import * as THREE from 'three';
import { bus } from '../core/EventBus.js';
import { CONTROLES } from '../core/controles.js';
import { estado, haciendoTrampa } from '../core/GameState.js';

/**
 * Modo debug (F1): cono de visión, grafo de pasillos, waypoints de patrulla,
 * ruta actual de la profesora y panel con la sospecha y el estado de la IA.
 */
export class Debug {
  constructor({ game, scene, profesora, nav, balance, aula }) {
    this.game = game;
    this.ia = profesora;
    this.aula = aula;
    this.grupo = new THREE.Group();
    this.grupo.visible = false;
    scene.add(this.grupo);

    // Cono de visión (vértice en el origen, abre hacia +Z)
    const v = balance.profesora.vision;
    const mitad = THREE.MathUtils.degToRad(v.anguloTotal / 2);
    const geo = new THREE.ConeGeometry(Math.tan(mitad) * v.distancia, v.distancia, 32, 1, true);
    geo.translate(0, -v.distancia / 2, 0);
    geo.rotateX(-Math.PI / 2);
    this.matCono = new THREE.MeshBasicMaterial({ color: 0xffd400, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false });
    this.cono = new THREE.Mesh(geo, this.matCono);
    const bordes = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 1), new THREE.LineBasicMaterial({ color: 0xffd400, transparent: true, opacity: 0.5 }));
    this.cono.add(bordes);
    this.grupo.add(this.cono);

    // Grafo de navegación
    const pos = [];
    for (const n of nav.nodos) {
      for (const vec of n.vecinos) {
        if (vec < n.id) continue;
        const m = nav.nodos[vec];
        pos.push(n.pos.x, 0.03, n.pos.z, m.pos.x, 0.03, m.pos.z);
      }
      const punto = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: 0x8899aa }));
      punto.position.set(n.pos.x, 0.05, n.pos.z);
      this.grupo.add(punto);
    }
    const geoAristas = new THREE.BufferGeometry();
    geoAristas.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    this.grupo.add(new THREE.LineSegments(geoAristas, new THREE.LineBasicMaterial({ color: 0x8899aa })));

    // Waypoints de patrulla (numerados por tamaño/color)
    balance.profesora.patrulla.forEach((p) => {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.04, 16), new THREE.MeshBasicMaterial({ color: 0xffb000 }));
      w.position.set(p.x, 0.04, p.z);
      this.grupo.add(w);
    });

    // Ruta actual
    this.geoRuta = new THREE.BufferGeometry();
    this.geoRuta.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(3 * 32), 3));
    this.lineaRuta = new THREE.Line(this.geoRuta, new THREE.LineBasicMaterial({ color: 0x00e5ff }));
    this.lineaRuta.frustumCulled = false;
    this.grupo.add(this.lineaRuta);

    // Radio de pánico alrededor del banco central (lo usa la Fase 5)
    const radioPanico = balance.panico?.radio;
    if (radioPanico) {
      const anillo = new THREE.Mesh(
        new THREE.RingGeometry(radioPanico - 0.04, radioPanico, 48),
        new THREE.MeshBasicMaterial({ color: 0xff4040, side: THREE.DoubleSide }),
      );
      anillo.rotation.x = -Math.PI / 2;
      anillo.position.set(aula.bancoCentral.posicion.x, 0.03, aula.bancoCentral.posicion.z);
      this.grupo.add(anillo);
    }

    // Panel de texto
    this.panel = document.createElement('div');
    this.panel.className = 'debug-panel';
    this.panel.style.display = 'none';
    document.getElementById('ui').appendChild(this.panel);

    bus.on('tecla', ({ code, abajo }) => {
      if (!abajo) return;
      if (code === CONTROLES.debug) this.alternar();
      if (!estado.debug) return;
      if (code === CONTROLES.debugRuido) {
        bus.emit('ruido', { posicion: aula.bancoCentral.posicion.clone(), intensidad: 0.9, tipo: 'debug' });
      }
      if (code === CONTROLES.debugTrampa) estado.accion.debugTrampa = !estado.accion.debugTrampa;
      if (code === CONTROLES.debugCenital) this.game.camaraDebug = this.game.camaraDebug ? null : this.camCenital;
    });

    // Cámara cenital para ver toda el aula desde arriba
    const l = aula.limites;
    const aspecto = window.innerWidth / window.innerHeight;
    const alto = (l.zMax - l.zMin) / 2 + 0.5;
    this.camCenital = new THREE.OrthographicCamera(-alto * aspecto, alto * aspecto, alto, -alto, 0.1, 30);
    this.camCenital.position.set(0, 12, (l.zMin + l.zMax) / 2);
    this.camCenital.lookAt(0, 0, (l.zMin + l.zMax) / 2);

    this._v = new THREE.Vector3();
    this.correEnPausa = true;
  }

  alternar() {
    estado.debug = !estado.debug;
    this.grupo.visible = estado.debug;
    this.panel.style.display = estado.debug ? 'block' : 'none';
    if (!estado.debug) {
      estado.accion.debugTrampa = false;
      this.game.camaraDebug = null;
    }
  }

  update() {
    if (!estado.debug) return;
    const ia = this.ia;
    const cabeza = ia.p.rig.cabeza;
    cabeza.getWorldPosition(this.cono.position);
    cabeza.getWorldDirection(this._v).negate();
    this.cono.lookAt(this._v.add(this.cono.position));
    this.matCono.color.set(ia.veTrampa ? 0xff2020 : ia.veAlJugador ? 0xff8800 : 0xffd400);

    // Ruta
    const attr = this.geoRuta.attributes.position;
    const puntos = [ia.posicion, ...ia.ruta].slice(0, 32);
    puntos.forEach((p, i) => attr.setXYZ(i, p.x, 0.08, p.z));
    this.geoRuta.setDrawRange(0, puntos.length);
    attr.needsUpdate = true;

    const barra = '#'.repeat(Math.round(ia.sospecha / 5)).padEnd(20, '·');
    this.panel.innerHTML = `
      <b>DEBUG (F1)</b><br>
      Estado IA: <b>${ia.nombreEstado}</b>${ia.descubierto ? ' — ¡te descubrió! (la secuencia de final llega en la Fase 6)' : ''}<br>
      Sospecha: ${barra} <b>${ia.sospecha.toFixed(1)}</b><br>
      Ve al jugador: ${ia.veAlJugador ? 'SÍ' : 'no'} · Ve trampa: ${ia.veTrampa ? '<b>SÍ</b>' : 'no'}<br>
      Haciendo trampa: ${haciendoTrampa() ? 'SÍ' : 'no'}${estado.accion.debugTrampa ? ' (simulada con T)' : ''}<br>
      Escalada: ${(ia.escalada * 100).toFixed(0)}% · Acto: ${estado.acto} · Pánico: ${((estado.panico ?? 0) * 100).toFixed(0)}% · Compromiso: ${estado.compromiso.toFixed(1)}<br>
      Tiempo: ${estado.tiempo.toFixed(0)} s<br>
      <span class="debug-ayuda">N = ruido en tu banco · T = simular trampa · V = vista cenital</span>`;
  }
}
