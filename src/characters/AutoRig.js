import * as THREE from 'three';
import { RAMPA, COLOR_CONTORNO } from '../world/materiales.js';
import { crearMuestreador, clasificarRegiones, prepararRecolor } from './Recolor.js';
import { detectarDedos, crearHuesosDedos, pesosDedos, Manos } from './Manos.js';

/**
 * Auto-rig de modelos estáticos (mallas sin esqueleto en pose A, como las que exportan
 * los generadores de personajes 3D).
 *
 * 1. Normaliza la malla: altura en metros, mirando a -Z, pies en y = 0.
 * 2. Detecta las articulaciones cortando el cuerpo en rebanadas horizontales
 *    (dónde se separan los brazos del torso, dónde está el cuello, las piernas, etc.).
 * 3. Arma un esqueleto con LOS MISMOS NOMBRES Y CONVENCIONES que el personaje placeholder
 *    (cadera, torso, cuello, cabeza, brazoI/D.{hombro,codo,muneca}, piernaI/D...), así el
 *    Animador y todos los sistemas funcionan igual con el modelo.
 * 4. Calcula los pesos de piel por distancia a cada hueso (con reglas por zona).
 *
 * Los brazos se "atan" en la orientación de la pose A, de modo que con rotación 0 el brazo
 * cuelga recto hacia abajo, igual que en el placeholder.
 */

const _v = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const ABAJO = new THREE.Vector3(0, -1, 0);

// ---------- Normalización ----------
function geometriaNormalizada(escena, { altura, rotacionY = 0 }) {
  escena.updateMatrixWorld(true);
  const mallas = [];
  escena.traverse((o) => o.isMesh && mallas.push(o));
  if (!mallas.length) throw new Error('El modelo no tiene mallas');
  // Se usa la malla más grande (los generadores exportan una sola)
  mallas.sort((m1, m2) => m2.geometry.attributes.position.count - m1.geometry.attributes.position.count);
  const malla = mallas[0];
  const g = malla.geometry.clone();
  g.applyMatrix4(malla.matrixWorld);
  if (rotacionY) g.rotateY(rotacionY);
  g.computeBoundingBox();
  const bb = g.boundingBox;
  const s = altura / (bb.max.y - bb.min.y);
  g.translate(0, -bb.min.y, 0);
  g.scale(s, s, s);
  // Centro horizontal: x del eje de simetría, z del torso (para que se siente donde va el placeholder)
  const pos = g.attributes.position;
  let sx = 0;
  let sz = 0;
  let n = 0;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y > altura * 0.5 && y < altura * 0.75 && Math.abs(pos.getX(i)) < altura * 0.12) {
      sx += pos.getX(i);
      sz += pos.getZ(i);
      n++;
    }
  }
  g.translate(-(n ? sx / n : 0), 0, -(n ? sz / n : 0));
  if (!g.attributes.normal) g.computeVertexNormals();
  return { geometria: g, material: malla.material };
}

// ---------- Rebanadas horizontales ----------
// Agrupa los vértices de una franja de altura en "islas" separadas en x (brazos, torso, piernas)
function rebanada(pos, y, banda, hueco) {
  const pts = [];
  for (let i = 0; i < pos.count; i++) {
    const py = pos.getY(i);
    if (Math.abs(py - y) < banda) pts.push(i);
  }
  pts.sort((i, j) => pos.getX(i) - pos.getX(j));
  const islas = [];
  let actual = null;
  let ultimoX = -Infinity;
  for (const i of pts) {
    const x = pos.getX(i);
    if (!actual || x - ultimoX > hueco) {
      actual = { min: x, max: x, sz: 0, n: 0 };
      islas.push(actual);
    }
    actual.max = x;
    actual.sz += pos.getZ(i);
    actual.n++;
    ultimoX = x;
  }
  for (const isla of islas) {
    isla.centro = (isla.min + isla.max) / 2;
    isla.z = isla.sz / isla.n;
    isla.ancho = isla.max - isla.min;
  }
  // Se descartan islas mínimas (ruido de la malla)
  return islas.filter((isla) => isla.n >= 3);
}

function ajusteLineal(puntos) {
  // x = a + b*y por mínimos cuadrados
  let sy = 0, sx = 0, syy = 0, sxy = 0;
  const n = puntos.length;
  for (const p of puntos) {
    sy += p.y; sx += p.x; syy += p.y * p.y; sxy += p.x * p.y;
  }
  const b = (n * sxy - sx * sy) / Math.max(1e-9, n * syy - sy * sy);
  return { a: (sx - b * sy) / n, b };
}

// ---------- Detección de articulaciones ----------
function detectarArticulaciones(g, H) {
  const pos = g.attributes.position;
  const banda = H * 0.008;
  const hueco = H * 0.018;

  // Brazos: alturas donde la rebanada tiene al menos 3 islas (brazo, torso, brazo)
  const brazos = { I: [], D: [] };
  let axila = 0;
  for (let k = 0.4; k <= 0.88; k += 0.005) {
    const y = k * H;
    const islas = rebanada(pos, y, banda, hueco);
    if (islas.length < 3) continue;
    const izq = islas[0];
    const der = islas[islas.length - 1];
    if (izq.centro > -H * 0.08 || der.centro < H * 0.08) continue;
    brazos.I.push({ x: izq.centro, y, z: izq.z });
    brazos.D.push({ x: der.centro, y, z: der.z });
    axila = Math.max(axila, y);
  }
  if (!brazos.I.length) axila = H * 0.72;

  // Cuello: la parte más angosta del tronco entre los hombros y la cabeza
  let cuelloY = H * 0.84;
  let cuelloZ = 0;
  let angosto = Infinity;
  for (let k = 0.78; k <= 0.92; k += 0.004) {
    const islas = rebanada(pos, k * H, banda, hueco).filter((i) => Math.abs(i.centro) < H * 0.06);
    if (!islas.length) continue;
    const isla = islas.reduce((m, i) => (i.n > m.n ? i : m));
    if (isla.ancho < angosto) {
      angosto = isla.ancho;
      cuelloY = k * H;
      cuelloZ = isla.z;
    }
  }

  const art = {};
  for (const [lado, signo] of [['I', -1], ['D', 1]]) {
    const pts = brazos[lado].filter((p) => p.y > axila - H * 0.12);
    const fit = pts.length >= 3 ? ajusteLineal(pts) : { a: signo * H * 0.2, b: 0 };
    // El hombro queda arriba de la axila (si los brazos se pegan al torso, se estima desde el cuello)
    const yHombro = Math.max(axila + H * 0.05, cuelloY - H * 0.07);
    const hombro = new THREE.Vector3((fit.a + fit.b * yHombro) * 0.9, yHombro, 0);
    const zArriba = pts.length ? pts.reduce((s, p) => s + p.z, 0) / pts.length : 0;
    hombro.z = zArriba;
    if (Math.abs(hombro.x) < H * 0.075) hombro.x = signo * H * 0.095;
    if (Math.abs(hombro.x) > H * 0.14) hombro.x = signo * H * 0.12;
    // Punta de los dedos: el vértice de ese lado más lejano al hombro, entre la cadera y la axila
    // y bien afuera del torso (así nunca agarra los pies)
    let punta = null;
    let mejor = 0;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      if (x * signo < Math.abs(hombro.x) + H * 0.04 || y > axila || y < H * 0.3) continue;
      _v.fromBufferAttribute(pos, i);
      const d = _v.distanceToSquared(hombro);
      if (d > mejor) {
        mejor = d;
        punta = _v.clone();
      }
    }
    if (!punta) punta = hombro.clone().add(new THREE.Vector3(signo * H * 0.25, -H * 0.35, 0));
    // Codo y muñeca a lo largo del brazo, con proporciones humanas, corregidos al centro del brazo
    const enBrazo = (f) => {
      const p = hombro.clone().lerp(punta, f);
      let cerca = null;
      for (const q of brazos[lado]) if (!cerca || Math.abs(q.y - p.y) < Math.abs(cerca.y - p.y)) cerca = q;
      if (cerca && Math.abs(cerca.y - p.y) < H * 0.015) {
        p.x = cerca.x;
        p.z = cerca.z;
      }
      return p;
    };
    art['hombro' + lado] = hombro;
    art['codo' + lado] = enBrazo(0.43);
    art['muneca' + lado] = enBrazo(0.76);
    art['punta' + lado] = punta;
    // Nudillos: donde empiezan los dedos (para poder cerrar la mano)
    art['nudillos' + lado] = art['muneca' + lado].clone().lerp(punta, 0.5);
  }

  art.cuello = new THREE.Vector3(0, cuelloY - H * 0.03, cuelloZ * 0.6);
  art.cabeza = new THREE.Vector3(0, cuelloY + H * 0.015, cuelloZ);
  art.coronilla = new THREE.Vector3(0, H, cuelloZ);

  // Piernas: alturas con dos islas centrales (debajo de la entrepierna o de la pollera)
  const piernas = { I: [], D: [] };
  let separacion = 0;
  for (let k = 0.03; k <= 0.5; k += 0.005) {
    const y = k * H;
    const islas = rebanada(pos, y, banda, H * 0.01).filter((i) => Math.abs(i.centro) < H * 0.14);
    if (islas.length !== 2) continue;
    piernas.I.push({ x: islas[0].centro, y, z: islas[0].z });
    piernas.D.push({ x: islas[1].centro, y, z: islas[1].z });
    separacion = Math.max(separacion, y);
  }
  const yCadera = H * 0.52;
  const yRodilla = H * 0.285;
  const yTobillo = H * 0.05;
  let zPelvis = 0;
  {
    const islas = rebanada(pos, yCadera, banda, hueco).filter((i) => Math.abs(i.centro) < H * 0.1);
    if (islas.length) zPelvis = islas[0].z;
  }
  for (const [lado, signo] of [['I', -1], ['D', 1]]) {
    const enPierna = (y, xPorDefecto) => {
      let cerca = null;
      for (const q of piernas[lado]) if (!cerca || Math.abs(q.y - y) < Math.abs(cerca.y - y)) cerca = q;
      return cerca && Math.abs(cerca.y - y) < H * 0.05 ? cerca : { x: xPorDefecto, z: 0 };
    };
    const rod = enPierna(yRodilla, signo * H * 0.055);
    const tob = enPierna(yTobillo + H * 0.02, rod.x);
    const alto = piernas[lado].length ? piernas[lado][piernas[lado].length - 1] : rod;
    art['pierna' + lado] = new THREE.Vector3(signo * Math.max(Math.abs(alto.x), H * 0.045), yCadera, zPelvis);
    art['rodilla' + lado] = new THREE.Vector3(rod.x, yRodilla, rod.z);
    art['tobillo' + lado] = new THREE.Vector3(tob.x, yTobillo, tob.z);
    // Punta del pie: el vértice más adelantado (-Z) cerca del piso de ese lado
    let punta = new THREE.Vector3(tob.x, 0.02, tob.z - H * 0.08);
    for (let i = 0; i < pos.count; i++) {
      if (pos.getY(i) > H * 0.04 || pos.getX(i) * signo < 0) continue;
      if (pos.getZ(i) < punta.z) punta = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i));
    }
    art['pie' + lado] = punta;
  }
  art.cadera = new THREE.Vector3(0, yCadera + H * 0.01, zPelvis);
  art.cintura = new THREE.Vector3(0, yCadera + H * 0.07, zPelvis);
  // Pollera: las piernas recién se separan cerca de las rodillas
  art.separacionPiernas = separacion || yCadera;
  art.conPollera = separacion > 0 && separacion < H * 0.4;
  return art;
}

// ---------- Esqueleto ----------
function hueso(nombre, padre, posMundo, posPadreMundo) {
  const b = new THREE.Bone();
  b.name = nombre;
  if (padre) {
    padre.add(b);
    padre.updateMatrixWorld(true);
    b.position.copy(padre.worldToLocal(posMundo.clone()));
  } else b.position.copy(posMundo).sub(posPadreMundo ?? new THREE.Vector3());
  b.updateMatrixWorld(true);
  return b;
}

// Orienta un hueso para que su -Y local apunte hacia "objetivo" (en mundo)
function apuntar(b, objetivo) {
  const desde = b.getWorldPosition(_a);
  const dir = _b.subVectors(objetivo, desde).normalize();
  const qMundo = new THREE.Quaternion().setFromUnitVectors(ABAJO, dir);
  const qPadre = b.parent.getWorldQuaternion(new THREE.Quaternion());
  b.quaternion.copy(qPadre.invert().multiply(qMundo));
  b.updateMatrixWorld(true);
}

function crearEsqueleto(raiz, art, dedos) {
  const cero = new THREE.Vector3();
  const cadera = hueso('cadera', null, art.cadera, cero);
  raiz.add(cadera);
  cadera.updateMatrixWorld(true);
  const torso = hueso('torso', cadera, art.cadera);
  const cuello = hueso('cuello', torso, art.cuello);
  const cabeza = hueso('cabeza', cuello, art.cabeza);
  cabeza.rotation.order = 'YXZ';
  const rig = { cadera, torso, cuello, cabeza };
  for (const lado of ['I', 'D']) {
    const hombro = hueso('hombro' + lado, torso, art['hombro' + lado]);
    apuntar(hombro, art['codo' + lado]);
    const codo = hueso('codo' + lado, hombro, art['codo' + lado]);
    apuntar(codo, art['muneca' + lado]);
    const muneca = hueso('muneca' + lado, codo, art['muneca' + lado]);
    const mano = hueso('mano' + lado, muneca, art['muneca' + lado]);
    // Dedos articulados (si se pudieron detectar en la malla); si no, la mano queda rígida
    const dedosHuesos = dedos?.[lado] ? crearHuesosDedos(mano, dedos[lado], lado) : null;
    rig['brazo' + lado] = { hombro, codo, muneca, manoModelo: mano, dedosHuesos, dedos: [] };
    const pierna = hueso('pierna' + lado, cadera, art['pierna' + lado]);
    const rodilla = hueso('rodilla' + lado, pierna, art['rodilla' + lado]);
    const tobillo = hueso('tobillo' + lado, rodilla, art['tobillo' + lado]);
    rig['pierna' + lado] = pierna;
    rig['rodilla' + lado] = rodilla;
    rig['tobillo' + lado] = tobillo;
  }
  return rig;
}

// ---------- Pesos de piel ----------
function distSegmento(p, a, b) {
  const ab = _b.subVectors(b, a);
  const t = THREE.MathUtils.clamp(_a.subVectors(p, a).dot(ab) / Math.max(1e-9, ab.lengthSq()), 0, 1);
  return p.distanceTo(_a.copy(a).addScaledVector(ab, t));
}

function calcularPesos(g, art, rig, huesos, H, dedos) {
  const pos = g.attributes.position;
  const idx = (b) => huesos.indexOf(b);
  // Segmentos de influencia: [hueso, desde, hasta, radio, zona]
  const segs = [
    [rig.cadera, new THREE.Vector3(0, art.separacionPiernas * 0.5 + art.cadera.y * 0.5, art.cadera.z), art.cintura, H * 0.075, 'tronco'],
    [rig.torso, art.cintura, art.cuello.clone().setY(art.cuello.y - H * 0.04), H * 0.085, 'tronco'],
    [rig.cuello, art.cuello, art.cabeza, H * 0.035, 'cuello'],
    [rig.cabeza, art.cabeza.clone().setY(art.cabeza.y + H * 0.03), art.coronilla.clone().setY(H * 0.96), H * 0.06, 'cabeza'],
  ];
  for (const [lado, signo] of [['I', -1], ['D', 1]]) {
    const br = rig['brazo' + lado];
    segs.push([br.hombro, art['hombro' + lado], art['codo' + lado], H * 0.028, 'brazo', signo]);
    segs.push([br.codo, art['codo' + lado], art['muneca' + lado], H * 0.024, 'brazo', signo]);
    segs.push([br.manoModelo, art['muneca' + lado], art['punta' + lado], H * 0.025, 'brazo', signo]);
    segs.push([rig['pierna' + lado], art['pierna' + lado], art['rodilla' + lado], H * 0.045, 'pierna', signo]);
    segs.push([rig['rodilla' + lado], art['rodilla' + lado], art['tobillo' + lado], H * 0.032, 'pierna', signo]);
    segs.push([rig['tobillo' + lado], art['tobillo' + lado], art['pie' + lado], H * 0.03, 'pierna', signo]);
  }
  const n = pos.count;
  const indices = new Uint16Array(n * 4);
  const pesos = new Float32Array(n * 4);
  const p = new THREE.Vector3();
  const xHombro = Math.min(Math.abs(art.hombroI.x), Math.abs(art.hombroD.x));
  const cand = [];
  for (let i = 0; i < n; i++) {
    p.fromBufferAttribute(pos, i);
    cand.length = 0;
    for (const [b, a, z, r, zona, signo] of segs) {
      // Reglas por zona: evitan que la mano "arrastre" el muslo o la cabeza el hombro, etc.
      if (zona === 'brazo' && (p.x * signo < xHombro * 0.55 || p.y > art.cabeza.y)) continue;
      if (zona === 'pierna' && (p.y > art.cintura.y || p.x * signo < -H * 0.02)) continue;
      if (zona === 'cabeza' && p.y < art.cuello.y) continue;
      if (zona === 'cuello' && (p.y < art.cuello.y - H * 0.05 || p.y > art.cabeza.y + H * 0.06)) continue;
      const d = distSegmento(p, a, z) / r;
      cand.push([idx(b), 1 / (Math.pow(d, 5) + 1e-4), zona]);
    }
    cand.sort((c1, c2) => c2[1] - c1[1]);
    // Pollera / entrepierna: mezcla con la cadera para que la tela no se rompa al caminar
    // (sólo si lo que domina es una pierna: antes se mezclaba también en las manos, que en pose A
    // quedan a la altura de la pelvis, y al mover los brazos se estiraban hacia la cintura)
    if (p.y > art.separacionPiernas - H * 0.02 && p.y < art.cintura.y && cand[0]?.[2] === 'pierna' && Math.abs(p.x) < H * 0.2) {
      const mezcla = art.conPollera ? 0.55 : 0.3;
      const total = cand.slice(0, 4).reduce((s, c) => s + c[1], 0);
      for (const c of cand) c[1] = (c[1] / total) * (1 - mezcla);
      const cad = cand.find((c) => c[0] === idx(rig.cadera));
      if (cad) cad[1] += mezcla;
      else cand.push([idx(rig.cadera), mezcla, 'tronco']);
      cand.sort((c1, c2) => c2[1] - c1[1]);
    }
    let total = 0;
    for (let k = 0; k < 4 && k < cand.length; k++) total += cand[k][1];
    for (let k = 0; k < 4; k++) {
      if (k < cand.length) {
        indices[i * 4 + k] = cand[k][0];
        pesos[i * 4 + k] = cand[k][1] / total;
      }
    }
  }
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(indices, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(pesos, 4));

  // Dedos: reparten el peso de la mano entre las tres falanges de cada dedo
  for (const lado of ['I', 'D']) {
    const det = dedos?.[lado];
    const br = rig['brazo' + lado];
    if (det && br.dedosHuesos) pesosDedos(g, det, br.dedosHuesos, idx, br.manoModelo, det.largo);
  }
}

// Normales promediadas por posición: el contorno no se abre en las costuras de la textura
function normalesSuaves(g) {
  const pos = g.attributes.position;
  const nor = g.attributes.normal;
  const mapa = new Map();
  const clave = (i) => `${Math.round(pos.getX(i) * 2000)},${Math.round(pos.getY(i) * 2000)},${Math.round(pos.getZ(i) * 2000)}`;
  for (let i = 0; i < pos.count; i++) {
    const k = clave(i);
    const acc = mapa.get(k) ?? [0, 0, 0];
    acc[0] += nor.getX(i); acc[1] += nor.getY(i); acc[2] += nor.getZ(i);
    mapa.set(k, acc);
  }
  const datos = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const acc = mapa.get(clave(i));
    _v.set(acc[0], acc[1], acc[2]).normalize();
    datos.set([_v.x, _v.y, _v.z], i * 3);
  }
  return new THREE.BufferAttribute(datos, 3);
}

// Material de contorno que se infla DESPUÉS del skinning (sigue al cuerpo animado)
const cacheContorno = new Map();
export function materialContornoPiel(grosor, color = COLOR_CONTORNO) {
  const clave = `${grosor.toFixed(4)}-${color}`;
  if (cacheContorno.has(clave)) return cacheContorno.get(clave);
  const m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <skinning_vertex>',
      `#include <skinning_vertex>\n  transformed += normalize(objectNormal) * ${grosor.toFixed(4)};`,
    );
  };
  m.customProgramCacheKey = () => `contornoPiel${grosor.toFixed(4)}-${color}`;
  cacheContorno.set(clave, m);
  return m;
}

// ---------- Preparación (se hace una sola vez por modelo) ----------
// Normalizar la malla, detectar articulaciones y dedos y calcular los pesos de piel cuesta unos
// 200 ms por modelo. Como en el aula hay muchos personajes que comparten modelo, todo eso se
// guarda: cada personaje sólo arma su propio esqueleto y comparte la geometría.
const cachePreparados = new Map();

// Deja sólo la parte de arriba del cuerpo (cintura, torso, brazos y cabeza): para los alumnos de
// fondo, sentados detrás del banco, no hace falta dibujar las piernas.
function recortarTorso(g, art, H) {
  const pos = g.attributes.position;
  const corte = art.cadera.y - H * 0.025;
  const viejo = g.index.array;
  const nuevo = [];
  for (let i = 0; i < viejo.length; i += 3) {
    const yMax = Math.max(pos.getY(viejo[i]), pos.getY(viejo[i + 1]), pos.getY(viejo[i + 2]));
    if (yMax >= corte) nuevo.push(viejo[i], viejo[i + 1], viejo[i + 2]);
  }
  g.setIndex(new THREE.BufferAttribute(new Uint32Array(nuevo), 1));
}

function preparar(escena, cfg) {
  const clave = `${cfg.ruta}|${cfg.altura}|${cfg.rotacionY ?? 0}|${cfg.soloTorso ? 'torso' : 'completo'}`;
  const guardado = cachePreparados.get(clave);
  if (guardado) return guardado;

  const H = cfg.altura;
  const { geometria: g, material: original } = geometriaNormalizada(escena, cfg);
  const art = detectarArticulaciones(g, H);

  const dedos = {};
  for (const lado of ['I', 'D']) {
    const diag = [];
    dedos[lado] = detectarDedos(g.attributes.position, art, lado, H, diag);
    if (!dedos[lado]) console.warn(`${cfg.ruta}: no se pudieron detectar los dedos (${lado}): ${diag.join('; ')}. La mano queda rígida.`);
  }

  // Esqueleto temporal: fija el orden de los huesos y permite calcular los pesos una única vez
  const temporal = new THREE.Group();
  const rigTmp = crearEsqueleto(temporal, art, dedos);
  const huesosTmp = [];
  rigTmp.cadera.traverse((o) => o.isBone && huesosTmp.push(o));
  calcularPesos(g, art, rigTmp, huesosTmp, H, dedos);

  // Regiones de pelo y remera (para recolorear); si falla, el modelo queda con sus colores
  let regiones = null;
  try {
    regiones = clasificarRegiones(g, art, H, crearMuestreador(original.map));
    if (regiones) g.setAttribute('region', regiones.region);
  } catch (e) {
    console.warn(`${cfg.ruta}: no se pudieron clasificar pelo y remera.`, e);
  }

  if (cfg.soloTorso) recortarTorso(g, art, H);

  // Contorno: misma piel y esqueleto, con normales suaves
  const gc = new THREE.BufferGeometry();
  gc.setIndex(g.index);
  for (const nombre of ['position', 'skinIndex', 'skinWeight']) gc.setAttribute(nombre, g.attributes[nombre]);
  gc.setAttribute('normal', normalesSuaves(g));

  const listo = { g, gc, art, dedos, original, H, regiones, nHuesos: huesosTmp.length };
  cachePreparados.set(clave, listo);
  return listo;
}

/**
 * Crea el personaje con esqueleto a partir de la escena de un GLB estático.
 * Devuelve { rig, malla, contorno, articulaciones, esqueleto, manos } y agrega todo a "raiz".
 */
export function autoRig(raiz, escena, cfg) {
  const { g, gc, art, dedos, original, regiones } = preparar(escena, cfg);

  // El esqueleto se arma con la raíz en el origen (pose de atadura)
  const posRaiz = raiz.position.clone();
  const rotRaiz = raiz.rotation.clone();
  const escRaiz = raiz.scale.clone();
  raiz.position.set(0, 0, 0);
  raiz.rotation.set(0, 0, 0);
  raiz.scale.set(1, 1, 1);
  raiz.updateMatrixWorld(true);

  const rig = crearEsqueleto(raiz, art, dedos);
  const huesos = [];
  rig.cadera.traverse((o) => o.isBone && huesos.push(o));

  const mapa = original.map ?? null;
  const mat = new THREE.MeshToonMaterial({ map: mapa, color: mapa ? 0xffffff : original.color, gradientMap: RAMPA });
  // Pelo y remera de otro color (cfg.pelo / cfg.remera, en hex); el resto del modelo queda igual
  if (regiones && (cfg.pelo != null || cfg.remera != null)) {
    const u = prepararRecolor(mat, regiones.lumaPelo, regiones.lumaRemera);
    if (cfg.pelo != null) {
      u.uColorPelo.value.set(cfg.pelo);
      u.uUsaPelo.value = 1;
    }
    if (cfg.remera != null) {
      u.uColorRemera.value.set(cfg.remera);
      u.uUsaRemera.value = 1;
    }
  }
  const malla = new THREE.SkinnedMesh(g, mat);
  malla.castShadow = true;
  malla.receiveShadow = true;
  malla.frustumCulled = false;
  raiz.add(malla);

  const grosor = cfg.contorno ?? 0.011;
  const contorno = new THREE.SkinnedMesh(gc, materialContornoPiel(grosor));
  contorno.userData.esContorno = true;
  contorno.userData.materialResaltado = materialContornoPiel(grosor * 1.3, 0xffd84a);
  contorno.frustumCulled = false;
  contorno.castShadow = false;
  contorno.raycast = () => {};
  raiz.add(contorno);

  raiz.updateMatrixWorld(true);
  const esqueleto = new THREE.Skeleton(huesos);
  malla.bind(esqueleto);
  contorno.bind(esqueleto);

  // Pose canónica: brazos colgando (rotación 0, como el placeholder), resto como el modelo
  for (const lado of ['I', 'D']) {
    rig['brazo' + lado].hombro.rotation.set(0, 0, 0);
    rig['brazo' + lado].codo.rotation.set(0, 0, 0);
  }

  // Control de los dedos (relajados por defecto); null si no se detectaron en la malla
  const manos = dedos.I && dedos.D ? new Manos({ I: rig.brazoI.dedosHuesos, D: rig.brazoD.dedosHuesos }) : null;

  raiz.position.copy(posRaiz);
  raiz.rotation.copy(rotRaiz);
  raiz.scale.copy(escRaiz);
  return { rig, malla, contorno, articulaciones: art, esqueleto, manos };
}
