// Configuración visual de todos los personajes.
//
// Modelos 3D: agregá a la entrada  modelo: { ruta, altura, rotacionY, piel }.
// El modelo puede ser una malla estática en pose A o T (como las que exportan los generadores de
// personajes): al cargarlo se le arma un esqueleto por código (characters/AutoRig.js) con las mismas
// articulaciones que el placeholder, así camina, se sienta y hace señas sin tocar la lógica.
// Si el archivo no carga, queda el placeholder hecho con primitivas (los demás campos).
//   ruta       archivo en public/modelos/
//   altura     altura del personaje parado, en metros
//   rotacionY  giro para que mire hacia -Z (los generadores suelen exportar mirando a +Z: Math.PI)
//   piel       color de la mano "de señas" que reemplaza a la del modelo mientras muestra dedos
//   alturaCadera  (sentados) altura de la cadera sobre el piso
//   rig: false    usa el modo viejo: malla rígida que sólo se balancea
//   cuello     altura del cuello (fracción de la altura, ej. 0.82) si el pelo largo lo tapa y la
//              cara se deforma al girar la cabeza; si no se pone, se detecta solo
//   coloresPlanos: true  pinta el cuerpo con colores lisos (texturas en mosaico que de lejos se ven
//                 manchadas); la cara conserva la textura. Ver characters/ColoresPlanos.js
// Para optimizar un modelo nuevo (polígonos y texturas): herramientas/optimizar-modelos.mjs

export const PIELES = [0xf1c9a5, 0xe0ac84, 0xc68d62, 0x9c6b47, 0xf6d7bd];

export const PERSONAJES = {
  // Jugador: sólo se ven antebrazos y manos
  // (en el aula la cabeza no se dibuja: la cámara está en sus ojos; en la intro se ve entero)
  protagonista: {
    tipo: 'placeholder',
    postura: 'sentado',
    soloBrazos: true,
    buzo: 0xf4f4f2,
    piel: 0xeec29c,
    // (la cadera va un poco más alta y adelante: así los hombros quedan donde la cámara espera)
    modelo: { ruta: '/modelos/principal.glb', altura: 1.72, rotacionY: Math.PI, piel: 0xf0c7a6, alturaCadera: 0.6, offsetCaderaZ: -0.04, contorno: 0 },
  },

  // Única con rojo en toda la escena
  profesora: {
    tipo: 'placeholder',
    postura: 'parado',
    buzo: 0x7a1c22,        // saco rojo oscuro
    pollera: 0x1d2547,     // pollera azul marino
    pantalon: 0x3b3236,    // medias / piernas
    piel: 0xf0cfb2,
    pelo: { estilo: 'rodete', color: 0xa3a3a8 },
    anteojos: true,
    // Con pollera tubo da pasos más cortos (zancada = amplitud del muslo al caminar)
    zancada: 0.24,
    // contorno: 0 -> sin línea negra (todos los personajes van sin ella)
    modelo: { ruta: '/modelos/profesora.glb', altura: 1.72, rotacionY: Math.PI, piel: 0xf0cfb2, contorno: 0, coloresPlanos: true },
  },

  // Esquina del fondo, izquierda. Silueta: cola de caballo
  senias: {
    tipo: 'placeholder',
    postura: 'sentado',
    buzo: 0x8fd0f2,
    pantalon: 0x3b4a66,
    piel: 0xf1c9a5,
    pelo: { estilo: 'coleta', color: 0x141018 },
    lapicera: true,
    modelo: { ruta: '/modelos/amiga2.glb', altura: 1.62, rotacionY: Math.PI, piel: 0xf3d2bb, alturaCadera: 0.5, elevarTorso: 0.12, contorno: 0, coloresPlanos: true },
  },

  // Esquina del fondo, derecha. Silueta: el más grandote, pelo corto rubio (placeholder: capucha)
  mensajero: {
    tipo: 'placeholder',
    postura: 'sentado',
    buzo: 0x2c5a3a,
    pantalon: 0x2f3440,
    piel: 0xc68d62,
    pelo: { estilo: 'corto', color: 0x2a1c12 },
    capucha: true,
    modelo: { ruta: '/modelos/tomas.glb', altura: 1.78, rotacionY: Math.PI, piel: 0xe7b892, alturaCadera: 0.53, elevarTorso: 0.12, contorno: 0, coloresPlanos: true },
  },

  // Fila de adelante, extremo derecho. Silueta: pelo largo suelto
  grupo: {
    tipo: 'placeholder',
    postura: 'sentado',
    buzo: 0xb89ce3,
    pantalon: 0x3b4a66,
    piel: 0xf6d7bd,
    pelo: { estilo: 'largo', color: 0xeac862 },
    // modelo de los compañeros de fondo rubios, con sus colores originales (sin recolorear)
    modelo: { ruta: '/modelos/sofi.glb', altura: 1.62, cuello: 0.82, rotacionY: Math.PI, piel: 0xf6d7bd, alturaCadera: 0.5, elevarTorso: 0.12, contorno: 0, coloresPlanos: true },
    contorno: 0,
  },

  // Banco cercano, fuera del grupo. Silueta: anteojos y cabeza siempre gacha
  aplicado: {
    tipo: 'placeholder',
    postura: 'sentado',
    buzo: 0xd3a12e,
    pantalon: 0x4a4038,
    piel: 0xe0ac84,
    pelo: { estilo: 'corto', color: 0x3a2618 },
    modelo: { ruta: '/modelos/amigo1.glb', altura: 1.78, rotacionY: Math.PI, piel: 0xe0ac84, alturaCadera: 0.53, elevarTorso: 0.12, contorno: 0, coloresPlanos: true },
    contorno: 0,
    anteojos: true,
  },
};

// Dónde se sienta cada uno (columna 0 = izquierda, fila 0 = adelante).
// Se calcula a partir del tamaño de la grilla (balance.json -> aula.columnas / aula.filas),
// así cambiar la cantidad de bancos no rompe nada:
//   Sofi: esquina del fondo a la izquierda · Tomi: esquina del fondo a la derecha
//   Juli: fila de adelante, extremo derecho · Martín: al lado del banco central
export function ubicaciones(columnas, filas) {
  const ultimaC = columnas - 1;
  const ultimaF = filas - 1;
  const medioC = Math.floor(columnas / 2);
  const medioF = Math.floor(filas / 2);
  // Martín a la derecha del central; si ese lugar no existe o está tomado, a la izquierda
  const tomados = new Set([`0,${ultimaF}`, `${ultimaC},${ultimaF}`, `${ultimaC},0`, `${medioC},${medioF}`]);
  let aplicado = { col: medioC + 1, fila: medioF };
  if (aplicado.col > ultimaC || tomados.has(`${aplicado.col},${aplicado.fila}`)) aplicado = { col: medioC - 1, fila: medioF };
  return {
    senias: { col: 0, fila: ultimaF },
    mensajero: { col: ultimaC, fila: ultimaF },
    grupo: { col: ultimaC, fila: 0 },
    aplicado,
  };
}

// Los bancos que quedan en línea recta entre el banco central y cada amigo se dejan vacíos
// (si no, un compañero de relleno los tapa). Distancia máxima a esa línea, en metros:
export const DISTANCIA_LINEA_VISTA = 0.8;

// Estudiantes de relleno: reutilizan los modelos de Tomi, Sofi y el protagonista (cuerpo completo,
// sentados). Todos con remera azul marino y el pelo en distintos colores para que no parezcan clones.
const AZUL_MARINO = 0x1b2a52;
const PELOS_RELLENO = [0x15110e, 0x2b1b12, 0x4a2f1c, 0x6b4a2b, 0x9a6b35, 0xc9a45c, 0x8a3b1f, 0x5d5a58];
const MODELOS_RELLENO = [
  { ruta: '/modelos/amigo1.glb', altura: 1.78, alturaCadera: 0.53 },
  { ruta: '/modelos/sofi.glb', altura: 1.62, cuello: 0.82, alturaCadera: 0.5 },
  { ruta: '/modelos/principal.glb', altura: 1.72, alturaCadera: 0.52, offsetCaderaZ: 0.04 },
];
const ESTILOS_RELLENO = ['corto', 'corto', 'largo', 'rodete', 'corto'];

export function configRelleno(rnd) {
  const elegir = (lista) => lista[Math.floor(rnd() * lista.length)];
  const pelo = elegir(PELOS_RELLENO);
  return {
    // (placeholder de respaldo si el modelo no carga)
    tipo: 'placeholder',
    postura: 'sentado',
    buzo: AZUL_MARINO,
    pantalon: 0x40444c,
    piel: elegir(PIELES),
    pelo: { estilo: elegir(ESTILOS_RELLENO), color: pelo },
    anteojos: rnd() < 0.2,
    modelo: { ...elegir(MODELOS_RELLENO), rotacionY: Math.PI, elevarTorso: 0.12, remera: AZUL_MARINO, pelo, contorno: 0, coloresPlanos: true },
  };
}

// Nombres con los que el HUD y los subtítulos se refieren a cada uno
export const NOMBRES = {
  senias: 'Sofi',
  mensajero: 'Tomi',
  grupo: 'Juli',
  aplicado: 'Martín',
  profesora: 'la profe',
};

// Rutas de todos los modelos (para precargarlos antes de armar el elenco)
export function rutasModelos() {
  // (incluye los de los compañeros de fondo: si no se precargan, quedan como muñecos simples)
  const rutas = [
    ...Object.values(PERSONAJES).map((c) => c.modelo?.ruta),
    ...MODELOS_RELLENO.map((m) => m.ruta),
  ];
  return [...new Set(rutas.filter(Boolean))];
}
