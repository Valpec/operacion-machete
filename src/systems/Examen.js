import { bus } from '../core/EventBus.js';
import { estado } from '../core/GameState.js';

/**
 * Lógica del examen: respuestas, pregunta actual, tiempo mirando cada pregunta
 * (para los destellos de memoria), tiempo límite y nota final.
 * La interfaz (ui/PanelExamen.js) sólo lee y llama a estos métodos.
 */
export class Examen {
  constructor(datos, balance) {
    this.datos = datos;
    this.preguntas = datos.preguntas;
    this.b = balance.examen;
    this.respuestas = new Array(this.preguntas.length).fill(null);
    this.tiempoEnPregunta = new Array(this.preguntas.length).fill(0);
    this.actual = 0;
    this.terminado = false;
  }

  get restante() {
    return Math.max(0, this.b.duracion - estado.tiempo);
  }

  get pregunta() {
    return this.preguntas[this.actual];
  }

  irA(indice) {
    this.actual = (indice + this.preguntas.length) % this.preguntas.length;
    bus.emit('examenCambio');
  }

  responder(opcion, indice = this.actual) {
    if (this.terminado) return;
    this.respuestas[indice] = opcion;
    bus.emit('examenRespuesta', { indice, opcion });
    bus.emit('examenCambio');
  }

  // Nivel de ayuda de la memoria para la pregunta actual: 0 nada, 1 destellos, 2 recuerdo
  nivelMemoria(indice = this.actual) {
    if (this.respuestas[indice] !== null) return 0;
    const t = this.tiempoEnPregunta[indice];
    if (t >= this.b.segundosParaRecuerdo) return 2;
    if (t >= this.b.segundosParaDestello) return 1;
    return 0;
  }

  get correctas() {
    return this.respuestas.filter((r, i) => r === this.preguntas[i].correcta).length;
  }

  get respondidas() {
    return this.respuestas.filter((r) => r !== null).length;
  }

  // Nota de 1 a 10 proporcional a las respuestas correctas
  get nota() {
    return Math.max(1, Math.round((this.correctas / this.preguntas.length) * this.b.notaMaxima));
  }

  get aprobado() {
    return this.nota >= this.b.notaAprobacion;
  }

  terminar(motivo) {
    if (this.terminado) return;
    this.terminado = true;
    bus.emit('finExamen', { motivo, nota: this.nota, correctas: this.correctas, total: this.preguntas.length });
  }

  update(dt) {
    if (this.terminado || estado.final) return;
    // Sólo cuenta el tiempo que el jugador pasa mirando la pregunta en el modo hoja
    if (estado.accion.modoHoja && estado.hojaVisible) this.tiempoEnPregunta[this.actual] += dt;
    if (this.restante <= 0) this.terminar('tiempo');
  }
}
