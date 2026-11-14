import { CONTROLES } from '../core/controles.js';
import { estado } from '../core/GameState.js';
import { bus } from '../core/EventBus.js';

/**
 * Modo hoja: mientras se mantiene Espacio, la cámara baja hacia el examen.
 * En este modo el pánico desaparece y la imagen se vuelve cálida (estado.concentracion),
 * y mirar la hoja nunca cuenta como trampa.
 */
export class ModoHoja {
  constructor({ input, camara, protagonista, balance }) {
    this.input = input;
    this.camara = camara;
    this.prota = protagonista;
    this.b = balance.hoja;
    this.mezcla = 0;
    estado.concentracion = 0;
    estado.hojaVisible = false;
  }

  update(dt) {
    const puede = !estado.final && !estado.bloqueoHoja;
    const activo = puede && this.input.mantenida(CONTROLES.modoHoja);
    if (activo !== estado.accion.modoHoja) {
      estado.accion.modoHoja = activo;
      // Al mirar la hoja se guardan / bajan las otras acciones
      this.prota.mostrarLapicera(activo);
      bus.emit('modoHoja', activo);
    }
    const objetivo = activo ? 1 : 0;
    const k = 1 - Math.exp(-this.b.velocidadTransicion * dt);
    this.mezcla += (objetivo - this.mezcla) * k;
    if (Math.abs(objetivo - this.mezcla) < 0.001) this.mezcla = objetivo;

    this.camara.solicitarMirada('hoja', { mezcla: this.mezcla, yaw: 0, pitch: this.b.pitch, adelante: 1 });
    estado.concentracion = this.mezcla;
    estado.hojaVisible = this.mezcla > 0.75;
  }
}
