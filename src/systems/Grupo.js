import * as THREE from 'three';
import { estado } from '../core/GameState.js';
import { NOMBRES } from '../characters/config.js';

const azar = (a, b) => a + Math.random() * (b - a);

/**
 * Comportamiento "social" del grupo:
 *  - Juli (fila de adelante, derecha) no tiene mecánica propia: cada tanto se da vuelta
 *    y te hace gestos de reclamo y presión ("¡pasá algo!").
 *  - En el Camino 2 (mérito propio) los tres amigos te miran con bronca desde sus lugares.
 *  - En el Camino 1 todos disimulan: bajan las manos y miran su hoja.
 */
export class Grupo {
  constructor({ elenco, profesora, camara, hud, balance }) {
    this.juli = elenco.grupo;
    this.amigos = [elenco.senias, elenco.mensajero, elenco.grupo];
    this.ia = profesora;
    this.camara = camara;
    this.hud = hud;
    this.b = balance.grupo;
    this.timer = azar(this.b.intervaloMin, this.b.intervaloMax);
    this.reclamando = 0;
    this.modo = 'normal'; // 'normal' | 'bronca' | 'disimulo'
    this._v = new THREE.Vector3();
  }

  // Gira torso y cabeza del personaje hacia el jugador (peso 0 = mirar su hoja)
  mirarAlJugador(p, peso) {
    const ex = (p.animador.extra.cabeza ??= [0, 0, 0]);
    const tor = (p.animador.extra.torso ??= [0, 0, 0]);
    const ojos = this.camara.posicionOjos(this._v);
    const pos = p.raiz.position;
    let ang = Math.atan2(-(ojos.x - pos.x), -(ojos.z - pos.z));
    // Juli está adelante: para mirarte tiene que darse vuelta (giro de casi 180°)
    ang = THREE.MathUtils.clamp(ang, -2.2, 2.2);
    tor[1] = ang * 0.5 * peso;
    ex[1] = THREE.MathUtils.clamp(ang * 0.5, -1.1, 1.1) * peso;
  }

  bronca() {
    this.modo = 'bronca';
    this.amigos.forEach((p, i) => {
      p.mostrarDedos(0);
      p.animador.capa('golpear', 0);
      p.animador.pose(i === 2 ? 'reclamo' : 'bronca', 4);
      p.animador.capa(i === 2 ? 'reclamo' : 'bronca', 1);
      this.mirarAlJugador(p, 1);
    });
  }

  disimular() {
    this.modo = 'disimulo';
    this.amigos.forEach((p) => {
      p.mostrarDedos(0);
      for (const c of ['golpear', 'reclamo', 'bronca', 'asentir']) p.animador.capa(c, 0);
      p.animador.pose('disimular', 14);
      this.mirarAlJugador(p, 0);
    });
  }

  update(dt) {
    if (estado.final || this.modo !== 'normal') return;
    if (this.reclamando > 0) {
      this.reclamando -= dt;
      this.mirarAlJugador(this.juli, 1);
      if (this.reclamando <= 0 || this.ia.estado !== 'patrulla') {
        this.reclamando = 0;
        this.juli.animador.capa('reclamo', 0);
        this.juli.animador.pose('escribirFondo', 5);
        this.mirarAlJugador(this.juli, 0);
      }
      return;
    }
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = azar(this.b.intervaloMin, this.b.intervaloMax);
      // Sólo se anima si la profesora no está mirando
      if (this.ia.estado === 'patrulla' && (this.ia.enPizarron || !this.ia.mirandoHacia(this.juli.raiz.position, 45))) {
        this.reclamando = this.b.duracionReclamo;
        this.juli.animador.pose('reclamo', 6);
        this.juli.animador.capa('reclamo', 1);
        this.hud.subtitulo(`[${NOMBRES.grupo} se da vuelta y te reclama con gestos: «¡pasá algo!»]`, 3);
      }
    }
  }
}
