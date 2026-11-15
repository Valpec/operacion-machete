import * as THREE from 'three';
import { estado } from '../core/GameState.js';

// Contorno amarillo para el objeto interactivo que el jugador está mirando
export const materialResaltado = new THREE.MeshBasicMaterial({ color: 0xffd84a, side: THREE.BackSide });

/**
 * Resalta (cambiando el color del contorno) el objeto interactivo más cercano al centro de la vista.
 * Cada sistema registra sus interactivos con una función que dice si están activos.
 */
export class Resaltado {
  constructor(camara) {
    this.camara = camara;
    this.items = new Set();
    this.actual = null;
    this._p = new THREE.Vector3();
  }

  /** item: { objeto, punto(v) -> Vector3, activo() -> bool, tolerancia (grados) } */
  registrar(item) {
    this.items.add(item);
    return () => {
      if (this.actual === item) this.aplicar(item, false);
      this.items.delete(item);
      if (this.actual === item) this.actual = null;
    };
  }

  aplicar(item, encendido) {
    item.objeto.traverse((o) => {
      if (!o.userData.esContorno) return;
      if (encendido) {
        o.userData.materialOriginal ??= o.material;
        o.material = o.userData.materialResaltado ?? materialResaltado;
      } else if (o.userData.materialOriginal) {
        o.material = o.userData.materialOriginal;
      }
    });
  }

  // ¿El jugador está mirando este item ahora?
  mirando(item) {
    return this.actual === item;
  }

  update() {
    let mejor = null;
    let mejorAng = Infinity;
    if (!estado.accion.modoHoja && !estado.final) {
      for (const item of this.items) {
        if (!item.activo()) continue;
        const ang = this.camara.anguloHacia(item.punto(this._p));
        if (ang < (item.tolerancia ?? 12) && ang < mejorAng) {
          mejor = item;
          mejorAng = ang;
        }
      }
    }
    if (mejor !== this.actual) {
      if (this.actual) this.aplicar(this.actual, false);
      if (mejor) this.aplicar(mejor, true);
      this.actual = mejor;
    }
  }
}
