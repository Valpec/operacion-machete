import { poseSenia } from '../characters/Manos.js';
import * as THREE from 'three';
import { bus } from '../core/EventBus.js';
import { CONTROLES } from '../core/controles.js';
import { estado, participar } from '../core/GameState.js';
import { NOMBRES } from '../characters/config.js';
import { texturaCanvas } from '../world/materiales.js';

const LETRAS = ['A', 'B', 'C', 'D'];
const azar = (a, b) => a + Math.random() * (b - a);
const elegir = (lista) => lista[Math.floor(Math.random() * lista.length)];

/**
 * Reto de las señas (Sofi, esquina del fondo a la izquierda).
 * Cuando la profesora está de espaldas o lejos: golpea la lapicera tres veces,
 * levanta un cartelito con el número de pregunta y muestra 1-4 dedos (A-D).
 *  - "respuesta": ella te pasa la opción de una pregunta.
 *  - "pedido": te pregunta qué va en una pregunta; respondés mirándola y apretando 1-4.
 * Para descifrar la seña hay que sostener la mirada ~1 s; con pánico alto es casi ilegible.
 */
const ESCALA_CARTEL = 1.8; // el cartel de 0.2 x 0.15 m pasa a 0.36 x 0.27 m
const ESCALA_MANO_SENIA = 1.6; // la mano de señas se agranda un poco para que se cuenten los dedos

export class Senias {
  constructor({ personaje, profesora, camara, hud, examen, balance, resaltado }) {
    this.p = personaje;
    this.ia = profesora;
    this.camara = camara;
    this.hud = hud;
    this.examen = examen;
    this.b = balance.senias;
    this.puntos = balance.compromiso.porSenia;
    this.nombre = NOMBRES.senias;

    this.fase = 'espera';
    this.timer = this.b.esperaInicial;
    this.senia = null;
    this.lectura = 0;
    this.golpesDados = 0;
    this.dedosTimer = 0;
    this.yaPasadas = new Set();
    this.yaPedidas = new Set();

    // Cartelito (una hoja con el número de pregunta) en la mano izquierda
    this.canvasCartel = null;
    this.texCartel = texturaCanvas(256, 192, (ctx) => {
      this.canvasCartel = ctx;
    });
    // El cartel se agranda (a 5 m un cartelito real no se lee) y flota sobre la mano izquierda,
    // siempre de frente al jugador (ver posicionarCartel)
    this.cartel = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.15), new THREE.MeshBasicMaterial({ map: this.texCartel, side: THREE.DoubleSide }));
    this.cartel.scale.setScalar(ESCALA_CARTEL);
    this.cartel.visible = false;
    personaje.raiz.add(this.cartel);
    this._w = new THREE.Vector3();
    this._o = new THREE.Vector3();

    this._v = new THREE.Vector3();
    this.item = {
      objeto: personaje.raiz,
      punto: (v) => personaje.posicionCabeza(v),
      activo: () => this.fase === 'senia' || this.fase === 'respuesta',
      tolerancia: this.b.toleranciaMirada,
    };
    resaltado.registrar(this.item);
    this.resaltado = resaltado;

    bus.on('tecla', ({ code, abajo }) => {
      if (!abajo || estado.pausado || estado.final || estado.accion.modoHoja) return;
      const n = CONTROLES.dedos.indexOf(code);
      if (n >= 0 && this.fase === 'respuesta' && this.mirandoAElla()) this.responder(n);
    });

    hud.registrarAcciones(() => {
      if (estado.accion.modoHoja) return [];
      if (this.fase === 'senia' && this.lectura < 1) return [{ tecla: '👀', texto: `Mirá a ${this.nombre} para leer la seña` }];
      if (this.fase === 'respuesta') return [{ tecla: '1–4', texto: `mirándola: mostrale los dedos (A–D)` }];
      return [];
    });
  }

  mirandoAElla() {
    return this.camara.anguloHacia(this.p.posicionCabeza(this._v)) < this.b.toleranciaMirada;
  }

  // La profesora no puede verla: de espaldas en el pizarrón o lejos y en patrulla
  oportunidad() {
    if (this.ia.estado !== 'patrulla') return false;
    if (this.ia.enPizarron) return true;
    const pos = this.p.raiz.position;
    return this.ia.posicion.distanceTo(pos) > this.b.distanciaProfeSegura && !this.ia.mirandoHacia(pos, 50);
  }

  dibujarCartel(texto) {
    // Alto contraste y número enorme: se tiene que leer a 5 m
    const ctx = this.canvasCartel;
    ctx.fillStyle = '#10163a';
    ctx.fillRect(0, 0, 256, 192);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(10, 10, 236, 172);
    ctx.fillStyle = '#0b1030';
    ctx.font = 'bold 150px Arial, Helvetica, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(texto, 128, 100);
    this.texCartel.needsUpdate = true;
  }

  // k dedos extendidos en la mano de señas (con puño en 0)
  mostrarDedosSenia(k) {
    if (this.p.manos) this.p.manos.forzar('D', poseSenia(k));
    else this.p.mostrarDedos(k);
  }

  // Secuencia de la seña: 0,6 s de puño mientras sube el brazo, un dedo cada 0,3 s y un pequeño temblor
  animarSenia(dt) {
    const r = this.revelar;
    if (!r) return;
    r.t += dt;
    const k = Math.max(0, Math.min(r.n, Math.floor((r.t - 0.6) / 0.3) + 1));
    if (k !== r.k) {
      r.k = k;
      this.mostrarDedosSenia(k);
    }
    const tras = r.t - (0.6 + 0.3 * r.n);
    const ex = (this.p.animador.extra.munecaD ??= [0, 0, 0]);
    ex[2] = tras > 0 ? Math.sin(tras * 11) * 0.1 * Math.exp(-tras * 0.6) : 0;
  }

  // Cartel sobre la mano izquierda, de frente al jugador; la palma de la mano de señas también lo mira
  posicionarCartel() {
    const ojos = this.camara.posicionOjos(this._o);
    this.p.orientarPalma('brazoD', ojos);
    if (!this.cartel.visible) return;
    this.p.rig.brazoI.muneca.getWorldPosition(this._w);
    const haciaJugador = Math.atan2(ojos.x - this._w.x, ojos.z - this._w.z);
    this._w.y += 0.17;
    this._w.x += Math.sin(haciaJugador) * 0.1; // un poco hacia el jugador, para que nada lo tape
    this._w.z += Math.cos(haciaJugador) * 0.1;
    this.cartel.position.copy(this.p.raiz.worldToLocal(this._w));
    this.cartel.lookAt(ojos);
  }

  mirarAlJugador(activo) {
    const ex = (this.p.animador.extra.cabeza ??= [0, 0, 0]);
    const tor = (this.p.animador.extra.torso ??= [0, 0, 0]);
    if (!activo) {
      ex[1] = 0;
      tor[1] = 0;
      return;
    }
    // Ángulo hacia el jugador (los personajes miran a -Z; y positivo = gira a su izquierda)
    const ojos = this.camara.posicionOjos(this._v);
    const pos = this.p.raiz.position;
    const ang = Math.atan2(-(ojos.x - pos.x), -(ojos.z - pos.z));
    // Se da vuelta casi de frente al jugador: así el cartel y la mano de señas quedan de cara
    tor[1] = THREE.MathUtils.clamp(ang * 0.8, -1.1, 1.1);
    ex[1] = THREE.MathUtils.clamp(ang * 0.3, -1, 1);
  }

  volverAEscribir(espera) {
    this.fase = 'espera';
    this.timer = espera ?? azar(this.b.intervaloMin, this.b.intervaloMax);
    this.cartel.visible = false;
    this.revelar = null;
    if (this.p.animador.extra.munecaD) this.p.animador.extra.munecaD[2] = 0;
    this.p.mostrarDedos(0);
    this.p.escalarMano('brazoD', 1);
    this.p.orientarPalma('brazoD', null);
    this.p.animador.pose('escribir', 5);
    this.p.animador.capa('golpear', 0);
    this.mirarAlJugador(false);
    estado.accion.mirandoSenia = false;
    this.hud.setLectura(null);
  }

  empezarGolpes() {
    this.fase = 'golpes';
    this.golpesDados = 0;
    this.timer = 0.15;
    this.p.animador.pose('golpear', 7);
    this.p.animador.capa('golpear', 1);
  }

  empezarSenia() {
    const m = this.examen.datos.machete;
    const pedidosPosibles = m.paraAmigos.filter((i) => !this.yaPedidas.has(i));
    const pasesPosibles = m.seniasPasan.filter((i) => !this.yaPasadas.has(i));
    let tipo = Math.random() < this.b.probPedido ? 'pedido' : 'respuesta';
    if (tipo === 'pedido' && !pedidosPosibles.length) tipo = 'respuesta';
    if (tipo === 'respuesta' && !pasesPosibles.length) tipo = pedidosPosibles.length ? 'pedido' : 'respuesta';
    const pregunta = tipo === 'pedido'
      ? elegir(pedidosPosibles)
      : elegir(pasesPosibles.length ? pasesPosibles : m.seniasPasan);
    const opcion = this.examen.preguntas[pregunta].correcta;
    this.senia = { tipo, pregunta, opcion };

    this.fase = 'senia';
    this.timer = this.b.duracionSenia;
    this.lectura = 0;
    this.p.animador.capa('golpear', 0);
    this.p.animador.pose(tipo === 'pedido' ? 'seniaPedido' : 'seniaCartel', 6);
    // Los dedos no aparecen de golpe: sube el puño, se abren de a uno hasta el número y la mano "late"
    this.revelar = tipo === 'pedido' ? null : { n: opcion + 1, t: 0 };
    this.mostrarDedosSenia(0);
    this.p.escalarMano('brazoD', ESCALA_MANO_SENIA);
    this.dibujarCartel(tipo === 'pedido' ? `¿${pregunta + 1}?` : `${pregunta + 1}`);
    this.cartel.visible = true;
    this.mirarAlJugador(true);
    bus.emit('seniaInicio', { tipo });
  }

  seniaLeida() {
    const s = this.senia;
    estado.registro.seniasLeidas += 1;
    if (s.tipo === 'respuesta') {
      this.yaPasadas.add(s.pregunta);
      estado.sabe.add(s.pregunta);
      participar(this.puntos, { intercambio: true });
      this.hud.mensaje(`${this.nombre} te pasa: «la ${s.pregunta + 1} es la ${LETRAS[s.opcion]}» (${s.opcion + 1} dedo${s.opcion ? 's' : ''})`, 6);
      bus.emit('seniaLeida', s);
      // Termina la seña enseguida
      this.timer = Math.min(this.timer, 0.8);
    } else {
      this.hud.mensaje(`${this.nombre} te pregunta: «¿qué va en la ${s.pregunta + 1}?» — mirala y mostrale los dedos (1–4 = A–D)`, 6);
      this.fase = 'respuesta';
      this.timer = this.b.ventanaRespuesta;
      bus.emit('seniaLeida', s);
    }
  }

  responder(n) {
    const s = this.senia;
    this.yaPedidas.add(s.pregunta);
    estado.accion.mostrandoDedos = n + 1;
    this.dedosTimer = 1.6;
    estado.registro.seniasRespondidas += 1;
    participar(this.puntos, { intercambio: true });
    const bien = n === s.opcion;
    this.hud.mensaje(`Le mostrás ${n + 1} dedo${n ? 's' : ''} a ${this.nombre}: «la ${s.pregunta + 1} es la ${LETRAS[n]}»`, 4);
    bus.emit('seniaRespondida', { ...s, respuesta: n, bien });
    // Ella asiente y vuelve a su hoja
    this.p.animador.capa('asentir', 1);
    setTimeout(() => this.p.animador.capa('asentir', 0), 900);
    this.volverAEscribir();
  }

  update(dt) {
    if (this.fase === 'senia' || this.fase === 'respuesta') {
      this.posicionarCartel();
      this.animarSenia(dt);
    }
    // Dedos del jugador: se bajan solos después de un rato
    if (this.dedosTimer > 0) {
      this.dedosTimer -= dt;
      if (this.dedosTimer <= 0) estado.accion.mostrandoDedos = 0;
    }
    if (estado.final) return;

    // Con el machete guardado (Camino 2) el grupo deja de pedirle cosas
    if (estado.grupoEnojado && this.fase !== 'espera') this.volverAEscribir(9999);

    // Si la profesora se da vuelta o se acerca, disimula
    const enCurso = this.fase === 'golpes' || this.fase === 'senia' || this.fase === 'respuesta';
    if (enCurso && (this.ia.estado !== 'patrulla' || this.ia.mirandoHacia(this.p.raiz.position, 35))) {
      // (no cuenta como ignorada: no es culpa del jugador)
      this.volverAEscribir(azar(8, 14));
      this.p.animador.pose('disimular', 10);
      setTimeout(() => this.fase === 'espera' && this.p.animador.pose('escribir', 4), 3500);
      return;
    }

    this.timer -= dt;
    switch (this.fase) {
      case 'espera':
        if (this.timer <= 0 && !estado.grupoEnojado) {
          if (this.oportunidad()) this.empezarGolpes();
          else this.timer = 1.5;
        }
        break;
      case 'golpes':
        if (this.timer <= 0) {
          if (this.golpesDados < 3) {
            this.golpesDados += 1;
            this.timer = this.b.separacionGolpes;
            const posicion = this.p.raiz.position.clone().setY(0.8);
            const intensidad = this.b.intensidadGolpe + 0.2 * (this.ia.escalada ?? 0);
            bus.emit('golpeLapicera', { posicion, numero: this.golpesDados });
            bus.emit('ruido', { posicion, intensidad, tipo: 'lapicera' });
            this.hud.indicar({ tipo: 'lapicera', posicion, etiqueta: 'toc toc', icono: '✎', duracion: 2.2 });
            if (this.golpesDados === 1) this.hud.subtitulo(`[Toc, toc, toc: ${this.nombre} golpea la lapicera ${this.hud.direccionTexto(posicion)}]`, 3);
          } else {
            this.empezarSenia();
          }
        }
        break;
      case 'senia': {
        const mirando = !estado.accion.modoHoja && this.mirandoAElla();
        estado.accion.mirandoSenia = mirando;
        if (mirando && this.lectura < 1) {
          const panico = estado.panico ?? 0;
          const ritmo = panico > this.b.panicoIlegible ? 0.08 : 1 - panico * 0.6;
          this.lectura = Math.min(1, this.lectura + (dt / this.b.tiempoLectura) * ritmo);
          this.hud.setLectura(this.lectura, panico > this.b.panicoIlegible ? 'La seña se ve borrosa…' : `Leyendo la seña de ${this.nombre}`);
          if (this.lectura >= 1) this.seniaLeida();
        } else if (this.lectura < 1) {
          this.hud.setLectura(null);
        }
        if (this.timer <= 0 && this.fase === 'senia') {
          if (this.lectura < 1) {
            estado.registro.ignorados += 1;
            bus.emit('seniaIgnorada');
          }
          this.volverAEscribir();
        }
        break;
      }
      case 'respuesta':
        estado.accion.mirandoSenia = !estado.accion.modoHoja && this.mirandoAElla();
        this.hud.setLectura(null);
        if (this.timer <= 0) {
          estado.registro.ignorados += 1;
          bus.emit('seniaIgnorada');
          this.p.animador.pose('reclamo', 6);
          this.p.animador.capa('reclamo', 1);
          setTimeout(() => this.p.animador.capa('reclamo', 0), 1500);
          this.hud.subtitulo(`[${this.nombre} te hace un gesto de reclamo]`);
          this.volverAEscribir();
          this.p.animador.pose('reclamo', 6);
          setTimeout(() => this.p.animador.pose('escribir', 4), 1500);
        }
        break;
    }
  }
}
