import * as THREE from 'three';
import { bus } from '../core/EventBus.js';
import { CONTROLES } from '../core/controles.js';
import { estado, participar } from '../core/GameState.js';
import { NOMBRES } from '../characters/config.js';
import { toon, contorno } from '../world/materiales.js';

const azar = (a, b) => a + Math.random() * (b - a);
const elegir = (lista) => lista[Math.floor(Math.random() * lista.length)];

/**
 * Reto del mensajero (Tomi, esquina del fondo a la derecha) y física de los papelitos.
 *  1. Tomi espera a que la profesora esté distraída y lanza un papelito en parábola hacia tu banco.
 *  2. Lo atrapás con clic izquierdo cuando entra en tu zona de alcance (si no, cae y hace ruido).
 *  3. Lo abrís bajo el banco y leés el pedido; consultás el machete (E).
 *  4. Lo devolvés: mantené clic derecho para cargar fuerza (con arco visible) y soltá.
 *     El temblor del pánico desvía el arco. Si no llega, cae en el pasillo: ruido y mucha sospecha.
 */
export class Papelitos {
  constructor({ scene, aula, elenco, profesora, camara, hud, examen, balance, input, resaltado, brazos }) {
    this.scene = scene;
    this.aula = aula;
    this.tomi = elenco.mensajero;
    this.prota = elenco.protagonista;
    this.ia = profesora;
    this.camara = camara;
    this.hud = hud;
    this.examen = examen;
    this.b = balance.papelitos;
    this.l = balance.lanzamiento;
    this.finales = balance.finales;
    this.urgente = false;      // reto final: pedido urgente de Tomi
    this.forzarFallo = false;  // reto final: el lanzamiento falla por el temblor
    this.puntos = balance.compromiso.porPapelito;
    this.input = input;
    this.resaltado = resaltado;
    this.brazos = brazos;
    this.nombre = NOMBRES.mensajero;

    this.papeles = [];
    this.fase = 'espera';
    this.timer = this.b.esperaInicial;
    this.abriendo = 0;
    this.carga = 0;
    this.gravedad = new THREE.Vector3(0, -this.b.gravedad, 0);

    // Geometría y material compartidos del papel arrugado
    this.geo = new THREE.IcosahedronGeometry(this.b.radio * 1.4, 0);
    this.mat = toon(0xfbfaf2);

    // Punto donde el jugador atrapa (sobre el banco, frente a las manos)
    const c = aula.bancoCentral;
    this.puntoAtrape = new THREE.Vector3(c.posicion.x, 1.0, c.posicion.z + 0.1);
    // Blanco del jugador al devolver: las manos de Tomi sobre su banco
    this.blancoTomi = this.tomi.banco.posicion.clone().add(new THREE.Vector3(0, 0.3, 0.25));

    // Papel en la mano del protagonista
    this.papelMano = new THREE.Mesh(this.geo, this.mat);
    contorno(this.papelMano, 0.004);
    this.papelMano.position.set(0, -0.07, -0.02);
    this.papelMano.visible = false;
    this.prota.rig.brazoD.muneca.add(this.papelMano);
    brazos.papelEnMano = this.papelMano;

    // Arco de trayectoria: una hilera de puntos (se ve mejor que una línea de 1 px)
    const n = this.l.puntosArco;
    this.arco = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.022, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthTest: false }),
      n,
    );
    this.arco.frustumCulled = false;
    this.arco.renderOrder = 10;
    this.arco.visible = false;
    this._m = new THREE.Matrix4();
    scene.add(this.arco);
    const geoMarca = new THREE.RingGeometry(0.12, 0.17, 24);
    geoMarca.rotateX(-Math.PI / 2);
    this.marcaCaida = new THREE.Mesh(geoMarca, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthTest: false }));
    this.marcaCaida.renderOrder = 10;
    this.marcaCaida.visible = false;
    scene.add(this.marcaCaida);

    // Tomi se resalta cuando tenés un papel listo para devolverle
    resaltado.registrar({
      objeto: this.tomi.raiz,
      punto: (v) => this.tomi.posicionCabeza(v),
      activo: () => !!estado.papelEnMano?.consultado,
      tolerancia: 20,
    });

    bus.on('mouse', ({ boton, abajo }) => {
      if (estado.pausado || estado.final || estado.accion.modoHoja) return;
      if (boton === CONTROLES.botonInteractuar && abajo) this.intentarAtrapar();
      if (boton === CONTROLES.botonLanzar) {
        if (abajo) this.empezarApuntar();
        else this.soltar();
      }
    });
    bus.on('modoHoja', (activo) => {
      if (activo && estado.accion.apuntando) this.cancelarApuntar();
    });

    hud.registrarAcciones(() => {
      if (estado.accion.modoHoja) return [];
      const acciones = [];
      if (this.papelAtrapable()) acciones.push({ tecla: 'Clic', texto: '¡atrapar el papelito!' });
      if (estado.papelEnMano && !estado.accion.abriendoPapel) {
        if (!estado.papelEnMano.consultado) {
          acciones.push({ tecla: 'E', texto: estado.macheteGuardado ? 'ya no tenés machete' : 'consultá el machete' });
        } else {
          acciones.push({ tecla: 'Clic der.', texto: `mantener y soltar: devolverle el papel a ${this.nombre}` });
        }
      }
      return acciones;
    });
  }

  // ---------- Papeles ----------
  crearPapel(posicion, velocidad, origen) {
    const mesh = new THREE.Mesh(this.geo, this.mat);
    contorno(mesh, 0.006);
    mesh.position.copy(posicion);
    mesh.castShadow = true;
    this.scene.add(mesh);
    const papel = { mesh, vel: velocidad.clone(), origen, estado: 'vuelo', vida: this.b.vidaEnPiso, giro: new THREE.Vector3(azar(-9, 9), azar(-9, 9), azar(-9, 9)), toco: false };
    if (origen === 'mensajero') {
      papel.item = {
        objeto: mesh,
        punto: (v) => v.copy(mesh.position),
        activo: () => papel.estado === 'vuelo' && this.alcanzable(papel),
        tolerancia: 25,
      };
      papel.quitarResaltado = this.resaltado.registrar(papel.item);
    }
    this.papeles.push(papel);
    return papel;
  }

  quitarPapel(papel) {
    this.scene.remove(papel.mesh);
    papel.quitarResaltado?.();
    this.papeles = this.papeles.filter((p) => p !== papel);
  }

  alcanzable(papel) {
    return papel.mesh.position.distanceTo(this.puntoAtrape) < this.b.radioAtrape;
  }

  papelAtrapable() {
    return this.papeles.find((p) => p.origen === 'mensajero' && p.estado === 'vuelo' && this.alcanzable(p));
  }

  // Velocidad inicial para llegar de "desde" a "hasta" en un tiempo dado (tiro parabólico)
  velocidadPara(desde, hasta, tiempo) {
    return new THREE.Vector3()
      .subVectors(hasta, desde)
      .addScaledVector(this.gravedad, -0.5 * tiempo * tiempo)
      .divideScalar(tiempo);
  }

  // Integra un paso de física con rebotes en el piso, los bancos y las paredes
  integrar(papel, dt) {
    const m = papel.mesh;
    const r = this.b.radio;
    papel.vel.addScaledVector(this.gravedad, dt);
    m.position.addScaledVector(papel.vel, dt);
    m.rotation.x += papel.giro.x * dt;
    m.rotation.y += papel.giro.y * dt;
    m.rotation.z += papel.giro.z * dt;

    let superficie = null;
    // Tapas de los bancos
    if (papel.vel.y < 0) {
      for (const banco of this.aula.bancos) {
        const p = banco.posicion;
        if (Math.abs(m.position.x - p.x) < 0.36 && Math.abs(m.position.z - p.z) < 0.25 && m.position.y - r < p.y && m.position.y > p.y - 0.08) {
          m.position.y = p.y + r;
          superficie = { tipo: 'banco', banco };
          break;
        }
      }
    }
    // Piso
    if (!superficie && m.position.y < r) {
      m.position.y = r;
      superficie = { tipo: 'piso' };
    }
    // Paredes
    const l = this.aula.limites;
    if (m.position.x < l.xMin + r || m.position.x > l.xMax - r) {
      m.position.x = THREE.MathUtils.clamp(m.position.x, l.xMin + r, l.xMax - r);
      papel.vel.x *= -0.4;
    }
    if (m.position.z < l.zMin + r || m.position.z > l.zMax - r) {
      m.position.z = THREE.MathUtils.clamp(m.position.z, l.zMin + r, l.zMax - r);
      papel.vel.z *= -0.4;
    }

    if (superficie) {
      const impacto = Math.abs(papel.vel.y);
      papel.vel.y = impacto > 0.6 ? impacto * this.b.rebote : 0;
      const roce = Math.max(0, 1 - this.b.friccion * dt);
      papel.vel.x *= roce;
      papel.vel.z *= roce;
      papel.giro.multiplyScalar(roce);
      if (!papel.toco) {
        papel.toco = true;
        this.alTocarSuperficie(papel, superficie);
      }
      if (papel.vel.lengthSq() < 0.01) papel.estado = 'quieto';
    }
  }

  alTocarSuperficie(papel, superficie) {
    const pos = papel.mesh.position.clone();
    bus.emit('papelCae', { posicion: pos, origen: papel.origen });
    if (papel.origen === 'mensajero') {
      // No lo atrapaste: cae y hace ruido cerca de tu banco
      bus.emit('ruido', { posicion: pos, intensidad: this.b.ruidoCaida, tipo: 'papel' });
      estado.registro.ignorados += 1;
      this.hud.subtitulo(`[Un papelito cae ${superficie.tipo === 'piso' ? 'al piso' : 'sobre un banco'} ${this.hud.direccionTexto(pos)}]`);
      this.hud.indicar({ tipo: 'papel', posicion: pos, etiqueta: 'papel', icono: '📄', duracion: 2 });
      this.tomiReclama();
      this.fase = 'espera';
      this.timer = azar(this.b.intervaloMin, this.b.intervaloMax);
    } else if (papel.origen === 'jugador') {
      // Tu devolución no llegó: cae en el pasillo, mucho ruido y mucha sospecha
      bus.emit('ruido', { posicion: pos, intensidad: this.b.ruidoFallo, tipo: 'papel' });
      bus.emit('sospechaExtra', { cantidad: this.b.sospechaPorFallo });
      bus.emit('lanzamientoFallido', { posicion: pos });
      participar(this.puntos * 0.3);
      this.hud.subtitulo('[¡El papelito cae en el pasillo!]', 3);
      this.hud.indicar({ tipo: 'papel', posicion: pos, etiqueta: 'papel', icono: '📄', duracion: 2.5 });
      this.tomiReclama();
    }
  }

  tomiReclama() {
    const a = this.tomi.animador;
    a.pose('reclamo', 6);
    a.capa('reclamo', 1);
    setTimeout(() => {
      a.capa('reclamo', 0);
      a.pose('sentado', 4);
    }, 1600);
  }

  // ---------- Tomi lanza ----------
  oportunidad() {
    if (this.ia.estado !== 'patrulla') return false;
    if (this.ia.enPizarron) return true;
    const pos = this.tomi.raiz.position;
    return this.ia.posicion.distanceTo(this.aula.bancoCentral.posicion) > 5 && !this.ia.mirandoHacia(pos, 60) && !this.ia.mirandoHacia(this.aula.bancoCentral.posicion, 60);
  }

  tomiPrepara() {
    this.fase = 'preparando';
    this.timer = 0.7;
    this.tomi.animador.pose('prepararLanzar', 6);
    this.mirarTomi(true);
  }

  tomiLanza() {
    this.tomi.animador.pose('lanzar', 16);
    const desde = this.tomi.rig.brazoD.muneca.getWorldPosition(new THREE.Vector3());
    const error = this.b.errorLanzamiento;
    const hasta = this.puntoAtrape.clone().add(new THREE.Vector3(azar(-error, error), azar(-error, error), azar(-error, error)));
    const vel = this.velocidadPara(desde, hasta, this.b.tiempoVuelo);
    const papel = this.crearPapel(desde, vel, 'mensajero');
    papel.pregunta = elegir(this.examen.datos.machete.paraAmigos);
    papel.urgente = this.urgente;
    bus.emit('papelLanzado', { posicion: desde });
    this.hud.subtitulo(`[${this.nombre} te tira un papelito]`, 2);
    this.hud.indicar({ tipo: 'papel', posicion: desde, etiqueta: 'papelito', icono: '📄', duracion: 1.5 });
    this.fase = 'enVuelo';
    setTimeout(() => {
      this.tomi.animador.pose('sentado', 4);
      this.mirarTomi(false);
    }, 600);
  }

  mirarTomi(activo) {
    const ex = (this.tomi.animador.extra.cabeza ??= [0, 0, 0]);
    const tor = (this.tomi.animador.extra.torso ??= [0, 0, 0]);
    if (!activo) {
      ex[1] = 0;
      tor[1] = 0;
      return;
    }
    const pos = this.tomi.raiz.position;
    const c = this.aula.bancoCentral.asiento;
    const ang = Math.atan2(-(c.x - pos.x), -(c.z - pos.z));
    tor[1] = ang * 0.5;
    ex[1] = ang * 0.4;
  }

  // ---------- El jugador atrapa, abre y devuelve ----------
  intentarAtrapar() {
    const papel = this.papelAtrapable();
    if (!papel || estado.papelEnMano) return;
    this.quitarPapel(papel);
    estado.papelEnMano = { pregunta: papel.pregunta, consultado: false, desde: estado.tiempo, urgente: !!papel.urgente };
    estado.accion.abriendoPapel = true;
    this.abriendo = this.b.tiempoAbrir;
    this.fase = 'esperandoRespuesta';
    this.timer = this.b.tiempoLimiteRespuesta;
    bus.emit('papelAtrapado');
    this.hud.subtitulo('[Atrapaste el papelito: lo abrís debajo del banco]', 2);
  }

  empezarApuntar() {
    const p = estado.papelEnMano;
    if (!p || estado.accion.abriendoPapel) return;
    if (!p.consultado) {
      this.hud.mensaje(estado.macheteGuardado ? 'Ya guardaste el machete: no tenés qué contestarle.' : 'Primero consultá el machete (mantené E) para escribir la respuesta.', 3);
      return;
    }
    estado.accion.apuntando = true;
    this.carga = 0;
  }

  cancelarApuntar() {
    estado.accion.apuntando = false;
    this.arco.visible = false;
    this.marcaCaida.visible = false;
    this.hud.setFuerza(null);
  }

  // Origen y velocidad del lanzamiento según la mirada, la carga y el temblor del pánico
  parametrosLanzamiento(t) {
    const origen = this.camara.posicionOjos(new THREE.Vector3()).add(new THREE.Vector3(0, -0.12, 0));
    const dir = this.camara.direccion(new THREE.Vector3());
    // El brazo puede tirar un poco más allá de donde llega la mirada (para alcanzar las esquinas)
    let yaw = Math.atan2(-dir.x, -dir.z) * this.l.factorGiroBrazo;
    let pitch = Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1)) + this.l.anguloElevacion;
    // El temblor del pánico desvía la puntería (no depende de la opción de vibración: es mecánica)
    const temblor = (estado.panico ?? 0) * this.l.temblorMax * (this.forzarFallo ? 2.5 : 1);
    yaw += (Math.sin(t * 7.3) + Math.sin(t * 13.1) * 0.6) * temblor;
    pitch += (Math.sin(t * 9.7 + 1) + Math.sin(t * 5.3) * 0.6) * temblor;
    const rapidez = THREE.MathUtils.lerp(this.l.velocidadMin, this.l.velocidadMax, this.carga);
    const vel = new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)).multiplyScalar(rapidez);
    origen.addScaledVector(vel.clone().setY(0).normalize(), 0.25);
    return { origen, vel };
  }

  actualizarArco(t) {
    const { origen, vel } = this.parametrosLanzamiento(t);
    const p = origen.clone();
    const v = vel.clone();
    const paso = 0.04;
    let n = 0;
    // El primer tramo queda pegado a la cámara: se saltean algunos puntos
    for (let i = 0; i < 4; i++) {
      v.addScaledVector(this.gravedad, paso);
      p.addScaledVector(v, paso);
    }
    for (; n < this.l.puntosArco; n++) {
      // los puntos se agrandan con la distancia para que se lean parejos
      const escala = 0.6 + n * 0.04;
      this._m.makeScale(escala, escala, escala).setPosition(p);
      this.arco.setMatrixAt(n, this._m);
      v.addScaledVector(this.gravedad, paso);
      p.addScaledVector(v, paso);
      if (p.y < 0.02) {
        n++;
        break;
      }
    }
    this.arco.count = n;
    this.arco.instanceMatrix.needsUpdate = true;
    this.arco.visible = true;
    this.marcaCaida.position.set(p.x, Math.max(0.02, p.y) + 0.01, p.z);
    this.marcaCaida.visible = true;
  }

  soltar() {
    if (!estado.accion.apuntando) return;
    const { origen, vel } = this.parametrosLanzamiento(performance.now() / 1000);
    if (this.forzarFallo) {
      // Reto final: el temblor arruina el tiro, el papel se va al pasillo y cae corto
      const desvio = this.finales.desvioFalloFinal * (Math.random() < 0.5 ? -1 : 1);
      vel.applyAxisAngle(new THREE.Vector3(0, 1, 0), desvio).multiplyScalar(this.finales.factorVelocidadFalloFinal);
      vel.y = Math.abs(vel.y) * 0.5 + 0.6;
    }
    this.cancelarApuntar();
    const papel = this.crearPapel(origen, vel, 'jugador');
    papel.pregunta = estado.papelEnMano.pregunta;
    estado.papelEnMano = null;
    this.brazos.gestoLanzar();
    bus.emit('papelDevuelto', { posicion: origen });
    this.fase = 'devuelto';
  }

  // ---------- Loop ----------
  update(dt) {
    const t = performance.now() / 1000;

    // Física de los papeles
    for (const papel of [...this.papeles]) {
      if (papel.estado === 'vuelo') {
        this.integrar(papel, dt);
        // ¿Tu devolución llegó a las manos de Tomi?
        if (papel.origen === 'jugador' && !papel.toco && papel.mesh.position.distanceTo(this.blancoTomi) < this.b.radioExito) {
          this.quitarPapel(papel);
          this.tomiAtrapa();
          continue;
        }
      } else {
        papel.vida -= dt;
        if (papel.vida <= 0) this.quitarPapel(papel);
      }
    }

    // Abriendo el papel bajo el banco (pequeña animación con la cámara)
    if (estado.accion.abriendoPapel) {
      this.abriendo -= dt;
      const avance = 1 - Math.max(0, this.abriendo) / this.b.tiempoAbrir;
      const mezcla = Math.min(1, Math.sin(Math.min(1, avance) * Math.PI) * 1.6);
      this.camara.solicitarMirada('papel', { mezcla: Math.max(0, mezcla), yaw: 0, pitch: -0.95, adelante: 0.5 });
      if (this.abriendo <= 0) {
        estado.accion.abriendoPapel = false;
        this.camara.solicitarMirada('papel', { mezcla: 0 });
        const n = estado.papelEnMano.pregunta + 1;
        const urg = estado.papelEnMano.urgente ? '¡¡URGENTE!! ' : '';
        this.hud.mensaje(`El papelito dice: «${urg}¿qué va en la ${n}?» — consultá el machete y devolvéselo`, 4.5);
      }
    }
    if (estado.papelEnMano && !estado.accion.abriendoPapel) {
      const p = estado.papelEnMano;
      const urg = p.urgente ? '<b>¡URGENTE!</b> ' : '';
      this.hud.setPedido(`📝 <b>${this.nombre}:</b> «${urg}¿qué va en la ${p.pregunta + 1}?» ${p.consultado ? '· ✓ respuesta escrita' : '· falta consultar el machete'}`);
    } else if (!estado.papelEnMano) {
      this.hud.setPedido(null);
    }

    // Apuntando: carga de fuerza y arco visible
    if (estado.accion.apuntando) {
      this.carga = Math.min(1, this.carga + dt / this.l.tiempoCarga);
      this.hud.setFuerza(this.carga);
      this.actualizarArco(t);
    }

    if (estado.final) return;
    this.timer -= dt;
    switch (this.fase) {
      case 'espera':
        if (this.timer <= 0 && !estado.grupoEnojado) {
          // El pedido urgente del reto final no espera a que la profesora esté distraída
          if (!estado.papelEnMano && (this.urgente || this.oportunidad())) this.tomiPrepara();
          else this.timer = 2;
        }
        break;
      case 'preparando':
        if (this.ia.estado !== 'patrulla' && !this.urgente) {
          this.tomi.animador.pose('disimular', 10);
          this.mirarTomi(false);
          this.fase = 'espera';
          this.timer = azar(8, 14);
        } else if (this.timer <= 0) this.tomiLanza();
        break;
      case 'enVuelo':
        // si nadie lo atrapó, alTocarSuperficie vuelve a 'espera'; si lo atrapaste, pasa a esperar respuesta
        break;
      case 'esperandoRespuesta':
        if (this.timer <= 0 && estado.papelEnMano && !estado.accion.apuntando) {
          // Tardaste demasiado: Tomi se cansa y vos te quedás con el papel arrugado
          estado.papelEnMano = null;
          estado.registro.ignorados += 1;
          this.hud.subtitulo(`[${this.nombre} se cansó de esperar tu respuesta]`, 3);
          this.tomiReclama();
          this.fase = 'espera';
          this.timer = azar(this.b.intervaloMin, this.b.intervaloMax);
        }
        break;
      case 'devuelto':
        if (!this.papeles.some((p) => p.origen === 'jugador' && p.estado === 'vuelo')) {
          this.fase = 'espera';
          this.timer = azar(this.b.intervaloMin, this.b.intervaloMax);
        }
        break;
    }
  }

  // Reto final (Acto IV): Tomi tira un pedido urgente aunque la profesora esté cerca
  lanzarUrgente() {
    this.urgente = true;
    this.forzarFallo = true;
    if (this.fase === 'espera') this.timer = Math.min(this.timer, 2.5);
  }

  tomiAtrapa() {
    const a = this.tomi.animador;
    a.pose('atrapar', 14);
    setTimeout(() => a.pose('sentado', 4), 700);
    estado.registro.papelitosDevueltos += 1;
    participar(this.puntos, { intercambio: true });
    this.hud.subtitulo(`[${this.nombre} atrapó tu papelito]`, 2.5);
    bus.emit('papelEntregado');
  }
}
