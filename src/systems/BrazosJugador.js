import { estado } from '../core/GameState.js';

/**
 * Decide la pose de los brazos del protagonista según lo que esté haciendo,
 * con prioridades (la hoja manda sobre todo, después lanzar, mostrar dedos, machete...).
 */
export class BrazosJugador {
  constructor(protagonista) {
    this.p = protagonista;
    this.poseActual = null;
    this.lanzando = 0; // segundos que dura el gesto de soltar el papelito
    this.papelEnMano = null; // malla del papelito pegada a la mano
  }

  gestoLanzar() {
    this.lanzando = 0.35;
  }

  update(dt) {
    const a = estado.accion;
    this.lanzando = Math.max(0, this.lanzando - dt);
    let pose = 'manosEnBanco';
    let escribir = 0;
    if (a.modoHoja) {
      escribir = 0.6;
    } else if (this.lanzando > 0) pose = 'jugLanzar';
    else if (a.apuntando) pose = 'jugApuntar';
    else if (a.mostrandoDedos > 0) pose = 'jugDedos';
    else if (a.abriendoPapel) pose = 'jugAbrirPapel';
    else if (a.machete) pose = 'jugMachete';

    if (pose !== this.poseActual) {
      this.p.animador.pose(pose, pose === 'jugLanzar' ? 18 : 9);
      this.poseActual = pose;
    }
    this.p.animador.capa('escribir', escribir);
    this.p.mostrarDedos(a.modoHoja ? 0 : a.mostrandoDedos);
    if (this.papelEnMano) this.papelEnMano.visible = !!estado.papelEnMano && !a.modoHoja;
  }
}
