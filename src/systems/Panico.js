import { estado, haciendoTrampa } from '../core/GameState.js';

/**
 * Pánico por proximidad: sólo sube si la profesora está cerca del banco central
 * MIENTRAS el jugador hace trampa. Sube y baja suave (0..1).
 * En el modo hoja desaparece por completo, aunque la profesora pase al lado.
 * Lo leen: postprocesado, audio (latido y respiración), cámara (vibración),
 * lanzamiento (temblor), machete (legibilidad) y señas (borrosas).
 */
export class Panico {
  constructor({ profesora, aula, camara, balance }) {
    this.ia = profesora;
    this.centro = aula.bancoCentral.posicion;
    this.camara = camara;
    this.b = balance.panico;
    estado.panico = 0;
  }

  update(dt) {
    const p = this.ia.posicion;
    const dist = Math.hypot(p.x - this.centro.x, p.z - this.centro.z);
    const cerca = dist < this.b.radio;
    let objetivo = 0;
    if (cerca && haciendoTrampa()) {
      // Cuanto más cerca está, más pánico
      objetivo = Math.min(1, this.b.base + (1 - this.b.base) * (1 - dist / this.b.radio) * 1.3);
    }
    let velocidad = objetivo > estado.panico ? this.b.velocidadSubida : this.b.velocidadBajada;
    if (estado.accion.modoHoja) {
      objetivo = 0;
      velocidad = this.b.velocidadBajadaHoja;
    }
    const paso = velocidad * dt;
    estado.panico += Math.max(-paso, Math.min(paso, objetivo - estado.panico));
    if (estado.final) estado.panico = Math.max(0, estado.panico - dt);

    this.camara.vibracion = estado.panico * this.b.vibracionMax * (estado.opciones?.intensidadVibracion ?? 1) * 3;
  }
}
