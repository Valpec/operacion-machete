import { bus } from '../core/EventBus.js';
import { CONTROLES } from '../core/controles.js';
import { estado, participar } from '../core/GameState.js';
import { NOMBRES } from '../characters/config.js';

const LETRAS = ['A', 'B', 'C', 'D'];

/**
 * Machete: al mantener E aparece en primer plano según el escondite elegido.
 *  - cartuchera: tarda más en abrirse, silencioso
 *  - manga: rápido, pero el gesto se ve más (más sospecha si te ven)
 *  - celular: se lee mejor, pero si te ven suma muchísima sospecha (y vibra un poco)
 * G lo guarda para siempre (con confirmación): es la decisión clave del Camino 2.
 */
export class Machete {
  constructor({ input, examen, balance, camara, hud }) {
    this.input = input;
    this.examen = examen;
    this.b = balance.machete;
    this.compromiso = balance.compromiso;
    this.camara = camara;
    this.hud = hud;
    this.progreso = 0;       // 0 = guardado, 1 = abierto y legible
    this.tiempoAbierto = 0;  // segundos seguidos abierto (para "consultar")
    this.confirmando = false;
    this.estabaAbierto = false;

    this.vista = new VistaMachete(examen.datos);

    bus.on('tecla', ({ code, abajo }) => {
      if (!abajo || estado.final || estado.pausado) return;
      if (this.confirmando) {
        if (code === 'KeyS' || code === 'Enter') this.guardar();
        else if (code === 'KeyN' || code === CONTROLES.guardarMachete) this.cancelar();
        return;
      }
      if (code === CONTROLES.guardarMachete && !estado.macheteGuardado) {
        this.confirmando = true;
        this.vista.mostrarConfirmacion(true);
      }
    });
    bus.on('pointerlock', (bloqueado) => {
      if (!bloqueado && this.confirmando) this.cancelar();
    });
  }

  get escondite() {
    return this.b.escondites[estado.escondite] ?? this.b.escondites.cartuchera;
  }

  guardar() {
    this.confirmando = false;
    this.vista.mostrarConfirmacion(false);
    estado.macheteGuardado = true;
    estado.accion.machete = false;
    this.hud?.mensaje('Guardaste el machete. Ahora depende de lo que sabés.', 4);
    bus.emit('macheteGuardado');
  }

  cancelar() {
    this.confirmando = false;
    this.vista.mostrarConfirmacion(false);
  }

  update(dt) {
    const quiere =
      this.input.mantenida(CONTROLES.espiarMachete) &&
      !estado.macheteGuardado &&
      !estado.accion.modoHoja &&
      !estado.final &&
      !this.confirmando;
    estado.accion.machete = quiere;
    const esc = this.escondite;

    if (quiere && !this.estabaAbierto) {
      // El celular vibra/hace click al desbloquearse: un ruido chiquito
      if (esc.ruido > 0) bus.emit('ruido', { posicion: this.camara.posicionOjos(), intensidad: esc.ruido, tipo: 'celular' });
      bus.emit('macheteAbre', { escondite: estado.escondite });
    }
    this.estabaAbierto = quiere;

    if (quiere) this.progreso = Math.min(1, this.progreso + dt / esc.apertura);
    else this.progreso = Math.max(0, this.progreso - dt / 0.2);

    if (quiere && this.progreso >= 1) {
      this.tiempoAbierto += dt;
      estado.registro.tiempoMachete += dt;
      participar(this.compromiso.porSegundoMachete * dt);
      if (this.tiempoAbierto >= this.b.tiempoConsulta) {
        const m = this.examen.datos.machete;
        [...m.propias, ...m.paraAmigos].forEach((i) => estado.sabe.add(i));
        if (estado.papelEnMano && !estado.papelEnMano.consultado) {
          estado.papelEnMano.consultado = true;
          bus.emit('macheteConsultado');
        }
      }
    } else {
      this.tiempoAbierto = 0;
    }

    // Si te ven con el machete, la sospecha sube según el escondite
    estado.factorVisibilidadTrampa = estado.accion.machete ? esc.factorSospecha : 1;

    this.vista.update(this.progreso, estado.panico ?? 0, esc.legibilidad, this.b.desenfoquePanicoPx, dt);
  }
}

// ---------- Vista HTML del machete ----------
class VistaMachete {
  constructor(datos) {
    this.datos = datos;
    this.raiz = document.createElement('div');
    this.raiz.className = 'machete';
    document.getElementById('ui').appendChild(this.raiz);
    this.escondite = null;
    this.t = 0;

    this.confirmacion = document.createElement('div');
    this.confirmacion.className = 'confirmacion';
    this.confirmacion.hidden = true;
    this.confirmacion.innerHTML = `
      <div class="tarjeta">
        <h2>¿Guardar el machete para siempre?</h2>
        <p>Es <b>irreversible</b>: no vas a poder volver a sacarlo ni pasarle respuestas al grupo.
           Vas a resolver el examen con lo que sabés.</p>
        <p class="opciones-confirmacion"><span><kbd>S</kbd> Sí, guardarlo</span> <span><kbd>N</kbd> No, mejor no</span></p>
      </div>`;
    document.getElementById('ui').appendChild(this.confirmacion);
  }

  contenido(escondite) {
    const p = this.datos.preguntas;
    const m = this.datos.machete;
    const linea = (i) => `<span class="m-item"><b>${i + 1}</b>→${LETRAS[p[i].correcta]}</span>`;
    const amigos = `${NOMBRES.senias} y ${NOMBRES.mensajero}`;
    if (escondite === 'celular') {
      return `
        <div class="cel-barra"><span>9:41</span><span>▮▮▮ 🔋</span></div>
        <div class="cel-app">Notas</div>
        <div class="cel-nota"><div class="m-titulo">Parcial 😬</div>
          <div class="m-seccion">Mías</div><div class="m-lista">${m.propias.map(linea).join('')}</div>
          <div class="m-seccion">Para ${amigos}</div><div class="m-lista">${m.paraAmigos.map(linea).join('')}</div>
        </div>`;
    }
    return `
      <div class="m-titulo">✎ mías:</div><div class="m-lista">${m.propias.map(linea).join('')}</div>
      <div class="m-titulo">✎ p/ ${amigos}:</div><div class="m-lista">${m.paraAmigos.map(linea).join('')}</div>`;
  }

  mostrarConfirmacion(v) {
    this.confirmacion.hidden = !v;
  }

  update(progreso, panico, legibilidad, desenfoqueMax, dt) {
    this.t += dt;
    if (estado.escondite !== this.escondite) {
      this.escondite = estado.escondite;
      this.raiz.className = `machete machete-${this.escondite}`;
      this.raiz.innerHTML = `<div class="machete-soporte"><div class="machete-papel">${this.contenido(this.escondite)}</div></div>
        <div class="machete-etiqueta"></div>`;
      this.papel = this.raiz.querySelector('.machete-papel');
      this.etiqueta = this.raiz.querySelector('.machete-etiqueta');
    }
    const visible = progreso > 0;
    this.raiz.style.visibility = visible ? 'visible' : 'hidden';
    if (!visible) return;
    // Entra desde abajo mientras se "abre"
    const e = 1 - Math.pow(1 - progreso, 3);
    this.raiz.style.transform = `translateY(${(1 - e) * 110}%)`;
    this.raiz.style.opacity = Math.min(1, progreso * 2).toFixed(2);
    // Legibilidad: el pánico desenfoca y hace temblar el texto
    const borroso = (1 - legibilidad) * 1.2 + panico * desenfoqueMax * (1.25 - legibilidad * 0.5) + (1 - progreso) * 3;
    const tx = Math.sin(this.t * 31) * panico * 3;
    const ty = Math.sin(this.t * 27 + 1) * panico * 2;
    this.papel.style.filter = `blur(${borroso.toFixed(2)}px)`;
    this.papel.style.transform = `translate(${tx.toFixed(1)}px, ${ty.toFixed(1)}px)`;
    this.etiqueta.textContent = progreso < 1 ? 'Sacando el machete…' : panico > 0.6 ? 'Te tiemblan las manos: cuesta leer' : '';
  }
}
