// Síntesis procedural de todos los sonidos del juego (no hace falta ningún archivo).
// Cada función devuelve un AudioBuffer mono generado muestra por muestra.

const TAU = Math.PI * 2;

function crear(ctx, segundos, fn) {
  const sr = ctx.sampleRate;
  const n = Math.floor(segundos * sr);
  const buffer = ctx.createBuffer(1, n, sr);
  const datos = buffer.getChannelData(0);
  fn(datos, sr, n);
  normalizar(datos, 0.9);
  return buffer;
}

function normalizar(d, pico) {
  let max = 0;
  for (let i = 0; i < d.length; i++) max = Math.max(max, Math.abs(d[i]));
  if (max > 0) for (let i = 0; i < d.length; i++) d[i] *= pico / max;
}

// Filtros de un polo (suficientes para dar color al ruido)
function pasaBajos(d, sr, corte) {
  const a = 1 - Math.exp((-TAU * corte) / sr);
  let y = 0;
  for (let i = 0; i < d.length; i++) {
    y += a * (d[i] - y);
    d[i] = y;
  }
}
function pasaAltos(d, sr, corte) {
  const a = Math.exp((-TAU * corte) / sr);
  let prevX = 0;
  let prevY = 0;
  for (let i = 0; i < d.length; i++) {
    const y = a * (prevY + d[i] - prevX);
    prevX = d[i];
    prevY = y;
    d[i] = y;
  }
}
function ruido(n, semilla = 1) {
  let s = semilla >>> 0 || 1;
  const d = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    d[i] = ((s >>> 0) / 4294967296) * 2 - 1;
  }
  return d;
}

// ---------- Sonidos ----------

// Paso de zapato sobre madera: golpe grave del taco + chasquido de la suela
export function paso(ctx) {
  return crear(ctx, 0.22, (d, sr, n) => {
    const r = ruido(n, 7);
    pasaBajos(r, sr, 900);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const golpe = (tt) => (tt >= 0 ? Math.exp(-tt * 45) : 0);
      const env = golpe(t) + 0.6 * golpe(t - 0.055);
      const grave = Math.sin(TAU * (80 - t * 120) * t) * Math.exp(-t * 30);
      d[i] = r[i] * env * 0.8 + grave * 0.9;
    }
  });
}

// Golpe de lapicera contra el banco: click seco y agudo
export function lapicera(ctx) {
  return crear(ctx, 0.08, (d, sr, n) => {
    const r = ruido(n, 3);
    pasaAltos(r, sr, 2500);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      d[i] = r[i] * Math.exp(-t * 160) + Math.sin(TAU * 2300 * t) * Math.exp(-t * 90) * 0.6 + Math.sin(TAU * 420 * t) * Math.exp(-t * 70) * 0.5;
    }
  });
}

// Papel que se arruga / se abre: crujidos de ruido filtrado
export function papel(ctx) {
  return crear(ctx, 0.45, (d, sr, n) => {
    const r = ruido(n, 11);
    pasaAltos(r, sr, 1400);
    pasaBajos(r, sr, 7000);
    const crujidos = ruido(64, 5).map((v) => Math.abs(v));
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const k = Math.floor((t / 0.45) * 64);
      const env = Math.pow(crujidos[k], 3) * Math.min(1, t * 30) * Math.exp(-t * 3);
      d[i] = r[i] * env;
    }
  });
}

// Papelito que cae: golpecito blando + crujido corto
export function papelCae(ctx) {
  return crear(ctx, 0.25, (d, sr, n) => {
    const r = ruido(n, 19);
    pasaAltos(r, sr, 900);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      d[i] = r[i] * Math.exp(-t * 28) + Math.sin(TAU * 140 * t) * Math.exp(-t * 50) * 0.7;
    }
  });
}

// Lanzamiento: "fffsh" de aire
export function soplido(ctx) {
  return crear(ctx, 0.3, (d, sr, n) => {
    const r = ruido(n, 23);
    pasaAltos(r, sr, 600);
    pasaBajos(r, sr, 3000);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      d[i] = r[i] * Math.sin(Math.PI * Math.min(1, t / 0.3)) ** 2;
    }
  });
}

// Latido: "lub-dub" grave
export function latido(ctx) {
  return crear(ctx, 0.5, (d, sr, n) => {
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const lub = Math.sin(TAU * (62 - t * 40) * t) * (t < 0.16 ? Math.sin((Math.PI * t) / 0.16) : 0);
      const t2 = t - 0.2;
      const dub = t2 > 0 ? Math.sin(TAU * (75 - t2 * 50) * t2) * (t2 < 0.12 ? Math.sin((Math.PI * t2) / 0.12) : 0) * 0.7 : 0;
      d[i] = lub + dub;
    }
  });
}

// Respiración agitada: inhalación y exhalación de ruido filtrado (loop de 1,6 s)
export function respiracion(ctx) {
  return crear(ctx, 1.6, (d, sr, n) => {
    const r = ruido(n, 31);
    pasaAltos(r, sr, 350);
    pasaBajos(r, sr, 2200);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const inhala = t < 0.6 ? Math.sin((Math.PI * t) / 0.6) : 0;
      const exhala = t > 0.75 && t < 1.5 ? Math.sin((Math.PI * (t - 0.75)) / 0.75) * 1.2 : 0;
      d[i] = r[i] * (inhala * 0.7 + exhala);
    }
  });
}

// Timbre eléctrico de escuela: campana metálica golpeada muy rápido
export function timbre(ctx) {
  return crear(ctx, 2.8, (d, sr, n) => {
    const parciales = [[950, 1], [2380, 0.5], [3900, 0.25], [1430, 0.35]];
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      let s = 0;
      for (const [f, a] of parciales) s += Math.sin(TAU * f * t) * a;
      const badajo = 0.55 + 0.45 * Math.sign(Math.sin(TAU * 24 * t));
      const env = Math.min(1, t * 40) * (t < 2.3 ? 1 : Math.exp(-(t - 2.3) * 9));
      d[i] = s * badajo * env;
    }
  });
}

// Ambiente del aula: rumor grave continuo (loop sin cortes)
export function ambiente(ctx) {
  return crear(ctx, 6, (d, sr, n) => {
    const r = ruido(n, 41);
    pasaBajos(r, sr, 380);
    pasaBajos(r, sr, 600);
    const tras = ruido(n, 43);
    pasaAltos(tras, sr, 3000);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      // ventilador / murmullo lejano con un vaivén lento
      d[i] = r[i] * (0.8 + 0.2 * Math.sin(TAU * 0.33 * t)) + tras[i] * 0.03;
    }
    // Fundido de los extremos para que el loop no haga click
    const f = Math.floor(sr * 0.05);
    for (let i = 0; i < f; i++) {
      d[i] *= i / f;
      d[n - 1 - i] *= i / f;
    }
  });
}

// Lápiz/lapicera escribiendo (loop): trazos de ruido agudo
export function escritura(ctx) {
  return crear(ctx, 2.4, (d, sr, n) => {
    const r = ruido(n, 53);
    pasaAltos(r, sr, 2200);
    pasaBajos(r, sr, 8000);
    const trazos = ruido(24, 59).map((v) => (v > -0.2 ? 0.4 + 0.6 * Math.abs(v) : 0));
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const k = Math.floor((t / 2.4) * 24);
      const dentro = ((t / 2.4) * 24) % 1;
      d[i] = r[i] * trazos[k] * Math.sin(Math.PI * dentro) * (0.6 + 0.4 * Math.sin(TAU * 18 * t));
    }
  });
}

// Destello de memoria: campanita suave
export function destello(ctx) {
  return crear(ctx, 1.2, (d, sr, n) => {
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const nota = (f, t0) => (t >= t0 ? Math.sin(TAU * f * (t - t0)) * Math.exp(-(t - t0) * 4) : 0);
      d[i] = nota(1318.5, 0) + nota(1760, 0.08) * 0.8 + nota(2637, 0.16) * 0.5;
    }
  });
}

// Vibración del celular
export function vibracion(ctx) {
  return crear(ctx, 0.45, (d, sr, n) => {
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const zumbido = Math.sign(Math.sin(TAU * 165 * t)) * 0.5 + Math.sin(TAU * 330 * t) * 0.3;
      d[i] = zumbido * (t < 0.18 || (t > 0.25 && t < 0.42) ? 1 : 0);
    }
    pasaBajos(d, sr, 900);
  });
}

// Tela del buzo (sacar el machete de la manga)
export function tela(ctx) {
  return crear(ctx, 0.3, (d, sr, n) => {
    const r = ruido(n, 61);
    pasaBajos(r, sr, 2500);
    pasaAltos(r, sr, 300);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      d[i] = r[i] * Math.sin(Math.PI * (t / 0.3)) * (0.7 + 0.3 * Math.sin(TAU * 30 * t));
    }
  });
}

// Cierre de la cartuchera
export function cierre(ctx) {
  return crear(ctx, 0.5, (d, sr, n) => {
    const r = ruido(n, 67);
    pasaAltos(r, sr, 1800);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const dientes = Math.max(0, Math.sin(TAU * (60 + t * 40) * t)) ** 8;
      d[i] = r[i] * dientes * Math.sin(Math.PI * (t / 0.5));
    }
  });
}

export const GENERADORES = {
  paso, lapicera, papel, papelCae, soplido, latido, respiracion, timbre,
  ambiente, escritura, destello, vibracion, tela, cierre,
};
