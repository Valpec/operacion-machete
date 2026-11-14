// Bus de eventos mínimo para que los sistemas se comuniquen sin conocerse entre sí.
export class EventBus {
  constructor() {
    this.oyentes = new Map();
  }

  on(evento, fn) {
    if (!this.oyentes.has(evento)) this.oyentes.set(evento, new Set());
    this.oyentes.get(evento).add(fn);
    return () => this.off(evento, fn);
  }

  off(evento, fn) {
    this.oyentes.get(evento)?.delete(fn);
  }

  emit(evento, datos) {
    this.oyentes.get(evento)?.forEach((fn) => fn(datos));
  }
}

export const bus = new EventBus();
