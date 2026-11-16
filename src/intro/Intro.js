import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { ShaderEmocion } from '../fx/Postprocesado.js';
import { estado } from '../core/GameState.js';
import { NOMBRES } from '../characters/config.js';
import { GENERADORES } from '../audio/sintesis.js';
import * as SON from './sonidosIntro.js';
import { crearComedor } from './Comedor.js';
import { ChatGrupo } from './ChatGrupo.js';

const QUIEN = {
  madre: { etiqueta: 'Mamá', voz: 'mujer', color: '#f0b3c8' },
  padre: { etiqueta: 'Papá', voz: 'hombre', color: '#b3cdf0' },
};

// Frases sueltas que "rebotan" en la cabeza del chico cuando ya no puede escuchar
const ECOS = [
  'sí o sí', 'un cuatro', 'tu futuro', 'no te la podés llevar', '¿me escuchaste?', 'con todo lo que hacemos',
  'un nueve', 'mirame', '¿estudiaste?', 'aprobar', 'decepción', 'olvidate', 'no podés fallar', 'mañana',
];

const duracionLinea = (texto) => THREE.MathUtils.clamp(0.06 * texto.length + 0.5, 1.4, 4.2);

/**
 * Intro (Acto I): la cena antes del parcial y el chat del grupo.
 * Usa su propia escena, cámara y postprocesado (con profundidad de campo: los padres siempre
 * quedan fuera de foco o fuera de cuadro). Se puede saltar con Esc o con el botón.
 * reproducir() devuelve { escondite } si el jugador lo eligió en el chat.
 */
export class Intro {
  constructor(game) {
    this.game = game;
    this.correEnPausa = true;
    this.activa = false;
    this.reloj = 0;
    this.esperas = [];
    this.presion = 0;
    this.presionObjetivo = 0;
    this.sacudida = 0;
  }

  // ---------- Armado (la primera vez que se reproduce) ----------
  preparar() {
    if (this.c) return;
    this.c = crearComedor();
    const { renderer } = this.game;
    const tam = renderer.getSize(new THREE.Vector2());
    this.camara = new THREE.PerspectiveCamera(32, tam.x / tam.y, 0.04, 30);
    this.composer = new EffectComposer(renderer);
    this.composer.setPixelRatio(renderer.getPixelRatio());
    this.composer.setSize(tam.x, tam.y);
    this.composer.addPass(new RenderPass(this.c.escena, this.camara));
    this.bokeh = new BokehPass(this.c.escena, this.camara, { focus: 2.5, aperture: 0.004, maxblur: 0.012 });
    this.composer.addPass(this.bokeh);
    this.emocion = new ShaderPass(ShaderEmocion);
    this.emocion.uniforms.resolucion.value.set(tam.x * renderer.getPixelRatio(), tam.y * renderer.getPixelRatio());
    this.emocion.uniforms.desenfoqueMaxPx.value = 10 * renderer.getPixelRatio();
    this.composer.addPass(this.emocion);
    this.composer.addPass(new OutputPass());
    this.camObjetivo = new THREE.Vector3();
    this.camPos = new THREE.Vector3();
  }

  alRedimensionar(w, h) {
    if (!this.c) return;
    this.camara.aspect = w / h;
    this.camara.updateProjectionMatrix();
    this.composer.setSize(w, h);
    const pr = this.game.renderer.getPixelRatio();
    this.emocion.uniforms.resolucion.value.set(w * pr, h * pr);
  }

  // ---------- Audio ----------
  prepararAudio() {
    this.ctx = THREE.AudioContext.getContext();
    if (this.ctx.state === 'suspended') this.ctx.resume();
    if (!this.buffers) {
      const ctx = this.ctx;
      this.buffers = {
        latido: GENERADORES.latido(ctx),
        respiracion: GENERADORES.respiracion(ctx),
        vibracion: GENERADORES.vibracion(ctx),
        tictac: SON.tictac(ctx),
        cubierto: SON.cubierto(ctx),
        zumbido: SON.zumbidoOidos(ctx),
        drone: SON.drone(ctx),
        notificacion: SON.notificacion(ctx),
        enviado: SON.enviado(ctx),
        golpe: GENERADORES.papelCae ? GENERADORES.papelCae(ctx) : null,
      };
    }
    this.maestro = this.ctx.createGain();
    this.maestro.gain.value = estado.opciones?.volumenGeneral ?? 0.8;
    this.maestro.connect(this.ctx.destination);
    // Voces: pasan por un filtro que se cierra con la presión (dejan de entenderse) y un eco
    this.busVoces = this.ctx.createGain();
    this.filtroVoces = this.ctx.createBiquadFilter();
    this.filtroVoces.type = 'lowpass';
    this.filtroVoces.frequency.value = 2800;
    this.eco = this.ctx.createDelay(1);
    this.eco.delayTime.value = 0.23;
    this.ecoGanancia = this.ctx.createGain();
    this.ecoGanancia.gain.value = 0;
    this.busVoces.connect(this.filtroVoces).connect(this.maestro);
    this.filtroVoces.connect(this.eco).connect(this.ecoGanancia).connect(this.eco);
    this.ecoGanancia.connect(this.maestro);
    this.fuentes = new Set();
    // Loops: drone y respiración (volumen según la presión)
    this.loopDrone = this.loop('drone', 0);
    this.loopRespiracion = this.loop('respiracion', 0);
    this.proximoLatido = 0;
    this.proximoTic = 0;
  }

  loop(nombre, vol) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffers[nombre];
    src.loop = true;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(g).connect(this.maestro);
    src.start();
    this.fuentes.add(src);
    return { src, g };
  }

  sonar(nombre, { vol = 1, rate = 1, pan = 0, destino } = {}) {
    const buffer = typeof nombre === 'string' ? this.buffers[nombre] : nombre;
    if (!buffer || !this.ctx) return null;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = rate;
    const g = this.ctx.createGain();
    g.gain.value = vol * (estado.opciones?.volumenEfectos ?? 1);
    const p = this.ctx.createStereoPanner();
    p.pan.value = THREE.MathUtils.clamp(pan, -1, 1);
    src.connect(g).connect(p).connect(destino ?? this.maestro);
    src.start();
    this.fuentes.add(src);
    src.onended = () => this.fuentes.delete(src);
    return src;
  }

  detenerAudio() {
    for (const s of this.fuentes ?? []) {
      try {
        s.stop();
      } catch {
        /* ya terminó */
      }
    }
    this.fuentes?.clear();
    this.maestro?.disconnect();
  }

  // Paneo estéreo según dónde está el personaje en pantalla
  paneo(personaje) {
    const v = personaje.raiz.position.clone().setY(1.3).project(this.camara);
    return THREE.MathUtils.clamp(v.x * 0.8, -0.9, 0.9);
  }

  // ---------- Tiempo del guion (avanza con el loop del juego; saltar lo resuelve todo) ----------
  esperar(segundos) {
    if (this.saltado) return Promise.resolve();
    return new Promise((resolver) => this.esperas.push({ hasta: this.reloj + segundos, resolver }));
  }

  // ---------- Interfaz (subtítulos, carteles, ecos, botón saltar) ----------
  crearCapa() {
    this.capa = document.createElement('div');
    this.capa.className = 'intro-capa';
    this.capa.innerHTML = `
      <div class="intro-negro"></div>
      <div class="intro-ecos"></div>
      <div class="intro-cartel"></div>
      <div class="intro-subtitulos"></div>
      <button class="intro-saltar" type="button">Saltar intro <kbd>Esc</kbd></button>`;
    document.getElementById('ui').appendChild(this.capa);
    this.negro = this.capa.querySelector('.intro-negro');
    this.cartelEl = this.capa.querySelector('.intro-cartel');
    this.subs = this.capa.querySelector('.intro-subtitulos');
    this.ecosEl = this.capa.querySelector('.intro-ecos');
    this.capa.querySelector('.intro-saltar').addEventListener('click', () => this.saltar());
    this.alTecla = (e) => {
      if (e.code === 'Escape') this.saltar();
    };
    window.addEventListener('keydown', this.alTecla);
  }

  negroA(opacidad, segundos = 1) {
    this.negro.style.transition = `opacity ${segundos}s ease`;
    this.negro.style.opacity = String(opacidad);
  }

  cartel(texto) {
    this.cartelEl.classList.toggle('visible', !!texto);
    if (texto) this.cartelEl.innerHTML = texto;
  }

  subtitulo(quien, texto, segundos) {
    const q = QUIEN[quien];
    const p = document.createElement('p');
    p.innerHTML = q ? `<b style="color:${q.color}">${q.etiqueta}:</b> ${texto}` : texto;
    this.subs.appendChild(p);
    while (this.subs.children.length > 3) this.subs.firstChild.remove();
    setTimeout(() => p.classList.add('fuera'), segundos * 1000);
    setTimeout(() => p.remove(), segundos * 1000 + 600);
  }

  ecoSuelto(texto) {
    const s = document.createElement('span');
    s.textContent = texto;
    const ang = Math.random() * Math.PI * 2;
    const r = 28 + Math.random() * 16;
    s.style.left = `${50 + Math.cos(ang) * r}%`;
    s.style.top = `${46 + Math.sin(ang) * r * 0.75}%`;
    s.style.fontSize = `${1.1 + Math.random() * 1.6}rem`;
    s.style.setProperty('--giro', `${(Math.random() - 0.5) * 16}deg`);
    this.ecosEl.appendChild(s);
    setTimeout(() => s.remove(), 2600);
  }

  // Un padre dice una frase: voz inventada + subtítulo. Devuelve la duración.
  linea(quien, texto, { enojo = 0.5, solapar = false } = {}) {
    if (this.saltado) return Promise.resolve();
    const seg = duracionLinea(texto);
    const q = QUIEN[quien];
    const buffer = SON.frase(this.ctx, { voz: q.voz, segundos: seg, enojo, semilla: texto.length * 13 + texto.charCodeAt(0) });
    const personaje = this.c[quien];
    this.sonar(buffer, { vol: 0.8 + enojo * 0.4, pan: this.paneo(personaje), destino: this.busVoces });
    this.subtitulo(quien, texto, seg + 0.4);
    personaje.animador.capa('retar', 0.6 + enojo * 0.6);
    this.esperar(seg).then(() => personaje.animador.capa('retar', 0.15));
    return this.esperar(solapar ? seg * 0.45 : seg + 0.25);
  }

  // ---------- Padres: caminan entre puntos y miran al chico ----------
  mover(personaje, x, z, velocidad = 0.75) {
    personaje.destino = new THREE.Vector3(x, 0, z);
    personaje.velocidad = velocidad;
  }

  ubicar(personaje, x, z, mirarAlChico = true) {
    personaje.destino = null;
    personaje.raiz.position.set(x, 0, z);
    if (mirarAlChico) personaje.raiz.rotation.y = this.anguloHacia(personaje.raiz.position, this.c.chico.raiz.position);
    personaje.velActual = 0;
  }

  anguloHacia(desde, hacia) {
    return Math.atan2(-(hacia.x - desde.x), -(hacia.z - desde.z));
  }

  actualizarPadres(dt) {
    const chico = this.c.chico.raiz.position;
    for (const p of [this.c.madre, this.c.padre]) {
      const an = p.animador;
      let objetivoAng = this.anguloHacia(p.raiz.position, chico);
      let paso = 0;
      if (p.destino) {
        const d = p.destino.clone().sub(p.raiz.position).setY(0);
        const dist = d.length();
        const velObj = Math.min(p.velocidad, Math.sqrt(2 * 1.5 * dist));
        p.velActual = (p.velActual ?? 0) + THREE.MathUtils.clamp(velObj - (p.velActual ?? 0), -3 * dt, 1.5 * dt);
        paso = Math.min(dist, p.velActual * dt);
        if (dist < 0.02) {
          p.destino = null;
          p.velActual = 0;
        } else {
          p.raiz.position.addScaledVector(d.normalize(), paso);
          objetivoAng = Math.atan2(-d.x, -d.z);
        }
      }
      const diff = Math.atan2(Math.sin(objetivoAng - p.raiz.rotation.y), Math.cos(objetivoAng - p.raiz.rotation.y));
      p.raiz.rotation.y += diff * (1 - Math.exp(-5 * dt));
      an.faseCaminar += (paso / 0.62) * Math.PI;
      // Girar en el lugar con pasitos (en vez de rotar patinando sobre los pies)
      const giro = Math.abs(diff * (1 - Math.exp(-5 * dt)));
      const girando = !p.destino && giro / dt > 0.35;
      if (girando) an.faseCaminar += giro * 1.8;
      an.zancada = girando ? 0.14 : 0.34;
      an.velCamina = p.velActual ?? 0;
      an.balanceoBrazos = girando ? 0.3 : 1;
      an.capa('caminar', p.destino || girando ? 1 : 0);
      // Parados no quedan congelados: cambian el peso, respiran, mueven la cabeza
      an.capa('vivo', p.destino || girando ? 0 : 1);
      p.update(dt, this.reloj);
    }
  }

  // ---------- Planos de cámara ----------
  plano(nombre) {
    const { chico, madre, padre } = this.c;
    chico.rig.cabeza.scale.setScalar(1);
    this.planoActual = nombre;
    this.tPlano = 0;
    const b = this.bokeh.uniforms;
    if (nombre === 'general') {
      // Desde el otro lado de la mesa: el chico en el centro, los padres cortados arriba
      this.camara.fov = 34;
      this.camPos.set(-0.38, 1.16, -1.55);
      this.camObjetivo.set(0.02, 0.97, 0.88);
      b.focus.value = 2.55;
      b.aperture.value = 0.0035;
      b.maxblur.value = 0.01;
      this.ubicar(madre, -1.7, 1.95);
      this.mover(madre, 1.3, 1.75, 0.6);
      this.ubicar(padre, 1.35, 0.95);
      padre.animador.pose('brazosEnJarra', 3);
      madre.animador.pose('parado', 3);
    } else if (nombre === 'primerPlano') {
      // Primer plano del chico; atrás, los padres pasan desenfocados
      this.camara.fov = 30;
      this.camPos.set(0.24, 0.99, 0.1);
      this.camObjetivo.set(0, 1.02, 0.84);
      b.focus.value = 0.82;
      b.aperture.value = 0.022;
      b.maxblur.value = 0.022;
      this.ubicar(padre, 1.6, 2.0);
      this.mover(padre, -1.4, 1.85, 0.55);
      this.ubicar(madre, -0.9, 2.25);
      madre.animador.pose('brazosEnJarra', 3);
      padre.animador.pose('senalar', 3);
    } else if (nombre === 'pov') {
      // Por encima del hombro del chico: el plato, los apuntes y las manos del padre golpeando la mesa
      // (el padre se inclina desde el otro lado; su cara queda fuera de cuadro)
      this.camara.fov = 42;
      this.camPos.set(0.3, 1.38, 1.25);
      this.camObjetivo.set(-0.06, 0.86, -0.2);
      b.focus.value = 1.55;
      b.aperture.value = 0.01;
      b.maxblur.value = 0.016;
      this.ubicar(padre, -0.12, -0.74);
      padre.animador.pose('apoyarMesa', 5);
      this.ubicar(madre, 1.02, 0.25);
      madre.animador.pose('senalar', 4);
    } else if (nombre === 'celular') {
      this.camara.fov = 30;
      this.camPos.set(0.44, 1.02, 0.68);
      this.camObjetivo.set(0.27, 0.78, 0.36);
      b.focus.value = 0.42;
      b.aperture.value = 0.03;
      b.maxblur.value = 0.02;
      this.ubicar(padre, 1.6, 2.4);
      this.ubicar(madre, -1.5, 2.5);
      madre.animador.pose('parado', 3);
      padre.animador.pose('parado', 3);
    }
    this.camara.updateProjectionMatrix();
    this.camBase = this.camPos.clone();
  }

  actualizarCamara(dt) {
    this.tPlano += dt;
    const t = this.reloj;
    const pos = this.camBase.clone();
    // Movimientos lentos de cada plano (acercamiento que agobia)
    if (this.planoActual === 'general') pos.add(new THREE.Vector3(0.12, 0, 0.35).multiplyScalar(Math.min(1, this.tPlano / 14)));
    if (this.planoActual === 'primerPlano') pos.lerp(new THREE.Vector3(0.13, 0.98, 0.3), Math.min(1, this.tPlano / 18) * 0.8);
    if (this.planoActual === 'celular') pos.lerp(new THREE.Vector3(0.36, 0.95, 0.5), Math.min(1, this.tPlano / 6) * 0.7);
    // Cámara en mano: respira con la presión, y se sacude con los golpes
    const temblor = 0.004 + this.presion * 0.01 + this.sacudida * 0.03;
    pos.x += (Math.sin(t * 1.3) + Math.sin(t * 2.9) * 0.4) * temblor;
    pos.y += (Math.sin(t * 1.7 + 1) + Math.sin(t * 3.7) * 0.4) * temblor;
    this.camara.position.copy(pos);
    this.camara.lookAt(this.camObjetivo);
    if (this.planoActual === 'pov') {
      pos.lerp(new THREE.Vector3(0.22, 1.3, 1.05), Math.min(1, this.tPlano / 10) * 0.7);
      this.camara.position.copy(pos);
      this.camara.lookAt(this.camObjetivo);
      this.camara.rotation.z += Math.sin(t * 0.8) * 0.012 * (1 + this.presion);
    }
    this.sacudida = Math.max(0, this.sacudida - dt * 2.5);
  }

  // ---------- Presión: imagen, latido, voces ----------
  actualizarPresion(dt) {
    this.presion += (this.presionObjetivo - this.presion) * (1 - Math.exp(-1.2 * dt));
    const p = this.presion;
    const u = this.emocion.uniforms;
    u.desenfoquePeriferico.value = p * 0.9;
    u.desenfoqueGeneral.value = Math.max(0, p - 0.7) * 0.6;
    u.vineta.value = 0.35 + p * 0.6;
    u.saturacion.value = 1 - p * 0.65;
    u.temperatura.value = 0.35 - p * 1.1;
    u.brillo.value = 1 - p * 0.08;
    if (!this.ctx) return;
    const ahora = this.ctx.currentTime;
    this.loopDrone.g.gain.setTargetAtTime(Math.max(0, p - 0.25) * 0.35, ahora, 0.3);
    this.loopRespiracion.g.gain.setTargetAtTime(Math.max(0, p - 0.45) * 0.5, ahora, 0.3);
    this.filtroVoces.frequency.setTargetAtTime(2800 - p * 1900, ahora, 0.3);
    this.ecoGanancia.gain.setTargetAtTime(Math.max(0, p - 0.5) * 0.7, ahora, 0.3);
    // Latido: más rápido y más fuerte con la presión
    if (this.latidoActivo && this.reloj >= this.proximoLatido) {
      this.sonar('latido', { vol: 0.35 + p * 0.65 });
      this.proximoLatido = this.reloj + 60 / (72 + p * 70);
    }
    // Tic-tac del reloj de pared
    if (this.ticActivo && this.reloj >= this.proximoTic) {
      this.sonar('tictac', { vol: 0.12 + p * 0.18, pan: 0.3 });
      this.proximoTic = this.reloj + 1;
      // La aguja del segundero no existe: se mueve un poquito el minutero para que se note el paso del tiempo
      this.c.agujas[1].rotation.z -= (Math.PI * 2) / 3600;
    }
  }

  // ---------- Loop ----------
  update(dtJuego) {
    if (!this.activa) return;
    // La intro corre con el reloj real (las voces y el latido son audio en tiempo real):
    // si bajan los cuadros por segundo, el guion no se atrasa respecto del sonido
    const ahora = performance.now() / 1000;
    const dt = Math.min(0.25, Math.max(0, ahora - (this.ultimoCuadro ?? ahora)) || dtJuego);
    this.ultimoCuadro = ahora;
    this.reloj += dt;
    if (this.esperas.length) {
      const listas = this.esperas.filter((e) => this.reloj >= e.hasta);
      this.esperas = this.esperas.filter((e) => this.reloj < e.hasta);
      listas.forEach((e) => e.resolver());
    }
    this.c.chico.update(dt, this.reloj);
    this.actualizarPadres(dt);
    this.actualizarCamara(dt);
    this.actualizarPresion(dt);
    // Vibración del celular sobre la mesa
    if (this.vibrando > 0) {
      this.vibrando -= dt;
      this.c.celular.position.x = 0.27 + Math.sin(this.reloj * 90) * 0.0018;
      this.c.celular.rotation.y = -0.18 + Math.sin(this.reloj * 70) * 0.012;
    }
  }

  // ---------- Reproducción ----------
  async reproducir() {
    this.preparar();
    this.reloj = 0;
    this.ultimoCuadro = null;
    this.esperas = [];
    this.saltado = false;
    this.presion = 0;
    this.presionObjetivo = 0;
    this.latidoActivo = false;
    this.ticActivo = false;
    this.vibrando = 0;
    this.resultado = {};
    this.c.celular.userData.apagar();
    this.c.chico.animador.poseInicial('cenar');
    this.c.chico.animador.capa('revolver', 1);
    this.prepararAudio();
    this.crearCapa();
    this.plano('general');
    this.actualizarCamara(0);
    this.anteriorRender = this.game.renderizar;
    this.game.renderizar = (dt) => this.composer.render(dt);
    this.activa = true;
    await new Promise((resolver) => {
      this.alTerminar = resolver;
      this.guion().then(() => this.terminar());
    });
    return this.resultado;
  }

  saltar() {
    if (this.saltado || !this.activa) return;
    this.saltado = true;
    this.esperas.forEach((e) => e.resolver());
    this.esperas = [];
    this.chat?.cerrar();
    this.terminar();
  }

  terminar() {
    if (!this.activa) return;
    this.activa = false;
    this.detenerAudio();
    window.removeEventListener('keydown', this.alTecla);
    this.chat?.cerrar();
    this.chat = null;
    this.capa.classList.add('saliendo');
    const capa = this.capa;
    setTimeout(() => capa.remove(), 800);
    this.game.renderizar = this.anteriorRender;
    this.alTerminar?.();
  }

  // ---------- Guion ----------
  async guion() {
    const { chico, madre, padre, celular } = this.c;
    const E = (s) => this.esperar(s);
    const corte = () => this.saltado;

    this.negroA(1, 0);
    await E(0.6);
    this.cartel('La noche antes del parcial.');
    await E(2.6);
    this.cartel(null);
    await E(0.6);
    if (corte()) return;

    // Plano general: la mesa tapada de apuntes, el chico solo bajo la lámpara
    this.ticActivo = true;
    this.negroA(0, 2);
    this.presionObjetivo = 0.1;
    await E(1.6);
    this.sonar('cubierto', { vol: 0.25 });
    await this.linea('madre', '¿Otra vez con la cabeza en otro lado? Te estoy hablando.', { enojo: 0.35 });
    await this.linea('padre', 'Mañana es el parcial. ¿Estudiaste o no estudiaste?', { enojo: 0.5 });
    this.sonar('cubierto', { vol: 0.2, rate: 0.9 });
    this.mover(madre, 0.4, 1.95, 0.5);
    await this.linea('madre', 'La última nota fue un cuatro. Un cuatro.', { enojo: 0.55 });
    if (corte()) return;

    // Primer plano: el chico no levanta la vista; atrás, sus padres son manchas que van y vienen
    this.plano('primerPlano');
    this.presionObjetivo = 0.3;
    this.latidoActivo = true;
    this.proximoLatido = this.reloj + 0.4;
    await E(0.8);
    await this.linea('padre', 'Esta materia no te la podés llevar. Sí o sí tenés que aprobar.', { enojo: 0.6 });
    this.mover(madre, 0.9, 1.6, 0.5);
    await this.linea('madre', 'Con todo lo que hacemos por vos…', { enojo: 0.45 });
    chico.animador.pose('agobiado', 2);
    chico.animador.capa('revolver', 0.3);
    this.presionObjetivo = 0.45;
    await this.linea('padre', '¿Sabés lo que nos cuesta mandarte a ese colegio?', { enojo: 0.65 });
    this.mover(padre, 0.6, 1.7, 0.6);
    await this.linea('madre', 'Tu primo se sacó un nueve. ¡Un nueve!', { enojo: 0.6 });
    if (corte()) return;

    // Punto de vista: el plato, los apuntes y las manos de los padres golpeando la mesa
    this.plano('pov');
    chico.animador.pose('cenar', 3);
    chico.animador.capa('revolver', 0.6);
    this.presionObjetivo = 0.7;
    await E(0.5);
    this.sonar('golpe', { vol: 1.4, rate: 0.55, pan: -0.4 });
    this.sacudida = 1;
    this.linea('padre', '¡El estudio es tu único futuro! ¿Me escuchaste?', { enojo: 0.9, solapar: true });
    await E(1.2);
    this.ecoSuelto('tu futuro');
    await this.linea('madre', 'Mirame cuando te hablo.', { enojo: 0.7, solapar: true });
    this.presionObjetivo = 0.85;
    this.ecoSuelto('sí o sí');
    await this.linea('padre', 'Si te llevás la materia, olvidate del celular.', { enojo: 0.85, solapar: true });
    this.ecoSuelto('un cuatro');
    await this.linea('madre', '…de la compu, de salir, de todo.', { enojo: 0.8, solapar: true });
    this.presionObjetivo = 1;
    for (let i = 0; i < 9 && !corte(); i++) {
      this.ecoSuelto(ECOS[(i * 5) % ECOS.length]);
      await E(0.22);
    }
    this.linea('madre', '¡Sí o sí!', { enojo: 1, solapar: true });
    this.linea('padre', '¡Sí o sí!', { enojo: 1, solapar: true });
    this.sonar('zumbido', { vol: 0.25 });
    for (let i = 0; i < 8 && !corte(); i++) {
      this.ecoSuelto(ECOS[(i * 3 + 2) % ECOS.length]);
      await E(0.16);
    }
    if (corte()) return;

    // Corte a negro: silencio de golpe (sólo el reloj)
    this.negroA(1, 0.05);
    this.detenerAudio();
    this.prepararAudio();
    this.latidoActivo = false;
    this.presionObjetivo = 0;
    this.presion = 0.2;
    this.subs.innerHTML = '';
    this.ecosEl.innerHTML = '';
    await E(1.4);
    if (corte()) return;

    // El celular vibra sobre la mesa: lo agregaron a un grupo
    this.plano('celular');
    madre.animador.capa('retar', 0);
    padre.animador.capa('retar', 0);
    this.negroA(0, 0.6);
    await E(1.0);
    celular.userData.encender(`${NOMBRES.mensajero} te añadió al grupo\n${NOMBRES.mensajero}: bueno gente 🫡`);
    this.sonar('vibracion', { vol: 0.7 });
    this.vibrando = 0.45;
    await E(0.9);
    this.sonar('vibracion', { vol: 0.7 });
    this.vibrando = 0.45;
    await E(1.6);
    if (corte()) return;

    // El chat del grupo
    this.bokeh.uniforms.focus.value = 3;
    this.presionObjetivo = 0.15;
    this.chat = new ChatGrupo(this.capa, { sonar: (n) => this.sonar(n, { vol: 0.5 }) });
    const r = await this.chat.reproducir();
    if (corte()) return;
    this.resultado.escondite = r.escondite;
    this.chat.cerrar();
    this.chat = null;
    await E(0.6);

    // Cierre del acto I
    this.negroA(1, 1.2);
    await E(1.4);
    this.cartel('Esa noche armó el machete…');
    await E(2.6);
    this.cartel('…y se quedó jugando hasta tarde.');
    await E(2.6);
    this.cartel(null);
    await E(0.8);
  }
}
