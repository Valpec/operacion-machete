import * as THREE from 'three';

// ---------- Cel-shading ----------
// Rampa de 3 tonos (sombra, medio, luz) con filtro "nearest" para cortes duros.
function crearRampa() {
  const datos = new Uint8Array([90, 90, 90, 255, 175, 175, 175, 255, 255, 255, 255, 255]);
  const tex = new THREE.DataTexture(datos, 3, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}
export const RAMPA = crearRampa();

const cacheToon = new Map();

// Material toon compartido por color (evita crear cientos de materiales iguales)
export function toon(color, opciones = {}) {
  const clave = `${color}|${opciones.map ? opciones.map.uuid : ''}|${opciones.emissive ?? ''}|${opciones.transparent ?? ''}`;
  if (!opciones.unico && cacheToon.has(clave)) return cacheToon.get(clave);
  const { unico, ...resto } = opciones;
  const m = new THREE.MeshToonMaterial({ color, gradientMap: RAMPA, ...resto });
  if (!unico) cacheToon.set(clave, m);
  return m;
}

// ---------- Contornos por malla invertida ----------
export const COLOR_CONTORNO = 0x1c1a24;
export const materialContorno = new THREE.MeshBasicMaterial({ color: COLOR_CONTORNO, side: THREE.BackSide });

/**
 * Agrega un contorno (malla invertida apenas más grande) a un mesh.
 * El grosor es absoluto en metros por eje, así funciona bien en piezas finas.
 * Requiere geometría centrada en el origen (todas las primitivas de three lo son).
 */
export function contorno(mesh, grosor = 0.012, material = materialContorno) {
  const g = mesh.geometry;
  if (!g.boundingBox) g.computeBoundingBox();
  const tam = new THREE.Vector3();
  g.boundingBox.getSize(tam);
  const borde = new THREE.Mesh(g, material);
  borde.scale.set(
    1 + (2 * grosor) / Math.max(tam.x, 0.01),
    1 + (2 * grosor) / Math.max(tam.y, 0.01),
    1 + (2 * grosor) / Math.max(tam.z, 0.01),
  );
  borde.userData.esContorno = true;
  borde.castShadow = false;
  borde.receiveShadow = false;
  borde.raycast = () => {};
  mesh.add(borde);
  return mesh;
}

// ---------- Atajos para armar escenografía ----------
export function caja(w, h, d, color, { sombra = true, borde = 0.01, mat } = {}) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat ?? toon(color));
  m.castShadow = sombra;
  m.receiveShadow = true;
  if (borde) contorno(m, borde);
  return m;
}

export function cilindro(rArriba, rAbajo, h, color, { segmentos = 12, sombra = true, borde = 0.01, mat } = {}) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rArriba, rAbajo, h, segmentos), mat ?? toon(color));
  m.castShadow = sombra;
  m.receiveShadow = true;
  if (borde) contorno(m, borde);
  return m;
}

export function esfera(r, color, { segmentos = 16, sombra = true, borde = 0.01, mat } = {}) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, segmentos, Math.round(segmentos * 0.75)), mat ?? toon(color));
  m.castShadow = sombra;
  m.receiveShadow = true;
  if (borde) contorno(m, borde);
  return m;
}

// ---------- Texturas dibujadas por código ----------
export function texturaCanvas(ancho, alto, dibujar) {
  const c = document.createElement('canvas');
  c.width = ancho;
  c.height = alto;
  dibujar(c.getContext('2d'), ancho, alto);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// Generador pseudoaleatorio con semilla: la escena se ve igual en cada partida
export function aleatorioConSemilla(semilla = 1) {
  let s = semilla >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
