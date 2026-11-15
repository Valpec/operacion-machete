import * as THREE from 'three';
import { toon, caja, cilindro, esfera, contorno, texturaCanvas } from '../world/materiales.js';
import { crearPersonaje } from '../characters/Personaje.js';
import { PERSONAJES } from '../characters/config.js';

// Padres: siluetas sin rostro (placeholders). Nunca se les ve la cara: quedan fuera de cuadro,
// a contraluz o desenfocados, como si el chico no pudiera levantar la vista.
export const PADRES = {
  madre: {
    tipo: 'placeholder',
    postura: 'parado',
    buzo: 0x5b4152,
    pollera: 0x2c2a33,
    pantalon: 0x3a3236,
    piel: 0xd9b394,
    pelo: { estilo: 'largo', color: 0x2a1d17 },
    sinRostro: true,
    // Reutiliza el modelo de Sofi (la cara no se ve nunca), con otra remera y otro pelo
    modelo: { ruta: '/modelos/amiga2.glb', altura: 1.7, rotacionY: Math.PI, remera: 0x5b4152, pelo: 0x2a1d17 },
  },
  padre: {
    tipo: 'placeholder',
    postura: 'parado',
    buzo: 0x34404d,
    pantalon: 0x24252b,
    piel: 0xc79a77,
    pelo: { estilo: 'corto', color: 0x1d1714 },
    sinRostro: true,
    // Reutiliza el modelo de Tomi (la cara no se ve nunca), con otra remera y otro pelo
    modelo: { ruta: '/modelos/amigo1.glb', altura: 1.86, rotacionY: Math.PI, remera: 0x34404d, pelo: 0x1d1714 },
  },
};

// Textura de hoja con renglones y garabatos (los apuntes que tapan la mesa)
function texturaApunte(semilla, conTitulo) {
  return texturaCanvas(256, 340, (ctx, w, h) => {
    let s = semilla;
    const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    ctx.fillStyle = '#f7f4ea';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#9fb8d8';
    ctx.lineWidth = 1.5;
    for (let y = 40; y < h; y += 18) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.strokeStyle = '#e09090';
    ctx.beginPath();
    ctx.moveTo(30, 0);
    ctx.lineTo(30, h);
    ctx.stroke();
    ctx.strokeStyle = '#2a2a55';
    ctx.lineWidth = 2;
    for (let y = 40 + 14; y < h - 10; y += 18) {
      let x = 36 + r() * 10;
      const fin = w - 15 - r() * 60;
      ctx.beginPath();
      ctx.moveTo(x, y);
      while (x < fin) {
        x += 4 + r() * 8;
        ctx.lineTo(x, y - r() * 6);
      }
      ctx.stroke();
    }
    if (conTitulo) {
      ctx.fillStyle = '#c0392b';
      ctx.font = 'bold 26px "Comic Sans MS", cursive';
      ctx.fillText(conTitulo, 40, 32);
    }
    // Resaltador
    ctx.fillStyle = 'rgba(255, 230, 60, 0.45)';
    ctx.fillRect(36, 40 + 18 * (2 + Math.floor(r() * 8)) - 4, 150, 14);
  });
}

// Textura del celular: apagado o con la notificación del grupo
export function dibujarPantallaCelular(ctx, w, h, { encendida, texto, hora = '23:47' }) {
  ctx.fillStyle = encendida ? '#141b26' : '#050608';
  ctx.fillRect(0, 0, w, h);
  if (!encendida) return;
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#203250');
  grad.addColorStop(1, '#0d1420');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.font = '300 70px system-ui, sans-serif';
  ctx.fillText(hora, w / 2, 120);
  // Tarjeta de notificación
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  const y = 190;
  ctx.beginPath();
  ctx.roundRect(16, y, w - 32, 120, 18);
  ctx.fill();
  ctx.textAlign = 'left';
  ctx.fillStyle = '#1b1b1f';
  ctx.font = 'bold 22px system-ui, sans-serif';
  ctx.fillText('Operación Machete 📝', 34, y + 36);
  ctx.font = '20px system-ui, sans-serif';
  const lineas = texto.split('\n');
  lineas.forEach((l, i) => ctx.fillText(l, 34, y + 68 + i * 26));
}

/**
 * Arma el comedor de la casa del protagonista: noche, una lámpara cálida sobre la mesa
 * tapada de apuntes, y el resto de la casa en penumbra.
 * El chico se sienta en z = 0.85 mirando hacia -Z (hacia la mesa).
 */
export function crearComedor() {
  const escena = new THREE.Scene();
  escena.background = new THREE.Color(0x0b0d14);
  escena.fog = new THREE.Fog(0x0b0d14, 5, 11);

  // ---------- Luces ----------
  escena.add(new THREE.HemisphereLight(0x46506e, 0x1a1410, 0.55));
  const lampara = new THREE.SpotLight(0xffd29a, 20, 6, 1.05, 0.6, 1.3);
  lampara.position.set(0, 1.95, 0.2);
  lampara.target.position.set(0, 0.7, 0.45);
  lampara.castShadow = true;
  lampara.shadow.mapSize.set(1024, 1024);
  lampara.shadow.bias = -0.0008;
  escena.add(lampara, lampara.target);
  // Luz fría de la ventana (noche) y un relleno muy tenue desde la cocina
  const luna = new THREE.DirectionalLight(0x6d86c4, 0.55);
  luna.position.set(-4, 2.5, -1);
  escena.add(luna);
  // Rebote cálido de la mesa sobre la cara y el buzo del chico
  const rebote = new THREE.PointLight(0xffc68a, 0.55, 1.4, 1.5);
  rebote.position.set(0, 0.95, 0.35);
  escena.add(rebote);
  const cocina = new THREE.PointLight(0xffb070, 3, 4.5, 1.6);
  cocina.position.set(1.9, 1.7, 2.7);
  escena.add(cocina);

  // ---------- Piso y paredes ----------
  const texPiso = texturaCanvas(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#6b5442';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#5a4637';
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) if ((x + y) % 2) ctx.fillRect(x * 64, y * 64, 64, 64);
    ctx.strokeStyle = '#3a2c22';
    ctx.lineWidth = 2;
    for (let i = 0; i <= 4; i++) {
      ctx.beginPath(); ctx.moveTo(i * 64, 0); ctx.lineTo(i * 64, h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * 64); ctx.lineTo(w, i * 64); ctx.stroke();
    }
  });
  texPiso.wrapS = texPiso.wrapT = THREE.RepeatWrapping;
  texPiso.repeat.set(4, 4);
  const piso = new THREE.Mesh(new THREE.PlaneGeometry(8, 7), toon(0xffffff, { map: texPiso }));
  piso.rotation.x = -Math.PI / 2;
  piso.position.z = 0.4;
  piso.receiveShadow = true;
  escena.add(piso);

  const texPapel = texturaCanvas(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#7f7363';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#756a5b';
    for (let x = 0; x < w; x += 32) ctx.fillRect(x, 0, 14, h);
  });
  texPapel.wrapS = texPapel.wrapT = THREE.RepeatWrapping;
  texPapel.repeat.set(6, 2);
  const matPared = toon(0xffffff, { map: texPapel });
  const pared = (w, h, x, z, ry) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), matPared);
    m.position.set(x, h / 2, z);
    m.rotation.y = ry;
    m.receiveShadow = true;
    escena.add(m);
    return m;
  };
  pared(8, 2.7, 0, -2.6, 0);
  pared(8, 2.7, 0, 3.0, Math.PI);
  pared(7, 2.7, -3.4, 0.4, Math.PI / 2);
  pared(7, 2.7, 3.4, 0.4, -Math.PI / 2);
  // Zócalo
  for (const [x, z, ry, w] of [[0, -2.59, 0, 8], [0, 2.99, Math.PI, 8], [-3.39, 0.4, Math.PI / 2, 7], [3.39, 0.4, -Math.PI / 2, 7]]) {
    const z0 = caja(w, 0.12, 0.02, 0x3a2c22, { borde: 0 });
    z0.position.set(x, 0.06, z);
    z0.rotation.y = ry;
    escena.add(z0);
  }

  // Ventana (noche) con cortinas, en la pared izquierda
  const vidrio = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.1), new THREE.MeshBasicMaterial({ color: 0x1b2a4a }));
  vidrio.position.set(-3.38, 1.45, -0.6);
  vidrio.rotation.y = Math.PI / 2;
  escena.add(vidrio);
  for (const dz of [-0.85, 0.85]) {
    const cortina = caja(0.05, 1.6, 0.45, 0x4a3348, { borde: 0.008 });
    cortina.position.set(-3.33, 1.35, -0.6 + dz);
    escena.add(cortina);
  }

  // Puerta a la cocina (iluminada) detrás del chico
  const vano = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 2.05), new THREE.MeshBasicMaterial({ color: 0x8a6a46 }));
  vano.position.set(1.9, 1.03, 2.98);
  vano.rotation.y = Math.PI;
  escena.add(vano);
  const marco = caja(1.1, 2.15, 0.06, 0x3e2e22, { borde: 0.008 });
  marco.position.set(1.9, 1.07, 3.0);
  escena.add(marco);
  vano.position.z = 2.96;

  // Mueble con fotos y un reloj (el tic-tac marca el tiempo que se le escapa)
  const mueble = caja(1.6, 0.85, 0.42, 0x4a3628, { borde: 0.01 });
  mueble.position.set(-1.4, 0.425, 2.75);
  escena.add(mueble);
  for (let i = 0; i < 3; i++) {
    const foto = caja(0.18, 0.24, 0.02, 0xc9b38a, { borde: 0.005 });
    foto.position.set(-1.9 + i * 0.36, 0.98, 2.68);
    foto.rotation.set(-0.12, Math.PI + (i - 1) * 0.15, 0);
    escena.add(foto);
  }
  const reloj = new THREE.Group();
  const esfReloj = cilindro(0.17, 0.17, 0.04, 0xf2ead8, { segmentos: 28, borde: 0.01 });
  esfReloj.rotation.x = Math.PI / 2;
  reloj.add(esfReloj);
  const agujas = [];
  for (const [largo, grosor] of [[0.1, 0.012], [0.14, 0.008]]) {
    const pivote = new THREE.Group();
    const aguja = new THREE.Mesh(new THREE.BoxGeometry(grosor, largo, 0.005), new THREE.MeshBasicMaterial({ color: 0x1a1a1a }));
    aguja.position.y = largo / 2;
    pivote.add(aguja);
    pivote.position.z = -0.025;
    reloj.add(pivote);
    agujas.push(pivote);
  }
  reloj.position.set(-0.6, 1.85, 2.97);
  reloj.rotation.y = Math.PI;
  escena.add(reloj);
  agujas[0].rotation.z = -Math.PI * 2 * (11.78 / 12);
  agujas[1].rotation.z = -Math.PI * 2 * (47 / 60);

  // ---------- Mesa y sillas ----------
  const mesa = new THREE.Group();
  const tapa = caja(1.8, 0.04, 1.0, 0x6b4426, { borde: 0.01 });
  tapa.position.y = 0.75;
  mesa.add(tapa);
  for (const [x, z] of [[-0.82, -0.42], [0.82, -0.42], [-0.82, 0.42], [0.82, 0.42]]) {
    const pata = caja(0.06, 0.73, 0.06, 0x553520, { borde: 0.006 });
    pata.position.set(x, 0.365, z);
    mesa.add(pata);
  }
  // Mantel individual bajo el plato
  const individual = caja(0.42, 0.004, 0.3, 0x7d2f2f, { borde: 0, sombra: false });
  individual.position.set(0, 0.772, 0.3);
  mesa.add(individual);
  escena.add(mesa);

  const silla = (x, z, ry) => {
    const g = new THREE.Group();
    const asiento = caja(0.44, 0.04, 0.42, 0x5c3a22, { borde: 0.008 });
    asiento.position.y = 0.46;
    g.add(asiento);
    const respaldo = caja(0.44, 0.5, 0.04, 0x5c3a22, { borde: 0.008 });
    respaldo.position.set(0, 0.73, 0.2);
    g.add(respaldo);
    for (const [px, pz] of [[-0.19, -0.18], [0.19, -0.18], [-0.19, 0.18], [0.19, 0.18]]) {
      const pata = caja(0.035, 0.46, 0.035, 0x4a2e1b, { borde: 0.005 });
      pata.position.set(px, 0.23, pz);
      g.add(pata);
    }
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    escena.add(g);
    return g;
  };
  silla(0, 0.88, 0);                // la del chico
  silla(0, -0.85, Math.PI);         // enfrente (vacía)
  silla(-1.15, 0, -Math.PI / 2);    // cabeceras (vacías: los padres no se sientan)
  silla(1.15, 0, Math.PI / 2);

  // ---------- Cena ----------
  const plato = cilindro(0.135, 0.11, 0.018, 0xf4f1ea, { segmentos: 28, borde: 0.005 });
  plato.position.set(0, 0.782, 0.3);
  escena.add(plato);
  const milanesa = esfera(0.075, 0xc68a3c, { segmentos: 14, borde: 0.005 });
  milanesa.scale.set(1.2, 0.18, 0.85);
  milanesa.position.set(-0.03, 0.8, 0.29);
  escena.add(milanesa);
  const pure = esfera(0.045, 0xf1dd96, { segmentos: 14, borde: 0.005 });
  pure.scale.set(1, 0.55, 1);
  pure.position.set(0.06, 0.8, 0.33);
  escena.add(pure);
  const vaso = cilindro(0.035, 0.03, 0.12, 0xa9c7d8, { segmentos: 14, borde: 0.004, mat: toon(0xa9c7d8, { transparent: true, opacity: 0.55 }) });
  vaso.position.set(0.24, 0.83, 0.12);
  escena.add(vaso);

  // ---------- Apuntes: la mesa está tapada ----------
  const apuntes = [
    [-0.42, 0.25, 0.3, true, 'Unidad 3'], [-0.55, 0.05, -0.4, false], [-0.3, -0.1, 0.9, false],
    [0.45, 0.2, -0.25, true, 'PARCIAL'], [0.6, -0.05, 0.5, false], [0.15, -0.25, 0.15, false],
    [-0.12, -0.32, -0.7, false], [0.4, -0.35, 1.2, false],
  ];
  apuntes.forEach(([x, z, rot, titulo, texto], i) => {
    const hoja = new THREE.Mesh(new THREE.PlaneGeometry(0.21, 0.29), toon(0xffffff, { map: texturaApunte(i * 97 + 13, titulo ? texto : null), unico: true }));
    hoja.rotation.set(-Math.PI / 2, 0, rot);
    hoja.position.set(x, 0.772 + i * 0.0012, z);
    hoja.receiveShadow = true;
    escena.add(hoja);
  });
  const carpeta = caja(0.24, 0.035, 0.32, 0x2f4f8a, { borde: 0.006 });
  carpeta.position.set(-0.62, 0.79, -0.2);
  carpeta.rotation.y = 0.25;
  escena.add(carpeta);
  const postit = new THREE.Mesh(
    new THREE.PlaneGeometry(0.08, 0.08),
    toon(0xffffff, {
      unico: true,
      map: texturaCanvas(96, 96, (ctx) => {
        ctx.fillStyle = '#ffe14d';
        ctx.fillRect(0, 0, 96, 96);
        ctx.fillStyle = '#b03020';
        ctx.font = 'bold 20px "Comic Sans MS", cursive';
        ctx.fillText('PARCIAL', 8, 40);
        ctx.fillText('8:00 !!', 14, 70);
      }),
    }),
  );
  postit.rotation.set(-Math.PI / 2, 0, 0.35);
  postit.position.set(-0.6, 0.809, -0.24);
  escena.add(postit);
  const resaltador = cilindro(0.008, 0.008, 0.12, 0xf4e04d, { borde: 0.003 });
  resaltador.rotation.set(Math.PI / 2, 0, 0.6);
  resaltador.position.set(0.3, 0.782, -0.05);
  escena.add(resaltador);
  const calculadora = caja(0.08, 0.012, 0.14, 0x2a2a30, { borde: 0.004 });
  calculadora.position.set(0.62, 0.782, 0.25);
  calculadora.rotation.y = -0.3;
  escena.add(calculadora);

  // ---------- Celular (boca arriba, al lado del plato) ----------
  const celular = new THREE.Group();
  const cuerpo = caja(0.075, 0.009, 0.155, 0x16161a, { borde: 0.003 });
  celular.add(cuerpo);
  let ctxPantalla = null;
  const texPantalla = texturaCanvas(360, 740, (ctx) => {
    ctxPantalla = ctx;
    dibujarPantallaCelular(ctx, 360, 740, { encendida: false });
  });
  const pantalla = new THREE.Mesh(new THREE.PlaneGeometry(0.068, 0.145), new THREE.MeshBasicMaterial({ map: texPantalla, toneMapped: false }));
  pantalla.rotation.x = -Math.PI / 2;
  pantalla.position.y = 0.0051;
  celular.add(pantalla);
  celular.position.set(0.27, 0.778, 0.36);
  celular.rotation.y = -0.18;
  escena.add(celular);
  const luzCelular = new THREE.PointLight(0x9fc0ff, 0, 0.9, 2);
  luzCelular.position.set(0.27, 0.86, 0.36);
  escena.add(luzCelular);
  celular.userData = {
    encender: (texto) => {
      dibujarPantallaCelular(ctxPantalla, 360, 740, { encendida: true, texto });
      texPantalla.needsUpdate = true;
      luzCelular.intensity = 1.2;
    },
    apagar: () => {
      dibujarPantallaCelular(ctxPantalla, 360, 740, { encendida: false });
      texPantalla.needsUpdate = true;
      luzCelular.intensity = 0;
    },
  };

  // ---------- Personajes ----------
  // El protagonista con su modelo completo (en el aula sólo se ven sus brazos)
  const cfgProta = { ...PERSONAJES.protagonista, soloBrazos: false };
  cfgProta.modelo = { ...cfgProta.modelo, alturaCadera: 0.52, offsetCaderaZ: 0.04, contorno: 0.008 };
  const chico = crearPersonaje(cfgProta, 'protagonista-intro');
  chico.raiz.position.set(0, 0, 0.88);
  escena.add(chico.raiz);
  // Tenedor en la mano derecha
  const tenedor = new THREE.Group();
  const mango = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.15, 0.004), toon(0xb8bcc4));
  mango.position.y = -0.06;
  tenedor.add(mango);
  for (let i = 0; i < 3; i++) {
    const diente = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.04, 0.003), toon(0xb8bcc4));
    diente.position.set((i - 1) * 0.006, -0.15, 0);
    tenedor.add(diente);
  }
  tenedor.rotation.set(-0.9, 0, 0);
  tenedor.position.set(0, -0.07, -0.015);
  chico.rig.brazoD.muneca.add(tenedor);

  const madre = crearPersonaje(PADRES.madre, 'madre');
  const padre = crearPersonaje(PADRES.padre, 'padre');
  escena.add(madre.raiz, padre.raiz);
  for (const p of [madre, padre]) {
    p.animador.poseInicial('parado');
    p.animador.faseCaminar = Math.random() * 6;
  }

  return { escena, chico, madre, padre, celular, plato, lampara, reloj, agujas, tenedor };
}
