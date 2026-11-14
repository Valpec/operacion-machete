import * as THREE from 'three';

/**
 * Grafo de navegación por los pasillos del aula.
 * Nodos: cruces entre pasillos verticales (entre columnas de bancos) y la altura de cada fila,
 * más los pasillos de adelante y del fondo, el pizarrón y el escritorio.
 * Sólo se puede cruzar de un pasillo vertical a otro por adelante o por el fondo.
 */
export class Navegacion {
  constructor(aula, balance) {
    const a = balance.aula;
    this.nodos = [];   // { id, pos: Vector3, vecinos: Set<id> }
    const filasZ = [...new Set(aula.bancos.map((b) => b.posicion.z))].sort((x, y) => x - y);
    const zs = [a.pasilloFrenteZ, ...filasZ, a.pasilloFondoZ];

    const idx = new Map();
    const agregar = (x, z) => {
      const id = this.nodos.length;
      this.nodos.push({ id, pos: new THREE.Vector3(x, 0, z), vecinos: new Set() });
      return id;
    };
    const unir = (i, j) => {
      this.nodos[i].vecinos.add(j);
      this.nodos[j].vecinos.add(i);
    };

    a.pasillosX.forEach((x, i) => {
      zs.forEach((z, j) => idx.set(`${i},${j}`, agregar(x, z)));
    });
    a.pasillosX.forEach((_, i) => {
      for (let j = 0; j < zs.length - 1; j++) unir(idx.get(`${i},${j}`), idx.get(`${i},${j + 1}`));
    });
    // Cruces horizontales sólo por adelante y por el fondo
    for (let i = 0; i < a.pasillosX.length - 1; i++) {
      unir(idx.get(`${i},0`), idx.get(`${i + 1},0`));
      unir(idx.get(`${i},${zs.length - 1}`), idx.get(`${i + 1},${zs.length - 1}`));
    }

    // Pizarrón y escritorio (conectados al pasillo de adelante por el lado libre)
    this.pizarron = agregar(...a.puntoPizarron);
    this.escritorio = agregar(...a.puntoEscritorio);
    unir(this.pizarron, this.escritorio);
    const frenteCercano = (x) => this.masCercano(new THREE.Vector3(x, 0, a.pasilloFrenteZ));
    unir(this.pizarron, frenteCercano(1.1));
    unir(this.pizarron, frenteCercano(3.3));
    unir(this.escritorio, frenteCercano(-1.1));

    this.filasZ = filasZ;
    this.pasillosX = a.pasillosX;
  }

  masCercano(pos) {
    let mejor = 0;
    let dMin = Infinity;
    for (const n of this.nodos) {
      const d = (n.pos.x - pos.x) ** 2 + (n.pos.z - pos.z) ** 2;
      if (d < dMin) {
        dMin = d;
        mejor = n.id;
      }
    }
    return mejor;
  }

  // Dijkstra (el grafo es chico, alcanza y sobra)
  ruta(desde, hasta) {
    const inicio = this.masCercano(desde);
    const fin = this.masCercano(hasta);
    const dist = new Map([[inicio, 0]]);
    const previo = new Map();
    const pendientes = new Set([inicio]);
    while (pendientes.size) {
      let actual = null;
      let dMin = Infinity;
      for (const id of pendientes) {
        if (dist.get(id) < dMin) {
          dMin = dist.get(id);
          actual = id;
        }
      }
      pendientes.delete(actual);
      if (actual === fin) break;
      for (const v of this.nodos[actual].vecinos) {
        const nd = dMin + this.nodos[actual].pos.distanceTo(this.nodos[v].pos);
        if (nd < (dist.get(v) ?? Infinity)) {
          dist.set(v, nd);
          previo.set(v, actual);
          pendientes.add(v);
        }
      }
    }
    const camino = [];
    for (let id = fin; id !== undefined; id = previo.get(id)) {
      camino.unshift(this.nodos[id].pos.clone());
      if (id === inicio) break;
    }
    // Si ya estamos parados sobre el tramo entre el primer y el segundo nodo, salteamos el primero
    // (evita volver hacia atrás). Sólo si estamos sobre el segmento, para no cortar camino entre bancos.
    if (camino.length > 1) {
      const [a, b] = camino;
      const sobreTramo = desde.distanceTo(a) + desde.distanceTo(b) - a.distanceTo(b) < 0.05;
      if (sobreTramo) camino.shift();
    }
    return camino;
  }

  // Punto del pasillo al costado de un banco (donde pararse a inspeccionarlo)
  puntoJuntoA(banco, preferirX = null) {
    const x = banco.posicion.x;
    const candidatos = this.pasillosX
      .filter((px) => Math.abs(px - x) < 1.5)
      .sort((p, q) => (preferirX === null ? Math.abs(p - x) - Math.abs(q - x) : Math.abs(p - preferirX) - Math.abs(q - preferirX)));
    return new THREE.Vector3(candidatos[0], 0, banco.posicion.z);
  }

  // Nodos de pasillo dentro de un radio (para deambular)
  nodosCerca(centro, radio) {
    return this.nodos.filter((n) => n.id !== this.pizarron && n.id !== this.escritorio && n.pos.distanceTo(centro) <= radio);
  }
}
