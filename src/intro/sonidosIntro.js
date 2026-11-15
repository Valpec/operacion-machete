// Sonidos procedurales de la intro (no hace falta ningún archivo).
// Las voces de los padres son "habla" inventada por síntesis de formantes: suenan a un hombre y a
// una mujer retando, pero no se entiende ninguna palabra (como cuando uno ya no escucha lo que le dicen).
// Lo que dicen se lee en los subtítulos.

const TAU = Math.PI * 2;

function aleatorio(semilla) {
  let s = semilla >>> 0 || 1;
  return () => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

function normalizar(d, pico = 0.9) {
  let max = 0;
  for (let i = 0; i < d.length; i++) max = Math.max(max, Math.abs(d[i]));
  if (max > 0) for (let i = 0; i < d.length; i++) d[i] *= pico / max;
}

// Formantes (F1, F2, F3) de vocales castellanas; la voz femenina los tiene un poco más altos
const VOCALES = {
  a: [800, 1250, 2600],
  e: [450, 1900, 2600],
  i: [300, 2250, 3000],
  o: [500, 900, 2500],
  u: [330, 750, 2400],
};
const LISTA_VOCALES = Object.keys(VOCALES);

// Resonador de dos polos (filtro pasabanda simple) con coeficientes recalculables
class Resonador {
  constructor(sr) {
    this.sr = sr;
    this.y1 = 0;
    this.y2 = 0;
    this.set(500, 80);
  }
  set(f, ancho) {
    const r = Math.exp((-Math.PI * ancho) / this.sr);
    this.a1 = 2 * r * Math.cos((TAU * f) / this.sr);
    this.a2 = -r * r;
    this.g = 1 - r;
  }
  paso(x) {
    const y = this.g * x + this.a1 * this.y1 + this.a2 * this.y2;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
}

/**
 * Genera una frase de "habla" inventada.
 *  voz: 'hombre' | 'mujer'
 *  segundos: duración aproximada
 *  enojo: 0..1 (más tono, más volumen y sílabas más marcadas)
 */
export function frase(ctx, { voz = 'hombre', segundos = 2.5, enojo = 0.5, semilla = 1 }) {
  const sr = ctx.sampleRate;
  const n = Math.floor((segundos + 0.25) * sr);
  const buffer = ctx.createBuffer(1, n, sr);
  const d = buffer.getChannelData(0);
  const rnd = aleatorio(semilla * 7919 + (voz === 'mujer' ? 31 : 17));
  const mujer = voz === 'mujer';
  const f0Base = (mujer ? 205 : 108) * (1 + enojo * 0.18);
  const escalaFormantes = mujer ? 1.16 : 1;

  // Plan de sílabas: [inicio, duración, vocal, consonante?, acento]
  const silabas = [];
  let t = 0.04;
  while (t < segundos - 0.12) {
    const dur = 0.11 + rnd() * 0.09 - enojo * 0.02;
    silabas.push({ t, dur, vocal: LISTA_VOCALES[Math.floor(rnd() * 5)], consonante: rnd() < 0.7, acento: rnd() < 0.3 });
    t += dur + 0.015;
    if (rnd() < 0.16) t += 0.07 + rnd() * 0.08; // pausa entre "palabras"
  }
  const ultimaFinaliza = t;

  const f1 = new Resonador(sr);
  const f2 = new Resonador(sr);
  const f3 = new Resonador(sr);
  let fase = 0;
  let ruidoS = 12345;
  let actual = VOCALES.a.slice();
  let indice = 0;
  for (let i = 0; i < n; i++) {
    const ts = i / sr;
    while (indice < silabas.length - 1 && ts > silabas[indice].t + silabas[indice].dur) indice++;
    const s = silabas[indice];
    const local = (ts - s.t) / s.dur; // 0..1 dentro de la sílaba
    // Entonación: baja a lo largo de la frase, sube en los acentos, termina "cortante" si está enojado
    const declinacion = 1 - 0.18 * (ts / Math.max(0.5, ultimaFinaliza));
    const acento = s.acento ? 1 + 0.22 * Math.sin(Math.PI * Math.min(1, Math.max(0, local))) : 1;
    const vibrato = 1 + 0.012 * Math.sin(TAU * 5.5 * ts);
    const f0 = f0Base * declinacion * acento * vibrato;
    fase += f0 / sr;
    if (fase >= 1) fase -= 1;
    // Fuente glotal: diente de sierra suavizado (más brillante con enojo)
    const glotal = (1 - 2 * fase) * (0.6 + enojo * 0.4) + Math.sin(TAU * fase) * 0.5;
    ruidoS ^= ruidoS << 13; ruidoS ^= ruidoS >>> 17; ruidoS ^= ruidoS << 5;
    const ruido = ((ruidoS >>> 0) / 4294967296) * 2 - 1;

    // Formantes que se deslizan hacia la vocal de la sílaba
    if (i % 64 === 0) {
      const obj = VOCALES[s.vocal];
      for (let k = 0; k < 3; k++) actual[k] += (obj[k] * escalaFormantes - actual[k]) * 0.35;
      f1.set(actual[0], 90);
      f2.set(actual[1], 120);
      f3.set(actual[2], 170);
    }
    // Envolvente de la sílaba: ataque corto, cuerpo y caída
    let env = 0;
    if (ts >= s.t && ts <= s.t + s.dur) {
      env = Math.min(1, local / 0.15) * Math.min(1, (1 - local) / 0.25);
    }
    // Consonante: soplo de ruido al principio de la sílaba
    const cons = s.consonante && local >= 0 && local < 0.22 ? (1 - local / 0.22) * 0.35 : 0;
    const exc = glotal * env * (s.consonante && local < 0.12 ? 0.3 : 1) + ruido * cons;
    d[i] = f1.paso(exc) * 1.0 + f2.paso(exc) * 0.7 + f3.paso(exc) * 0.35;
  }
  // Un poco de "habitación": eco corto
  const eco = Math.floor(0.045 * sr);
  for (let i = eco; i < n; i++) d[i] += d[i - eco] * 0.22;
  normalizar(d, 0.85);
  return buffer;
}

function crear(ctx, segundos, fn) {
  const sr = ctx.sampleRate;
  const n = Math.floor(segundos * sr);
  const buffer = ctx.createBuffer(1, n, sr);
  const d = buffer.getChannelData(0);
  fn(d, sr, n);
  normalizar(d);
  return buffer;
}

// Tic-tac de un reloj de pared
export function tictac(ctx) {
  return crear(ctx, 0.08, (d, sr, n) => {
    const rnd = aleatorio(5);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      d[i] = (Math.sin(TAU * 2400 * t) * 0.6 + (rnd() * 2 - 1) * 0.6) * Math.exp(-t * 90);
    }
  });
}

// Cubiertos contra el plato
export function cubierto(ctx) {
  return crear(ctx, 0.35, (d, sr, n) => {
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      d[i] = (Math.sin(TAU * 3150 * t) + Math.sin(TAU * 4720 * t) * 0.6 + Math.sin(TAU * 6900 * t) * 0.3) * Math.exp(-t * 18);
    }
  });
}

// Zumbido agudo de oídos (el momento en que ya no escucha nada)
export function zumbidoOidos(ctx) {
  return crear(ctx, 3, (d, sr, n) => {
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const env = Math.min(1, t / 0.6) * Math.min(1, (3 - t) / 0.8);
      d[i] = Math.sin(TAU * 3700 * t) * env * 0.5 + Math.sin(TAU * 3707 * t) * env * 0.3;
    }
  });
}

// Drone grave que crece con la presión
export function drone(ctx) {
  return crear(ctx, 4, (d, sr, n) => {
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      d[i] = Math.sin(TAU * 55 * t) * 0.6 + Math.sin(TAU * 82.5 * t) * 0.3 + Math.sin(TAU * 110.4 * t) * 0.15;
    }
  });
}

// Notificación de mensaje
export function notificacion(ctx) {
  return crear(ctx, 0.32, (d, sr, n) => {
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const f = t < 0.1 ? 880 : 1320;
      const tt = t < 0.1 ? t : t - 0.1;
      d[i] = Math.sin(TAU * f * t) * Math.exp(-tt * 14) * (t < 0.1 ? 0.7 : 1);
    }
  });
}

// "Pop" de mensaje enviado
export function enviado(ctx) {
  return crear(ctx, 0.12, (d, sr, n) => {
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      d[i] = Math.sin(TAU * (600 + t * 2500) * t) * Math.exp(-t * 35);
    }
  });
}
