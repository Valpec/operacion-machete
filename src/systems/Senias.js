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
    this.texCartel = texturaCanvas(128, 96, (ctx) => {
      this.canvasCartel = ctx;
    });
    this.cartel = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.15), new THREE.MeshBasicMaterial({ map: this.texCartel, side: THREE.DoubleSide }));
    this.cartel.position.set(0, -0.1, -0.03);
    this.cartel.rotation.set(1.04, 0, Math.PI); // queda de frente (y derecho) cuando el brazo está levantado
    this.cartel.visible = false;
    personaje.rig.brazoI.muneca.add(this.cartel);

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
    const ctx = this.canvasCartel;
    ctx.fillStyle = '#fffdf3';
    ctx.fillRect(0, 0, 128, 96);
    ctx.strokeStyle = '#999';
    ctx.strokeRect(2, 2, 124, 92);
    ctx.fillStyle = '#1a1a40';
    ctx.font = 'bold 64px "Comic Sans MS", cursive';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(texto, 64, 52);
    this.texCartel.needsUpdate = true;
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
    tor[1] = ang * 0.45;
    ex[1] = THREE.MathUtils.clamp(ang * 0.55, -1, 1);
  }

  volverAEscribir(espera) {
    this.fase = 'espera';
    this.timer = espera ?? azar(this.b.intervaloMin, this.b.intervaloMax);
    this.cartel.visible = false;
    this.p.mostrarDedos(0);
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
    this.p.mostrarDedos(tipo === 'pedido' ? 0 : opcion + 1);
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
