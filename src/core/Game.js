import * as THREE from 'three';
import { estado } from './GameState.js';

// Loop principal: actualiza todos los sistemas registrados y dibuja.
export class Game {
  constructor(contenedor, balance) {
    this.balance = balance;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    contenedor.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    const c = balance.camara;
    this.camera = new THREE.PerspectiveCamera(c.fov, window.innerWidth / window.innerHeight, c.cerca, c.lejos);

    this.reloj = new THREE.Timer();
    this.reloj.connect(document);
    this.sistemas = [];      // objetos con update(dt, t)
    this.renderizar = null;
    this.camaraDebug = null; // si se define, se dibuja con esta cámara (vista cenital del debug)  // si se define (postprocesado), reemplaza el render directo

    window.addEventListener('resize', () => this.alRedimensionar());
  }

  agregar(sistema) {
    this.sistemas.push(sistema);
    return sistema;
  }

  alRedimensionar() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.sistemas.forEach((s) => s.alRedimensionar?.(w, h));
  }

  iniciar() {
    this.renderer.setAnimationLoop(() => this.cuadro());
  }

  cuadro() {
    // Limitamos dt para que un tirón (cambio de pestaña) no rompa la física
    this.reloj.update();
    const dt = Math.min(this.reloj.getDelta(), 0.05);
    const t = this.reloj.getElapsed();
    for (const s of this.sistemas) {
      if (estado.pausado && !s.correEnPausa) continue;
      s.update?.(dt, t);
    }
    if (this.camaraDebug) this.renderer.render(this.scene, this.camaraDebug);
    else if (this.renderizar) this.renderizar(dt);
    else this.renderer.render(this.scene, this.camera);
  }
}
