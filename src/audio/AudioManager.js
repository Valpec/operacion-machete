import * as THREE from 'three';
import { bus } from '../core/EventBus.js';
import { estado } from '../core/GameState.js';
import { GENERADORES } from './sintesis.js';

// Un buffer más largo que esto se considera una grabación continua (loop) y no un golpe suelto
const DURACION_LOOP = 1.5;

// Lleva el pico del archivo al mismo nivel que los sonidos procedurales, así los volúmenes
// de balance.json funcionan igual con archivos grabados a distinto nivel
function normalizar(buffer, pico) {
  let max = 0;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < d.length; i++) max = Math.max(max, Math.abs(d[i]));
  }
  if (max <= 0) return;
  const k = pico / max;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < d.length; i++) d[i] *= k;
  }
}

/**
 * Audio del juego con Web Audio API + THREE.PositionalAudio.
 *  - Todos los sonidos tienen una versión procedural (audio/sintesis.js).
 *  - Si existe public/audio/sonidos.json, se cargan esos archivos y reemplazan a los procedurales
 *    con el mismo nombre (ver public/audio/LEEME.txt).
 *  - "paso" y "latido" aceptan un golpe corto (se repite por evento) o una grabación larga (loop).
 *  - Buses: efectos, ambiente (con "ducking" por pánico y concentración) y cuerpo (latido/respiración).
 */
export class AudioManager {
  constructor({ camera, profesora, elenco, aula, balance }) {
    this.b = balance.audio;
    this.ia = profesora;
    this.listener = new THREE.AudioListener();
    camera.add(this.listener);
    this.ctx = this.listener.context;
    this.correEnPausa = true;

    // Buses
    this.busEfectos = this.ctx.createGain();
    this.busAmbiente = this.ctx.createGain();
    this.busCuerpo = this.ctx.createGain(); // latido y respiración (no se atenúan con el ducking)
    for (const b of [this.busEfectos, this.busAmbiente, this.busCuerpo]) b.connect(this.listener.getInput());

    // Buffers procedurales (los archivos los reemplazan cuando terminan de cargar)
    this.buffers = {};
    for (const [nombre, gen] of Object.entries(GENERADORES)) this.buffers[nombre] = gen(this.ctx);
    this.cargando = this.cargarArchivos();

    // Profesora: pasos (golpe por paso o loop mientras camina) y voz
    this.fuentePasos = this.posicional(profesora.raiz, 1.4, 0.1);
    this.pasosLoop = this.posicional(profesora.raiz, 0, 0.1);
    this.pasosLoop.setLoop(true);
    this.volPasos = 0;
    this.vozProfe = this.posicional(profesora.raiz, this.b.volumenVozProfe, 1.6);
    this.fuenteLapicera = this.posicional(elenco.senias.raiz, 1.2, 0.85);

    // Compañeros escribiendo (loops posicionales: dan vida al aula)
    this.escrituras = [elenco.aplicado, ...elenco.relleno.slice(0, 4)].map((p, i) => {
      const a = this.posicional(p.raiz, this.b.volumenEscritura * (i === 0 ? 1 : 0.4), 0.85, this.busAmbiente);
      a.setLoop(true);
      a.setPlaybackRate(0.92 + Math.random() * 0.16);
      return a;
    });
    // Cuchicheos al fondo del aula, entre las esquinas del grupo
    const fondo = new THREE.Object3D();
    fondo.position.set(0, 0, aula.limites.zMax - 1.2);
    profesora.raiz.parent.add(fondo);
    this.susurro = this.posicional(fondo, this.b.volumenSusurro, 1.1, this.busAmbiente);
    this.susurro.setLoop(true);

    // Pool para sonidos en posiciones arbitrarias (papeles)
    this.pool = Array.from({ length: 6 }, () => {
      const obj = new THREE.Object3D();
      profesora.raiz.parent.add(obj);
      return this.posicional(obj, 0.8);
    });
    this.indicePool = 0;

    // Ambiente y cuerpo (no posicionales)
    this.ambiente = this.global(this.busAmbiente, true);
    this.ambiente.setVolume(this.b.volumenAmbiente);
    this.respiracion = this.global(this.busCuerpo, true);
    this.respiracion.setVolume(0);
    this.latidoLoop = this.global(this.busCuerpo, true);
    this.latidoLoop.setVolume(0);
    this.proximoLatido = 0;
    this.iniciado = false;

    this.escuchar();
  }

  posicional(objeto, volumen = 1, alturaY = 1.0, destino = this.busEfectos) {
    const a = new THREE.PositionalAudio(this.listener);
    a.setRefDistance(this.b.refDistancia);
    a.setRolloffFactor(this.b.rolloff);
    a.setDistanceModel('inverse');
    a.setVolume(volumen);
    a.position.y = alturaY;
    a.gain.disconnect();
    a.gain.connect(destino);
    objeto.add(a);
    return a;
  }

  global(destino, loop) {
    const a = new THREE.Audio(this.listener);
    a.gain.disconnect();
    a.gain.connect(destino);
    a.setLoop(loop);
    return a;
  }

  // ¿El sonido es una grabación larga (loop) en vez de un golpe suelto?
  esLoop(nombre) {
    return (this.buffers[nombre]?.duration ?? 0) > DURACION_LOOP;
  }

  async cargarArchivos() {
    try {
      const r = await fetch('audio/sonidos.json');
      if (!r.ok || !(r.headers.get('content-type') ?? '').includes('json')) return;
      const lista = await r.json();
      await Promise.all(
        Object.entries(lista)
          .filter(([nombre]) => !nombre.startsWith('_'))
          .map(async ([nombre, entrada]) => {
            // Cada entrada puede ser "archivo.wav" o { "archivo": "archivo.wav", "ganancia": 1.5 }
            const archivo = typeof entrada === 'string' ? entrada : entrada.archivo;
            const ganancia = typeof entrada === 'string' ? 1 : entrada.ganancia ?? 1;
            try {
              const datos = await (await fetch(`audio/${archivo}`)).arrayBuffer();
              const buffer = await this.ctx.decodeAudioData(datos);
              normalizar(buffer, 0.9 * ganancia);
              this.buffers[nombre] = buffer;
              console.info(`[audio] "${nombre}" ← ${archivo} (${buffer.duration.toFixed(1)} s)`);
            } catch (e) {
              console.warn(`[audio] no se pudo cargar ${archivo}; queda el procedural`, e);
            }
          }),
      );
      // Los loops que ya estaban sonando pasan a usar los archivos
      if (this.iniciado) this.reiniciarLoops();
    } catch {
      /* sin archivos: todo procedural */
    }
  }

  // El navegador sólo deja arrancar el audio después de un gesto del usuario
  iniciar() {
    if (this.ctx.state === 'suspended') this.ctx.resume();
    if (this.iniciado) return;
    this.iniciado = true;
    this.reiniciarLoops();
    // Al empezar, la profe da las indicaciones del examen
    setTimeout(() => this.hablarProfe(3.5), 600);
  }

  reiniciarLoops() {
    const loops = [
      [this.respiracion, 'respiracion'],
      ...this.escrituras.map((e) => [e, 'escritura']),
      [this.susurro, 'susurro'],
    ];
    // El rumor de fondo sólo suena si tiene volumen en balance.json (audio.volumenAmbiente)
    if (this.b.volumenAmbiente > 0) loops.push([this.ambiente, 'ambiente']);
    if (this.esLoop('latido')) loops.push([this.latidoLoop, 'latido']);
    if (this.esLoop('paso')) loops.push([this.pasosLoop, 'paso']);
    for (const [a, nombre] of loops) {
      const buffer = this.buffers[nombre];
      if (!buffer) continue;
      if (a.isPlaying) a.stop();
      a.setBuffer(buffer);
      // Cada loop arranca en un punto distinto para que no suenen todos sincronizados
      a.offset = buffer.duration > 3 ? Math.random() * buffer.duration * 0.8 : 0;
      a.play();
    }
  }

  // Dispara un buffer en una fuente posicional (con una leve variación de tono)
  disparar(fuente, nombre, volumen = 1, variacion = 0.08) {
    if (!this.iniciado || !this.buffers[nombre]) return;
    if (fuente.isPlaying) fuente.stop();
    fuente.setBuffer(this.buffers[nombre]);
    fuente.offset = 0;
    fuente.duration = undefined;
    fuente.setVolume(volumen);
    fuente.setPlaybackRate(1 + (Math.random() * 2 - 1) * variacion);
    fuente.play();
  }

  enPosicion(posicion, nombre, volumen = 1) {
    const fuente = this.pool[this.indicePool++ % this.pool.length];
    fuente.parent.position.copy(posicion);
    fuente.position.y = 0;
    this.disparar(fuente, nombre, volumen);
  }

  sinPosicion(nombre, volumen = 1, destino = this.busEfectos) {
    if (!this.iniciado || !this.buffers[nombre]) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffers[nombre];
    const g = this.ctx.createGain();
    g.gain.value = volumen;
    src.connect(g).connect(destino);
    src.start();
  }

  // La profe habla unos segundos (un fragmento al azar de la grabación de su voz)
  hablarProfe(segundos = 2.5) {
    const buffer = this.buffers.hablaProfe;
    if (!this.iniciado || !buffer || estado.final) return;
    const v = this.vozProfe;
    if (v.isPlaying) v.stop();
    v.setBuffer(buffer);
    v.setLoop(false);
    v.offset = Math.random() * Math.max(0, buffer.duration - segundos);
    v.duration = Math.min(segundos, buffer.duration);
    v.play();
  }

  escuchar() {
    bus.on('pointerlock', (b) => b && this.iniciar());
    bus.on('paso', ({ fuerte }) => {
      // Si "paso" es una grabación larga, suena en loop mientras camina (ver update)
      if (!this.esLoop('paso')) this.disparar(this.fuentePasos, 'paso', fuerte ? 1.3 : 1);
    });
    bus.on('golpeLapicera', () => this.disparar(this.fuenteLapicera, 'lapicera', 1, 0.04));
    bus.on('papelLanzado', ({ posicion }) => this.enPosicion(posicion, 'soplido', 0.6));
    bus.on('papelDevuelto', ({ posicion }) => this.enPosicion(posicion, 'soplido', 0.7));
    bus.on('papelCae', ({ posicion, origen }) => this.enPosicion(posicion, 'papelCae', origen === 'jugador' ? 1.6 : 1.2));
    bus.on('papelAtrapado', () => this.sinPosicion('papel', 0.7));
    bus.on('destelloMemoria', () => this.sinPosicion('destello', 0.35));
    bus.on('macheteAbre', ({ escondite }) => {
      const sonido = { cartuchera: 'cierre', manga: 'tela', celular: 'vibracion' }[escondite];
      this.sinPosicion(sonido, escondite === 'cartuchera' ? 0.15 : 0.4);
    });
    bus.on('timbre', () => this.sinPosicion('timbre', 0.8));
    // Voz de la profe: cuando viene a revisar tu banco y cuando te saca la hoja
    bus.on('profesoraEstado', ({ estado: e, banco }) => {
      if (e === 'inspeccion' && banco === this.ia.aula.bancoCentral) this.hablarProfe(1.8);
    });
    bus.on('profesoraHabla', ({ segundos } = {}) => this.hablarProfe(segundos ?? 3));
  }

  update(dt) {
    const op = estado.opciones ?? {};
    const t = this.ctx.currentTime;
    this.listener.setMasterVolume(estado.pausado && !estado.final ? 0.25 * (op.volumenGeneral ?? 0.8) : op.volumenGeneral ?? 0.8);
    const efectos = op.volumenEfectos ?? 1;
    const p = estado.panico ?? 0;
    const c = estado.concentracion ?? 0;

    // Ducking: el pánico tapa el ambiente y la concentración lo atenúa
    const duck = (1 - p * this.b.duckingPanico) * (1 - c * this.b.duckingHoja);
    this.busAmbiente.gain.setTargetAtTime(duck * efectos, t, 0.1);
    this.busEfectos.gain.setTargetAtTime(efectos * (1 - p * 0.5) * (1 - c * 0.35), t, 0.1);
    this.busCuerpo.gain.setTargetAtTime(efectos, t, 0.1);

    if (!this.iniciado) return;
    // Respiración: más fuerte y rápida con el pánico
    this.respiracion.setVolume(Math.max(0, p - 0.1) * this.b.volumenRespiracionMax);
    this.respiracion.setPlaybackRate(1 + p * 0.5);

    // Latido: grabación en loop que sube de volumen y se acelera, o un golpe por pulsación
    if (this.esLoop('latido')) {
      this.latidoLoop.setVolume(p * this.b.volumenLatidoMax);
      if (this.latidoLoop.isPlaying) this.latidoLoop.setPlaybackRate(0.9 + p * 0.6);
    } else if (p > 0.05 && t >= this.proximoLatido) {
      const ppm = 72 + p * 88;
      this.sinPosicion('latido', p * this.b.volumenLatidoMax, this.busCuerpo);
      this.proximoLatido = t + 60 / ppm;
    }

    // Tacos de la profe en loop: suenan sólo mientras camina, al ritmo de su velocidad
    if (this.esLoop('paso')) {
      const camina = this.ia.ruta.length > 0 && !estado.final;
      const objetivo = camina ? this.b.volumenPasos * (this.ia.estado === 'patrulla' ? 1 : 1.3) : 0;
      this.volPasos += (objetivo - this.volPasos) * Math.min(1, dt * 8);
      this.pasosLoop.setVolume(this.volPasos);
      if (this.pasosLoop.isPlaying) this.pasosLoop.setPlaybackRate(this.ia.velocidad / this.ia.b.velocidadPatrulla);
    }
  }
}
