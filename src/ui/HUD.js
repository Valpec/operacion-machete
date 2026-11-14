import * as THREE from 'three';
import { bus } from '../core/EventBus.js';
import { estado } from '../core/GameState.js';

const formatoTiempo = (s) => {
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return `${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
};

/**
 * HUD superpuesto: tiempo restante, sospecha (barra + número), pulso/pánico,
 * acciones disponibles según el contexto, indicadores direccionales y subtítulos.
 * Nada importante depende sólo del color: siempre hay texto, número o ícono.
 */
export class HUD {
  constructor({ camera, profesora, examen, balance }) {
    this.camera = camera;
    this.ia = profesora;
    this.examen = examen;
    this.b = balance.hud;
    this.proveedores = []; // funciones que devuelven [{ tecla, texto }]
    this.indicadores = new Map(); // tipo -> { el, posicion, vida }

    this.raiz = document.createElement('div');
    this.raiz.className = 'hud';
    this.raiz.innerHTML = `
      <div class="hud-pulso" title="Pulso">
        <span class="corazon" aria-hidden="true">♥</span>
        <span class="pulso-bpm">72</span><span class="pulso-unidad">ppm</span>
        <span class="pulso-texto">Tranquilo</span>
      </div>
      <div class="hud-tiempo"><span class="reloj-icono" aria-hidden="true">⏱</span> <span class="tiempo-valor">08:00</span>
        <div class="tiempo-aviso"></div></div>
      <div class="hud-sospecha">
        <div class="sospecha-fila"><span class="ojo" aria-hidden="true">👁</span> Sospecha <b class="sospecha-num">0</b></div>
        <div class="sospecha-barra"><div class="sospecha-relleno"></div>
          <div class="marca" style="left:60%"></div></div>
        <div class="sospecha-estado"></div>
      </div>
      <div class="hud-mira" aria-hidden="true"></div>
      <div class="hud-lectura" hidden><div class="lectura-anillo"></div><div class="lectura-texto"></div></div>
      <div class="hud-fuerza" hidden><div class="fuerza-barra"><div class="fuerza-relleno"></div></div><div class="fuerza-texto"></div></div>
      <div class="hud-pedido" hidden></div>
      <div class="hud-mensaje" aria-live="polite"></div>
      <div class="hud-indicadores"></div>
      <div class="hud-subtitulos" aria-live="polite"></div>
      <div class="hud-acciones"></div>`;
    this.raiz.style.display = 'none'; // se muestra al empezar la partida
    document.getElementById('ui').appendChild(this.raiz);

    const q = (s) => this.raiz.querySelector(s);
    this.el = {
      tiempo: q('.tiempo-valor'),
      tiempoCaja: q('.hud-tiempo'),
      aviso: q('.tiempo-aviso'),
      sospechaNum: q('.sospecha-num'),
      sospechaRelleno: q('.sospecha-relleno'),
      sospechaCaja: q('.hud-sospecha'),
      sospechaEstado: q('.sospecha-estado'),
      corazon: q('.corazon'),
      bpm: q('.pulso-bpm'),
      pulsoTexto: q('.pulso-texto'),
      acciones: q('.hud-acciones'),
      indicadores: q('.hud-indicadores'),
      subtitulos: q('.hud-subtitulos'),
      lectura: q('.hud-lectura'),
      lecturaAnillo: q('.lectura-anillo'),
      lecturaTexto: q('.lectura-texto'),
      fuerza: q('.hud-fuerza'),
      fuerzaRelleno: q('.fuerza-relleno'),
      fuerzaTexto: q('.fuerza-texto'),
      pedido: q('.hud-pedido'),
      mensaje: q('.hud-mensaje'),
    };
    this.timerMensaje = 0;
    this.ultimasAcciones = '';
    this._v = new THREE.Vector3();
    this._f = new THREE.Vector3();

    // Pasos de la profesora cerca del banco: indicador visual + subtítulo
    bus.on('paso', ({ posicion }) => {
      this.camera.getWorldPosition(this._v);
      if (posicion.distanceTo(this._v.setY(0)) > this.b.radioIndicadorPasos) return;
      const nuevo = !this.indicadores.has('pasos');
      this.indicar({ tipo: 'pasos', posicion, etiqueta: 'pasos', icono: '👣' });
      if (nuevo) this.subtitulo(`[Pasos de la profesora ${this.direccionTexto(posicion)}]`);
    });
  }

  registrarAcciones(fn) {
    this.proveedores.push(fn);
  }

  // ---------- Indicadores direccionales ----------
  anguloRelativo(posicion) {
    this.camera.getWorldPosition(this._v);
    this.camera.getWorldDirection(this._f);
    const fx = this._f.x, fz = this._f.z;
    const largo = Math.hypot(fx, fz) || 1;
    const sx = posicion.x - this._v.x, sz = posicion.z - this._v.z;
    // 0 = adelante, positivo = a la derecha
    return Math.atan2((sx * -fz + sz * fx) / largo, (sx * fx + sz * fz) / largo);
  }

  // Dirección en palabras respecto del cuerpo (sentado mirando al pizarrón), no de la cámara
  direccionTexto(posicion) {
    this.camera.getWorldPosition(this._v);
    const dx = posicion.x - this._v.x;
    const dz = posicion.z - this._v.z;
    const a = Math.atan2(dx, -dz); // 0 = adelante (pizarrón), + = derecha
    const g = Math.abs(a);
    const lado = a > 0 ? 'a la derecha' : 'a la izquierda';
    if (g < Math.PI / 8) return 'adelante';
    if (g < (3 * Math.PI) / 8) return `adelante ${lado}`;
    if (g < (5 * Math.PI) / 8) return a > 0 ? 'a tu derecha' : 'a tu izquierda';
    if (g < (7 * Math.PI) / 8) return `atrás ${lado}`;
    return 'detrás tuyo';
  }

  indicar({ tipo, posicion, etiqueta, icono = '◆', duracion = this.b.duracionIndicador }) {
    let ind = this.indicadores.get(tipo);
    if (!ind) {
      const el = document.createElement('div');
      el.className = `indicador indicador-${tipo}`;
      el.innerHTML = `<span class="indicador-flecha">▲</span><span class="indicador-texto">${icono} ${etiqueta}</span>`;
      this.el.indicadores.appendChild(el);
      ind = { el };
      this.indicadores.set(tipo, ind);
    }
    ind.posicion = posicion.clone();
    ind.vida = duracion;
    ind.duracion = duracion;
  }

  subtitulo(texto, duracion = 2.5) {
    if (estado.opciones?.subtitulos === false) return;
    const el = document.createElement('div');
    el.className = 'subtitulo';
    el.textContent = texto;
    this.el.subtitulos.appendChild(el);
    while (this.el.subtitulos.children.length > 3) this.el.subtitulos.firstChild.remove();
    setTimeout(() => el.remove(), duracion * 1000);
  }

  // ---------- Mensajes y medidores contextuales ----------
  // Mensaje destacado arriba al centro (texto descifrado de una seña, avisos)
  mensaje(texto, duracion = 4) {
    this.el.mensaje.textContent = texto;
    this.el.mensaje.classList.add('visible');
    this.timerMensaje = duracion;
  }

  // Progreso de lectura de una seña alrededor de la mira (null = ocultar)
  setLectura(progreso, texto = '') {
    if (progreso === null) {
      this.el.lectura.hidden = true;
      return;
    }
    this.el.lectura.hidden = false;
    this.el.lecturaAnillo.style.setProperty('--p', `${Math.round(progreso * 100)}%`);
    this.el.lecturaTexto.textContent = `${texto} ${Math.round(progreso * 100)}%`;
  }

  // Barra de fuerza del lanzamiento (null = ocultar)
  setFuerza(carga) {
    if (carga === null) {
      this.el.fuerza.hidden = true;
      return;
    }
    this.el.fuerza.hidden = false;
    this.el.fuerzaRelleno.style.width = `${Math.round(carga * 100)}%`;
    this.el.fuerzaTexto.textContent = `Fuerza ${Math.round(carga * 100)}%`;
  }

  // Tarjeta con el pedido pendiente del papelito (null = ocultar)
  setPedido(html) {
    if (!html) {
      this.el.pedido.hidden = true;
      return;
    }
    if (this.el.pedido.innerHTML !== html) this.el.pedido.innerHTML = html;
    this.el.pedido.hidden = false;
  }

  // ---------- Loop ----------
  update(dt, t) {
    this.raiz.classList.toggle('modo-hoja', !!estado.hojaVisible);
    this.raiz.style.display = estado.final || !estado.iniciado || estado.enSecuencia ? 'none' : '';

    if (this.timerMensaje > 0) {
      this.timerMensaje -= dt;
      if (this.timerMensaje <= 0) this.el.mensaje.classList.remove('visible');
    }

    // Tiempo
    const r = this.examen.restante;
    this.el.tiempo.textContent = formatoTiempo(r);
    const urgente = r <= this.b.segundosAvisoTiempo;
    this.el.tiempoCaja.classList.toggle('urgente', urgente);
    this.el.aviso.textContent = urgente ? '¡Queda poco tiempo!' : '';

    // Sospecha
    const s = this.ia.sospecha;
    this.el.sospechaNum.textContent = Math.round(s);
    this.el.sospechaRelleno.style.width = `${s}%`;
    const nivel = s >= 80 ? 'alta' : s >= 40 ? 'media' : 'baja';
    this.el.sospechaCaja.dataset.nivel = nivel;
    let txt = '';
    if (this.ia.veTrampa) txt = '⚠ ¡Te está viendo!';
    else if (this.ia.estado === 'inspeccion' && this.ia.inspeccionado === this.ia.aula.bancoCentral) txt = '⚠ Viene a revisar tu banco';
    else if (this.ia.estado === 'sospecha') txt = '? Está atenta';
    this.el.sospechaEstado.textContent = txt;

    // Pulso / pánico (el sistema de pánico escribe estado.panico en la Fase 5)
    const p = estado.panico ?? 0;
    const bpm = Math.round(72 + p * 88);
    this.el.bpm.textContent = bpm;
    this.el.pulsoTexto.textContent = p > 0.66 ? 'Pánico' : p > 0.3 ? 'Nervioso' : 'Tranquilo';
    this.el.corazon.style.animationDuration = `${60 / bpm}s`;
    this.raiz.dataset.panico = p > 0.66 ? 'alto' : p > 0.3 ? 'medio' : 'bajo';

    // Acciones disponibles según el contexto
    const acciones = this.proveedores.flatMap((fn) => fn() ?? []);
    const html = acciones.map((a) => `<span class="accion"><kbd>${a.tecla}</kbd> ${a.texto}</span>`).join('');
    if (html !== this.ultimasAcciones) {
      this.el.acciones.innerHTML = html;
      this.ultimasAcciones = html;
    }

    // Indicadores direccionales alrededor del centro de la pantalla
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    const radio = Math.min(cx, cy) * 0.62;
    for (const [tipo, ind] of this.indicadores) {
      ind.vida -= dt;
      if (ind.vida <= 0) {
        ind.el.remove();
        this.indicadores.delete(tipo);
        continue;
      }
      const a = this.anguloRelativo(ind.posicion);
      const x = cx + Math.sin(a) * radio;
      const y = cy - Math.cos(a) * radio;
      ind.el.style.transform = `translate(${x}px, ${y}px)`;
      ind.el.querySelector('.indicador-flecha').style.transform = `rotate(${a}rad)`;
      ind.el.style.opacity = Math.min(1, ind.vida / (ind.duracion * 0.4)).toFixed(2);
    }
  }
}
