import * as THREE from 'three';

/**
 * Recoloreado de pelo y remera de los modelos, sin tocar las texturas.
 * Las texturas de los GLB son un mosaico de parches, así que no hay máscaras por zona de textura:
 * se clasifica cada VÉRTICE (por altura y por el color de su texel) en pelo / remera / otro, y se
 * guarda en un atributo `region` (x = pelo, y = remera). Un shader mezcla ese color nuevo
 * conservando el detalle (luminosidad) de la textura original.
 */

// ---------- Muestreo de la textura ----------
export function crearMuestreador(mapa) {
  const img = mapa?.image;
  if (!img) return null;
  let datos = img.data; // (pruebas en Node)
  let ancho = img.width;
  let alto = img.height;
  if (!datos) {
    const c = document.createElement('canvas');
    ancho = c.width = img.width;
    alto = c.height = img.height;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    datos = ctx.getImageData(0, 0, ancho, alto).data;
  }
  // glTF: el origen de uv es arriba a la izquierda y three no invierte la textura (flipY = false)
  return (u, v, salida) => {
    const x = Math.min(ancho - 1, Math.max(0, Math.floor(u * ancho)));
    const y = Math.min(alto - 1, Math.max(0, Math.floor(v * alto)));
    const o = (y * ancho + x) * 4;
    salida[0] = datos[o] / 255;
    salida[1] = datos[o + 1] / 255;
    salida[2] = datos[o + 2] / 255;
    return salida;
  };
}

const luma = (c) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
function cromaticidad(c) {
  const s = c[0] + c[1] + c[2] + 1e-4;
  return [c[0] / s, c[1] / s, c[2] / s];
}
const distCroma = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const mediana = (lista) => {
  const o = [...lista].sort((x, y) => x - y);
  return o[Math.floor(o.length / 2)] ?? 0;
};
const medianaColor = (cols) => [0, 1, 2].map((k) => mediana(cols.map((c) => c[k])));

/**
 * Devuelve { region: BufferAttribute(vec2), lumaPelo, lumaRemera } o null si no hay textura.
 * `g` ya está normalizada (altura H, mirando a -Z, pies en y = 0).
 */
export function clasificarRegiones(g, art, H, muestrear) {
  if (!muestrear || !g.attributes.uv) return null;
  const pos = g.attributes.position;
  const uv = g.attributes.uv;
  const n = pos.count;
  const col = new Array(n);
  const tmp = [0, 0, 0];
  for (let i = 0; i < n; i++) col[i] = [...muestrear(uv.getX(i), uv.getY(i), tmp)];

  const yCuello = art.cuello.y;
  const yCintura = art.cintura.y;
  const yCabeza = art.cabeza.y;
  // centro y radio aproximados de la cabeza
  const rCabeza = (H - yCabeza) * 0.62;
  const zCabeza = art.cabeza.z;

  // Color de referencia de la remera: torso, entre el pecho y la cintura, cerca del eje
  const refRemera = [];
  const refPelo = [];
  const refPiel = [];
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    if (Math.abs(x) < H * 0.07 && y > yCintura + H * 0.03 && y < yCuello - H * 0.06) refRemera.push(col[i]);
    if (y > H * 0.968) refPelo.push(col[i]);
    // piel: vértices de las manos (los más lejanos del eje, a la altura de la punta)
    if (Math.abs(x) > H * 0.26 && y < art.hombroD.y - H * 0.1) refPiel.push(col[i]);
  }
  if (refRemera.length < 20 || refPelo.length < 20) return null;
  // la mitad más clara: en algunos modelos hay parches negros (sombras) mezclados con la remera
  refRemera.sort((a, b) => luma(b) - luma(a));
  const cRemera = medianaColor(refRemera.slice(0, Math.ceil(refRemera.length / 2)));
  const cPelo = medianaColor(refPelo);
  const cPiel = refPiel.length > 10 ? medianaColor(refPiel) : [0.9, 0.7, 0.6];
  const chRemera = cromaticidad(cRemera);
  const chPelo = cromaticidad(cPelo);
  const chPiel = cromaticidad(cPiel);
  const lRemera = luma(cRemera);
  const lPelo = luma(cPelo);

  const region = new Float32Array(n * 2);
  const lumasPelo = [];
  const lumasRemera = [];
  for (let i = 0; i < n; i++) {
    const c = col[i];
    const ch = cromaticidad(c);
    const l = luma(c);
    const y = pos.getY(i);
    const esPiel = distCroma(ch, chPiel) < 0.045 && l > 0.45;
    // --- remera: del cinturón al cuello, todo lo que no sea piel (los modelos mezclan parches
    // claros y oscuros por las sombras pintadas en la textura). La cola de caballo que cae por la
    // espalda se deja afuera: es pelo.
    if (y > yCintura - H * 0.01 && y < yCuello + H * 0.01 && !esPiel) {
      const colaPelo =
        distCroma(ch, chPelo) < 0.07 && Math.abs(l - lPelo) < Math.max(0.2, lPelo * 0.9) &&
        y > yCuello - H * 0.2 && pos.getZ(i) > zCabeza + rCabeza * 0.2 && Math.abs(pos.getX(i)) < H * 0.08;
      if (!colaPelo) {
        region[i * 2 + 1] = 1;
        lumasRemera.push(l);
        continue;
      }
    }
    // --- pelo: cabeza, fuera de la cara (frente/mejillas), color del pelo
    if (y > yCuello - H * 0.2) {
      const dz = pos.getZ(i) - zCabeza;
      const enCara = y > yCuello && dz < -rCabeza * 0.35 && y < yCabeza + (H - yCabeza) * 0.55;
      const cercaPelo =
        distCroma(ch, chPelo) < 0.07 && Math.abs(l - lPelo) < Math.max(0.2, lPelo * 0.9) && !esPiel;
      if (cercaPelo && !enCara) {
        region[i * 2] = 1;
        lumasPelo.push(l);
      }
    }
  }
  return {
    region: new THREE.BufferAttribute(region, 2),
    lumaPelo: Math.max(0.04, mediana(lumasPelo)),
    lumaRemera: Math.max(0.1, mediana(lumasRemera)),
  };
}

// ---------- Material ----------
const CLAVE = 'recolor-v1';

/**
 * Agrega al material toon el recoloreado por región. Devuelve los uniforms
 * { colorPelo, colorRemera, activaPelo, activaRemera } para cambiarlos por personaje.
 */
export function prepararRecolor(material, lumaPelo, lumaRemera) {
  const u = {
    uColorPelo: { value: new THREE.Color(0xffffff) },
    uColorRemera: { value: new THREE.Color(0xffffff) },
    uUsaPelo: { value: 0 },
    uUsaRemera: { value: 0 },
    uLumaPelo: { value: lumaPelo },
    uLumaRemera: { value: lumaRemera },
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 region;\nvarying vec2 vRegion;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vRegion = region;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec2 vRegion;
uniform vec3 uColorPelo;
uniform vec3 uColorRemera;
uniform float uUsaPelo;
uniform float uUsaRemera;
uniform float uLumaPelo;
uniform float uLumaRemera;`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
  {
    float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
    float mPelo = step(0.5, vRegion.x) * uUsaPelo;
    float mRemera = step(0.5, vRegion.y) * uUsaRemera;
    vec3 pelo = uColorPelo * clamp(lum / uLumaPelo, 0.45, 1.8);
    vec3 remera = uColorRemera * clamp(lum / uLumaRemera, 0.45, 1.5);
    diffuseColor.rgb = mix(diffuseColor.rgb, pelo, mPelo);
    diffuseColor.rgb = mix(diffuseColor.rgb, remera, mRemera);
  }`,
      );
  };
  material.customProgramCacheKey = () => CLAVE;
  return u;
}
