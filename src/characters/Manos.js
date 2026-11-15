import * as THREE from 'three';

/**
 * Manos con dedos articulados para los modelos con auto-rig.
 *
 * Los GLB traen la mano como un bloque: cuatro dedos rectos y un pulgar, todo pegado a un solo
 * hueso. Acá se detectan los dedos en la malla y se arma, por mano, un esqueleto de
 *   pulgar (3 huesos) + índice, medio, anular y meñique (3 huesos cada uno)
 * colgado del hueso "mano". Con eso la mano puede quedar relajada, hacer puño, señalar,
 * agarrar una lapicera o mostrar de 1 a 4 dedos (las señas de Sofi) sin manos "postizas".
 *
 * Convención (igual que el resto del rig): los huesos de los dedos nacen con la orientación
 * del antebrazo; el eje Z local es el eje de flexión (los dedos se cierran hacia la palma).
 */

export const DEDOS = ['pulgar', 'indice', 'medio', 'anular', 'menique'];

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();

// ---------- Detección ----------

/**
 * Detecta los dedos de UNA mano en la geometría normalizada (mirando a -Z, pose A).
 * Devuelve null si la mano no tiene la forma esperada (en ese caso se usa el modo viejo).
 *   art  articulaciones de detectarArticulaciones()
 *   lado 'I' | 'D'
 * Resultado: { dedos: [{ nombre, puntos:[p0,p1,p2,p3] }], eje, largo }
 *   p0 = nudillo (base del dedo), p3 = punta; p1 y p2 son las articulaciones intermedias.
 */
export function detectarDedos(pos, art, lado, H, diag = []) {
  const signo = lado === 'I' ? -1 : 1;
  const mu = art['muneca' + lado];
  const pu = art['punta' + lado];
  const hombro = art['hombro' + lado];
  const u = new THREE.Vector3().subVectors(pu, mu);
  const L = u.length();
  if (L < H * 0.05) return diag.push('mano demasiado corta'), null;
  u.normalize();

  // Vértices de la mano: pasada la muñeca, cerca del eje y del lado correcto
  const xMin = Math.abs(hombro.x) * 0.55;
  const mano = [];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    if (x * signo < xMin) continue;
    _a.fromBufferAttribute(pos, i).sub(mu);
    const t = _a.dot(u);
    if (t < 0.05 * L || t > 1.08 * L) continue;
    const radial = _b.copy(_a).addScaledVector(u, -t).length();
    if (radial > 0.62 * L) continue;
    mano.push({ i, t: t / L, c: _a.z, p: new THREE.Vector3().fromBufferAttribute(pos, i) });
  }
  if (mano.length < 60) return diag.push(`pocos vértices de mano (${mano.length})`), null;

  // Puntas de los cuatro dedos largos: k-means (k = 4) sobre la coordenada transversal (z)
  // de los vértices de la franja distal. El pulgar no llega hasta ahí.
  const distal = mano.filter((q) => q.t > 0.74);
  if (distal.length < 20) return diag.push(`pocos vértices en la franja de puntas (${distal.length})`), null;
  const cs = distal.map((q) => q.c).sort((x, y) => x - y);
  let centros = [0.125, 0.375, 0.625, 0.875].map((f) => cs[Math.floor(f * (cs.length - 1))]);
  let grupo = new Array(distal.length).fill(0);
  for (let it = 0; it < 25; it++) {
    distal.forEach((q, n) => {
      let mejor = 0;
      for (let k = 1; k < 4; k++) if (Math.abs(q.c - centros[k]) < Math.abs(q.c - centros[mejor])) mejor = k;
      grupo[n] = mejor;
    });
    const suma = [0, 0, 0, 0];
    const cant = [0, 0, 0, 0];
    distal.forEach((q, n) => {
      suma[grupo[n]] += q.c;
      cant[grupo[n]]++;
    });
    for (let k = 0; k < 4; k++) if (cant[k]) centros[k] = suma[k] / cant[k];
  }
  // Ordenados de adelante (-z, junto al pulgar) hacia atrás: índice, medio, anular, meñique
  const orden = [0, 1, 2, 3].sort((x, y) => centros[x] - centros[y]);
  const largos = [0.4, 0.43, 0.4, 0.33]; // largo de cada dedo respecto del largo de la mano

  const dedos = [];
  const puntaDe = (miembros) => {
    // punta = promedio de los vértices más lejanos del grupo
    const ord = [...miembros].sort((q1, q2) => q2.t - q1.t);
    const n = Math.max(3, Math.min(8, Math.floor(ord.length * 0.15)));
    const p = new THREE.Vector3();
    for (let k = 0; k < n; k++) p.add(ord[k].p);
    return p.multiplyScalar(1 / n);
  };
  for (let f = 0; f < 4; f++) {
    const miembros = distal.filter((_, n) => grupo[n] === orden[f]);
    if (miembros.length < 3) return diag.push(`dedo ${f + 1} sin vértices`), null;
    const punta = puntaDe(miembros);
    const largo = Math.max(L * 0.28, Math.min(L * 0.6, punta.distanceTo(mu) * largos[f]));
    const dir = _c.subVectors(punta, mu).normalize();
    const base = punta.clone().addScaledVector(dir, -largo);
    const j1 = base.clone().lerp(punta, 0.4);
    const j2 = base.clone().lerp(punta, 0.72);
    dedos.push({ nombre: DEDOS[f + 1], puntos: [base, j1, j2, punta.clone()] });
  }

  // Pulgar: vértices adelante (-z) del eje del índice, sin llegar a la franja de las puntas
  const indice = dedos[0];
  const tIndice = _a.subVectors(indice.puntos[3], mu).dot(u) / L;
  const cIndice = indice.puntos[3].z - mu.z;
  const anchoDedo = Math.abs(centros[orden[1]] - centros[orden[0]]) || L * 0.12;
  const pulgarPts = mano.filter((q) => q.t < 0.8 && q.c < cIndice * (q.t / Math.max(0.3, tIndice)) - anchoDedo * 0.6);
  if (pulgarPts.length < 15) return diag.push(`pulgar sin vértices (${pulgarPts.length})`), null;
  // La punta del pulgar: el extremo más adelantado (-z) y largo del conjunto
  const ranking = pulgarPts
    .filter((q) => q.t > 0.3)
    .map((q) => ({ q, v: -q.c / L + 0.35 * q.t }))
    .sort((x, y) => y.v - x.v);
  if (ranking.length < 6) return diag.push('pulgar sin punta'), null;
  const punta = new THREE.Vector3();
  for (let k = 0; k < 6; k++) punta.add(ranking[k].q.p);
  punta.multiplyScalar(1 / 6);
  const tp = punta.clone();
  const baseP = mu.clone().lerp(tp, 0.3);
  dedos.unshift({
    nombre: 'pulgar',
    puntos: [baseP, baseP.clone().lerp(tp, 0.42), baseP.clone().lerp(tp, 0.74), tp],
  });

  return { dedos, eje: u, largo: L, mano };
}

// ---------- Esqueleto ----------

/** Crea los huesos de los dedos de una mano. Devuelve { pulgar: [h1,h2,h3], indice: [...], ... }. */
export function crearHuesosDedos(manoHueso, deteccion, lado) {
  const huesos = {};
  manoHueso.updateMatrixWorld(true);
  for (const d of deteccion.dedos) {
    const cadena = [];
    let padre = manoHueso;
    for (let k = 0; k < 3; k++) {
      const b = new THREE.Bone();
      b.name = `${d.nombre}${k + 1}${lado}`;
      padre.add(b);
      padre.updateMatrixWorld(true);
      b.position.copy(padre.worldToLocal(d.puntos[k].clone()));
      b.updateMatrixWorld(true);
      cadena.push(b);
      padre = b;
    }
    huesos[d.nombre] = cadena;
  }
  return huesos;
}

// ---------- Pesos ----------

function distSeg(p, a, b, salida) {
  const ab = _b.subVectors(b, a);
  const t = THREE.MathUtils.clamp(_a.subVectors(p, a).dot(ab) / Math.max(1e-9, ab.lengthSq()), 0, 1);
  const q = _c.copy(a).addScaledVector(ab, t);
  if (salida) salida.t = t;
  return p.distanceTo(q);
}

const suave = (x) => {
  const t = THREE.MathUtils.clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
};

/**
 * Sobrescribe los pesos de piel de los vértices de los dedos.
 *   deteccion   resultado de detectarDedos()
 *   huesosDedos resultado de crearHuesosDedos()
 *   indiceHueso (hueso) => índice en el esqueleto
 *   manoHueso   hueso "mano" (para la unión con la palma)
 */
export function pesosDedos(g, deteccion, huesosDedos, indiceHueso, manoHueso, L) {
  const pos = g.attributes.position;
  const idx = g.attributes.skinIndex;
  const pes = g.attributes.skinWeight;
  const p = new THREE.Vector3();
  const aux = { t: 0 };
  const manoIdx = indiceHueso(manoHueso);
  const radio = L * 0.2; // ancho máximo de un dedo (desde su eje)
  let tocados = 0;
  for (const q of deteccion.mano) {
    p.fromBufferAttribute(pos, q.i);
    // dedo más cercano (distancia al segmento nudillo-punta, normalizada por el grosor)
    let mejor = null;
    let mejorD = Infinity;
    for (const d of deteccion.dedos) {
      const grosor = d.nombre === 'pulgar' ? radio * 1.25 : radio * 0.8;
      const dist = distSeg(p, d.puntos[0], d.puntos[3], aux) / grosor;
      if (dist < mejorD) {
        mejorD = dist;
        mejor = { d, s: aux.t };
      }
    }
    if (!mejor || mejorD > 1.15) continue;
    // s: 0 en el nudillo, 1 en la punta. Para vértices antes del nudillo no hay proyección
    // negativa (clamp), así que se mira también la posición a lo largo del eje de la mano.
    const d = mejor.d;
    const cadena = huesosDedos[d.nombre];
    const ab = _b.subVectors(d.puntos[3], d.puntos[0]);
    const sReal = _a.subVectors(p, d.puntos[0]).dot(ab) / Math.max(1e-9, ab.lengthSq());
    const w1 = 1 - suave((sReal - 0.4 + 0.1) / 0.2); // falange proximal
    const w3 = suave((sReal - 0.72 + 0.1) / 0.2); // falange distal
    let wProx = w1;
    let wDist = w3;
    let wMed = Math.max(0, 1 - wProx - wDist);
    // unión con la palma: antes y alrededor del nudillo se mezcla con la mano
    const wPalma = 1 - suave((sReal + 0.1) / 0.28);
    const resto = 1 - wPalma;
    wProx *= resto;
    wMed *= resto;
    wDist *= resto;
    const lista = [
      [manoIdx, wPalma],
      [indiceHueso(cadena[0]), wProx],
      [indiceHueso(cadena[1]), wMed],
      [indiceHueso(cadena[2]), wDist],
    ];
    let total = 0;
    for (const [, w] of lista) total += w;
    if (total < 1e-6) continue;
    for (let k = 0; k < 4; k++) {
      idx.setComponent(q.i, k, lista[k][0]);
      pes.setComponent(q.i, k, lista[k][1] / total);
    }
    tocados++;
  }
  return tocados;
}

// ---------- Poses de mano ----------
// Cada pose da, por dedo, la flexión de las tres falanges [prox, medial, distal] en radianes
// (positivo = hacia la palma) y la apertura lateral del dedo ("abrir", en radianes).

const reposo = {
  pulgar: { f: [0.18, 0.25, 0.2], abrir: 0.0, cruzar: 0.2 },
  indice: { f: [0.22, 0.34, 0.2], abrir: -0.03 },
  medio: { f: [0.3, 0.42, 0.24], abrir: 0.0 },
  anular: { f: [0.38, 0.48, 0.28], abrir: 0.03 },
  menique: { f: [0.46, 0.52, 0.3], abrir: 0.07 },
};
const puno = {
  pulgar: { f: [0.35, 0.5, 0.45], abrir: 0.0, cruzar: 0.75 },
  indice: { f: [1.35, 1.55, 1.0], abrir: 0 },
  medio: { f: [1.4, 1.6, 1.0], abrir: 0 },
  anular: { f: [1.45, 1.6, 1.0], abrir: 0 },
  menique: { f: [1.5, 1.6, 1.0], abrir: 0 },
};
const recta = (abrir = 0.08) => ({
  pulgar: { f: [0.05, 0.05, 0.05], abrir: 0.35, cruzar: 0.0 },
  indice: { f: [0.02, 0.02, 0.02], abrir: -abrir },
  medio: { f: [0.02, 0.02, 0.02], abrir: -abrir * 0.25 },
  anular: { f: [0.02, 0.02, 0.02], abrir: abrir * 0.5 },
  menique: { f: [0.02, 0.02, 0.02], abrir: abrir * 1.4 },
});

export const POSES_MANO = {
  reposo,
  puno,
  abierta: recta(0.12),
  plana: {
    ...recta(0.04),
    pulgar: { f: [0.08, 0.1, 0.08], abrir: 0.15, cruzar: 0.1 },
  },
  // Señalar: índice estirado, el resto cerrado
  senalar: {
    ...puno,
    indice: { f: [0.02, 0.03, 0.02], abrir: -0.02 },
    pulgar: { f: [0.2, 0.3, 0.25], abrir: 0.1, cruzar: 0.5 },
  },
  // Agarrar la lapicera: pinza entre pulgar e índice, el resto recogido
  lapicera: {
    pulgar: { f: [0.35, 0.45, 0.3], abrir: -0.05, cruzar: 0.75 },
    indice: { f: [0.55, 0.7, 0.35], abrir: 0.0 },
    medio: { f: [0.95, 1.05, 0.6], abrir: 0.02 },
    anular: { f: [1.15, 1.25, 0.75], abrir: 0.04 },
    menique: { f: [1.25, 1.3, 0.8], abrir: 0.07 },
  },
  // Sostener un papelito: pinza más cerrada
  pinza: {
    pulgar: { f: [0.3, 0.4, 0.3], abrir: -0.05, cruzar: 0.7 },
    indice: { f: [0.65, 0.75, 0.4], abrir: 0.0 },
    medio: { f: [0.7, 0.85, 0.5], abrir: 0.02 },
    anular: { f: [0.8, 0.95, 0.55], abrir: 0.04 },
    menique: { f: [0.9, 1.0, 0.6], abrir: 0.07 },
  },
  // Mano que espera atrapar algo: abierta y un poco cóncava
  atrapar: {
    pulgar: { f: [0.1, 0.15, 0.1], abrir: 0.3, cruzar: 0.1 },
    indice: { f: [0.25, 0.3, 0.15], abrir: -0.1 },
    medio: { f: [0.28, 0.32, 0.15], abrir: -0.03 },
    anular: { f: [0.3, 0.34, 0.16], abrir: 0.05 },
    menique: { f: [0.34, 0.36, 0.18], abrir: 0.13 },
  },
};

/** Pose de señas: se estiran los primeros n dedos (1 = índice … 4 = meñique), el resto en puño. */
export function poseSenia(n) {
  const base = {};
  const abiertos = ['indice', 'medio', 'anular', 'menique'];
  const separacion = { indice: -0.05, medio: 0.0, anular: 0.06, menique: 0.14 };
  for (const [nombre, def] of Object.entries(POSES_MANO.puno)) base[nombre] = def;
  abiertos.forEach((nombre, i) => {
    if (i < n) base[nombre] = { f: [0.02, 0.02, 0.02], abrir: separacion[nombre] };
  });
  base.pulgar = { f: [0.3, 0.45, 0.4], abrir: 0.0, cruzar: 0.85 };
  return base;
}

// ---------- Controlador ----------

/**
 * Mueve los huesos de los dedos de un personaje con suavizado. Se crea una vez por personaje con modelo.
 *   huesos: { I: { pulgar: [..3], indice: [..3], ... }, D: {...} }
 */
export class Manos {
  constructor(huesos) {
    this.huesos = huesos;
    this.estado = { I: this.copiar(POSES_MANO.reposo), D: this.copiar(POSES_MANO.reposo) };
    this.objetivo = { I: POSES_MANO.reposo, D: POSES_MANO.reposo };
    this.forzada = { I: null, D: null };
    this.velocidad = 14;
    this.aplicar(0, true);
  }

  copiar(pose) {
    const r = {};
    for (const [nombre, d] of Object.entries(pose)) r[nombre] = { f: [...d.f], abrir: d.abrir ?? 0, cruzar: d.cruzar ?? 0 };
    return r;
  }

  /** Pose de mano asociada a la pose del brazo (se ignora mientras haya una pose forzada). */
  pose(lado, nombre) {
    this.objetivo[lado] = POSES_MANO[nombre] ?? POSES_MANO.reposo;
  }

  /** Fuerza una pose (por ejemplo las señas); con null se vuelve a la pose del brazo. */
  forzar(lado, pose) {
    this.forzada[lado] = pose;
  }

  update(dt) {
    this.aplicar(dt, false);
  }

  aplicar(dt, inmediato) {
    const k = inmediato ? 1 : 1 - Math.exp(-this.velocidad * dt);
    for (const lado of ['I', 'D']) {
      const meta = this.forzada[lado] ?? this.objetivo[lado];
      const actual = this.estado[lado];
      // Convención de signo: derecha cierra con z negativo, izquierda con z positivo
      const signo = lado === 'D' ? -1 : 1;
      for (const nombre of DEDOS) {
        const cadena = this.huesos[lado][nombre];
        if (!cadena) continue;
        const m = meta[nombre] ?? POSES_MANO.reposo[nombre];
        const a = actual[nombre];
        for (let i = 0; i < 3; i++) a.f[i] += (m.f[i] - a.f[i]) * k;
        a.abrir += ((m.abrir ?? 0) - a.abrir) * k;
        a.cruzar += ((m.cruzar ?? 0) - a.cruzar) * k;
        for (let i = 0; i < 3; i++) {
          if (nombre === 'pulgar') {
            // El pulgar se cierra cruzando la palma: flexión (z) + giro hacia los dedos (x)
            cadena[i].rotation.set(i === 0 ? -a.cruzar : -a.cruzar * 0.25, 0, signo * a.f[i]);
          } else {
            cadena[i].rotation.set(0, 0, signo * a.f[i]);
          }
        }
        // apertura lateral en la primera falange (rotación alrededor del eje de la palma)
        if (nombre !== 'pulgar') cadena[0].rotation.x = a.abrir;
        else cadena[0].rotation.y = signo * a.abrir;
      }
    }
  }
}
