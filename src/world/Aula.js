import * as THREE from 'three';
import { caja, cilindro, toon, contorno, texturaCanvas, aleatorioConSemilla } from './materiales.js';

// Paleta del aula (los personajes no usan estos tonos para destacarse)
const C = {
  maderaClara: 0xd9b58a,
  maderaBanco: 0xb9824f,
  maderaOscura: 0x7a4f2e,
  metal: 0x5d6470,
  pared: 0xeee3cf,
  zocalo: 0x9fb7a8,
  techo: 0xf4f1ea,
  pizarron: 0x2f5d45,
  marcoVentana: 0xf7f7f2,
  vidrio: 0xcfe7ff,
  puerta: 0x8a5a36,
};

/**
 * Construye el aula completa y devuelve referencias útiles para los sistemas:
 * bancos (con su asiento), banco central, objetos sólidos para física y visión, reloj, etc.
 */
export function crearAula(balance) {
  const a = balance.aula;
  const grupo = new THREE.Group();
  grupo.name = 'aula';

  const ancho = a.anchoAula;
  const xMin = -ancho / 2;
  const xMax = ancho / 2;
  const zMin = a.frenteZ;
  const zMax = a.fondoZ;
  const profundidad = zMax - zMin;
  const alto = a.altoAula;
  const centroZ = (zMin + zMax) / 2;

  const solidos = []; // mallas que bloquean la vista y contra las que rebota el papelito

  // ---------- Piso de madera clara ----------
  const texPiso = texturaCanvas(512, 512, (ctx, w, h) => {
    const rnd = aleatorioConSemilla(7);
    const tablas = 8;
    for (let i = 0; i < tablas; i++) {
      const tono = 205 + Math.floor(rnd() * 25);
      ctx.fillStyle = `rgb(${tono}, ${Math.floor(tono * 0.8)}, ${Math.floor(tono * 0.6)})`;
      ctx.fillRect(0, (i * h) / tablas, w, h / tablas);
      ctx.fillStyle = 'rgba(90,60,30,0.45)';
      ctx.fillRect(0, (i * h) / tablas, w, 3);
      const corte = rnd() * w;
      ctx.fillRect(corte, (i * h) / tablas, 3, h / tablas);
    }
  });
  texPiso.wrapS = texPiso.wrapT = THREE.RepeatWrapping;
  texPiso.repeat.set(ancho / 2.5, profundidad / 2.5);
  const piso = new THREE.Mesh(new THREE.PlaneGeometry(ancho, profundidad), toon(0xffffff, { map: texPiso }));
  piso.rotation.x = -Math.PI / 2;
  piso.position.set(0, 0, centroZ);
  piso.receiveShadow = true;
  piso.name = 'piso';
  grupo.add(piso);

  // ---------- Paredes y techo ----------
  const matPared = toon(C.pared, { side: THREE.FrontSide });
  const pared = (w, h, pos, rotY) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), matPared);
    m.position.copy(pos);
    m.rotation.y = rotY;
    m.receiveShadow = true;
    grupo.add(m);
    solidos.push(m);
    return m;
  };
  pared(ancho, alto, new THREE.Vector3(0, alto / 2, zMin), 0); // frente
  pared(ancho, alto, new THREE.Vector3(0, alto / 2, zMax), Math.PI); // fondo
  pared(profundidad, alto, new THREE.Vector3(xMax, alto / 2, centroZ), -Math.PI / 2); // derecha (puerta)
  // La pared izquierda tiene ventanas: se arma por partes
  construirParedConVentanas(grupo, solidos, { x: xMin, zMin, zMax, alto, matPared });

  const techo = new THREE.Mesh(new THREE.PlaneGeometry(ancho, profundidad), toon(C.techo, { emissive: 0x77736a }));
  techo.rotation.x = Math.PI / 2;
  techo.position.set(0, alto, centroZ);
  grupo.add(techo);

  // Zócalo pintado alrededor (franja verde agua típica de escuela)
  const zocalo = (w, pos, rotY) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.9), toon(C.zocalo));
    m.position.copy(pos);
    m.rotation.y = rotY;
    grupo.add(m);
  };
  zocalo(ancho, new THREE.Vector3(0, 0.45, zMin + 0.005), 0);
  zocalo(ancho, new THREE.Vector3(0, 0.45, zMax - 0.005), Math.PI);
  zocalo(profundidad, new THREE.Vector3(xMax - 0.005, 0.45, centroZ), -Math.PI / 2);

  // Tubos fluorescentes en el techo
  const matTubo = new THREE.MeshBasicMaterial({ color: 0xfffdf2 });
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 2; j++) {
      const t = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.05, 1.6), matTubo);
      t.position.set(-2.8 + i * 2.8, alto - 0.03, -3.5 + j * 4.5);
      grupo.add(t);
    }
  }

  // ---------- Pizarrón verde ----------
  const texPizarron = texturaCanvas(1024, 384, (ctx, w, h) => {
    ctx.fillStyle = '#2f5d45';
    ctx.fillRect(0, 0, w, h);
    // manchas de borrador
    const rnd = aleatorioConSemilla(3);
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = `rgba(255,255,255,${0.02 + rnd() * 0.03})`;
      ctx.beginPath();
      ctx.ellipse(rnd() * w, rnd() * h, 40 + rnd() * 90, 15 + rnd() * 30, rnd() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(245,245,235,0.92)';
    ctx.font = 'bold 54px "Comic Sans MS", "Segoe Print", cursive';
    ctx.fillText('PRIMER PARCIAL', 60, 90);
    ctx.font = '38px "Comic Sans MS", "Segoe Print", cursive';
    ctx.fillText('Tiempo: 8 minutos', 60, 160);
    ctx.fillText('Sin celulares — Sin hablar', 60, 220);
    ctx.fillText('Nombre y legajo en la hoja', 60, 280);
    ctx.font = '34px "Comic Sans MS", cursive';
    ctx.fillText('¡Éxitos!', w - 230, h - 50);
  });
  const anchoPiz = 5.2;
  const pizarron = new THREE.Mesh(new THREE.BoxGeometry(anchoPiz, 1.35, 0.04), [
    toon(C.pizarron), toon(C.pizarron), toon(C.pizarron), toon(C.pizarron),
    toon(0xffffff, { map: texPizarron }), toon(C.pizarron),
  ]);
  pizarron.position.set(0, 1.65, zMin + 0.04);
  contorno(pizarron, 0.02);
  grupo.add(pizarron);
  const marco = caja(anchoPiz + 0.12, 0.06, 0.12, C.maderaOscura);
  marco.position.set(0, 0.95, zMin + 0.08);
  grupo.add(marco);
  // tizas en la bandeja
  for (let i = 0; i < 3; i++) {
    const tiza = caja(0.08, 0.015, 0.015, 0xffffff, { borde: 0 });
    tiza.position.set(-1 + i * 0.2, 0.99, zMin + 0.09);
    grupo.add(tiza);
  }

  // ---------- Reloj de pared (arriba del pizarrón, visible desde el banco) ----------
  const reloj = crearReloj();
  reloj.grupo.position.set(0, 2.82, zMin + 0.05);
  grupo.add(reloj.grupo);

  // ---------- Escritorio de la profesora ----------
  const escritorio = new THREE.Group();
  const tapa = caja(1.5, 0.05, 0.75, C.maderaOscura);
  tapa.position.y = 0.76;
  escritorio.add(tapa);
  solidos.push(tapa);
  const frente = caja(1.5, 0.55, 0.04, C.maderaOscura);
  frente.position.set(0, 0.46, 0.33);
  escritorio.add(frente);
  for (const sx of [-1, 1]) {
    const lado = caja(0.04, 0.74, 0.7, C.maderaOscura);
    lado.position.set(sx * 0.72, 0.37, 0);
    escritorio.add(lado);
  }
  // pila de libros y una taza
  const colores = [0x3e5a8a, 0x8a7a3e, 0x4e7a5a];
  colores.forEach((col, i) => {
    const libro = caja(0.3, 0.05, 0.22, col, { borde: 0.006 });
    libro.position.set(-0.45, 0.81 + i * 0.05, -0.05);
    libro.rotation.y = (i - 1) * 0.15;
    escritorio.add(libro);
  });
  const taza = cilindro(0.045, 0.04, 0.1, 0xe8e8e8, { borde: 0.006 });
  taza.position.set(0.5, 0.84, 0.05);
  escritorio.add(taza);
  // El frente cerrado (z local positivo) queda del lado de los alumnos
  escritorio.position.set(-1.6, 0, zMin + 2.1);
  grupo.add(escritorio);
  const sillaProfe = crearSilla();
  sillaProfe.position.set(-1.6, 0, zMin + 1.4);
  grupo.add(sillaProfe);

  // ---------- Puerta (pared derecha, adelante) ----------
  const puerta = new THREE.Group();
  const hoja = caja(0.06, 2.1, 0.95, C.puerta, { borde: 0.015 });
  hoja.position.y = 1.05;
  puerta.add(hoja);
  const marcoP = caja(0.08, 2.2, 1.1, 0xe7dccb, { borde: 0.01 });
  marcoP.position.set(0.02, 1.1, 0);
  marcoP.scale.x = 0.9;
  puerta.add(marcoP);
  const picaporte = cilindro(0.03, 0.03, 0.14, 0xd8c060, { borde: 0.005 });
  picaporte.rotation.z = Math.PI / 2;
  picaporte.position.set(-0.08, 1.0, -0.36);
  puerta.add(picaporte);
  const visor = caja(0.07, 0.4, 0.3, C.vidrio, { borde: 0.008, mat: new THREE.MeshBasicMaterial({ color: 0xbcd6ea }) });
  visor.position.set(0, 1.6, 0);
  puerta.add(visor);
  puerta.position.set(xMax - 0.05, 0, zMin + 1.4);
  grupo.add(puerta);

  // Cartelera de corcho en el fondo (decoración)
  const corcho = caja(2.2, 1.1, 0.04, 0xc69c6d, { borde: 0.015 });
  corcho.position.set(2.5, 1.7, zMax - 0.03);
  grupo.add(corcho);
  const rndC = aleatorioConSemilla(11);
  for (let i = 0; i < 6; i++) {
    const hojita = caja(0.3, 0.38, 0.01, [0xffffff, 0xfff3a0, 0xbfe3ff][i % 3], { borde: 0.004 });
    hojita.position.set(1.7 + (i % 3) * 0.7 + rndC() * 0.1, 1.95 - Math.floor(i / 3) * 0.5, zMax - 0.06);
    hojita.rotation.z = (rndC() - 0.5) * 0.2;
    grupo.add(hojita);
  }

  // ---------- Bancos en grilla 5 x 5 ----------
  const bancos = [];
  const x0 = -((a.columnas - 1) * a.separacionColumnas) / 2;
  const z0 = -((a.filas - 1) * a.separacionFilas) / 2;
  for (let fila = 0; fila < a.filas; fila++) {
    for (let col = 0; col < a.columnas; col++) {
      const x = x0 + col * a.separacionColumnas;
      const z = z0 + fila * a.separacionFilas;
      const banco = crearBanco();
      banco.grupo.position.set(x, 0, z);
      grupo.add(banco.grupo);
      solidos.push(banco.tapa);
      const silla = crearSilla();
      silla.position.set(x, 0, z + a.offsetSillaZ);
      grupo.add(silla);
      bancos.push({
        col,
        fila, // 0 = adelante, filas-1 = fondo
        posicion: new THREE.Vector3(x, a.alturaBanco, z), // centro de la tapa
        asiento: new THREE.Vector3(x, 0, z + a.offsetSillaZ), // raíz del alumno sentado
        grupo: banco.grupo,
        tapa: banco.tapa,
        hoja: banco.hoja,
      });
    }
  }
  const medioC = Math.floor(a.columnas / 2);
  const medioF = Math.floor(a.filas / 2);
  const buscarBanco = (col, fila) => bancos.find((b) => b.col === col && b.fila === fila);
  const bancoCentral = buscarBanco(medioC, medioF);

  // ---------- Luces: mañana entrando por las ventanas de la izquierda ----------
  const hemi = new THREE.HemisphereLight(0xe4ecff, 0x9a8468, 1.6);
  grupo.add(hemi);
  const sol = new THREE.DirectionalLight(0xfff0d2, 2.6);
  sol.position.set(xMin - 6, 7, centroZ + 2);
  sol.target.position.set(1.5, 0, centroZ - 1);
  sol.castShadow = true;
  sol.shadow.mapSize.set(2048, 2048);
  const sc = sol.shadow.camera;
  sc.left = -10; sc.right = 10; sc.top = 10; sc.bottom = -10; sc.near = 1; sc.far = 30;
  sol.shadow.bias = -0.0008;
  sol.shadow.normalBias = 0.02;
  grupo.add(sol, sol.target);
  // Relleno suave desde el techo para que el lado de la puerta no quede oscuro
  const relleno = new THREE.DirectionalLight(0xfff8ee, 0.7);
  relleno.position.set(3, 8, 2);
  grupo.add(relleno);

  return {
    grupo,
    bancos,
    bancoCentral,
    buscarBanco,
    solidos,
    reloj,
    limites: { xMin, xMax, zMin, zMax, alto },
    escritorioProfe: escritorio.position.clone(),
    pizarron: { x: 0, z: zMin + 0.9 },
    luces: { hemi, sol, relleno },
  };
}

// ---------- Piezas ----------

let texHoja = null;
function texturaHoja() {
  texHoja ??= texturaCanvas(128, 180, (ctx, w, h) => {
    ctx.fillStyle = '#fbfaf4';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#9db7d6';
    for (let y = 30; y < h; y += 9) ctx.fillRect(8, y, w - 16, 1);
    ctx.fillStyle = '#333';
    ctx.fillRect(10, 10, 60, 4);
  });
  return texHoja;
}

// Línea de contorno de bancos y sillas (más fina que la del resto: tapas y asientos tienen 2-3,5 cm de espesor)
const BORDE_MUEBLES = 0.003;

function crearBanco() {
  const grupo = new THREE.Group();
  const tapa = caja(0.72, 0.035, 0.5, C.maderaBanco, { borde: BORDE_MUEBLES });
  tapa.position.y = 0.74;
  tapa.name = 'tapaBanco';
  grupo.add(tapa);
  // hoja del examen apoyada sobre la tapa
  const hoja = new THREE.Mesh(new THREE.PlaneGeometry(0.21, 0.297), toon(0xffffff, { map: texturaHoja() }));
  hoja.rotation.x = -Math.PI / 2;
  hoja.rotation.z = (Math.random() - 0.5) * 0.15;
  hoja.position.set(0, 0.759, 0.02);
  hoja.receiveShadow = true;
  hoja.name = 'hoja';
  grupo.add(hoja);
  // estante abajo de la tapa (donde se abren los papelitos)
  const estante = caja(0.66, 0.02, 0.36, C.metal, { borde: BORDE_MUEBLES });
  estante.position.set(0, 0.6, -0.05);
  grupo.add(estante);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const pata = cilindro(0.014, 0.014, 0.72, C.metal, { segmentos: 6, borde: 0 });
      pata.position.set(sx * 0.32, 0.36, sz * 0.21);
      grupo.add(pata);
    }
  }
  return { grupo, tapa, hoja };
}

// Medidas del asiento (la cola de los personajes sentados se apoya sobre él: ver AutoRig.apoyarEnAsiento)
export const ASIENTO = { ancho: 0.42, fondo: 0.4, espesor: 0.03, altura: 0.45 };
ASIENTO.tope = ASIENTO.altura + ASIENTO.espesor / 2;

function crearSilla() {
  const grupo = new THREE.Group();
  const asiento = caja(ASIENTO.ancho, ASIENTO.espesor, ASIENTO.fondo, C.maderaBanco, { borde: BORDE_MUEBLES });
  asiento.position.y = ASIENTO.altura;
  grupo.add(asiento);
  const respaldo = caja(0.42, 0.26, 0.03, C.maderaBanco, { borde: BORDE_MUEBLES });
  respaldo.position.set(0, 0.78, 0.2);
  respaldo.rotation.x = -0.08;
  grupo.add(respaldo);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const pata = cilindro(0.012, 0.012, 0.45, C.metal, { segmentos: 6, borde: 0 });
      pata.position.set(sx * 0.18, 0.225, sz * 0.17);
      grupo.add(pata);
    }
    const parante = cilindro(0.012, 0.012, 0.35, C.metal, { segmentos: 6, borde: 0 });
    parante.position.set(sx * 0.18, 0.62, 0.19);
    grupo.add(parante);
  }
  return grupo;
}

function construirParedConVentanas(grupo, solidos, { x, zMin, zMax, alto, matPared }) {
  const profundidad = zMax - zMin;
  // Ventanas: 3 huecos entre y = 1.0 y 2.6
  const vAbajo = 1.0;
  const vArriba = 2.6;
  const huecos = [
    [zMin + 1.6, zMin + 3.6],
    [zMin + 5.0, zMin + 7.0],
    [zMin + 8.4, zMin + 10.4],
  ];
  const ponerPanel = (z1, z2, y1, y2) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(z2 - z1, y2 - y1), matPared);
    m.rotation.y = Math.PI / 2;
    m.position.set(x, (y1 + y2) / 2, (z1 + z2) / 2);
    m.receiveShadow = true;
    grupo.add(m);
    solidos.push(m);
  };
  // franja inferior y superior completas
  ponerPanel(zMin, zMax, 0, vAbajo);
  ponerPanel(zMin, zMax, vArriba, alto);
  // columnas entre ventanas
  let zAnterior = zMin;
  for (const [z1, z2] of huecos) {
    ponerPanel(zAnterior, z1, vAbajo, vArriba);
    zAnterior = z2;
  }
  ponerPanel(zAnterior, zMax, vAbajo, vArriba);
  // Zócalo de la pared izquierda
  const zoc = new THREE.Mesh(new THREE.PlaneGeometry(profundidad, 0.9), toon(C.zocalo));
  zoc.rotation.y = Math.PI / 2;
  zoc.position.set(x + 0.005, 0.45, (zMin + zMax) / 2);
  grupo.add(zoc);

  // Vidrios luminosos (cielo de mañana) con marco blanco y travesaños
  const matCielo = new THREE.MeshBasicMaterial({ color: 0xd9ecff });
  for (const [z1, z2] of huecos) {
    const w = z2 - z1;
    const zc = (z1 + z2) / 2;
    const yc = (vAbajo + vArriba) / 2;
    const vidrio = new THREE.Mesh(new THREE.PlaneGeometry(w, vArriba - vAbajo), matCielo);
    vidrio.rotation.y = Math.PI / 2;
    vidrio.position.set(x - 0.05, yc, zc);
    grupo.add(vidrio);
    const travesanoH = caja(0.08, 0.06, w, C.marcoVentana, { sombra: true, borde: 0.006 });
    travesanoH.position.set(x + 0.02, yc, zc);
    grupo.add(travesanoH);
    const travesanoV = caja(0.08, vArriba - vAbajo, 0.06, C.marcoVentana, { sombra: true, borde: 0.006 });
    travesanoV.position.set(x + 0.02, yc, zc);
    grupo.add(travesanoV);
    for (const zz of [z1, z2]) {
      const lado = caja(0.12, vArriba - vAbajo + 0.1, 0.08, C.marcoVentana, { borde: 0.008 });
      lado.position.set(x + 0.02, yc, zz);
      grupo.add(lado);
    }
    for (const yy of [vAbajo, vArriba]) {
      const lado = caja(0.16, 0.08, w + 0.1, C.marcoVentana, { borde: 0.008 });
      lado.position.set(x + 0.04, yy, zc);
      grupo.add(lado);
    }
  }
}

function crearReloj() {
  const grupo = new THREE.Group();
  const tex = texturaCanvas(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#fbfaf5';
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, w / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#222';
    ctx.font = 'bold 30px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 1; i <= 12; i++) {
      const ang = (i / 12) * Math.PI * 2;
      ctx.fillText(String(i), w / 2 + Math.sin(ang) * 98, h / 2 - Math.cos(ang) * 98);
    }
  });
  const cara = new THREE.Mesh(new THREE.CircleGeometry(0.22, 32), toon(0xffffff, { map: tex }));
  cara.position.z = 0.03;
  grupo.add(cara);
  const aro = cilindro(0.25, 0.25, 0.05, 0x333333, { segmentos: 32, borde: 0.008 });
  aro.rotation.x = Math.PI / 2;
  grupo.add(aro);
  const aguja = (largo, grosor, color, z) => {
    const pivote = new THREE.Group();
    const m = new THREE.Mesh(new THREE.BoxGeometry(grosor, largo, 0.005), new THREE.MeshBasicMaterial({ color }));
    m.position.y = largo / 2;
    pivote.add(m);
    pivote.position.z = z;
    grupo.add(pivote);
    return pivote;
  };
  const horas = aguja(0.11, 0.018, 0x111111, 0.035);
  const minutos = aguja(0.17, 0.012, 0x111111, 0.04);
  const segundos = aguja(0.18, 0.005, 0xb02020, 0.045);

  // La hora del reloj arranca a las 8:00 y avanza con el tiempo del examen
  const actualizar = (segundosExamen) => {
    const total = 8 * 3600 + segundosExamen;
    segundos.rotation.z = -((total % 60) / 60) * Math.PI * 2;
    minutos.rotation.z = -(((total / 60) % 60) / 60) * Math.PI * 2;
    horas.rotation.z = -(((total / 3600) % 12) / 12) * Math.PI * 2;
  };
  actualizar(0);
  return { grupo, actualizar };
}
