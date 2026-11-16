// Animación por poses simples: cada pose define rotaciones [x, y, z] (radianes) por articulación.
// El animador interpola suavemente hacia la pose objetivo y suma "capas" procedurales
// (escribir, golpear la lapicera, caminar, respirar...) encima.
//
// Convenciones (el personaje mira hacia -Z):
//  - hombro/codo x positivo: el brazo va hacia adelante (π = brazo arriba)
//  - hombro z: hacia adentro es + para el izquierdo y - para el derecho
//  - cabeza x negativo: mira hacia abajo; cabeza y positivo: gira a su izquierda
//  - torso x negativo: se inclina hacia adelante

//  - pierna x positivo: el muslo va hacia adelante; rodilla x negativo: dobla la rodilla
//  (cadera, rodillas y tobillos sólo existen en los personajes con modelo y esqueleto)
const ARTICULACIONES = [
  'cadera', 'torso', 'cabeza', 'hombroI', 'codoI', 'munecaI', 'hombroD', 'codoD', 'munecaD',
  'piernaI', 'piernaD', 'rodillaI', 'rodillaD', 'tobilloI', 'tobilloD',
];

export const POSES = {
  sentado: {
    torso: [-0.08, 0, 0], cabeza: [-0.25, 0, 0],
    hombroI: [0.6, 0, 0.18], codoI: [0.85, 0, 0], munecaI: [0, -1.3, 0],
    hombroD: [0.6, 0, -0.18], codoD: [0.85, 0, 0], munecaD: [0, 1.3, 0],
  },
  escribir: {
    torso: [-0.18, 0, 0], cabeza: [-0.55, 0, 0],
    hombroI: [0.55, 0, 0.3], codoI: [0.95, 0, 0], munecaI: [0, -1.4, 0],
    hombroD: [0.62, 0, -0.12], codoD: [0.85, 0, 0], munecaD: [0.3, 1.2, 0],
  },
  // Primera persona: manos apoyadas sobre la hoja
  // (munecas y = ±π/2: la palma mira hacia abajo, apoyada; no cambia nada en el placeholder)
  manosEnBanco: {
    hombroI: [0.55, 0, 0.12], codoI: [0.95, 0, 0], munecaI: [0, -1.45, 0],
    hombroD: [0.55, 0, -0.12], codoD: [0.95, 0, 0], munecaD: [0, 1.45, 0],
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
  // Manos atrás: el brazo rota hacia adentro (y) para que el codo doble hacia la espalda
  manosAtras: {
    torso: [0.03, 0, 0],
    hombroI: [-0.5, -1.4, 0.1], codoI: [1.55, 0, 0],
    hombroD: [-0.5, 1.4, -0.1], codoD: [1.55, 0, 0],
  },
  // Señas: mano derecha levantada mostrando dedos
  levantarMano: {
    torso: [-0.05, 0, 0], cabeza: [-0.05, 0, 0],
    hombroI: [0.6, 0, 0.25], codoI: [0.9, 0, 0],
    hombroD: [2.45, 0, -0.2], codoD: [0.55, 0, 0],
  },
  // Alumnos de fondo escribiendo: con el torso elevado (modelo.elevarTorso) las manos quedan
  // apoyadas sobre la tapa del banco y no por debajo (valores medidos con los tres modelos)
  escribirFondo: {
    torso: [0, 0, 0], cabeza: [-0.25, 0, 0],
    hombroI: [0.5, 0, 0], codoI: [1.2, 0, 0], munecaI: [0, -1.2, 0],
    hombroD: [0.6, 0, 0], codoD: [1.1, 0, 0], munecaD: [0, 1.2, 0],
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
  // Sofi: cartelito con el número de pregunta en la izquierda y los dedos en la derecha.
  // Antebrazo izquierdo levantado con el cartel y brazo derecho arriba con los dedos; el cartel y
  // la mano se agrandan un poco y se orientan al jugador (ver Senias.js).
  seniaCartel: {
    torso: [-0.02, 0, 0], cabeza: [0, 0, 0],
    hombroI: [1.5, 0, -0.9], codoI: [1.8, 0, 0],
    hombroD: [2.1, 0, 0.5], codoD: [1.0, 0, 0],
  },
  // Sofi pidiendo: cartelito con "¿N?" y la otra mano abierta, como preguntando
  seniaPedido: {
    torso: [0.02, 0, 0], cabeza: [0.08, 0, 0.15],
    hombroI: [1.5, 0, -0.9], codoI: [1.8, 0, 0],
    hombroD: [1.6, 0, 0.6], codoD: [1.4, 0, 0],
  },
  // Tomi atrapando un papelito
  atrapar: {
    torso: [0.05, 0, 0], cabeza: [0.15, 0, 0],
    hombroI: [1.9, 0, 0.2], codoI: [0.4, 0, 0],
    hombroD: [1.9, 0, -0.2], codoD: [0.4, 0, 0],
  },
  // ---- Protagonista (primera persona: sólo se ven antebrazos y manos) ----
  jugMachete: {
    hombroI: [0.85, 0, 0.2], codoI: [1.05, 0, 0], munecaI: [0, -0.9, 0],
    hombroD: [0.55, 0, -0.12], codoD: [0.95, 0, 0], munecaD: [0, 1.45, 0],
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
    hombroI: [0.55, 0, 0.12], codoI: [0.95, 0, 0], munecaI: [0, -1.45, 0],
    hombroD: [1.85, 0, 0.02], codoD: [0.45, 0, 0],
  },
  jugAbrirPapel: {
    hombroI: [0.35, 0, 0.35], codoI: [1.05, 0, 0], munecaI: [0, -0.6, 0],
    hombroD: [0.35, 0, -0.35], codoD: [1.05, 0, 0], munecaD: [0, 0.6, 0],
  },
  // ---- Intro: la cena ----
  // El chico revuelve la comida sin comer, encorvado y con la cabeza gacha
  // (el torso inclinado lleva los brazos hacia atrás: por eso los hombros van bien adelante)
  cenar: {
    torso: [-0.3, 0, 0], cabeza: [-0.45, 0, 0],
    hombroI: [1.3, 0, 0.16], codoI: [0.62, 0, 0], munecaI: [0, -1.4, 0],
    hombroD: [1.35, 0, -0.04], codoD: [0.55, 0, 0], munecaD: [-0.1, 0.9, 0],
  },
  // Codo izquierdo en la mesa y la frente apoyada en la mano
  agobiado: {
    torso: [-0.38, 0, 0], cabeza: [-0.6, 0.15, 0.12],
    hombroI: [1.4, 0, 0.3], codoI: [2.4, 0, 0], munecaI: [0.2, -0.5, 0],
    hombroD: [1.42, 0, -0.04], codoD: [0.5, 0, 0], munecaD: [-0.1, 0.9, 0],
  },
  // Padres: señalar con el dedo, apoyar las manos en la mesa
  senalar: {
    torso: [-0.06, 0, 0],
    hombroI: [0.1, 0, -0.1], codoI: [0.3, 0, 0],
    hombroD: [1.45, 0, 0.05], codoD: [0.15, 0, 0],
  },
  apoyarMesa: {
    torso: [-0.5, 0, 0], cabeza: [-0.2, 0, 0],
    hombroI: [0.75, 0, -0.15], codoI: [0.35, 0, 0],
    hombroD: [0.75, 0, 0.15], codoD: [0.35, 0, 0],
  },
  brazosEnJarra: {
    torso: [0.04, 0, 0],
    hombroI: [0.1, 0, -0.65], codoI: [1.6, 0, 0],
    hombroD: [0.1, 0, 0.65], codoD: [1.6, 0, 0],
  },
  // Disimular: todos bajan las manos y miran la hoja
  disimular: {
    torso: [-0.2, 0, 0], cabeza: [-0.65, 0, 0],
    hombroI: [0.55, 0, 0.3], codoI: [0.95, 0, 0],
    hombroD: [0.6, 0, -0.15], codoD: [0.85, 0, 0],
  },
};

// Pose de los dedos que acompaña a cada pose del brazo (por defecto: relajada).
// Valores en POSES_MANO (Manos.js). [izquierda, derecha]
const MANOS_POR_POSE = {
  escribir: ['plana', 'lapicera'],
  escribirFondo: ['plana', 'lapicera'],
  golpear: ['plana', 'lapicera'],
  disimular: ['plana', 'lapicera'],
  manosEnBanco: ['plana', 'plana'],
  jugMachete: ['pinza', 'plana'],
  jugApuntar: ['plana', 'pinza'],
  jugLanzar: ['plana', 'abierta'],
  jugDedos: ['plana', 'abierta'],
  jugAbrirPapel: ['pinza', 'pinza'],
  prepararLanzar: ['plana', 'pinza'],
  lanzar: ['plana', 'abierta'],
  atrapar: ['atrapar', 'atrapar'],
  reclamo: ['abierta', 'abierta'],
  bronca: ['puno', 'puno'],
  brazosEnJarra: ['puno', 'puno'],
  senalar: ['reposo', 'senalar'],
  apoyarMesa: ['plana', 'plana'],
  retirarExamen: ['reposo', 'pinza'],
  seniaCartel: ['pinza', 'reposo'],
  seniaPedido: ['pinza', 'abierta'],
  cenar: ['plana', 'pinza'],
  agobiado: ['puno', 'pinza'],
  escribirPizarron: ['reposo', 'lapicera'],
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
  // Ciclo de marcha. La fase la avanza quien mueve al personaje según la DISTANCIA recorrida
  // (an.faseCaminar), así los pies no patinan aunque cambie la velocidad.
  // Convención de signos: en brazos y piernas +x = hacia adelante; en torso y cabeza +x = hacia atrás.
  caminar: (t, f, vel = 1, an) => {
    const fase = an?.faseCaminar ?? t * 7 * vel + f;
    const s = Math.sin(fase);
    const c = Math.cos(fase);
    const A = an?.zancada ?? 0.34; // amplitud del muslo (radianes)
    const k = A / 0.3;
    const v = an?.velCamina ?? 0.7; // velocidad real (m/s): inclina el cuerpo al arrancar y al ir rápido
    const bb = an?.balanceoBrazos ?? 1; // los brazos acompañan (0 = manos atrás)
    // La rodilla se dobla mientras la pierna avanza (balanceo) y queda casi recta al apoyar
    const rodI = -(0.08 + 0.8 * Math.pow(Math.max(0, c), 1.5)) * k;
    const rodD = -(0.08 + 0.8 * Math.pow(Math.max(0, -c), 1.5)) * k;
    const swing = 0.46 * bb * Math.min(1.25, 0.5 + v) * k; // vaivén de los brazos
    return {
      piernaI: [s * A, 0, 0],
      piernaD: [-s * A, 0, 0],
      rodillaI: [rodI, 0, 0],
      rodillaD: [rodD, 0, 0],
      // El pie llega con la punta arriba (talón) y despega con la punta abajo
      tobilloI: [-(s * A + rodI) * 0.7, 0, 0],
      tobilloD: [-(-s * A + rodD) * 0.7, 0, 0],
      // La pelvis gira con la pierna que avanza, se inclina hacia el lado de la pierna que
      // se balancea y se desplaza sobre el pie de apoyo; el torso contrarresta
      cadera: [0, s * 0.1 * k, -c * 0.035 * k],
      caderaX: [c * 0.024 * k, 0, 0],
      torso: [-Math.min(0.09, v * 0.08), -s * 0.17 * k, c * 0.022 * k],
      // Brazos contra-fase, algo separados del cuerpo y con el codo que acompaña
      hombroI: [-s * swing, 0, -0.07],
      hombroD: [s * swing, 0, 0.07],
      codoI: [(0.2 + Math.max(0, -s) * 0.45) * bb, 0, 0],
      codoD: [(0.2 + Math.max(0, s) * 0.45) * bb, 0, 0],
      // La cabeza compensa el giro del torso y acompaña con un leve cabeceo
      cabeza: [Math.cos(fase * 2) * 0.014, s * 0.06 * k, 0],
      // Sube y baja: más alto con la pierna vertical, más bajo con las piernas abiertas
      caderaY: [(Math.cos(fase * 2) * 0.022 - 0.016) * k, 0, 0],
    };
  },
  // Quieto pero vivo: cambios de peso, respiración y micro-movimientos de cabeza y hombros
  vivo: (t, f) => {
    const w = Math.sin(t * 0.55 + f);
    return {
      caderaX: [w * 0.014, 0, 0],
      cadera: [0, Math.sin(t * 0.31 + f) * 0.03, w * 0.022],
      torso: [Math.sin(t * 1.6 + f) * 0.014, Math.sin(t * 0.37 + f * 1.3) * 0.03, -w * 0.035],
      cabeza: [Math.sin(t * 0.9 + f) * 0.025, Math.sin(t * 0.43 + f * 2) * 0.08, w * 0.02],
      hombroI: [Math.sin(t * 0.8 + f) * 0.025, 0, Math.sin(t * 0.6 + f) * 0.02],
      hombroD: [Math.sin(t * 0.8 + f + 2) * 0.025, 0, -Math.sin(t * 0.6 + f + 1) * 0.02],
    };
  },
  reclamo: (t, f) => ({
    hombroI: [Math.sin(t * 6 + f) * 0.12, 0, 0],
    hombroD: [Math.sin(t * 6 + f + 0.5) * 0.12, 0, 0],
    cabeza: [0, Math.sin(t * 3 + f) * 0.15, 0],
  }),
  bronca: (t, f) => ({ cabeza: [0, Math.sin(t * 2 + f) * 0.2, 0] }),
  asentir: (t) => ({ cabeza: [Math.sin(t * 9) * 0.18, 0, 0] }),
  // Revolver la comida con el tenedor, sin ganas
  revolver: (t, f) => ({
    hombroD: [Math.sin(t * 1.3 + f) * 0.05, 0, Math.sin(t * 0.9 + f) * 0.07],
    codoD: [Math.sin(t * 1.3 + f + 1) * 0.07, 0, 0],
  }),
  // Retar: gestos enfáticos con las manos y la cabeza
  retar: (t, f) => ({
    hombroD: [Math.max(0, Math.sin(t * 4.2 + f)) * 0.35, 0, 0],
    codoD: [Math.max(0, Math.sin(t * 4.2 + f)) * 0.3, 0, 0],
    cabeza: [Math.sin(t * 5 + f) * 0.06, Math.sin(t * 2.1 + f) * 0.12, 0],
    torso: [Math.sin(t * 4.2 + f) * 0.03, 0, 0],
  }),
};

export class Animador {
  constructor(personaje) {
    this.p = personaje;
    this.actual = {};
    this.objetivo = {};
    this.extra = {};   // offsets externos (p. ej., girar la cabeza hacia algo)
    this.base = {};
    this.capas = new Map([['respirar', 1]]);   // peso objetivo de cada capa
    this.pesos = new Map([['respirar', 1]]);   // peso actual (se acerca suave al objetivo)
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
    if (this.p.rig.cadera) {
      this.baseCaderaY = this.p.rig.cadera.position.y;
      this.baseCaderaX = this.p.rig.cadera.position.x;
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
    const manos = MANOS_POR_POSE[nombre] ?? ['reposo', 'reposo'];
    this.p.manos?.pose('I', manos[0]);
    this.p.manos?.pose('D', manos[1]);
  }

  // Las capas entran y salen con una mezcla suave (sin saltos al empezar o dejar de caminar)
  capa(nombre, peso = 1) {
    this.capas.set(nombre, Math.max(0, peso));
    if (!this.pesos.has(nombre)) this.pesos.set(nombre, 0);
  }

  update(dt, t) {
    const k = 1 - Math.exp(-this.velocidad * dt);
    const kCapa = 1 - Math.exp(-(this.velocidadCapas ?? 7) * dt);
    // offsets de capas
    const suma = {};
    for (const [nombre, actual] of this.pesos) {
      const objetivo = this.capas.get(nombre) ?? 0;
      const peso = actual + (objetivo - actual) * kCapa;
      if (objetivo === 0 && peso < 0.002) {
        this.pesos.delete(nombre);
        this.capas.delete(nombre);
        continue;
      }
      this.pesos.set(nombre, peso);
      const off = CAPAS[nombre]?.(t, this.fase, this.velCaminar, this);
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
    // Rebote vertical de la cadera al caminar
    if (this.baseCaderaY !== undefined && this.p.rig.cadera) {
      this.p.rig.cadera.position.y = this.baseCaderaY + (suma.caderaY ? suma.caderaY[0] : 0);
      // Desplazamiento lateral de la pelvis (cambio de peso)
      this.p.rig.cadera.position.x = (this.baseCaderaX ?? 0) + (suma.caderaX ? suma.caderaX[0] : 0);
    }
  }
}
