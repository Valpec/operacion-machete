// Animación por poses simples: cada pose define rotaciones [x, y, z] (radianes) por articulación.
// El animador interpola suavemente hacia la pose objetivo y suma "capas" procedurales
// (escribir, golpear la lapicera, caminar, respirar...) encima.
//
// Convenciones (el personaje mira hacia -Z):
//  - hombro/codo x positivo: el brazo va hacia adelante (π = brazo arriba)
//  - hombro z: hacia adentro es + para el izquierdo y - para el derecho
//  - cabeza x negativo: mira hacia abajo; cabeza y positivo: gira a su izquierda
//  - torso x negativo: se inclina hacia adelante

const ARTICULACIONES = ['torso', 'cabeza', 'hombroI', 'codoI', 'munecaI', 'hombroD', 'codoD', 'munecaD', 'piernaI', 'piernaD'];

export const POSES = {
  sentado: {
    torso: [-0.08, 0, 0], cabeza: [-0.25, 0, 0],
    hombroI: [0.6, 0, 0.18], codoI: [0.85, 0, 0],
    hombroD: [0.6, 0, -0.18], codoD: [0.85, 0, 0],
  },
  escribir: {
    torso: [-0.18, 0, 0], cabeza: [-0.55, 0, 0],
    hombroI: [0.55, 0, 0.3], codoI: [0.95, 0, 0],
    hombroD: [0.62, 0, -0.12], codoD: [0.85, 0, 0], munecaD: [0.3, 0, 0],
  },
  // Primera persona: manos apoyadas sobre la hoja
  manosEnBanco: {
    hombroI: [0.55, 0, 0.12], codoI: [0.95, 0, 0],
    hombroD: [0.55, 0, -0.12], codoD: [0.95, 0, 0],
  },
  parado: {
    hombroI: [0.05, 0, -0.08], codoI: [0.15, 0, 0],
    hombroD: [0.05, 0, 0.08], codoD: [0.15, 0, 0],
  },
  // Profesora escribiendo en el pizarrón (de espaldas a la clase)
  escribirPizarron: {
    cabeza: [0.1, 0, 0],
    hombroI: [0.05, 0, -0.08], codoI: [0.2, 0, 0],
    hombroD: [2.2, 0, -0.15], codoD: [0.7, 0, 0],
  },
  // Profesora estirando el brazo para retirar el examen del banco
  retirarExamen: {
    torso: [-0.3, 0, 0], cabeza: [-0.35, 0, 0],
    hombroI: [0.05, 0, -0.08], codoI: [0.2, 0, 0],
    hombroD: [1.15, 0, -0.1], codoD: [0.35, 0, 0],
  },
  manosAtras: {
    torso: [0.03, 0, 0],
    hombroI: [-0.35, 0, 0.25], codoI: [0.9, 0, 0],
    hombroD: [-0.35, 0, -0.25], codoD: [0.9, 0, 0],
  },
  // Señas: mano derecha levantada mostrando dedos
  levantarMano: {
    torso: [-0.05, 0, 0], cabeza: [-0.05, 0, 0],
    hombroI: [0.6, 0, 0.25], codoI: [0.9, 0, 0],
    hombroD: [2.45, 0, -0.2], codoD: [0.55, 0, 0],
  },
  // Golpes de lapicera: antebrazo derecho elevado (la capa "golpear" lo baja y sube)
  golpear: {
    torso: [-0.12, 0, 0], cabeza: [-0.2, 0, 0],
    hombroI: [0.55, 0, 0.3], codoI: [0.95, 0, 0],
    hombroD: [0.7, 0, -0.15], codoD: [1.05, 0, 0],
  },
  prepararLanzar: {
    torso: [0.05, 0, 0], cabeza: [0, 0, 0],
    hombroI: [0.6, 0, 0.25], codoI: [0.9, 0, 0],
    hombroD: [1.9, 0, -0.3], codoD: [1.6, 0, 0],
  },
  lanzar: {
    torso: [-0.12, 0, 0], cabeza: [0, 0, 0],
    hombroI: [0.6, 0, 0.25], codoI: [0.9, 0, 0],
    hombroD: [1.5, 0, -0.1], codoD: [0.1, 0, 0],
  },
  // Reclamo / presión: brazos abiertos con palmas arriba
  reclamo: {
    torso: [0.05, 0, 0], cabeza: [0.1, 0, 0],
    hombroI: [0.9, 0, -0.5], codoI: [0.9, 0, 0],
    hombroD: [0.9, 0, 0.5], codoD: [0.9, 0, 0],
  },
  // Bronca: brazos cruzados
  bronca: {
    torso: [0.08, 0, 0], cabeza: [0.05, 0, 0],
    hombroI: [0.55, 0, 0.55], codoI: [1.75, 0, 0],
    hombroD: [0.5, 0, -0.55], codoD: [1.8, 0, 0],
  },
  // Sofi: cartelito con el número de pregunta en la izquierda y dedos en la derecha
  seniaCartel: {
    torso: [-0.02, 0, 0], cabeza: [0, 0, 0],
    hombroI: [1.35, 0, 0.35], codoI: [0.75, 0, 0],
    hombroD: [2.45, 0, -0.2], codoD: [0.55, 0, 0],
  },
  // Sofi pidiendo: cartelito con "¿N?" y la otra mano abierta, como preguntando
  seniaPedido: {
    torso: [0.02, 0, 0], cabeza: [0.08, 0, 0.15],
    hombroI: [1.35, 0, 0.35], codoI: [0.75, 0, 0],
    hombroD: [0.95, 0, 0.45], codoD: [0.9, 0, 0],
  },
  // Tomi atrapando un papelito
  atrapar: {
    torso: [0.05, 0, 0], cabeza: [0.15, 0, 0],
    hombroI: [1.9, 0, 0.2], codoI: [0.4, 0, 0],
    hombroD: [1.9, 0, -0.2], codoD: [0.4, 0, 0],
  },
  // ---- Protagonista (primera persona: sólo se ven antebrazos y manos) ----
  jugMachete: {
    hombroI: [0.85, 0, 0.2], codoI: [1.05, 0, 0],
    hombroD: [0.55, 0, -0.12], codoD: [0.95, 0, 0],
  },
  jugApuntar: {
    hombroI: [0.55, 0, 0.12], codoI: [0.95, 0, 0],
    hombroD: [1.7, 0, -0.45], codoD: [1.75, 0, 0],
  },
  jugLanzar: {
    hombroI: [0.55, 0, 0.12], codoI: [0.95, 0, 0],
    hombroD: [1.55, 0, -0.1], codoD: [0.15, 0, 0],
  },
  jugDedos: {
    hombroI: [0.55, 0, 0.12], codoI: [0.95, 0, 0],
    hombroD: [2.2, 0, -0.55], codoD: [0.7, 0, 0],
  },
  jugAbrirPapel: {
    hombroI: [0.35, 0, 0.35], codoI: [1.05, 0, 0],
    hombroD: [0.35, 0, -0.35], codoD: [1.05, 0, 0],
  },
  // Disimular: todos bajan las manos y miran la hoja
  disimular: {
    torso: [-0.2, 0, 0], cabeza: [-0.65, 0, 0],
    hombroI: [0.55, 0, 0.3], codoI: [0.95, 0, 0],
    hombroD: [0.6, 0, -0.15], codoD: [0.85, 0, 0],
  },
};

// Capas procedurales: devuelven offsets que se suman a la pose
const CAPAS = {
  respirar: (t, f) => ({ torso: [Math.sin(t * 1.6 + f) * 0.015, 0, 0] }),
  escribir: (t, f) => ({
    codoD: [Math.sin(t * 11 + f) * 0.05, 0, 0],
    hombroD: [0, 0, Math.sin(t * 2.3 + f) * 0.06],
    cabeza: [0, Math.sin(t * 0.7 + f) * 0.06, 0],
  }),
  golpear: (t) => {
    // tres golpes rápidos por ciclo (el sistema de señas sincroniza el sonido)
    const fase = (t * 3.2) % 1;
    return { codoD: [-Math.max(0, Math.sin(fase * Math.PI)) * 0.45, 0, 0] };
  },
  caminar: (t, f, vel = 1) => {
    const s = Math.sin(t * 7 * vel + f);
    return {
      piernaI: [s * 0.35, 0, 0],
      piernaD: [-s * 0.35, 0, 0],
      torso: [0, s * 0.04, 0],
    };
  },
  reclamo: (t, f) => ({
    hombroI: [Math.sin(t * 6 + f) * 0.12, 0, 0],
    hombroD: [Math.sin(t * 6 + f + 0.5) * 0.12, 0, 0],
    cabeza: [0, Math.sin(t * 3 + f) * 0.15, 0],
  }),
  bronca: (t, f) => ({ cabeza: [0, Math.sin(t * 2 + f) * 0.2, 0] }),
  asentir: (t) => ({ cabeza: [Math.sin(t * 9) * 0.18, 0, 0] }),
};

export class Animador {
  constructor(personaje) {
    this.p = personaje;
    this.actual = {};
    this.objetivo = {};
    this.extra = {};   // offsets externos (p. ej., girar la cabeza hacia algo)
    this.base = {};
    this.capas = new Map([['respirar', 1]]);
    this.velocidad = 6;
    this.fase = Math.random() * 10;
    this.velCaminar = 1;
  }

  articulacion(nombre) {
    const r = this.p.rig;
    switch (nombre) {
      case 'hombroI': return r.brazoI?.hombro;
      case 'codoI': return r.brazoI?.codo;
      case 'munecaI': return r.brazoI?.muneca;
      case 'hombroD': return r.brazoD?.hombro;
      case 'codoD': return r.brazoD?.codo;
      case 'munecaD': return r.brazoD?.muneca;
      default: return r[nombre];
    }
  }

  capturarReposo() {
    for (const n of ARTICULACIONES) {
      const a = this.articulacion(n);
      if (a) this.base[n] = [a.rotation.x, a.rotation.y, a.rotation.z];
    }
  }

  poseInicial(nombre) {
    this.capturarReposo();
    this.pose(nombre);
    for (const n of ARTICULACIONES) this.actual[n] = [...(this.objetivo[n] ?? [0, 0, 0])];
  }

  pose(nombre, velocidad = 6) {
    const def = POSES[nombre];
    if (!def) return;
    this.poseActual = nombre;
    this.velocidad = velocidad;
    for (const n of ARTICULACIONES) this.objetivo[n] = def[n] ?? [0, 0, 0];
  }

  capa(nombre, peso = 1) {
    if (peso <= 0) this.capas.delete(nombre);
    else this.capas.set(nombre, peso);
  }

  update(dt, t) {
    const k = 1 - Math.exp(-this.velocidad * dt);
    // offsets de capas
    const suma = {};
    for (const [nombre, peso] of this.capas) {
      const off = CAPAS[nombre]?.(t, this.fase, this.velCaminar);
      if (!off) continue;
      for (const [art, v] of Object.entries(off)) {
        suma[art] ??= [0, 0, 0];
        for (let i = 0; i < 3; i++) suma[art][i] += v[i] * peso;
      }
    }
    for (const n of ARTICULACIONES) {
      const a = this.articulacion(n);
      if (!a) continue;
      const obj = this.objetivo[n] ?? [0, 0, 0];
      const cur = (this.actual[n] ??= [0, 0, 0]);
      const ex = this.extra[n];
      for (let i = 0; i < 3; i++) cur[i] += (obj[i] + (ex ? ex[i] : 0) - cur[i]) * k;
      const b = this.base[n] ?? [0, 0, 0];
      const s = suma[n];
      a.rotation.set(b[0] + cur[0] + (s ? s[0] : 0), b[1] + cur[1] + (s ? s[1] : 0), b[2] + cur[2] + (s ? s[2] : 0));
    }
  }
}
