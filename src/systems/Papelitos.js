import * as THREE from 'three';
import { bus } from '../core/EventBus.js';
import { CONTROLES } from '../core/controles.js';
import { estado, participar } from '../core/GameState.js';
import { NOMBRES } from '../characters/config.js';
import { toon, contorno } from '../world/materiales.js';

const azar = (a, b) => a + Math.random() * (b - a);
const elegir = (lista) => lista[Math.floor(Math.random() * lista.length)];
// Altura mínima del papel desplegado al abrirlo (la tapa del banco termina a 0,76 m)
const ALTURA_MIN_PAPEL_ABIERTO = 0.8;

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

    // Punto donde el jugador atrapa: a la altura del hombro, corrido hacia el lado de Tomi.
    // Así, cuando girás a mirarlo, el papel llega DENTRO de tu campo visual (antes apuntaba
    // al frente del banco y salía de la pantalla justo antes de poder agarrarlo).
    const c = aula.bancoCentral;
    const hacia = new THREE.Vector3().subVectors(this.tomi.raiz.position, c.asiento).setY(0).normalize();
    this.puntoAtrape = c.asiento.clone().addScaledVector(hacia, this.b.distanciaAtrape).setY(this.b.alturaAtrape);
    this.clicPendiente = 0; // clic "anticipado": si apretás un poco antes de tiempo, igual cuenta
    // Blanco del jugador al devolver: las manos de Tomi sobre su banco
    this.blancoTomi = this.tomi.banco.posicion.clone().add(new THREE.Vector3(0, 0.3, 0.25));

    // Papel pequeño sostenido por la mano derecha
    this.papelMano = new THREE.Mesh(
      new THREE.PlaneGeometry(0.045, 0.035),
      new THREE.MeshBasicMaterial({
        color: 0xfbfaf2,
        side: THREE.DoubleSide
      })
    );

    this.papelMano.position.set(0.025, -0.045, -0.025);
    this.papelMano.rotation.set(0, 0, 0);
    this.papelMano.visible = false;

    this.prota.rig.brazoD.muneca.add(this.papelMano);
    brazos.papelEnMano = this.papelMano;

// Hojita desplegada que se ve entre ambas manos al abrir el papel bajo el banco
    this.papelAbierto = new THREE.Mesh(
      new THREE.PlaneGeometry(0.11, 0.08, 2, 1),
      new THREE.MeshBasicMaterial({ color: 0xfbfaf2, side: THREE.DoubleSide }),
    );
    contorno(this.papelAbierto, 0.002);
    const posHoja = this.papelAbierto.geometry.attributes.position;
    for (let i = 0; i < posHoja.count; i++) {
      if (Math.abs(posHoja.getX(i)) < 0.01) posHoja.setZ(i, 0.008);
    }
    this.papelAbierto.geometry.computeVertexNormals();
    this.papelAbierto.visible = false;
    this.scene.add(this.papelAbierto);
    brazos.papelAbierto = this.papelAbierto;

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
      if (boton === CONTROLES.botonInteractuar && abajo) {
        // Si todavía no llegó pero viene en camino, el clic queda "guardado" un instante
        if (!this.intentarAtrapar() && this.papelEnCamino()) this.clicPendiente = this.b.margenClic;
      }
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
      if (this.papelAtrapable()) acciones.push({ tecla: 'Clic', texto: '¡AHORA! atrapar el papelito' });
      else if (this.papelEnCamino()) acciones.push({ tecla: 'Clic', texto: `¡viene un papelito de ${this.nombre}! atrapalo cuando llegue` });
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

  // Se puede atrapar mientras vuela cerca del punto de atrape y todavía no tocó nada
  alcanzable(papel) {
    return !papel.toco && papel.mesh.position.distanceTo(this.puntoAtrape) < this.b.radioAtrape;
  }

  // ¿Hay un papelito de Tomi volando hacia vos (todavía sin llegar)?
  papelEnCamino() {
    return this.papeles.some((p) => p.origen === 'mensajero' && p.estado === 'vuelo' && !p.toco);
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
      a.pose('escribirFondo', 4);
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
    this.timer = this.b.tiempoAviso ?? 1.8;
    this.tomi.animador.pose('prepararLanzar', 6);
    this.mirarTomi(true);

    // Posición de Tomi para el audio y el indicador del HUD
    const pos = this.tomi.raiz.position.clone().setY(1.1);
    const intensidad = (this.b.intensidadAviso ?? 0.14) + 0.15 * (this.ia.escalada ?? 0);

    // Eventos de audio y alerta para la IA (ruido sutil)
    bus.emit('tomiAvisa', { posicion: pos });
    bus.emit('ruido', { posicion: pos, intensidad, tipo: 'susurro' });

    // Feedback claro en HUD con dirección espacial
    this.hud.indicar({ tipo: 'susurro', posicion: pos, etiqueta: '¡pst!', icono: '🤫', duracion: this.timer });
    this.hud.subtitulo(`[¡Pst! ${this.nombre} te llama ${this.hud.direccionTexto(pos)}]`, 2.2);
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
      this.tomi.animador.pose('escribirFondo', 4);
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
    if (!papel || estado.papelEnMano) return false;
    this.clicPendiente = 0;
    this.quitarPapel(papel);
    estado.papelEnMano = { pregunta: papel.pregunta, consultado: false, desde: estado.tiempo, urgente: !!papel.urgente };
    estado.accion.abriendoPapel = true;
    this.abriendo = this.b.tiempoAbrir;
    this.fase = 'esperandoRespuesta';
    this.timer = this.b.tiempoLimiteRespuesta;
    bus.emit('papelAtrapado');
    this.hud.subtitulo('[Atrapaste el papelito: lo abrís debajo del banco]', 2);
    return true;
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

    // Clic anticipado: si apretaste un instante antes de que llegara, se atrapa apenas entra en alcance
    if (this.clicPendiente > 0) {
      this.clicPendiente -= dt;
      if (this.papelAtrapable()) this.intentarAtrapar();
    }

    // Física de los papeles
    for (const papel of [...this.papeles]) {
      if (papel.estado === 'vuelo') {
        // El papel de Tomi se frena al llegar a tu alcance (cámara lenta): sin esto cruza
        // la zona en 0,2 s cayendo casi en picada y es muy difícil de agarrar
        let paso = dt;
        if (papel.origen === 'mensajero' && !papel.toco) {
          const d = papel.mesh.position.distanceTo(this.puntoAtrape);
          if (d < this.b.radioAtrape * 1.3) paso *= this.b.lentitudAtrape;
        }
        this.integrar(papel, paso);
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
      const mezcla = Math.min(1, Math.sin(Math.min(1, avance) * Math.PI) * 1.4);
      this.camara.solicitarMirada('papel', { mezcla: Math.max(0, mezcla), yaw: 0, pitch: -0.72, adelante: 0.18 });

      // Colocar el papel entre ambas manos y detrás de ellas
      const mI = this.prota.rig.brazoI.muneca.getWorldPosition(
        new THREE.Vector3()
      );

      const mD = this.prota.rig.brazoD.muneca.getWorldPosition(
        new THREE.Vector3()
      );

      const ojos = this.camara.posicionOjos(new THREE.Vector3());

      // Centro entre las dos muñecas
      const centro = new THREE.Vector3().lerpVectors(mI, mD, 0.5);

      // Dirección desde la cámara hacia el papel
      const haciaFondo = new THREE.Vector3()
        .subVectors(centro, ojos)
        .normalize();

      // Alejar el papel de la cámara para que las manos queden delante
      this.papelAbierto.position.copy(centro);
      this.papelAbierto.position.addScaledVector(haciaFondo, 0.045);
      // Siempre por encima de la tapa del banco (si no, queda metido adentro y no se ve)
      this.papelAbierto.position.y = Math.max(this.papelAbierto.position.y, ALTURA_MIN_PAPEL_ABIERTO);

      // Orientar la hoja hacia la cámara
      this.papelAbierto.lookAt(ojos);

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
      // Cuánto le queda a Tomi antes de cansarse de esperar (en rojo los últimos 10 s)
      let reloj = '';
      if (this.fase === 'esperandoRespuesta') {
        const s = Math.max(0, Math.ceil(this.timer));
        reloj = ` <span class="pedido-tiempo${s <= 10 ? ' apurado' : ''}">⏱ ${s} s</span>`;
      }
      this.hud.setPedido(`📝 <b>${this.nombre}:</b> «${urg}¿qué va en la ${p.pregunta + 1}?» ${p.consultado ? '· ✓ respuesta escrita' : '· falta consultar el machete'}${reloj}`);
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
      case 'preparando': {
        // Si la profesora deja de patrullar o mira hacia Tomi, aborta y disimula
        const peligro = this.ia.estado !== 'patrulla' || this.ia.mirandoHacia(this.tomi.raiz.position, 40);
        if (peligro && !this.urgente) {
          this.tomi.animador.pose('disimular', 10);
          this.mirarTomi(false);
          this.fase = 'espera';
          this.timer = azar(8, 14);
          break;
        }

        // Si el jugador gira y mira a Tomi, lanza casi al instante (tras al menos 0.45s de aviso)
        const yaLoMiro = this.timer < (this.b.tiempoAviso - 0.45) &&
          this.camara.anguloHacia(this.tomi.posicionCabeza(new THREE.Vector3())) < 28;

        if (this.timer <= 0 || yaLoMiro) {
          this.tomiLanza();
        }
        break;
      }
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
    setTimeout(() => a.pose('escribirFondo', 4), 700);
    estado.registro.papelitosDevueltos += 1;
    participar(this.puntos, { intercambio: true });
    this.hud.subtitulo(`[${this.nombre} atrapó tu papelito]`, 2.5);
    bus.emit('papelEntregado');
  }
}
