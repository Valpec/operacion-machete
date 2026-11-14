import * as THREE from 'three';
import { bus } from '../core/EventBus.js';
import { estado } from '../core/GameState.js';
import { NOMBRES } from '../characters/config.js';

/**
 * Decisiones y finales (Acto IV).
 *  - Camino 1 (traición del grupo): el compromiso supera el umbral -> reto final con un pedido
 *    urgente de Tomi y la profesora rondando el centro. El lanzamiento falla por el temblor
 *    (o cualquier descubrimiento con sospecha al 100 lleva directo acá). Secuencia: el papel cae,
 *    la profesora gira, los amigos disimulan, ella camina hasta el banco y retira el examen.
 *  - Camino 2 (mérito propio): guardar el machete (G) o ignorar señas y papelitos mucho tiempo.
 *    Los amigos muestran bronca, la profesora pasa junto al banco y sigue de largo.
 *  - Final neutral: se termina el tiempo (o entregás) sin que se active ningún camino.
 */
export class Finales {
  constructor({ input, camara, profesora, elenco, aula, examen, papelitos, senias, grupo, hud, panelExamen, pantallas, balance }) {
    Object.assign(this, { input, camara, ia: profesora, elenco, aula, examen, papelitos, senias, grupo, hud, panelExamen, pantallas });
    this.b = balance.finales;
    this.reto = false;
    this.enSecuencia = false;
    this.esperas = [];
    this.mirarProfesora = false;
    this._v = new THREE.Vector3();
    this._o = new THREE.Vector3();
    estado.camino = null;

    bus.on('macheteGuardado', () => this.activarMerito('machete'));
    bus.on('descubrimiento', () => this.secuenciaTraicion('descubierto'));
    bus.on('lanzamientoFallido', () => {
      if (this.reto) this.secuenciaTraicion('papel');
    });
    bus.on('finExamen', (datos) => this.alTerminarExamen(datos));
    bus.on('acto', (n) => {
      if (n === 3) this.hud.mensaje('La profe está cada vez más atenta… y se acerca más seguido a tu banco.', 4);
    });
  }

  // Espera en tiempo de juego (respeta la pausa)
  esperar(segundos) {
    return new Promise((resolver) => this.esperas.push({ t: segundos, resolver }));
  }

  // ---------- Camino 1: reto final ----------
  iniciarReto() {
    this.reto = true;
    estado.acto = 4;
    bus.emit('acto', 4);
    this.ia.vigilarCentro();
    this.papelitos.lanzarUrgente();
    this.hud.mensaje(`${NOMBRES.mensajero} te mira desesperado: tiene un pedido urgente. La profe ronda tu banco…`, 5);
  }

  async secuenciaTraicion(origen) {
    if (this.enSecuencia || estado.final || estado.camino === 'merito') return;
    this.enSecuencia = true;
    estado.enSecuencia = true; // oculta el HUD
    estado.camino = 'traicion';
    estado.acto = 4;
    this.reto = false;
    this.papelitos.forzarFallo = false;
    this.papelitos.urgente = false;
    // El jugador pierde el control
    this.input.setHabilitado(false);
    this.papelitos.cancelarApuntar();
    estado.bloqueoHoja = true;
    for (const k of Object.keys(estado.accion)) estado.accion[k] = typeof estado.accion[k] === 'number' ? 0 : false;
    estado.grupoEnojado = true;
    this.senias.volverAEscribir(9999);

    if (origen === 'papel') await this.esperar(0.7);
    // La profesora gira hacia el banco central; los amigos bajan las manos y miran su hoja al instante
    this.grupo.disimular();
    this.ia.descubrir();
    this.mirarProfesora = true;
    this.hud.subtitulo('[La profesora se da vuelta hacia tu banco]', 3);
    await this.esperar(0.4);
    this.hud.subtitulo(`[${NOMBRES.senias}, ${NOMBRES.mensajero} y ${NOMBRES.grupo} bajan la vista a sus hojas]`, 3);

    // Espera a que llegue (con un límite por las dudas)
    let limite = 14;
    while (this.ia.ruta.length && limite > 0) {
      await this.esperar(0.1);
      limite -= 0.1;
    }
    await this.esperar(0.6);
    this.hud.subtitulo('Profesora: — Dame la hoja. Esto queda anulado.', 3.5);
    bus.emit('profesoraHabla', { segundos: 2.5 });
    this.ia.retirarExamen();
    await this.esperar(0.8);
    // La hoja del banco pasa a la mano de la profesora
    const hoja = this.aula.bancoCentral.hoja;
    const mano = this.ia.p.puntoMano();
    mano.add(hoja);
    if (mano === this.ia.p.manoModelo) {
      // Modelo estático: la hoja queda colgando de la mano, vertical
      hoja.position.set(0, -0.1, -0.08);
      hoja.rotation.set(0, 0, 0);
    } else {
      hoja.position.set(0, -0.12, -0.03);
      hoja.rotation.set(0, 0, 0);
    }
    await this.esperar(1.0);
    this.ia.p.animador.pose('parado', 3);
    await this.esperar(1.6);

    // Pantalla de final: timbre, los amigos se van sin defenderlo, aula vacía
    await this.pantallas.fundido(true, 1.2);
    this.mirarProfesora = false;
    this.camara.solicitarMirada('secuencia', { mezcla: 0 });
    for (const p of this.elenco.todos) p.raiz.visible = p === this.elenco.protagonista;
    this.camara.yaw = 0;
    this.camara.pitch = -0.05;
    estado.tonoFinal = 'frio';
    this.terminar('traicion');
    bus.emit('timbre');
    await this.pantallas.fundido(false, 1.5);
  }

  // ---------- Camino 2: mérito propio ----------
  activarMerito(motivo) {
    if (estado.camino || estado.final) return;
    estado.camino = 'merito';
    estado.acto = 4;
    bus.emit('acto', 4);
    this.reto = false;
    this.papelitos.urgente = false;
    this.papelitos.forzarFallo = false;
    this.ia.modoReto = false;
    this.ia.calma = true;
    estado.grupoEnojado = true;
    this.senias.volverAEscribir(9999);
    if (motivo === 'ignorar' && !estado.macheteGuardado) {
      estado.macheteGuardado = true;
      this.hud.mensaje('Te das cuenta de que no lo necesitás: guardás el machete. Ahora es entre vos y el examen.', 5);
    } else {
      this.hud.mensaje('Tus amigos te miran con bronca desde las esquinas. Concentrate en tu examen.', 5);
    }
    this.grupo.bronca();
    this.hud.subtitulo(`[${NOMBRES.senias} y ${NOMBRES.mensajero} te miran con bronca; ${NOMBRES.grupo} te reclama]`, 4);
    // La profesora pasa junto al banco y sigue de largo
    this.esperar(this.b.demoraPasoProfesoraMerito).then(() => {
      if (!estado.final) this.ia.pasarJunto(this.aula.bancoCentral);
    });
  }

  // ---------- Fin del examen (entregar o tiempo) ----------
  alTerminarExamen() {
    if (estado.camino === 'traicion') return; // la secuencia se encarga
    const tipo = estado.camino === 'merito' ? 'merito' : 'neutral';
    bus.emit('timbre');
    estado.tonoFinal = tipo === 'merito' ? 'calido' : null;
    this.terminar(tipo);
  }

  terminar(tipo) {
    estado.final = tipo;
    this.input.setHabilitado(true);
    this.input.liberar();
    this.enSecuencia = false;
    estado.enSecuencia = false;
    const ex = this.examen;
    const r = estado.registro;
    this.pantallas.mostrarFinal({
      tipo,
      nota: tipo === 'traicion' ? 1 : ex.nota,
      notaPropia: ex.nota,
      correctas: ex.correctas,
      total: ex.preguntas.length,
      aprobado: ex.aprobado,
      estadisticas: {
        seniasLeidas: r.seniasLeidas,
        seniasRespondidas: r.seniasRespondidas,
        papelitosDevueltos: r.papelitosDevueltos,
        tiempoMachete: Math.round(r.tiempoMachete),
      },
    });
  }

  // ---------- Loop ----------
  update(dt) {
    // Esperas de las secuencias
    if (this.esperas.length) {
      const listas = [];
      this.esperas = this.esperas.filter((e) => {
        e.t -= dt;
        if (e.t <= 0) listas.push(e);
        return e.t > 0;
      });
      listas.forEach((e) => e.resolver());
    }

    // Durante la secuencia la cámara sigue a la profesora
    if (this.mirarProfesora) {
      const cuello = this.camara.cuello.getWorldPosition(this._o);
      const cabeza = this.ia.p.posicionCabeza(this._v);
      const dx = cabeza.x - cuello.x;
      const dz = cabeza.z - cuello.z;
      const yaw = Math.atan2(-dx, -dz);
      const pitch = Math.atan2(cabeza.y - cuello.y - 0.1, Math.hypot(dx, dz));
      const actual = this.camara.miradas.get('secuencia');
      const mezcla = Math.min(1, (actual?.mezcla ?? 0) + dt * 1.5);
      this.camara.solicitarMirada('secuencia', { mezcla, yaw, pitch: THREE.MathUtils.clamp(pitch, -0.6, 0.6), adelante: 0 });
    }

    if (estado.final || estado.camino || this.enSecuencia) return;

    // ¿Se activa algún camino?
    if (!this.reto && !estado.macheteGuardado && estado.compromiso >= this.b.umbralCompromiso) this.iniciarReto();
    const r = estado.registro;
    if (!this.reto && r.ignorados >= this.b.ignoradosMinimos && estado.tiempo - r.ultimaParticipacion >= this.b.segundosIgnorandoParaMerito) {
      this.activarMerito('ignorar');
    }
  }
}
