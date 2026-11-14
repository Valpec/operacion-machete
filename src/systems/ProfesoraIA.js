import * as THREE from 'three';
import { bus } from '../core/EventBus.js';
import { estado, haciendoTrampa } from '../core/GameState.js';

const ESTADOS = {
  patrulla: 'Patrulla',
  sospecha: 'Sospecha',
  inspeccion: 'Inspección',
  descubrimiento: 'Descubrimiento',
};

const azar = (min, max) => min + Math.random() * (max - min);
const angulo = (dx, dz) => Math.atan2(-dx, -dz); // rotación Y para mirar hacia (dx, dz) (los personajes miran a -Z)
const difAngulo = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

/**
 * IA de la profesora con máquina de estados:
 *  - Patrulla: recorre waypoints fijos y se detiene en el pizarrón (de espaldas a la clase).
 *  - Sospecha: deja el recorrido y deambula entre bancos acercándose al ruido y al centro.
 *  - Inspección: se para junto a un banco y lo observa unos segundos.
 *  - Descubrimiento: vio al jugador en flagrancia con la sospecha al 100.
 */
export class ProfesoraIA {
  constructor({ personaje, aula, nav, balance, camera, elenco }) {
    this.p = personaje;
    this.raiz = personaje.raiz;
    this.aula = aula;
    this.nav = nav;
    this.b = balance.profesora;
    this.camera = camera;
    this.elenco = elenco;

    this.estado = 'patrulla';
    this.sospecha = 0;
    this.escalada = 0;
    this.ruta = [];
    this.velocidad = this.b.velocidadPatrulla;
    this.alLlegar = null;
    this.espera = 0;
    this.alTerminarEspera = null;
    this.orientacion = this.raiz.rotation.y;
    this.orientacionObjetivo = null;
    this.mirarA = null;          // Vector3 mundial hacia donde gira la cabeza
    this.escanear = false;       // mirar alrededor (cabeza de lado a lado)
    this.indicePatrulla = 0;
    this.tiempoSospecha = 0;
    this.focoSospecha = new THREE.Vector3();
    this.distPaso = 0;
    this.relojVision = 0;
    this.veAlJugador = false;
    this.veTrampa = false;
    this.alivio = 0;             // segundos de decaimiento rápido tras inspeccionar al jugador
    this.inspeccionado = null;   // banco que está inspeccionando
    this.descubierto = false;

    this.raycaster = new THREE.Raycaster();
    this.ocluyentes = [...aula.solidos];
    for (const pj of elenco.todos) {
      if (pj === personaje || pj === elenco.protagonista) continue;
      pj.raiz.traverse((o) => {
        if (o.isMesh && !o.userData.esContorno) this.ocluyentes.push(o);
      });
    }

    this._v = new THREE.Vector3();
    this._ojo = new THREE.Vector3();
    this._adelante = new THREE.Vector3();
    this._objetivos = [new THREE.Vector3(), new THREE.Vector3()];

    this.enPizarron = false;     // de espaldas escribiendo en el pizarrón
    bus.on('ruido', (e) => this.oir(e));
    // Sospecha directa (p. ej., un papelito que cae en el pasillo después de un mal lanzamiento)
    bus.on('sospechaExtra', ({ cantidad }) => this.subirSospecha(cantidad, false));
    this.irAPatrulla();
  }

  get nombreEstado() {
    return ESTADOS[this.estado];
  }

  get posicion() {
    return this.raiz.position;
  }

  // ---------- Movimiento ----------
  caminarHacia(destino, velocidad, alLlegar) {
    this.ruta = this.nav.ruta(this.posicion, destino);
    const ultimo = this.ruta[this.ruta.length - 1];
    if (!ultimo || ultimo.distanceTo(destino) > 0.05) this.ruta.push(destino.clone().setY(0));
    this.velocidad = velocidad;
    this.alLlegar = alLlegar;
    this.orientacionObjetivo = null;
    this.espera = 0;
    this.alTerminarEspera = null;
  }

  esperar(segundos, despues) {
    this.espera = segundos;
    this.alTerminarEspera = despues;
  }

  moverse(dt) {
    if (!this.ruta.length) {
      this.p.animador.capa('caminar', 0);
      return;
    }
    const objetivo = this.ruta[0];
    const d = this._v.subVectors(objetivo, this.posicion).setY(0);
    const dist = d.length();
    const paso = this.velocidad * dt;
    if (dist <= paso) {
      this.posicion.copy(objetivo);
      this.ruta.shift();
      if (!this.ruta.length) {
        const cb = this.alLlegar;
        this.alLlegar = null;
        this.p.animador.capa('caminar', 0);
        cb?.();
      }
    } else {
      d.multiplyScalar(paso / dist);
      this.posicion.add(d);
      this.orientacion = this.girarHacia(this.orientacion, angulo(d.x, d.z), dt);
    }
    // Pasos: evento con posición para el audio posicional y los indicadores del HUD
    this.distPaso += Math.min(paso, dist);
    if (this.distPaso >= this.b.distanciaPaso) {
      this.distPaso = 0;
      bus.emit('paso', { posicion: this.posicion.clone(), fuerte: this.estado !== 'patrulla' });
    }
    this.p.animador.capa('caminar', 1);
    this.p.animador.velCaminar = this.velocidad / this.b.velocidadPatrulla;
  }

  girarHacia(actual, objetivo, dt) {
    const diff = difAngulo(actual, objetivo);
    const max = this.b.velocidadGiro * dt;
    return actual + THREE.MathUtils.clamp(diff, -max, max);
  }

  // ---------- Estados ----------
  irAPatrulla() {
    this.estado = 'patrulla';
    this.inspeccionado = null;
    this.escanear = false;
    this.mirarA = null;
    this.p.animador.pose('manosAtras', 4);
    this.p.animador.capa('escribir', 0);
    const punto = this.b.patrulla[this.indicePatrulla];
    this.caminarHacia(new THREE.Vector3(punto.x, 0, punto.z), this.b.velocidadPatrulla, () => this.llegarAPuntoPatrulla(punto));
  }

  llegarAPuntoPatrulla(punto) {
    const siguiente = () => {
      this.enPizarron = false;
      this.indicePatrulla = (this.indicePatrulla + 1) % this.b.patrulla.length;
      this.irAPatrulla();
    };
    if (!punto.pausa) return siguiente();
    if (punto.mirar === 'pizarron') {
      // De espaldas a la clase, escribiendo en el pizarrón: la ventana para las señas
      this.orientacionObjetivo = 0;
      this.enPizarron = true;
      this.p.animador.pose('escribirPizarron', 4);
      this.p.animador.capa('escribir', 1);
      this.mirarA = null;
    } else if (punto.mirar === 'alumnos') {
      this.orientacionObjetivo = angulo(-this.posicion.x * 0.3, -this.posicion.z);
      this.p.animador.pose('parado', 4);
      this.escanear = true;
    }
    this.esperar(punto.pausa, () => {
      this.p.animador.capa('escribir', 0);
      this.escanear = false;
      siguiente();
    });
  }

  // ¿La cabeza de la profesora apunta hacia ese punto (dentro de un ángulo en grados)?
  mirandoHacia(punto, grados) {
    const cabeza = this.p.rig.cabeza;
    cabeza.getWorldPosition(this._ojo);
    cabeza.getWorldDirection(this._adelante).negate().setY(0).normalize();
    const dir = this._v.subVectors(punto, this._ojo).setY(0).normalize();
    return THREE.MathUtils.radToDeg(dir.angleTo(this._adelante)) < grados;
  }

  entrarSospecha(foco) {
    if (this.estado === 'descubrimiento') return;
    this.enPizarron = false;
    const venia = this.estado;
    this.estado = 'sospecha';
    this.inspeccionado = null;
    this.focoSospecha.copy(foco).setY(0);
    if (venia !== 'sospecha') this.tiempoSospecha = azar(this.b.estados.duracionSospechaMin, this.b.estados.duracionSospechaMax);
    else this.tiempoSospecha = Math.max(this.tiempoSospecha, this.b.estados.duracionSospechaMin * 0.6);
    this.p.animador.pose('parado', 5);
    this.p.animador.capa('escribir', 0);
    this.escanear = false;
    this.mirarA = foco.clone().setY(0.9);
    // Primero va directo hacia el origen
    const destino = this.nav.nodos[this.nav.masCercano(foco)].pos;
    this.caminarHacia(destino, this.b.velocidadSospecha, () => this.llegarDeambulando());
    bus.emit('profesoraEstado', { estado: this.estado });
  }

  llegarDeambulando() {
    this.escanear = true;
    this.mirarA = null;
    this.esperar(this.b.estados.pausaDeambular, () => {
      this.escanear = false;
      if (this.tiempoSospecha <= 0) return this.irAPatrulla();
      if (Math.random() < this.b.estados.probInspeccion) return this.inspeccionar(this.elegirBancoParaInspeccionar());
      this.deambular();
    });
  }

  deambular() {
    const e = this.b.estados;
    // Con la escalada, el foco se corre hacia el banco central y el radio se achica
    const centro = this.aula.bancoCentral.posicion;
    let foco = this.focoSospecha.clone().lerp(centro, 0.3 + 0.5 * this.escalada);
    let radio = THREE.MathUtils.lerp(e.radioDeambularMax, e.radioDeambularMin, this.escalada);
    // Reto final (Acto IV): deambula pegada al centro todo el tiempo
    if (this.modoReto) {
      foco = centro.clone();
      radio = e.radioDeambularMin + 0.6;
      this.tiempoSospecha = Math.max(this.tiempoSospecha, 10);
    }
    let candidatos = this.nav.nodosCerca(foco, radio).filter((n) => n.pos.distanceTo(this.posicion) > 0.5);
    if (!candidatos.length) candidatos = this.nav.nodosCerca(foco, radio + 3);
    const elegido = candidatos[Math.floor(Math.random() * candidatos.length)];
    this.caminarHacia(elegido.pos, this.b.velocidadSospecha, () => this.llegarDeambulando());
  }

  elegirBancoParaInspeccionar() {
    const central = this.aula.bancoCentral;
    const probCentral = 0.2 + 0.5 * this.escalada + (this.sospecha > this.b.sospecha.umbralInspeccionJugador ? 1 : 0);
    if (Math.random() < probCentral) return central;
    const cercanos = this.aula.bancos
      .filter((b) => b.posicion.distanceTo(this.posicion) < 4)
      .sort(() => Math.random() - 0.5);
    return cercanos[0] ?? central;
  }

  inspeccionar(banco) {
    if (this.estado === 'descubrimiento') return;
    this.enPizarron = false;
    const venia = this.estado;
    this.estado = 'inspeccion';
    this.inspeccionado = banco;
    this.escanear = false;
    this.p.animador.pose('manosAtras', 4);
    // Si viene a tu banco, te clava la mirada mientras se acerca
    this.mirarA = banco === this.aula.bancoCentral ? banco.asiento.clone().setY(1.25) : null;
    const punto = this.nav.puntoJuntoA(banco, this.posicion.x);
    this.caminarHacia(punto, this.b.velocidadSospecha, () => {
      // Se para mirando al alumno sentado en ese banco
      const cabezaAlumno = banco.asiento.clone().setY(1.2);
      this.orientacionObjetivo = angulo(cabezaAlumno.x - this.posicion.x, cabezaAlumno.z - this.posicion.z);
      this.mirarA = banco === this.aula.bancoCentral ? banco.asiento.clone().setY(1.0) : banco.posicion.clone();
      const e = this.b.estados;
      this.esperar(azar(e.duracionInspeccionMin, e.duracionInspeccionMax), () => {
        if (banco === this.aula.bancoCentral) this.alivio = 6;
        this.inspeccionado = null;
        if (venia === 'sospecha' && this.tiempoSospecha > 0) {
          this.estado = 'sospecha';
          this.deambular();
        } else {
          this.irAPatrulla();
        }
      });
    });
    bus.emit('profesoraEstado', { estado: this.estado, banco });
  }

  // Acto IV, Camino 1: queda deambulando cerca del banco central
  vigilarCentro() {
    this.modoReto = true;
    if (this.estado !== 'inspeccion' && this.estado !== 'descubrimiento') this.entrarSospecha(this.aula.bancoCentral.posicion);
  }

  // Acto IV, Camino 2: pasa junto al banco del jugador, lo mira y sigue de largo
  pasarJunto(banco) {
    if (this.estado === 'descubrimiento') return;
    this.modoReto = false;
    this.estado = 'patrulla';
    this.enPizarron = false;
    this.inspeccionado = null;
    this.sospecha = 0;
    this.p.animador.pose('manosAtras', 4);
    const lado = this.nav.puntoJuntoA(banco, this.posicion.x);
    const despues = new THREE.Vector3(lado.x, 0, this.nav.filasZ[this.nav.filasZ.length - 1] + 1.4);
    this.mirarA = banco.asiento.clone().setY(1.0);
    this.caminarHacia(lado, this.b.velocidadPatrulla, () => {
      this.caminarHacia(despues, this.b.velocidadPatrulla, () => {
        this.mirarA = null;
        this.irAPatrulla();
      });
      // a mitad de camino deja de mirarlo: sigue de largo
      setTimeout(() => (this.mirarA = null), 900);
    });
    this.velocidad = this.b.velocidadPatrulla * 0.8;
  }

  // Le saca la hoja al jugador (secuencia del Camino 1)
  retirarExamen() {
    this.p.animador.pose('retirarExamen', 5);
  }

  descubrir() {
    if (this.descubierto) return;
    this.modoReto = false;
    this.descubierto = true;
    this.estado = 'descubrimiento';
    this.escanear = false;
    this.p.animador.pose('parado', 6);
    this.mirarA = this.camera.getWorldPosition(new THREE.Vector3());
    const central = this.aula.bancoCentral;
    const punto = this.nav.puntoJuntoA(central, this.posicion.x);
    this.caminarHacia(punto, this.b.velocidadDescubrimiento, () => {
      this.orientacionObjetivo = angulo(central.asiento.x - this.posicion.x, central.asiento.z - this.posicion.z);
      bus.emit('profesoraLlegoAlJugador');
    });
    bus.emit('descubrimiento');
    bus.emit('profesoraEstado', { estado: this.estado });
  }

  // ---------- Percepción ----------
  oir({ posicion, intensidad }) {
    if (this.estado === 'descubrimiento') return;
    const d = posicion.distanceTo(this.posicion);
    const percibido = intensidad * Math.max(0, 1 - d / this.b.escucha.radio);
    if (percibido < this.b.escucha.umbral) return;
    this.subirSospecha(percibido * this.b.sospecha.porRuido, false);
    if (this.estado !== 'inspeccion') this.entrarSospecha(posicion);
    bus.emit('profesoraOyo', { posicion, percibido });
  }

  mirar() {
    const cabeza = this.p.rig.cabeza;
    cabeza.getWorldPosition(this._ojo);
    // getWorldDirection devuelve el +Z local; la cara mira hacia -Z
    cabeza.getWorldDirection(this._adelante).negate();
    const v = this.b.vision;
    const mitad = THREE.MathUtils.degToRad(v.anguloTotal / 2);
    const [cabezaJ, manosJ] = this._objetivos;
    this.camera.getWorldPosition(cabezaJ);
    this.elenco.protagonista.rig.brazoD.muneca.getWorldPosition(manosJ);

    let visible = false;
    this.distanciaVista = Infinity;
    for (const obj of this._objetivos) {
      const dir = this._v.subVectors(obj, this._ojo);
      const dist = dir.length();
      if (dist > v.distancia) continue;
      dir.divideScalar(dist);
      if (dir.angleTo(this._adelante) > mitad) continue;
      this.raycaster.set(this._ojo, dir);
      this.raycaster.far = dist - 0.12;
      if (this.raycaster.intersectObjects(this.ocluyentes, false).length === 0) {
        visible = true;
        this.distanciaVista = dist;
        break;
      }
    }
    this.veAlJugador = visible;
    this.veTrampa = visible && haciendoTrampa();
  }

  subirSospecha(cantidad, flagrancia) {
    const s = this.b.sospecha;
    this.sospecha = Math.min(100, this.sospecha + cantidad);
    // Sin flagrancia nunca llega a 100: queda en el máximo y va a inspeccionar al jugador
    if (!flagrancia && this.sospecha > s.maxSinFlagrancia) {
      this.sospecha = s.maxSinFlagrancia;
      if (this.inspeccionado !== this.aula.bancoCentral) this.inspeccionar(this.aula.bancoCentral);
    }
  }

  // ---------- Loop ----------
  update(dt, t) {
    if (estado.final) {
      this.p.animador.capa('caminar', 0);
      return;
    }
    this.actualizarEscalada();
    if (this.estado === 'sospecha') this.tiempoSospecha -= dt;

    this.moverse(dt);
    if (!this.ruta.length && this.orientacionObjetivo !== null) {
      this.orientacion = this.girarHacia(this.orientacion, this.orientacionObjetivo, dt);
    }
    this.raiz.rotation.y = this.orientacion;

    if (this.espera > 0) {
      this.espera -= dt;
      if (this.espera <= 0) {
        const cb = this.alTerminarEspera;
        this.alTerminarEspera = null;
        cb?.();
      }
    }

    // Sospecha espontánea (más frecuente a medida que escala la tensión)
    if (this.estado === 'patrulla' && !this.calma) {
      const e = this.b.estados;
      const prob = e.probSospechaEspontaneaBase + e.probSospechaEspontaneaEscalada * this.escalada;
      if (Math.random() < prob * dt) this.entrarSospecha(this.aula.bancoCentral.posicion);
    }

    // Visión (no hace falta cada cuadro)
    this.relojVision -= dt;
    if (this.relojVision <= 0) {
      this.relojVision = this.b.vision.intervalo;
      this.mirar();
    }
    const s = this.b.sospecha;
    if (this.veTrampa) {
      // Ver de lejos suma menos que ver de cerca
      const cerca = 1 - this.b.vision.atenuacionDistancia * Math.min(1, this.distanciaVista / this.b.vision.distancia);
      const factor = (estado.factorVisibilidadTrampa ?? 1) * cerca;
      this.subirSospecha(s.porSegundoViendoTrampa * factor * dt, true);
      bus.emit('profesoraVeTrampa');
      // Si te vio, deja lo que estaba haciendo y viene a tu banco
      if (this.sospecha >= 100) this.descubrir();
      else if (this.estado !== 'descubrimiento' && this.inspeccionado !== this.aula.bancoCentral) {
        this.inspeccionar(this.aula.bancoCentral);
      }
    } else if (this.estado !== 'descubrimiento') {
      this.alivio = Math.max(0, this.alivio - dt);
      const ritmo = this.alivio > 0 ? s.decaimientoTrasInspeccion : s.decaimiento;
      this.sospecha = Math.max(0, this.sospecha - ritmo * dt);
    }

    this.orientarCabeza(t);
  }

  actualizarEscalada() {
    const e = this.b.escalada;
    this.escalada = THREE.MathUtils.clamp(estado.tiempo / e.duracionReferencia + (estado.intercambios ?? 0) * e.pesoIntercambio, 0, 1);
    if (estado.acto === 2 && this.escalada >= e.umbralActo3) {
      estado.acto = 3;
      bus.emit('acto', 3);
    }
  }

  orientarCabeza(t) {
    const extra = (this.p.animador.extra.cabeza ??= [0, 0, 0]);
    if (this.mirarA) {
      const local = this.raiz.worldToLocal(this._v.copy(this.mirarA));
      const yaw = Math.atan2(-local.x, -local.z);
      const pitch = Math.atan2(local.y - 1.6, Math.hypot(local.x, local.z));
      extra[0] = THREE.MathUtils.clamp(pitch, -0.7, 0.4);
      extra[1] = THREE.MathUtils.clamp(yaw, -1.1, 1.1);
    } else if (this.escanear) {
      extra[0] = -0.15;
      extra[1] = Math.sin(t * 0.9) * 0.9;
    } else {
      extra[0] = 0;
      extra[1] = 0;
    }
  }
}
