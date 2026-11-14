import { bus } from '../core/EventBus.js';
import { CONTROLES } from '../core/controles.js';
import { estado } from '../core/GameState.js';

const LETRAS = ['A', 'B', 'C', 'D'];

const escapar = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const escaparRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Panel HTML del examen (estética de hoja de papel). Aparece en el modo hoja.
 * El mouse sigue bloqueado (Pointer Lock), así que se maneja con un cursor virtual:
 * el movimiento del mouse mueve una lapicera sobre la hoja y el clic izquierdo marca.
 * También se puede usar el teclado: 1-4 marca la opción, flechas cambian de pregunta.
 */
export class PanelExamen {
  constructor({ examen, input, balance }) {
    this.examen = examen;
    this.input = input;
    this.b = balance.hoja;
    this.cursor = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    this.hover = null;
    this.confirmando = false;

    this.raiz = document.createElement('div');
    this.raiz.className = 'examen';
    this.raiz.innerHTML = `
      <div class="hoja-papel">
        <header class="hoja-cabecera">
          <div class="hoja-titulo">${escapar(examen.datos.titulo)}</div>
          <div class="hoja-alumno">Alumno/a: <span class="manuscrito">Yo</span> &nbsp;·&nbsp; Legajo: <span class="manuscrito">12345</span></div>
          <nav class="hoja-pestanias"></nav>
        </header>
        <div class="hoja-cuerpo">
          <div class="hoja-numero"></div>
          <p class="hoja-enunciado"></p>
          <ol class="hoja-opciones"></ol>
          <div class="hoja-recuerdo" aria-live="polite"></div>
        </div>
        <footer class="hoja-pie">
          <button data-accion="anterior">← Anterior</button>
          <span class="hoja-progreso"></span>
          <button data-accion="siguiente">Siguiente →</button>
          <button data-accion="entregar" class="boton-entregar">Entregar examen</button>
        </footer>
        <div class="hoja-confirmar" hidden>
          <p>¿Entregar el examen? Ya no vas a poder cambiar las respuestas.</p>
          <div>
            <button data-accion="confirmarEntrega" class="boton-entregar">Sí, entregar</button>
            <button data-accion="cancelarEntrega">Seguir revisando</button>
          </div>
        </div>
        <div class="hoja-ayuda">Mové el mouse para llevar la lapicera · Clic o 1–4 para marcar · ←/→ cambiar pregunta</div>
      </div>
      <div class="cursor-virtual" aria-hidden="true">✎</div>`;
    document.getElementById('ui').appendChild(this.raiz);

    this.el = {
      pestanias: this.raiz.querySelector('.hoja-pestanias'),
      numero: this.raiz.querySelector('.hoja-numero'),
      enunciado: this.raiz.querySelector('.hoja-enunciado'),
      opciones: this.raiz.querySelector('.hoja-opciones'),
      recuerdo: this.raiz.querySelector('.hoja-recuerdo'),
      progreso: this.raiz.querySelector('.hoja-progreso'),
      confirmar: this.raiz.querySelector('.hoja-confirmar'),
      cursor: this.raiz.querySelector('.cursor-virtual'),
      cuerpo: this.raiz.querySelector('.hoja-cuerpo'),
    };

    bus.on('examenCambio', () => this.render());
    bus.on('mouse', ({ boton, abajo }) => {
      if (abajo && boton === CONTROLES.botonInteractuar && estado.hojaVisible) this.clic();
    });
    bus.on('tecla', ({ code, abajo }) => {
      if (!abajo || !estado.accion.modoHoja || this.examen.terminado) return;
      const op = CONTROLES.opciones.indexOf(code);
      if (op >= 0 && !this.confirmando) this.examen.responder(op);
      if (code === CONTROLES.preguntaAnterior) this.examen.irA(this.examen.actual - 1);
      if (code === CONTROLES.preguntaSiguiente) this.examen.irA(this.examen.actual + 1);
    });
    bus.on('modoHoja', (activo) => {
      if (!activo) this.cancelarConfirmacion();
    });
    this.render();
  }

  render() {
    const ex = this.examen;
    const p = ex.pregunta;
    this.el.pestanias.innerHTML = ex.preguntas
      .map((_, i) => {
        const clases = ['pestania', i === ex.actual ? 'actual' : '', ex.respuestas[i] !== null ? 'respondida' : ''].join(' ');
        const marca = ex.respuestas[i] !== null ? ` ${LETRAS[ex.respuestas[i]]}` : '';
        return `<button class="${clases}" data-accion="ir" data-i="${i}">${i + 1}${marca}</button>`;
      })
      .join('');
    this.el.numero.textContent = `Pregunta ${ex.actual + 1} de ${ex.preguntas.length}`;

    // Enunciado con las palabras clave envueltas para los destellos
    let html = escapar(p.enunciado);
    for (const clave of p.claves ?? []) {
      html = html.replace(new RegExp(escaparRegex(escapar(clave)), 'i'), (m) => `<span class="clave">${m}</span>`);
    }
    this.el.enunciado.innerHTML = html;

    this.el.opciones.innerHTML = p.opciones
      .map((texto, i) => {
        const marcada = ex.respuestas[ex.actual] === i;
        return `<li data-accion="responder" data-op="${i}" class="${marcada ? 'marcada' : ''}">
          <span class="burbuja">${marcada ? '✕' : LETRAS[i]}</span><span>${escapar(texto)}</span></li>`;
      })
      .join('');
    this.el.recuerdo.textContent = p.recuerdo ? `💭 ${p.recuerdo}` : '';
    this.el.progreso.textContent = `${ex.respondidas}/${ex.preguntas.length} respondidas`;
    this.memoriaMostrada = -1;
  }

  clic() {
    const objetivo = document.elementFromPoint(this.cursor.x, this.cursor.y)?.closest('[data-accion]');
    if (!objetivo || !this.raiz.contains(objetivo)) return;
    const ex = this.examen;
    switch (objetivo.dataset.accion) {
      case 'responder':
        if (!this.confirmando) ex.responder(Number(objetivo.dataset.op));
        break;
      case 'ir':
        ex.irA(Number(objetivo.dataset.i));
        break;
      case 'anterior':
        ex.irA(ex.actual - 1);
        break;
      case 'siguiente':
        ex.irA(ex.actual + 1);
        break;
      case 'entregar':
        this.confirmando = true;
        this.el.confirmar.hidden = false;
        break;
      case 'confirmarEntrega':
        this.cancelarConfirmacion();
        ex.terminar('entregado');
        break;
      case 'cancelarEntrega':
        this.cancelarConfirmacion();
        break;
    }
  }

  cancelarConfirmacion() {
    this.confirmando = false;
    this.el.confirmar.hidden = true;
  }

  update() {
    const c = estado.concentracion ?? 0;
    const opacidad = Math.max(0, Math.min(1, (c - 0.45) / 0.4));
    this.raiz.style.opacity = opacidad.toFixed(3);
    this.raiz.style.visibility = opacidad > 0 ? 'visible' : 'hidden';
    this.raiz.style.transform = `translateY(${(1 - opacidad) * 40}px)`;
    if (!estado.hojaVisible) return;

    // Cursor virtual (el mouse está bloqueado)
    const { dx, dy } = this.input.consumirMovimiento();
    const s = this.b.sensibilidadCursor * (estado.opciones?.sensibilidad ?? 1);
    this.cursor.x = Math.max(0, Math.min(window.innerWidth - 1, this.cursor.x + dx * s));
    this.cursor.y = Math.max(0, Math.min(window.innerHeight - 1, this.cursor.y + dy * s));
    this.el.cursor.style.transform = `translate(${this.cursor.x}px, ${this.cursor.y}px)`;

    const bajo = document.elementFromPoint(this.cursor.x, this.cursor.y)?.closest('[data-accion]') ?? null;
    if (bajo !== this.hover) {
      this.hover?.classList.remove('hover');
      bajo?.classList.add('hover');
      this.hover = bajo;
    }

    // Destellos de memoria según el tiempo que lleva en esta pregunta
    const nivel = this.examen.nivelMemoria();
    if (nivel !== this.memoriaMostrada) {
      this.memoriaMostrada = nivel;
      this.el.cuerpo.classList.toggle('memoria-1', nivel >= 1);
      this.el.cuerpo.classList.toggle('memoria-2', nivel >= 2);
      if (nivel === 1) bus.emit('destelloMemoria');
    }
  }
}
