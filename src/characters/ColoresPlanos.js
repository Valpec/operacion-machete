import * as THREE from 'three';

/**
 * Colores lisos por zona para los modelos con texturas "mosaico".
 *
 * Los generadores de personajes con IA arman la textura con cientos de parches irregulares pegados
 * entre sí, sin margen (saco al lado de piel, pelo al lado de pollera...). De cerca se ve bien, pero
 * de lejos la placa de video usa versiones achicadas de la textura (mipmaps) que mezclan los
 * parches vecinos: aparecen manchas claras que parecen agujeros.
 *
 * Solución: al cargar el modelo se lee el color de cada vértice (muestreando hacia ADENTRO de sus
 * triángulos, lejos del borde del parche), se agrupan los colores en una paleta chica, se unen los
 * tonos casi iguales y se emparejan las zonas con sus vecinos. El shader pinta el cuerpo con esos
 * colores lisos y deja la textura sólo en la cara (ojos, cejas, boca).
 *
 * Uso: en config.js, dentro de `modelo`, agregar  coloresPlanos: true
 */

const luma = (c) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
const dist2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

/**
 * Devuelve { colorPlano: BufferAttribute(vec3, lineal), plano: BufferAttribute(float) } o null.
 *   g          geometría normalizada (altura H, mirando a -Z, pies en y = 0), con índice y uv
 *   art        articulaciones (se usan cuello y cabeza para ubicar la cara)
 *   muestrear  crearMuestreador(mapa) de Recolor.js
 */
export function calcularColoresPlanos(g, art, H, muestrear, opciones = {}) {
  if (!muestrear || !g.attributes.uv || !g.index) return null;
  const pos = g.attributes.position;
  const uv = g.attributes.uv;
  const idx = g.index.array;
  const n = pos.count;
  const k = opciones.colores ?? 10;        // tamaño inicial de la paleta
  const unir = opciones.unir ?? 0.11;      // distancia (RGB 0..1) por debajo de la cual dos tonos se unen
  const pasadas = opciones.suavizado ?? 4; // pasadas de "voto de vecinos"

  // --- 1. Color de cada vértice: promedio de muestras corridas hacia el centro de sus triángulos ---
  const suma = new Float32Array(n * 3);
  const cant = new Float32Array(n);
  const tmp = [0, 0, 0];
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2];
    const cu = (uv.getX(a) + uv.getX(b) + uv.getX(c)) / 3;
    const cv = (uv.getY(a) + uv.getY(b) + uv.getY(c)) / 3;
    for (const v of [a, b, c]) {
      // a mitad de camino entre el vértice y el centro del triángulo: dentro del parche
      for (const f of [0.45, 0.8]) {
        muestrear(uv.getX(v) + (cu - uv.getX(v)) * f, uv.getY(v) + (cv - uv.getY(v)) * f, tmp);
        suma[v * 3] += tmp[0];
        suma[v * 3 + 1] += tmp[1];
        suma[v * 3 + 2] += tmp[2];
        cant[v]++;
      }
    }
  }
  const col = [];
  for (let i = 0; i < n; i++) {
    const c = Math.max(1, cant[i]);
    col.push([suma[i * 3] / c, suma[i * 3 + 1] / c, suma[i * 3 + 2] / c]);
  }

  // --- 2. Vértices "soldados" por posición (las costuras de la textura duplican vértices) ---
  const grupoDe = new Int32Array(n);
  const claves = new Map();
  const miembros = [];
  for (let i = 0; i < n; i++) {
    const clave = `${Math.round(pos.getX(i) * 1e4)},${Math.round(pos.getY(i) * 1e4)},${Math.round(pos.getZ(i) * 1e4)}`;
    let gi = claves.get(clave);
    if (gi === undefined) {
      gi = miembros.length;
      claves.set(clave, gi);
      miembros.push([]);
    }
    grupoDe[i] = gi;
    miembros[gi].push(i);
  }
  const m = miembros.length;
  const vecinos = Array.from({ length: m }, () => new Set());
  for (let t = 0; t < idx.length; t += 3) {
    const a = grupoDe[idx[t]], b = grupoDe[idx[t + 1]], c = grupoDe[idx[t + 2]];
    vecinos[a].add(b).add(c);
    vecinos[b].add(a).add(c);
    vecinos[c].add(a).add(b);
  }
  // color por grupo soldado (promedio de sus copias)
  const colG = miembros.map((lista) => {
    const s = [0, 0, 0];
    for (const i of lista) for (let j = 0; j < 3; j++) s[j] += col[i][j];
    return s.map((x) => x / lista.length);
  });

  // --- 3. Paleta: k-means con arranque "el más lejano" (determinístico) ---
  let centros = [colG.reduce((a, b) => (luma(b) > luma(a) ? b : a))];
  const paso = Math.max(1, Math.floor(m / 4000)); // submuestra para el arranque
  while (centros.length < k) {
    let mejor = null;
    let mejorD = -1;
    for (let i = 0; i < m; i += paso) {
      let d = Infinity;
      for (const c of centros) d = Math.min(d, dist2(colG[i], c));
      if (d > mejorD) {
        mejorD = d;
        mejor = colG[i];
      }
    }
    centros.push([...mejor]);
  }
  const etiqueta = new Int32Array(m);
  const asignar = () => {
    for (let i = 0; i < m; i++) {
      let mejor = 0;
      let mejorD = Infinity;
      for (let c = 0; c < centros.length; c++) {
        const d = dist2(colG[i], centros[c]);
        if (d < mejorD) {
          mejorD = d;
          mejor = c;
        }
      }
      etiqueta[i] = mejor;
    }
  };
  const recalcular = () => {
    const s = centros.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < m; i++) {
      const e = s[etiqueta[i]];
      e[0] += colG[i][0];
      e[1] += colG[i][1];
      e[2] += colG[i][2];
      e[3]++;
    }
    centros = centros.map((c, j) => (s[j][3] ? [s[j][0] / s[j][3], s[j][1] / s[j][3], s[j][2] / s[j][3]] : c));
    return s.map((e) => e[3]);
  };
  for (let it = 0; it < 15; it++) {
    asignar();
    recalcular();
  }

  // --- 4. Se unen los tonos casi iguales (ej. dos rojos del saco por las sombras pintadas) ---
  for (;;) {
    let par = null;
    let parD = unir * unir;
    for (let a = 0; a < centros.length; a++)
      for (let b = a + 1; b < centros.length; b++) {
        const d = dist2(centros[a], centros[b]);
        if (d < parD) {
          parD = d;
          par = [a, b];
        }
      }
    if (!par) break;
    centros.splice(par[1], 1);
    asignar();
    recalcular();
  }

  // --- 5. Voto de vecinos: borra los puntitos sueltos y empareja los bordes ---
  const votos = new Float32Array(centros.length);
  for (let p = 0; p < pasadas; p++) {
    const nueva = new Int32Array(m);
    for (let i = 0; i < m; i++) {
      votos.fill(0);
      votos[etiqueta[i]] += 1.5;
      for (const v of vecinos[i]) votos[etiqueta[v]] += 1;
      let mejor = etiqueta[i];
      for (let c = 0; c < centros.length; c++) if (votos[c] > votos[mejor]) mejor = c;
      nueva[i] = mejor;
    }
    etiqueta.set(nueva);
  }
  recalcular(); // color final de cada zona = promedio de sus vértices

  // --- 6. Atributos: color lineal (el shader trabaja en lineal) y máscara de la cara ---
  const colorPlano = new Float32Array(n * 3);
  const plano = new Float32Array(n);
  const c = new THREE.Color();
  const yCara = art.cuello.y + H * 0.015;
  const zCabeza = art.cabeza.z;
  for (let i = 0; i < n; i++) {
    const cc = centros[etiqueta[grupoDe[i]]];
    c.setRGB(cc[0], cc[1], cc[2], THREE.SRGBColorSpace);
    colorPlano[i * 3] = c.r;
    colorPlano[i * 3 + 1] = c.g;
    colorPlano[i * 3 + 2] = c.b;
    // la cara (adelante de la cabeza: el modelo mira a -Z) conserva la textura
    const esCara = pos.getY(i) > yCara && pos.getZ(i) < zCabeza + H * 0.01;
    plano[i] = esCara ? 0 : 1;
  }
  const zona = new Int32Array(n);
  for (let i = 0; i < n; i++) zona[i] = etiqueta[grupoDe[i]];
  return {
    colorPlano: new THREE.BufferAttribute(colorPlano, 3),
    plano: new THREE.BufferAttribute(plano, 1),
    zona, // zona de color de cada vértice (índice de la paleta)
    paleta: centros.length,
  };
}

/**
 * Regiones de pelo y remera a partir de las zonas de color (para el recoloreo de Recolor.js).
 * En vez de decidir por altura, se recolorea la zona COMPLETA:
 *   remera = la zona que ocupa el centro del pecho (incluye la parte del buzo que baja de la cintura)
 *   pelo   = la zona que ocupa la coronilla (incluye la cola que cae por la espalda)
 * Devuelve el mismo formato que clasificarRegiones(), o null si no se pueden separar (por ejemplo
 * pelo y buzo del mismo color): en ese caso se usa la clasificación por altura.
 */
export function regionesPorZonas(g, art, H, planos) {
  const pos = g.attributes.position;
  const n = pos.count;
  const { zona } = planos;
  const masComun = (filtro) => {
    const votos = new Map();
    for (let i = 0; i < n; i++) if (filtro(i)) votos.set(zona[i], (votos.get(zona[i]) ?? 0) + 1);
    let mejor = -1;
    let mejorN = 0;
    for (const [z, c] of votos) if (c > mejorN) [mejor, mejorN] = [z, c];
    return mejorN >= 20 ? mejor : -1;
  };
  const yCintura = art.cintura.y;
  const yCuello = art.cuello.y;
  const zPelo = masComun((i) => pos.getY(i) > H * 0.968);
  if (zPelo < 0) return null;
  const col = planos.colorPlano.array;

  // El pelo puede tener más de un tono (mechas claras y oscuras): también son pelo las zonas de color
  // parecido que están casi todas del pecho para arriba. Nunca la zona de las manos (la piel puede
  // parecerse a un pelo rubio).
  const zManos = masComun((i) => Math.abs(pos.getX(i)) > H * 0.26 && pos.getY(i) < art.hombroD.y - H * 0.1);
  const datos = new Map(); // zona -> { r, g, b (sRGB), n, arriba }
  const c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const d = datos.get(zona[i]) ?? { r: 0, g: 0, b: 0, n: 0, arriba: 0 };
    if (!d.n) {
      c.setRGB(col[i * 3], col[i * 3 + 1], col[i * 3 + 2]).convertLinearToSRGB();
      Object.assign(d, { r: c.r, g: c.g, b: c.b });
    }
    d.n++;
    if (pos.getY(i) > yCintura + H * 0.1) d.arriba++; // del pecho para arriba (el pelo largo cae debajo del cuello)
    datos.set(zona[i], d);
  }
  const dp = datos.get(zPelo);
  const zonasPelo = new Set([zPelo]);
  for (const [z, d] of datos) {
    if (z === zPelo || z === zManos) continue;
    const dist = Math.hypot(d.r - dp.r, d.g - dp.g, d.b - dp.b);
    if (dist < 0.18 && d.arriba / d.n > 0.6) zonasPelo.add(z);
  }

  // Remera: la zona más común de la parte baja del torso (justo arriba de la cintura, donde el pelo
  // largo ya no llega), sin contar el pelo
  const zRemera = masComun((i) => {
    const y = pos.getY(i);
    return !zonasPelo.has(zona[i]) && Math.abs(pos.getX(i)) < H * 0.09 && y > yCintura + H * 0.01 && y < yCintura + H * 0.09;
  });
  if (zRemera < 0) return null;

  // Límites de altura sólo para no pintar otras partes del mismo color (pantalón negro = pelo negro,
  // zapatillas celestes = buzo celeste...): el buzo llega hasta la cadera, el pelo hasta la cintura.
  const yMinRemera = art.cadera.y - H * 0.06;
  const yMinPelo = yCintura;
  const region = new Float32Array(n * 2);
  const plano = planos.plano.array;
  let lumaPelo = 0;
  let lumaRemera = 0;
  for (let i = 0; i < n; i++) {
    const y = pos.getY(i);
    const l = 0.299 * col[i * 3] + 0.587 * col[i * 3 + 1] + 0.114 * col[i * 3 + 2];
    if (zona[i] === zRemera && y > yMinRemera && plano[i] > 0.5) {
      region[i * 2 + 1] = 1;
      lumaRemera = l;
    } else if (zonasPelo.has(zona[i]) && y > yMinPelo) {
      region[i * 2] = 1;
      if (zona[i] === zPelo) lumaPelo = l;
    }
  }
  // (los colores lisos son uniformes por zona: la luminosidad de referencia es la de la zona,
  // así el color nuevo sale exacto)
  return {
    region: new THREE.BufferAttribute(region, 2),
    lumaPelo: Math.max(0.002, lumaPelo),
    lumaRemera: Math.max(0.002, lumaRemera),
  };
}

/**
 * Agrega al material los colores lisos. Respeta un onBeforeCompile anterior (el recoloreo de pelo
 * y remera): los colores lisos se aplican justo después de leer la textura, antes del recoloreo.
 */
export function prepararColoresPlanos(material) {
  const previo = material.onBeforeCompile;
  const clavePrevia = material.customProgramCacheKey?.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    previo?.call(material, shader, renderer);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute vec3 colorPlano;\nattribute float plano;\nvarying vec3 vColorPlano;\nvarying float vPlano;',
      )
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vColorPlano = colorPlano;\n  vPlano = plano;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vColorPlano;\nvarying float vPlano;')
      .replace(
        '#include <map_fragment>',
        '#include <map_fragment>\n  diffuseColor.rgb = mix(diffuseColor.rgb, vColorPlano, step(0.5, vPlano));',
      );
  };
  material.customProgramCacheKey = () => `planos|${clavePrevia ? clavePrevia() : ''}`;
}
