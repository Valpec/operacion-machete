import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { toon, contorno, RAMPA, COLOR_CONTORNO } from '../world/materiales.js';
import { Animador } from './animaciones.js';
import { autoRig, apoyarEnAsiento } from './AutoRig.js';
import { ASIENTO } from '../world/Aula.js';
import { poseSenia } from './Manos.js';

// Medidas base del placeholder (en metros)
const M = {
  caderaSentado: 0.5,
  caderaParado: 0.95,
  radioTorso: 0.16,
  largoTorso: 0.3,
  altoHombro: 0.55,
  anchoHombro: 0.21,
  altoCuello: 0.64,
  radioCabeza: 0.12,
  largoBrazo: 0.27,
  largoAntebrazo: 0.25,
  radioBrazo: 0.045,
};

const loader = new GLTFLoader();

// Modelos precargados (ruta -> gltf). Se llenan con precargarModelos() antes de armar el elenco,
// así los personajes se construyen con su esqueleto de una vez y los sistemas que cuelgan cosas
// de las manos (cartelito, papelito, lapicera) ya encuentran las articulaciones definitivas.
const cacheModelos = new Map();

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const _v5 = new THREE.Vector3();

export async function precargarModelos(rutas, alProgresar) {
  let listos = 0;
  await Promise.all(
    [...new Set(rutas)].map(
      (ruta) =>
        new Promise((resolver) => {
          loader.load(
            ruta,
            (gltf) => {
              cacheModelos.set(ruta, gltf);
              alProgresar?.(++listos, rutas.length);
              resolver();
            },
            undefined,
            (err) => {
              console.warn(`No se pudo cargar ${ruta}; ese personaje queda como placeholder.`, err);
              alProgresar?.(++listos, rutas.length);
              resolver();
            },
          );
        }),
    ),
  );
}

/**
 * Fábrica de personajes.
 *   crearPersonaje({ tipo: 'placeholder', ...config })
 *   crearPersonaje({ tipo: 'glb', ruta: '/modelos/x.glb', ... })
 * Siempre devuelve un Personaje con la misma interfaz (raiz, animador, mostrarDedos, etc.).
 */
export function crearPersonaje(config, nombre = 'personaje') {
  const p = new Personaje(config, nombre);
  const gltf = config.modelo && cacheModelos.get(config.modelo.ruta);
  if (gltf && config.modelo.rig !== false) {
    // Modelo estático + esqueleto generado por código (ver AutoRig.js)
    try {
      p.construirConModelo(config, gltf);
      return p;
    } catch (e) {
      console.warn(`No se pudo armar el esqueleto de ${config.modelo.ruta}; queda el placeholder.`, e);
      p.raiz.clear();
      p.rig = {};
    }
  }
  if (config.tipo === 'glb') p.cargarGLB(config);
  else p.construirPlaceholder(config);
  // Modelo estático sin esqueleto como "piel" (modo viejo: rig: false)
  if (config.modelo && config.modelo.rig === false) p.cargarModeloEstatico(config.modelo);
  return p;
}

export class Personaje {
  constructor(config, nombre) {
    this.config = config;
    this.nombre = nombre;
    this.raiz = new THREE.Group();
    this.raiz.name = nombre;
    this.raiz.userData.personaje = this;
    this.rig = {};
    this.mixer = null;
    this.animador = new Animador(this);
  }

  // ---------- Placeholder hecho con primitivas ----------
  construirPlaceholder(cfg) {
    const sentado = cfg.postura === 'sentado';
    const matBuzo = toon(cfg.buzo);
    const matPiel = toon(cfg.piel);
    const matPantalon = toon(cfg.pantalon ?? 0x3b4a66);

    const cadera = new THREE.Group();
    cadera.position.y = sentado ? M.caderaSentado : M.caderaParado;
    this.raiz.add(cadera);
    this.rig.cadera = cadera;

    // Torso (pivote en la cadera para poder inclinarlo)
    const torso = new THREE.Group();
    cadera.add(torso);
    this.rig.torso = torso;

    if (!cfg.soloBrazos) {
      const cuerpo = new THREE.Mesh(new THREE.CapsuleGeometry(M.radioTorso, M.largoTorso, 6, 14), matBuzo);
      cuerpo.position.y = M.radioTorso + M.largoTorso / 2;
      cuerpo.scale.z = 0.8;
      cuerpo.castShadow = true;
      contorno(cuerpo, 0.012);
      torso.add(cuerpo);
      this.construirPiernas(cfg, sentado, matPantalon);
      this.construirCabeza(cfg, torso, matPiel, matBuzo);
    }

    this.rig.brazoI = this.construirBrazo(torso, -1, matBuzo, matPiel, cfg);
    this.rig.brazoD = this.construirBrazo(torso, 1, matBuzo, matPiel, cfg);

    // contorno: 0 en config.js -> se quitan las líneas negras del muñeco
    if (cfg.contorno === 0) {
      const bordes = [];
      this.raiz.traverse((o) => o.userData.esContorno && bordes.push(o));
      bordes.forEach((o) => o.removeFromParent());
    }

    if (cfg.escala) this.raiz.scale.setScalar(cfg.escala);
    this.animador.poseInicial(sentado ? (cfg.soloBrazos ? 'manosEnBanco' : 'sentado') : 'parado');
  }

  construirPiernas(cfg, sentado, matPantalon) {
    const zapato = toon(0x26242a);
    for (const lado of [-1, 1]) {
      if (sentado) {
        const muslo = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.3, 4, 8), matPantalon);
        muslo.rotation.x = Math.PI / 2;
        muslo.position.set(lado * 0.09, M.caderaSentado + 0.02, -0.2);
        muslo.castShadow = true;
        contorno(muslo, 0.01);
        this.raiz.add(muslo);
        const pierna = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.38, 4, 8), matPantalon);
        pierna.position.set(lado * 0.09, 0.27, -0.4);
        pierna.castShadow = true;
        contorno(pierna, 0.01);
        this.raiz.add(pierna);
        const pie = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.2), zapato);
        pie.position.set(lado * 0.09, 0.04, -0.46);
        contorno(pie, 0.008);
        this.raiz.add(pie);
      } else {
        // Pivote en la cadera para poder balancear la pierna al caminar
        const pivote = new THREE.Group();
        const altoPivote = M.caderaParado - 0.05;
        pivote.position.set(lado * 0.085, altoPivote, 0);
        this.raiz.add(pivote);
        this.rig['pierna' + (lado < 0 ? 'I' : 'D')] = pivote;
        const pierna = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, altoPivote - 0.12, 4, 8), matPantalon);
        pierna.position.y = -altoPivote / 2;
        pierna.castShadow = true;
        contorno(pierna, 0.008);
        pivote.add(pierna);
        const pie = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.22), zapato);
        pie.position.set(0, -altoPivote + 0.035, -0.04);
        contorno(pie, 0.008);
        pivote.add(pie);
      }
    }
    if (!sentado && cfg.pollera) {
      const pollera = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.25, 0.55, 16), toon(cfg.pollera));
      pollera.position.y = -0.22;
      pollera.castShadow = true;
      contorno(pollera, 0.012);
      this.rig.cadera.add(pollera);
    }
  }

  construirCabeza(cfg, torso, matPiel, matBuzo) {
    const cuello = new THREE.Group();
    cuello.position.y = M.altoCuello;
    torso.add(cuello);
    this.rig.cuello = cuello;

    const cuelloMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.1, 8), matPiel);
    cuelloMesh.position.y = 0.02;
    cuello.add(cuelloMesh);

    const cabeza = new THREE.Group();
    cabeza.position.y = 0.13;
    cabeza.rotation.order = 'YXZ';
    cuello.add(cabeza);
    this.rig.cabeza = cabeza;

    const r = M.radioCabeza;
    const craneo = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 14), matPiel);
    craneo.castShadow = true;
    contorno(craneo, 0.01);
    cabeza.add(craneo);

    // Ojos y nariz: dejan leer hacia dónde mira (clave para la profesora).
    // sinRostro: los padres de la intro no tienen cara (el chico no puede ni mirarlos)
    const matOjo = new THREE.MeshBasicMaterial({ color: 0x15121a });
    for (const lado of cfg.sinRostro ? [] : [-1, 1]) {
      const ojo = new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 6), matOjo);
      ojo.position.set(lado * 0.045, 0.015, -r * 0.93);
      cabeza.add(ojo);
    }
    if (!cfg.sinRostro) {
      const nariz = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), matPiel);
      nariz.position.set(0, -0.015, -r * 1.02);
      cabeza.add(nariz);
    }

    if (cfg.pelo) this.construirPelo(cabeza, cfg.pelo, r);
    if (cfg.capucha) {
      const capucha = new THREE.Mesh(
        new THREE.SphereGeometry(r * 1.32, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.62),
        toon(cfg.buzo, { side: THREE.DoubleSide }),
      );
      capucha.rotation.x = 0.55;
      capucha.position.set(0, 0.01, 0.02);
      contorno(capucha, 0.012);
      cabeza.add(capucha);
      // pliegue de la capucha sobre la espalda
      const pliegue = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8), matBuzo);
      pliegue.scale.set(1.2, 0.6, 0.7);
      pliegue.position.set(0, -0.16, 0.1);
      contorno(pliegue, 0.01);
      cabeza.add(pliegue);
    }
    if (cfg.anteojos) {
      const matMarco = new THREE.MeshBasicMaterial({ color: 0x1a1a1a });
      for (const lado of [-1, 1]) {
        const lente = new THREE.Mesh(new THREE.TorusGeometry(0.032, 0.006, 6, 16), matMarco);
        lente.position.set(lado * 0.047, 0.015, -r * 1.0);
        cabeza.add(lente);
      }
      const puente = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.006, 0.006), matMarco);
      puente.position.set(0, 0.02, -r * 1.02);
      cabeza.add(puente);
    }
  }

  construirPelo(cabeza, pelo, r) {
    const mat = toon(pelo.color);
    // Casquete: media esfera inclinada hacia atrás para dejar la frente libre
    const casquete = new THREE.Mesh(new THREE.SphereGeometry(r * 1.08, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), mat);
    casquete.rotation.x = 0.8;
    casquete.castShadow = true;
    contorno(casquete, 0.008);
    cabeza.add(casquete);

    if (pelo.estilo === 'coleta') {
      const coleta = new THREE.Mesh(new THREE.CapsuleGeometry(0.042, 0.2, 4, 8), mat);
      // Cuelga desde la parte de atrás y arriba de la cabeza, hacia abajo y afuera
      coleta.position.set(0, -0.03, r + 0.05);
      coleta.rotation.x = -0.4;
      contorno(coleta, 0.008);
      cabeza.add(coleta);
      this.rig.coleta = coleta;
      const gomita = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.012, 6, 12), toon(0xf05a8a));
      gomita.position.set(0, 0.08, r * 0.95);
      gomita.rotation.x = Math.PI / 2 - 0.4;
      cabeza.add(gomita);
    } else if (pelo.estilo === 'rodete') {
      const rodete = new THREE.Mesh(new THREE.SphereGeometry(0.065, 12, 10), mat);
      rodete.position.set(0, 0.09, r * 0.85);
      contorno(rodete, 0.008);
      cabeza.add(rodete);
    } else if (pelo.estilo === 'largo') {
      const largo = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.2, 4, 12), mat);
      largo.scale.set(1.15, 1, 0.55);
      largo.position.set(0, -0.12, r * 0.55);
      largo.castShadow = true;
      contorno(largo, 0.008);
      cabeza.add(largo);
    }
  }

  construirBrazo(torso, lado, matBuzo, matPiel, cfg) {
    const hombro = new THREE.Group();
    hombro.position.set(lado * M.anchoHombro, M.altoHombro, 0);
    torso.add(hombro);

    const brazo = new THREE.Mesh(new THREE.CapsuleGeometry(M.radioBrazo, M.largoBrazo - M.radioBrazo, 4, 8), matBuzo);
    brazo.position.y = -M.largoBrazo / 2;
    brazo.castShadow = true;
    if (cfg.soloBrazos) brazo.visible = false; // en primera persona sólo se ven antebrazos y manos
    else contorno(brazo, 0.008);
    hombro.add(brazo);

    const codo = new THREE.Group();
    codo.position.y = -M.largoBrazo;
    hombro.add(codo);

    const antebrazo = new THREE.Mesh(
      new THREE.CapsuleGeometry(M.radioBrazo * 0.95, M.largoAntebrazo - M.radioBrazo, 4, 8),
      matBuzo,
    );
    antebrazo.position.y = -M.largoAntebrazo / 2;
    antebrazo.castShadow = true;
    contorno(antebrazo, cfg.soloBrazos ? 0.004 : 0.008);
    codo.add(antebrazo);

    const muneca = new THREE.Group();
    muneca.position.y = -M.largoAntebrazo;
    codo.add(muneca);
    const mano = new THREE.Mesh(new THREE.SphereGeometry(0.048, 12, 10), matPiel);
    mano.scale.set(0.9, 1.1, 0.6);
    mano.position.y = -0.04;
    mano.castShadow = true;
    contorno(mano, cfg.soloBrazos ? 0.004 : 0.007);
    muneca.add(mano);

    // Dedos (para las señas): exagerados para que se lean a distancia
    const dedos = [];
    for (let i = 0; i < 4; i++) {
      const dedo = new THREE.Mesh(new THREE.CapsuleGeometry(0.013, 0.07, 3, 6), matPiel);
      dedo.position.set((i - 1.5) * 0.024 * -lado, -0.12, 0);
      dedo.visible = false;
      contorno(dedo, 0.005);
      muneca.add(dedo);
      dedos.push(dedo);
    }

    let lapicera = null;
    if (cfg.lapicera || cfg.soloBrazos) {
      lapicera = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.11, 6), toon(0x2050c0));
      lapicera.position.set(0, -0.06, -0.03);
      lapicera.rotation.x = Math.PI / 2;
      lapicera.visible = false;
      muneca.add(lapicera);
    }

    return { hombro, codo, muneca, mano, dedos, lapicera, brazo, antebrazo };
  }

  // ---------- Modelo con esqueleto automático ----------
  construirConModelo(cfg, gltf) {
    const m = cfg.modelo;
    const sentado = cfg.postura === 'sentado';
    const { rig, malla, contorno: bordes, articulaciones, manos } = autoRig(this.raiz, gltf.scene, m);
    this.manos = manos; // dedos articulados (null si no se detectaron: queda la mano postiza)
    this.rig = rig;
    this.malla = malla;
    this.mallaContorno = bordes;
    this.articulaciones = articulaciones;
    this.conModelo = true;

    // Lapicera (y mano postiza de respaldo si no se detectaron los dedos del modelo)
    const matPiel = toon(m.piel ?? cfg.piel ?? 0xeec29c);
    for (const [lado, signo] of [['brazoI', -1], ['brazoD', 1]]) {
      const br = rig[lado];
      if (!manos) this.construirManoPostiza(br, signo, matPiel);
      if (cfg.lapicera || cfg.soloBrazos || m.lapicera) {
        const lapicera = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.12, 6), toon(0x2050c0));
        lapicera.position.set(0.01 * signo, -0.075, -0.03);
        lapicera.rotation.x = Math.PI / 2;
        lapicera.visible = false;
        br.muneca.add(lapicera);
        br.lapicera = lapicera;
      }
    }

    // Visión, highlight y oclusión usan una caja simple en vez de la malla con piel (mucho más barato)
    const caja = sentado
      ? new THREE.Box3(new THREE.Vector3(-0.28, 0.35, -0.45), new THREE.Vector3(0.28, 1.32, 0.25))
      : new THREE.Box3(new THREE.Vector3(-0.3, 0, -0.22), new THREE.Vector3(0.3, m.altura, 0.22));
    const inversa = new THREE.Matrix4();
    const rayoLocal = new THREE.Ray();
    const punto = new THREE.Vector3();
    malla.raycast = (raycaster, intersecciones) => {
      inversa.copy(this.raiz.matrixWorld).invert();
      rayoLocal.copy(raycaster.ray).applyMatrix4(inversa);
      if (!rayoLocal.intersectBox(caja, punto)) return;
      punto.applyMatrix4(this.raiz.matrixWorld);
      const distancia = raycaster.ray.origin.distanceTo(punto);
      if (distancia < raycaster.near || distancia > raycaster.far) return;
      intersecciones.push({ distance: distancia, point: punto.clone(), object: malla });
    };

    // Postura: sentado = cadera a la altura del asiento, muslos adelante y piernas abajo
    if (sentado) {
      rig.cadera.position.y = m.alturaCadera ?? 0.52;
      rig.cadera.position.z += m.offsetCaderaZ ?? 0.04;
      // Torso más alto (sentarse derecho): sube el tronco, la cabeza y los brazos; las piernas quedan
      if (m.elevarTorso) rig.torso.position.y += m.elevarTorso;
      // La cola se apoya sobre el asiento en vez de atravesarlo (la raíz está en el centro de la silla)
      if (!cfg.soloBrazos) apoyarEnAsiento(malla.material, ASIENTO);
      for (const [lado, signo] of [['I', -1], ['D', 1]]) {
        rig['pierna' + lado].rotation.set(Math.PI / 2 - 0.05, 0, -signo * 0.06);
        rig['rodilla' + lado].rotation.set(-Math.PI / 2 + 0.12, 0, signo * 0.04);
        rig['tobillo' + lado].rotation.set(-0.05, 0, 0);
      }
    }
    if (cfg.escala) this.raiz.scale.setScalar(cfg.escala);
    // Primera persona: la cabeza no se dibuja (la cámara está ahí)
    if (cfg.soloBrazos) rig.cabeza.scale.setScalar(0.001);
    this.animador.poseInicial(sentado ? (cfg.soloBrazos ? 'manosEnBanco' : 'sentado') : 'parado');
  }

  // ---------- Mano de señas (Sofi): agrandada y con la palma hacia el jugador ----------
  estadoManoSenia(lado) {
    this._manoSenia ??= {
      I: { escala: 1, objetivo: 1, giro: 0, punto: null },
      D: { escala: 1, objetivo: 1, giro: 0, punto: null },
    };
    return this._manoSenia[lado === 'brazoI' || lado === 'I' ? 'I' : 'D'];
  }

  /** Agranda (o devuelve a su tamaño) la mano del modelo, con transición suave. */
  escalarMano(lado, factor) {
    this.estadoManoSenia(lado).objetivo = factor;
  }

  /** Gira la muñeca para que la palma mire a un punto del mundo (null = sin girar). */
  orientarPalma(lado, punto) {
    const e = this.estadoManoSenia(lado);
    e.punto = punto ? (e.punto ?? new THREE.Vector3()).copy(punto) : null;
  }

  actualizarManoSenia(dt) {
    if (!this._manoSenia) return;
    const k = 1 - Math.exp(-8 * dt);
    for (const lado of ['I', 'D']) {
      const e = this._manoSenia[lado];
      const br = this.rig['brazo' + lado];
      if (!br?.manoModelo) continue;
      e.escala += (e.objetivo - e.escala) * k;
      br.manoModelo.scale.setScalar(e.escala);
      let giro = 0;
      if (e.punto) {
        // La palma mira hacia -x local en la mano derecha y +x en la izquierda (pose de atadura).
        // Se gira alrededor del eje del antebrazo (y local) hasta que apunte al punto.
        br.muneca.updateWorldMatrix(true, false);
        const m = br.muneca.matrixWorld;
        const eje = _v1.setFromMatrixColumn(m, 1).normalize();
        const centro = _v2.setFromMatrixPosition(m);
        const normal = _v3.set(lado === 'D' ? -1 : 1, 0, 0).transformDirection(m);
        const meta = _v4.copy(e.punto).sub(centro);
        normal.addScaledVector(eje, -normal.dot(eje)).normalize();
        meta.addScaledVector(eje, -meta.dot(eje));
        if (meta.lengthSq() > 1e-6) {
          meta.normalize();
          giro = Math.atan2(eje.dot(_v5.crossVectors(normal, meta)), normal.dot(meta));
        }
      }
      e.giro += (giro - e.giro) * k;
      br.muneca.rotation.y += e.giro;
    }
  }

  // Mano "postiza" con dedos exagerados: sólo si no se pudieron detectar los dedos del modelo
  construirManoPostiza(br, signo, matPiel) {
    const mano = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10), matPiel);
    mano.scale.set(0.9, 1.15, 0.65);
    mano.position.y = -0.045;
    mano.visible = false;
    contorno(mano, 0.006);
    br.muneca.add(mano);
    br.mano = mano;
    for (let i = 0; i < 4; i++) {
      const dedo = new THREE.Mesh(new THREE.CapsuleGeometry(0.012, 0.065, 3, 6), matPiel);
      dedo.position.set((i - 1.5) * 0.022 * -signo, -0.115, 0);
      dedo.visible = false;
      contorno(dedo, 0.005);
      br.muneca.add(dedo);
      br.dedos.push(dedo);
    }
  }

  // ---------- Modelo GLB ----------
  cargarGLB(cfg) {
    loader.load(
      cfg.ruta,
      (gltf) => {
        const modelo = gltf.scene;
        modelo.traverse((o) => {
          if (o.isMesh) o.castShadow = true;
        });
        if (cfg.escala) modelo.scale.setScalar(cfg.escala);
        this.raiz.add(modelo);
        // Mapear huesos del modelo a las articulaciones que usa el animador
        if (cfg.huesos) {
          for (const [articulacion, nombreHueso] of Object.entries(cfg.huesos)) {
            const hueso = modelo.getObjectByName(nombreHueso);
            if (!hueso) continue;
            if (articulacion.startsWith('hombro') || articulacion.startsWith('codo')) {
              const lado = articulacion.endsWith('I') ? 'brazoI' : 'brazoD';
              this.rig[lado] ??= { dedos: [] };
              this.rig[lado][articulacion.startsWith('hombro') ? 'hombro' : 'codo'] = hueso;
            } else {
              this.rig[articulacion] = hueso;
            }
          }
        }
        if (gltf.animations.length) {
          this.mixer = new THREE.AnimationMixer(modelo);
          const clip = THREE.AnimationClip.findByName(gltf.animations, cfg.animacion) ?? gltf.animations[0];
          this.mixer.clipAction(clip).play();
        }
        this.animador.capturarReposo();
      },
      undefined,
      (err) => console.warn(`No se pudo cargar ${cfg.ruta}; queda vacío.`, err),
    );
  }

  // ---------- Modelo estático (malla sin esqueleto) ----------
  cargarModeloEstatico(m) {
    loader.load(
      m.ruta,
      (gltf) => {
        const modelo = gltf.scene;
        // Cel-shading: se reemplaza el material PBR por uno toon con la misma textura
        modelo.traverse((o) => {
          if (!o.isMesh) return;
          const original = o.material;
          o.material = new THREE.MeshToonMaterial({ map: original.map ?? null, color: original.map ? 0xffffff : original.color, gradientMap: RAMPA });
          original.dispose();
          o.castShadow = true;
          o.receiveShadow = true;
        });
        // Escala por altura y pies apoyados en el piso (el origen del archivo puede estar en cualquier lado)
        const caja = new THREE.Box3().setFromObject(modelo);
        const alto = caja.max.y - caja.min.y;
        const escalaRaiz = this.raiz.scale.y || 1;
        const s = m.altura / alto / escalaRaiz;
        // Contorno como el resto de la escena: copia de la malla inflada por las normales, de espaldas
        const grosor = (m.contorno ?? 0.012) / (s * escalaRaiz);
        const matContorno = new THREE.MeshBasicMaterial({ color: COLOR_CONTORNO, side: THREE.BackSide });
        matContorno.onBeforeCompile = (shader) => {
          shader.vertexShader = shader.vertexShader.replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>\n  transformed += normalize(normal) * ${grosor.toFixed(5)};`,
          );
        };
        const mallas = [];
        modelo.traverse((o) => o.isMesh && mallas.push(o));
        for (const o of mallas) {
          const borde = new THREE.Mesh(o.geometry, matContorno);
          borde.userData.esContorno = true;
          borde.raycast = () => {};
          o.add(borde);
        }
        modelo.scale.setScalar(s);
        modelo.position.y = -caja.min.y * s;
        // Pivote para inclinarlo y balancearlo al caminar (no tiene huesos)
        this.pivoteModelo = new THREE.Group();
        this.pivoteModelo.rotation.order = 'YXZ';
        this.pivoteModelo.rotation.y = m.rotacionY ?? 0;
        this.pivoteModelo.add(modelo);
        this.raiz.add(this.pivoteModelo);
        // Punto de la mano derecha (para sostener cosas, como la hoja retirada)
        this.manoModelo = new THREE.Object3D();
        this.manoModelo.position.set(...(m.manoDerecha ?? [0.5, 0.85, -0.05]));
        this.raiz.add(this.manoModelo);
        // Recién ahora se oculta el placeholder (así nunca queda el personaje invisible)
        this.raiz.traverse((o) => {
          if (o.isMesh && !this.pivoteModelo.getObjectById(o.id)) o.visible = false;
        });
      },
      undefined,
      (err) => console.warn(`No se pudo cargar ${m.ruta}; queda el placeholder.`, err),
    );
  }

  // Objeto al que se le pueden "dar" cosas en la mano derecha
  puntoMano() {
    return this.manoModelo ?? this.rig.brazoD?.muneca ?? this.raiz;
  }

  // Cuánto mide de alto el personaje (para encuadres y la mirada de la profe)
  get altura() {
    return (this.config.modelo?.altura ?? 1.5) * (this.config.escala ?? 1);
  }

  // Animación procedural del modelo estático: balanceo al caminar e inclinación según la pose
  animarModeloEstatico(dt, t) {
    const pv = this.pivoteModelo;
    const caminar = this.animador.capas.get('caminar') ?? 0;
    const ritmo = t * 7 * (this.animador.velCaminar || 1);
    const k = 1 - Math.exp(-8 * dt);
    const inclinar = this.animador.poseActual === 'retirarExamen' ? -0.18 : this.animador.poseActual === 'escribirPizarron' ? 0.04 : 0;
    pv.position.y += (Math.abs(Math.sin(ritmo)) * 0.035 * caminar - pv.position.y) * k;
    pv.rotation.z += (Math.sin(ritmo) * 0.035 * caminar - pv.rotation.z) * k;
    pv.rotation.x += (inclinar - pv.rotation.x) * k;
  }

  // ---------- Interfaz común ----------
  mostrarDedos(cantidad, lado = 'brazoD') {
    // Con dedos articulados: se estiran los primeros n y el resto queda en puño
    if (this.manos) {
      this.manos.forzar(lado === 'brazoI' ? 'I' : 'D', cantidad > 0 ? poseSenia(cantidad) : null);
      return;
    }
    const br = this.rig[lado];
    const dedos = br?.dedos ?? [];
    dedos.forEach((d, i) => (d.visible = i < cantidad));
    // Mano rígida: se cambia la mano del modelo por la mano de señas
    if (br?.manoModelo && br.mano) {
      const senia = cantidad > 0;
      br.manoModelo.scale.setScalar(senia ? 0.3 : 1);
      br.mano.visible = senia;
    }
  }

  mostrarLapicera(visible, lado = 'brazoD') {
    const l = this.rig[lado]?.lapicera;
    if (l) l.visible = visible;
  }

  // Posición mundial de la cabeza (para visión, mirada, audio)
  posicionCabeza(destino = new THREE.Vector3()) {
    const obj = this.rig.cabeza ?? this.raiz;
    return obj.getWorldPosition(destino);
  }

  update(dt, t) {
    this.mixer?.update(dt);
    this.animador.update(dt, t);
    this.manos?.update(dt);
    this.actualizarManoSenia(dt);
    if (this.pivoteModelo) this.animarModeloEstatico(dt, t);
  }
}
