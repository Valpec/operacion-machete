import { bus } from './EventBus.js';
import { estado } from './GameState.js';

/**
 * Calidad gráfica y contador de FPS.
 *
 * Lo que más le cuesta a la placa de video en esta escena (medido):
 *  - la resolución interna (en pantallas con escala de Windows al 125-200 % se dibuja al doble),
 *  - los contornos de los personajes (un tercio de los triángulos),
 *  - la pasada de sombras (vuelve a dibujar todo lo que proyecta sombra).
 * Cada nivel recorta eso, empezando por los compañeros de relleno, que son los que menos se notan.
 *
 * "auto" arranca en media y, si el juego anda lento varios segundos seguidos, baja un nivel solo.
 */
export const NIVELES = {
  alta: { nombre: 'Alta', resolucion: 2, sombras: true, mapaSombra: 2048, contornosFondo: true, sombrasFondo: true, msaa: 4 },
  media: { nombre: 'Media', resolucion: 1.25, sombras: true, mapaSombra: 1024, contornosFondo: false, sombrasFondo: false, msaa: 0 },
  baja: { nombre: 'Baja', resolucion: 0.8, sombras: false, mapaSombra: 512, contornosFondo: false, sombrasFondo: false, msaa: 0 },
};
const ORDEN = ['alta', 'media', 'baja'];

// Auto-ajuste: si el promedio queda por debajo de esto durante SEGUNDOS_LENTO, baja un nivel
const FPS_MINIMO = 40;
const SEGUNDOS_LENTO = 4;

export class Calidad {
  constructor({ game, aula, elenco, postpro, hud }) {
    Object.assign(this, { game, aula, elenco, postpro, hud });
    this.correEnPausa = true;
    this.cuadros = 0;
    this.acumulado = 0;
    this.fps = 0;
    this.lento = 0;
    this.nivel = null;

    this.el = document.createElement('div');
    this.el.className = 'contador-fps';
    document.getElementById('ui').appendChild(this.el);

    bus.on('calidad', () => this.aplicar());
    this.aplicar();
  }

  // Nivel efectivo según la opción elegida ("auto" usa el que se fue ajustando)
  nivelElegido() {
    const op = estado.opciones?.calidad ?? 'auto';
    if (op === 'auto') return this.nivelAuto ?? 'media';
    return NIVELES[op] ? op : 'media';
  }

  aplicar() {
    const clave = this.nivelElegido();
    const n = NIVELES[clave];
    this.nivel = clave;
    this.lento = 0;
    const r = this.game.renderer;

    // Resolución interna (nunca más que la pantalla)
    const pr = Math.min(window.devicePixelRatio || 1, n.resolucion);
    r.setPixelRatio(pr);
    r.setSize(window.innerWidth, window.innerHeight);
    if (this.postpro) {
      const c = this.postpro.composer;
      c.setPixelRatio(pr);
      c.setSize(window.innerWidth, window.innerHeight);
      this.postpro.actualizarResolucion(window.innerWidth, window.innerHeight);
      this.postpro.pase.uniforms.desenfoqueMaxPx.value = this.postpro.b.desenfoqueMaxPx * pr;
      // Antialiasing (MSAA) en los búferes del postprocesado: sólo en calidad alta
      for (const rt of [c.renderTarget1, c.renderTarget2]) {
        if (rt.samples !== n.msaa) {
          rt.samples = n.msaa;
          rt.dispose();
        }
      }
    }

    // Sombras del sol (al apagar la luz que proyecta, three deja de dibujar el mapa de sombras)
    const sol = this.aula.luces?.sol;
    if (sol) {
      sol.castShadow = n.sombras;
      if (sol.shadow.mapSize.x !== n.mapaSombra) {
        sol.shadow.mapSize.set(n.mapaSombra, n.mapaSombra);
        sol.shadow.map?.dispose();
        sol.shadow.map = null;
      }
    }

    // Compañeros de relleno: contornos y sombras propias
    for (const p of this.elenco.relleno ?? []) {
      p.raiz.traverse((o) => {
        if (!o.isMesh) return;
        if (o.userData.esContorno) o.visible = n.contornosFondo;
        else o.castShadow = n.sombrasFondo;
      });
    }
  }

  update(dt) {
    // FPS reales: se cuenta el tiempo entre cuadros (dt de Game viene recortado a 0,05)
    const ahora = performance.now();
    if (this.ultimo) {
      this.acumulado += ahora - this.ultimo;
      this.cuadros += 1;
    }
    this.ultimo = ahora;
    if (this.acumulado >= 500) {
      this.fps = Math.round((this.cuadros * 1000) / this.acumulado);
      this.cuadros = 0;
      this.acumulado = 0;
      this.revisarAuto(0.5);
    }

    const visible = !!(estado.opciones?.mostrarFps || estado.debug);
    this.el.style.display = visible ? 'block' : 'none';
    if (visible) this.el.textContent = `${this.fps} FPS · calidad ${NIVELES[this.nivel].nombre.toLowerCase()}${(estado.opciones?.calidad ?? 'auto') === 'auto' ? ' (auto)' : ''}`;
  }

  // Modo auto: si anda lento un rato, baja un nivel (sólo jugando: los menús no cuentan)
  revisarAuto(segundos) {
    if ((estado.opciones?.calidad ?? 'auto') !== 'auto' || estado.pausado || !estado.iniciado) {
      this.lento = 0;
      return;
    }
    if (this.fps > 0 && this.fps < FPS_MINIMO) this.lento += segundos;
    else this.lento = 0;
    const i = ORDEN.indexOf(this.nivel);
    if (this.lento >= SEGUNDOS_LENTO && i < ORDEN.length - 1) {
      this.nivelAuto = ORDEN[i + 1];
      this.aplicar();
      this.hud?.mensaje?.(`El juego andaba lento (${this.fps} FPS): bajé la calidad gráfica a ${NIVELES[this.nivel].nombre.toLowerCase()}.`, 4);
    }
  }
}
