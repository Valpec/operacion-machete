import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { estado } from '../core/GameState.js';

/**
 * Shader propio: desenfoque (general + periférico), viñeta y color grading.
 *  - Tensión / pánico: imagen fría, desaturada, borrosa en los bordes y con viñeta.
 *  - Concentración (mirando la hoja): imagen cálida, luminosa y nítida.
 */
const ShaderEmocion = {
  uniforms: {
    tDiffuse: { value: null },
    resolucion: { value: new THREE.Vector2(1, 1) },
    desenfoqueGeneral: { value: 0 },   // 0..1
    desenfoquePeriferico: { value: 0 }, // 0..1
    desenfoqueMaxPx: { value: 9 },
    vineta: { value: 0.22 },
    saturacion: { value: 1 },
    temperatura: { value: 0 },          // -1 frío ... +1 cálido
    brillo: { value: 1 },
    tiempo: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 resolucion;
    uniform float desenfoqueGeneral;
    uniform float desenfoquePeriferico;
    uniform float desenfoqueMaxPx;
    uniform float vineta;
    uniform float saturacion;
    uniform float temperatura;
    uniform float brillo;
    uniform float tiempo;
    varying vec2 vUv;

    // Disco de Poisson de 12 muestras para un desenfoque barato pero suave
    const vec2 DISCO[12] = vec2[](
      vec2(-0.326, -0.406), vec2(-0.840, -0.074), vec2(-0.696, 0.457), vec2(-0.203, 0.621),
      vec2(0.962, -0.195), vec2(0.473, -0.480), vec2(0.519, 0.767), vec2(0.185, -0.893),
      vec2(0.507, 0.064), vec2(0.896, 0.412), vec2(-0.322, -0.933), vec2(-0.792, -0.598)
    );

    void main() {
      vec2 centro = vUv - 0.5;
      centro.x *= resolucion.x / resolucion.y;
      float d = length(centro);

      // Radio de desenfoque: general + periférico (crece hacia los bordes)
      float periferia = smoothstep(0.22, 0.75, d);
      float radioPx = desenfoqueMaxPx * (desenfoqueGeneral * 0.45 + desenfoquePeriferico * periferia);
      vec4 color = texture2D(tDiffuse, vUv);
      if (radioPx > 0.35) {
        // Rotamos el disco por píxel para disimular el patrón
        float ang = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) * 6.2831;
        mat2 rot = mat2(cos(ang), -sin(ang), sin(ang), cos(ang));
        vec4 suma = color;
        for (int i = 0; i < 12; i++) {
          suma += texture2D(tDiffuse, vUv + rot * DISCO[i] * radioPx / resolucion);
        }
        color = suma / 13.0;
      }

      vec3 c = color.rgb * brillo;
      // Saturación
      float gris = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(gris), c, saturacion);
      // Temperatura: cálido suma rojo/amarillo, frío suma azul
      vec3 calido = vec3(1.08, 1.0, 0.86);
      vec3 frio = vec3(0.86, 0.96, 1.12);
      c *= temperatura >= 0.0 ? mix(vec3(1.0), calido, temperatura) : mix(vec3(1.0), frio, -temperatura);
      // Viñeta
      float v = smoothstep(1.0, 0.3, d * (0.6 + vineta * 0.6));
      c *= mix(1.0, v, clamp(vineta * 0.9, 0.0, 0.85));
      gl_FragColor = vec4(c, color.a);
    }`,
};

export class Postprocesado {
  constructor(game, balance) {
    this.game = game;
    this.b = balance.efectos;
    const { renderer, scene, camera } = game;
    const tam = renderer.getSize(new THREE.Vector2());
    this.composer = new EffectComposer(renderer);
    this.composer.setPixelRatio(renderer.getPixelRatio());
    this.composer.setSize(tam.x, tam.y);
    this.composer.addPass(new RenderPass(scene, camera));
    this.pase = new ShaderPass(ShaderEmocion);
    this.pase.uniforms.desenfoqueMaxPx.value = this.b.desenfoqueMaxPx * renderer.getPixelRatio();
    this.composer.addPass(this.pase);
    this.composer.addPass(new OutputPass());
    this.actualizarResolucion(tam.x, tam.y);
    this.ia = null; // la profesora (para la tensión por sospecha)
    this.correEnPausa = true;

    game.renderizar = (dt) => this.composer.render(dt);
  }

  actualizarResolucion(w, h) {
    const pr = this.game.renderer.getPixelRatio();
    this.pase.uniforms.resolucion.value.set(w * pr, h * pr);
  }

  alRedimensionar(w, h) {
    this.composer.setSize(w, h);
    this.actualizarResolucion(w, h);
  }

  update(dt, t) {
    const u = this.pase.uniforms;
    const p = estado.panico ?? 0;
    const c = estado.concentracion ?? 0;
    const op = estado.opciones ?? {};
    const intensidad = op.intensidadDesenfoque ?? 1;
    // La sospecha alta también enfría un poco la imagen (la paleta es mecánica)
    const sospecha = this.ia ? this.ia.sospecha / 100 : 0;
    let tension = Math.max(p, sospecha * this.b.tensionPorSospecha) * (1 - c);
    // Tono de las pantallas de final: aula vacía y fría, o tarde cálida
    if (estado.tonoFinal === 'frio') tension = 0.8;

    u.desenfoqueGeneral.value = p * 0.6 * intensidad * (1 - c);
    u.desenfoquePeriferico.value = p * intensidad * (1 - c);
    u.vineta.value = this.b.vinetaBase + tension * 0.55 + c * 0.08;
    const calido = estado.tonoFinal === 'calido' ? 1 : c;
    u.saturacion.value = 1 - tension * 0.7 + calido * 0.15;
    u.temperatura.value = calido * 0.9 - tension;
    u.brillo.value = 1 + c * 0.07 - tension * 0.06;
    u.tiempo.value = t;
  }
}
