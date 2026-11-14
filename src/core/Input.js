import { CONTROLES } from './controles.js';
import { bus } from './EventBus.js';

// Maneja teclado, mouse y Pointer Lock. Los sistemas consultan el estado
// (teclas mantenidas) o escuchan eventos del bus ('tecla', 'mouse').
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.teclas = new Set();
    this.botones = new Set();
    this.dx = 0;
    this.dy = 0;
    this.bloqueado = false;
    this.habilitado = true;

    window.addEventListener('keydown', (e) => {
      if (e.code === CONTROLES.modoHoja || e.code === CONTROLES.debug || e.code === 'Tab') e.preventDefault();
      if (e.repeat) return;
      // Durante las secuencias (finales) el jugador no controla nada salvo Esc
      if (!this.habilitado && e.code !== 'Escape') return;
      this.teclas.add(e.code);
      bus.emit('tecla', { code: e.code, abajo: true });
    });
    window.addEventListener('keyup', (e) => {
      this.teclas.delete(e.code);
      bus.emit('tecla', { code: e.code, abajo: false });
    });
    window.addEventListener('blur', () => {
      this.teclas.clear();
      this.botones.clear();
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.bloqueado) return;
      this.dx += e.movementX;
      this.dy += e.movementY;
    });
    document.addEventListener('mousedown', (e) => {
      if (!this.bloqueado || !this.habilitado) return;
      this.botones.add(e.button);
      bus.emit('mouse', { boton: e.button, abajo: true });
    });
    document.addEventListener('mouseup', (e) => {
      if (!this.botones.has(e.button)) return;
      this.botones.delete(e.button);
      bus.emit('mouse', { boton: e.button, abajo: false });
    });
    document.addEventListener('contextmenu', (e) => e.preventDefault());

    document.addEventListener('pointerlockchange', () => {
      this.bloqueado = document.pointerLockElement === this.canvas;
      if (!this.bloqueado) {
        this.botones.clear();
        this.teclas.clear();
      }
      bus.emit('pointerlock', this.bloqueado);
    });
  }

  // Devuelve una promesa: falla si el navegador no deja bloquear el mouse todavía
  // (Chrome exige esperar ~1 s después de salir con Esc)
  bloquear() {
    try {
      const p = this.canvas.requestPointerLock?.();
      if (p && p.then) return p;
      return Promise.resolve();
    } catch (e) {
      return Promise.reject(e);
    }
  }

  // Al deshabilitar se sueltan las teclas mantenidas
  setHabilitado(v) {
    this.habilitado = v;
    if (!v) {
      this.teclas.clear();
      this.botones.clear();
    }
  }

  liberar() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  mantenida(code) {
    return this.habilitado && this.teclas.has(code);
  }

  boton(b) {
    return this.habilitado && this.botones.has(b);
  }

  // Devuelve y resetea el movimiento del mouse acumulado en el cuadro
  consumirMovimiento() {
    const r = { dx: this.dx, dy: this.dy };
    this.dx = 0;
    this.dy = 0;
    return r;
  }
}
