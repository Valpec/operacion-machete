import * as THREE from 'three';

const GRADOS = Math.PI / 180;
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();

/**
 * Cámara en primera persona anclada al cuello del protagonista sentado.
 * Jerarquía: cuello (posición) -> giro horizontal (yaw) -> giro vertical (pitch) -> cámara (ojos).
 * El jugador no puede girar más de ±giroHorizontalMax ni mirar hacia atrás.
 */
export class CamaraPrimeraPersona {
  constructor(camera, input, balance, opciones) {
    this.camera = camera;
    this.input = input;
    this.b = balance.camara;
    this.opciones = opciones;

    this.cuello = new THREE.Group();
    this.giroH = new THREE.Group();
    this.giroV = new THREE.Group();
    this.cuello.add(this.giroH);
    this.giroH.add(this.giroV);
    this.giroV.add(camera);
    camera.position.set(0, this.b.offsetOjosY, this.b.offsetOjosZ);
    camera.rotation.set(0, 0, 0);

    this.yaw = 0;        // + = izquierda
    this.pitch = -0.12;  // + = arriba
    // Miradas forzadas (modo hoja, abrir un papelito, secuencias): cada sistema publica la suya
    // con una mezcla 0..1 y gana la de mayor mezcla.
    this.miradas = new Map();
    this.forzado = { mezcla: 0, yaw: 0, pitch: 0, adelante: 0 };
    this.vibracion = 0;  // amplitud de la vibración de cámara (pánico)
    this.habilitada = true;
    this.correEnPausa = false;
  }

  anclar(scene, asiento) {
    this.cuello.position.set(asiento.x, asiento.y + this.b.alturaCuello, asiento.z);
    scene.add(this.cuello);
  }

  solicitarMirada(id, mirada) {
    this.miradas.set(id, mirada);
  }

  update(dt, t) {
    let f = { mezcla: 0, yaw: 0, pitch: 0, adelante: 0 };
    for (const m of this.miradas.values()) if (m.mezcla > f.mezcla) f = m;
    this.forzado = f;

    const { dx, dy } = this.input.consumirMovimiento();
    if (this.habilitada) {
      const sens = this.b.sensibilidad * (this.opciones?.sensibilidad ?? 1);
      // Mientras la mirada está forzada, el mouse casi no mueve la cabeza
      const libertad = 1 - this.forzado.mezcla;
      this.yaw -= dx * sens * libertad;
      this.pitch -= dy * sens * libertad;
    }
    const maxH = this.b.giroHorizontalMax * GRADOS;
    this.yaw = THREE.MathUtils.clamp(this.yaw, -maxH, maxH);
    this.pitch = THREE.MathUtils.clamp(this.pitch, this.b.giroVerticalMin * GRADOS, this.b.giroVerticalMax * GRADOS);

    const m = f.mezcla;
    let yaw = THREE.MathUtils.lerp(this.yaw, f.yaw, m);
    let pitch = THREE.MathUtils.lerp(this.pitch, f.pitch, m);

    // Vibración: ruido suave a partir de senos desfasados (no da mareo como el ruido blanco)
    const v = this.vibracion;
    if (v > 0) {
      yaw += (Math.sin(t * 23.1) + Math.sin(t * 37.7) * 0.5) * 0.004 * v;
      pitch += (Math.sin(t * 29.3) + Math.sin(t * 17.9) * 0.5) * 0.004 * v;
    }

    this.giroH.rotation.y = yaw;
    this.giroV.rotation.x = pitch;
    // Al bajar la vista a la hoja, el cuello se inclina un poco hacia adelante
    this.giroH.position.set(0, -0.06 * f.adelante * m, -0.1 * f.adelante * m);
  }

  // Ángulos efectivos actuales (para chequear hacia dónde mira el jugador)
  direccion(destino = new THREE.Vector3()) {
    return this.camera.getWorldDirection(destino);
  }

  // Ángulo (en grados) entre el centro de la vista y un punto del mundo
  anguloHacia(punto) {
    const ojo = this.camera.getWorldPosition(_a);
    const dir = this.camera.getWorldDirection(_b);
    return THREE.MathUtils.radToDeg(dir.angleTo(_c.subVectors(punto, ojo)));
  }

  posicionOjos(destino = new THREE.Vector3()) {
    return this.camera.getWorldPosition(destino);
  }
}
