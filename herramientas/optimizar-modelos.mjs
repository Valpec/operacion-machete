// Optimiza los modelos GLB para la web: suelda vértices, reduce polígonos, deja sólo la textura
// de color (el juego usa materiales toon, no necesita normal ni rugosidad) y la achica.
// Uso: node optimizar-modelos.mjs <carpetaOriginales> <carpetaSalida>
// Requiere: npm i @gltf-transform/core @gltf-transform/functions meshoptimizer sharp
import { NodeIO } from '@gltf-transform/core';
import { weld, simplify, dedup, prune, textureCompress } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const [, , entrada, salida] = process.argv;
// Triángulos objetivo por modelo (el protagonista se ve de cerca en la intro)
const OBJETIVO = { principal: 34000, teacher: 30000, amigo1: 26000, amiga2: 28000 };
const io = new NodeIO();
await MeshoptSimplifier.ready;
fs.mkdirSync(salida, { recursive: true });

for (const archivo of fs.readdirSync(entrada).filter((f) => f.endsWith('.glb'))) {
  const nombre = path.basename(archivo, '.glb');
  const doc = await io.read(path.join(entrada, archivo));
  const root = doc.getRoot();
  let tris = 0;
  for (const m of root.listMeshes()) for (const p of m.listPrimitives()) tris += (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3;
  for (const mat of root.listMaterials()) {
    mat.setNormalTexture(null);
    mat.setMetallicRoughnessTexture(null);
    mat.setOcclusionTexture(null);
    mat.setEmissiveTexture(null);
    mat.setMetallicFactor(0);
    mat.setRoughnessFactor(1);
  }
  const objetivo = OBJETIVO[nombre] ?? 28000;
  await doc.transform(
    dedup(),
    weld({}),
    simplify({ simplifier: MeshoptSimplifier, ratio: Math.min(1, objetivo / tris), error: 0.002 }),
    prune(),
    textureCompress({ encoder: sharp, targetFormat: 'jpeg', resize: [1024, 1024], quality: 86 }),
  );
  let trisFin = 0;
  for (const m of root.listMeshes()) for (const p of m.listPrimitives()) trisFin += p.getIndices().getCount() / 3;
  const destino = path.join(salida, archivo);
  await io.write(destino, doc);
  console.log(`${archivo}: ${Math.round(tris)} → ${trisFin} triángulos, ${(fs.statSync(destino).size / 1e6).toFixed(2)} MB`);
}
