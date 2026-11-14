// Configuración visual de todos los personajes.
// Para reemplazar un placeholder por un modelo, cambiá su entrada por:
//   { tipo: 'glb', ruta: '/modelos/profesora.glb', escala: 1, postura: 'parado',
//     huesos: { cabeza: 'Head', hombroD: 'RightArm', codoD: 'RightForeArm', ... } }
// La lógica de juego no cambia: sólo usa la interfaz de Personaje.

export const PIELES = [0xf1c9a5, 0xe0ac84, 0xc68d62, 0x9c6b47, 0xf6d7bd];

export const PERSONAJES = {
  // Jugador: sólo se ven antebrazos y manos
  protagonista: {
    tipo: 'placeholder',
    postura: 'sentado',
    soloBrazos: true,
    buzo: 0xf4f4f2,
    piel: 0xeec29c,
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
    escala: 1.04,
    // Modelo 3D (malla estática, sin esqueleto): se ve este y el placeholder queda invisible
    // para la lógica. El archivo mira hacia +Z, por eso se gira 180°.
    modelo: {
      ruta: '/modelos/teacher.glb',
      altura: 1.78,              // metros
      rotacionY: Math.PI,
      manoDerecha: [0.52, 0.82, -0.04], // dónde sostiene la hoja retirada (coordenadas locales)
    },
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
  },

  // Esquina del fondo, derecha. Silueta: capucha puesta
  mensajero: {
    tipo: 'placeholder',
    postura: 'sentado',
    buzo: 0x2c5a3a,
    pantalon: 0x2f3440,
    piel: 0xc68d62,
    pelo: { estilo: 'corto', color: 0x2a1c12 },
    capucha: true,
  },

  // Fila de adelante, extremo derecho. Silueta: pelo largo suelto
  grupo: {
    tipo: 'placeholder',
    postura: 'sentado',
    buzo: 0xb89ce3,
    pantalon: 0x3b4a66,
    piel: 0xf6d7bd,
    pelo: { estilo: 'largo', color: 0xeac862 },
  },

  // Banco cercano, fuera del grupo. Silueta: anteojos y cabeza siempre gacha
  aplicado: {
    tipo: 'placeholder',
    postura: 'sentado',
    buzo: 0xd3a12e,
    pantalon: 0x4a4038,
    piel: 0xe0ac84,
    pelo: { estilo: 'corto', color: 0x3a2618 },
    anteojos: true,
  },
};

// Dónde se sienta cada uno (columna 0 = izquierda, fila 0 = adelante)
export const UBICACIONES = {
  senias: { col: 0, fila: 4 },
  mensajero: { col: 4, fila: 4 },
  grupo: { col: 4, fila: 0 },
  aplicado: { col: 3, fila: 2 },
};

// Bancos que quedan vacíos para que haya línea de vista directa entre el
// banco central y cada amigo (si no, un compañero de relleno los tapa)
export const BANCOS_VACIOS = [
  { col: 1, fila: 3 },
  { col: 3, fila: 3 },
  { col: 3, fila: 1 },
];

// Estudiantes de relleno: tonos grises y apagados para no competir con el grupo
const BUZOS_RELLENO = [0x8a8d93, 0x6f7377, 0x9c978e, 0x5d6168, 0x7d8a8f, 0xa3a09a, 0x6b6660, 0x878078];
const PELOS_RELLENO = [0x1c1612, 0x3a2618, 0x5a4030, 0x2a2a2a, 0x7a6048];
const ESTILOS_RELLENO = ['corto', 'corto', 'largo', 'rodete', 'corto'];

export function configRelleno(rnd) {
  const elegir = (lista) => lista[Math.floor(rnd() * lista.length)];
  return {
    tipo: 'placeholder',
    postura: 'sentado',
    buzo: elegir(BUZOS_RELLENO),
    pantalon: 0x40444c,
    piel: elegir(PIELES),
    pelo: { estilo: elegir(ESTILOS_RELLENO), color: elegir(PELOS_RELLENO) },
    anteojos: rnd() < 0.2,
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
