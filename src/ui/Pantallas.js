import { estado } from '../core/GameState.js';
import { NOMBRES } from '../characters/config.js';

const CLAVE_OPCIONES = 'elParcial.opciones';

// Lee/guarda opciones en localStorage (si el navegador lo bloquea, simplemente no se recuerdan)
export function cargarOpciones(opciones) {
  try {
    const guardadas = JSON.parse(localStorage.getItem(CLAVE_OPCIONES) ?? 'null');
    if (guardadas) Object.assign(opciones, guardadas);
  } catch {
    /* sin almacenamiento */
  }
}
function guardarOpciones(opciones) {
  try {
    localStorage.setItem(CLAVE_OPCIONES, JSON.stringify(opciones));
  } catch {
    /* sin almacenamiento */
  }
}

const ESCONDITES = [
  { id: 'cartuchera', icono: '✏️', nombre: 'Cartuchera', pro: 'Silenciosa', contra: 'Tarda más en abrirse' },
  { id: 'manga', icono: '👕', nombre: 'Manga del buzo', pro: 'Rapidísima', contra: 'El gesto se nota más' },
  { id: 'celular', icono: '📱', nombre: 'Celular', pro: 'Se lee mucho mejor', contra: 'Si te ven, la sospecha se dispara' },
];

const CONTROLES_TEXTO = [
  ['Mouse', 'mirar alrededor (no podés darte vuelta del todo)'],
  ['Mantener Espacio', 'bajar la vista a tu hoja: responder el examen y calmarte'],
  ['Clic / 1–4', 'en la hoja: marcar opción · ← → cambiar de pregunta'],
  ['Mantener E', 'espiar el machete'],
  ['Clic izquierdo', 'atrapar un papelito en el aire'],
  ['Clic derecho', 'mantener para apuntar y cargar fuerza, soltar para lanzar'],
  ['Mirar a Sofi', 'sostener la mirada ~1 s para leer su seña · 1–4 para contestarle con los dedos'],
  ['G', 'guardar el machete para siempre (no hay vuelta atrás)'],
  ['Esc', 'pausa y opciones'],
  ['F1', 'modo debug'],
];

/**
 * Pantallas HTML: inicio, pausa, opciones, fundido a negro y finales.
 */
export class Pantallas {
  constructor({ alEmpezar, alContinuar }) {
    this.ui = document.getElementById('ui');
    this.alEmpezar = alEmpezar;
    this.alContinuar = alContinuar;
    this.escondite = estado.escondite;
    this.crearInicio();
    this.crearPausa();
    this.crearOpciones();
    this.fundidoEl = this.div('fundido');
  }

  div(clase, html = '') {
    const el = document.createElement('div');
    el.className = clase;
    el.innerHTML = html;
    this.ui.appendChild(el);
    return el;
  }

  tablaControles() {
    return `<table class="controles">${CONTROLES_TEXTO.map(([k, v]) => `<tr><td><kbd>${k}</kbd></td><td>${v}</td></tr>`).join('')}</table>`;
  }

  // ---------- Inicio ----------
  crearInicio() {
    this.inicio = this.div(
      'pantalla menu inicio',
      `<div class="tarjeta tarjeta-ancha">
        <h1>El Parcial</h1>
        <p class="bajada">Estás rindiendo el primer parcial, sentado en el banco del medio. Desde las esquinas,
          ${NOMBRES.senias}, ${NOMBRES.mensajero} y ${NOMBRES.grupo} quieren copiarse en grupo… y te necesitan a vos.
          La profe patrulla el aula.</p>
        <div class="columnas">
          <section>
            <h2>Objetivos</h2>
            <ul>
              <li>Resolvé las 8 preguntas antes de que termine el tiempo (8 minutos).</li>
              <li>Decidí: ¿seguís pasando respuestas (más riesgo y más pánico) o lo resolvés por tu cuenta?</li>
              <li>Que la profe no te vea haciendo trampa: si la sospecha llega a 100 con las manos en la masa, se terminó.</li>
              <li>Si te trabás con una pregunta, quedate mirándola: tu memoria te va a ayudar.</li>
            </ul>
            <h2>¿Dónde escondés el machete?</h2>
            <div class="escondites" role="radiogroup">
              ${ESCONDITES.map(
                (e) => `<button class="escondite" role="radio" data-id="${e.id}">
                  <span class="esc-icono">${e.icono}</span><b>${e.nombre}</b>
                  <span class="esc-pro">＋ ${e.pro}</span><span class="esc-contra">－ ${e.contra}</span>
                </button>`,
              ).join('')}
            </div>
          </section>
          <section>
            <h2>Controles</h2>
            ${this.tablaControles()}
            <p class="nota-auriculares">🎧 Recomendado: auriculares. Los pasos de la profe se escuchan en estéreo
              (y además aparecen indicadores y subtítulos).</p>
          </section>
        </div>
        <div class="botonera">
          <button class="boton-grande" data-accion="empezar">Empezar el examen</button>
          <button class="boton-secundario" data-accion="opciones">Opciones</button>
        </div>
        <p class="aviso-lock" hidden>Hacé clic de nuevo para tomar el control del mouse.</p>
      </div>`,
    );
    this.inicio.style.cursor = 'default';
    const marcar = () =>
      this.inicio.querySelectorAll('.escondite').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.id === this.escondite)));
    this.inicio.querySelectorAll('.escondite').forEach((b) =>
      b.addEventListener('click', () => {
        this.escondite = b.dataset.id;
        marcar();
      }),
    );
    marcar();
    this.inicio.querySelector('[data-accion="empezar"]').addEventListener('click', () => {
      estado.escondite = this.escondite;
      this.alEmpezar().catch(() => (this.inicio.querySelector('.aviso-lock').hidden = false));
    });
    this.inicio.querySelector('[data-accion="opciones"]').addEventListener('click', () => this.mostrarOpciones(this.inicio));
  }

  ocultarInicio() {
    this.inicio.style.display = 'none';
  }

  // ---------- Pausa ----------
  crearPausa() {
    this.pausa = this.div(
      'pantalla menu',
      `<div class="tarjeta">
        <h1>Pausa</h1>
        <div class="botonera vertical">
          <button class="boton-grande" data-accion="continuar">Continuar</button>
          <button class="boton-secundario" data-accion="opciones">Opciones</button>
          <button class="boton-secundario" data-accion="reiniciar">Reiniciar</button>
        </div>
        <p class="aviso-lock" hidden>El navegador pide esperar un segundo: volvé a hacer clic en Continuar.</p>
        <details><summary>Controles</summary>${this.tablaControles()}</details>
      </div>`,
    );
    this.pausa.style.display = 'none';
    this.pausa.style.cursor = 'default';
    this.pausa.querySelector('[data-accion="continuar"]').addEventListener('click', () => {
      this.alContinuar().catch(() => (this.pausa.querySelector('.aviso-lock').hidden = false));
    });
    this.pausa.querySelector('[data-accion="opciones"]').addEventListener('click', () => this.mostrarOpciones(this.pausa));
    this.pausa.querySelector('[data-accion="reiniciar"]').addEventListener('click', () => location.reload());
  }

  mostrarPausa(visible) {
    this.pausa.style.display = visible ? 'flex' : 'none';
    this.pausa.querySelector('.aviso-lock').hidden = true;
    if (!visible) this.opciones.style.display = 'none';
  }

  // ---------- Opciones ----------
  crearOpciones() {
    const o = estado.opciones;
    const deslizador = (clave, etiqueta, min, max, paso, formato) => `
      <label class="opcion"><span>${etiqueta}</span>
        <input type="range" data-clave="${clave}" min="${min}" max="${max}" step="${paso}" value="${o[clave]}">
        <output data-para="${clave}">${formato(o[clave])}</output></label>`;
    const pct = (v) => `${Math.round(v * 100)}%`;
    this.formatos = { sensibilidad: (v) => `${Number(v).toFixed(1)}×`, volumenGeneral: pct, volumenEfectos: pct, intensidadDesenfoque: pct, intensidadVibracion: pct };
    this.opciones = this.div(
      'pantalla menu',
      `<div class="tarjeta">
        <h1>Opciones</h1>
        ${deslizador('sensibilidad', 'Sensibilidad del mouse', 0.3, 2.5, 0.1, this.formatos.sensibilidad)}
        ${deslizador('volumenGeneral', 'Volumen general', 0, 1, 0.05, pct)}
        ${deslizador('volumenEfectos', 'Volumen de efectos', 0, 1, 0.05, pct)}
        ${deslizador('intensidadDesenfoque', 'Desenfoque por pánico', 0, 1, 0.05, pct)}
        ${deslizador('intensidadVibracion', 'Vibración de cámara', 0, 1, 0.05, pct)}
        <label class="opcion casilla"><input type="checkbox" data-clave="subtitulos" ${o.subtitulos ? 'checked' : ''}>
          <span>Subtítulos de sonidos</span></label>
        <div class="botonera">
          <button class="boton-secundario" data-accion="reducir">Reducir efectos (desenfoque y vibración al 20%)</button>
          <button class="boton-grande" data-accion="volver">Volver</button>
        </div>
      </div>`,
    );
    this.opciones.style.display = 'none';
    this.opciones.style.cursor = 'default';
    this.opciones.querySelectorAll('input').forEach((inp) =>
      inp.addEventListener('input', () => {
        const clave = inp.dataset.clave;
        o[clave] = inp.type === 'checkbox' ? inp.checked : Number(inp.value);
        const out = this.opciones.querySelector(`output[data-para="${clave}"]`);
        if (out) out.textContent = this.formatos[clave](o[clave]);
        guardarOpciones(o);
      }),
    );
    this.opciones.querySelector('[data-accion="reducir"]').addEventListener('click', () => {
      for (const clave of ['intensidadDesenfoque', 'intensidadVibracion']) {
        o[clave] = 0.2;
        this.opciones.querySelector(`input[data-clave="${clave}"]`).value = 0.2;
        this.opciones.querySelector(`output[data-para="${clave}"]`).textContent = '20%';
      }
      guardarOpciones(o);
    });
    this.opciones.querySelector('[data-accion="volver"]').addEventListener('click', () => {
      this.opciones.style.display = 'none';
      this.volverA.style.display = 'flex';
    });
  }

  mostrarOpciones(desde) {
    this.volverA = desde;
    desde.style.display = 'none';
    this.opciones.style.display = 'flex';
  }

  // ---------- Fundido a negro ----------
  fundido(aNegro, segundos = 1) {
    this.fundidoEl.style.transition = `opacity ${segundos}s ease`;
    this.fundidoEl.style.opacity = aNegro ? '1' : '0';
    return new Promise((r) => setTimeout(r, segundos * 1000));
  }

  // ---------- Finales ----------
  mostrarFinal({ tipo, nota, notaPropia, correctas, total, aprobado, estadisticas: s }) {
    let titulo;
    let lineas;
    let cierre;
    if (tipo === 'traicion') {
      titulo = 'Examen anulado';
      lineas = [
        '🔔 Suena el timbre.',
        'Tus amigos agarran sus cosas y pasan al lado de tu banco.',
        'Nadie dice nada para defenderte.',
        `<i>— Uh, qué mala suerte tuviste, quedaste re regalado ahí.</i>`,
        'Se van. El aula queda vacía.',
      ];
      cierre = `Desaprobaste una materia que sabías resolver.<br><small>Con lo que habías respondido vos solo ibas por un <b>${notaPropia}</b>.</small>`;
    } else if (tipo === 'merito') {
      titulo = aprobado ? 'Aprobado por mérito propio' : 'Lo hiciste por tu cuenta';
      lineas = [
        '🔔 Suena el timbre.',
        'Entregás la hoja y salís sin mirar hacia las esquinas.',
        'Volvés a tu casa tranquilo.',
        aprobado
          ? `<i>— ¡Felicitaciones! Sabíamos que podías.</i> Tus viejos te reciben con un abrazo.`
          : 'Esta vez no alcanzó, pero cada respuesta fue tuya. Con lo que estudiaste, la próxima sale.',
      ];
      cierre = aprobado ? 'Aprobaste por mérito propio.' : 'Desaprobaste, pero sin deberle nada a nadie.';
    } else {
      titulo = 'Se terminó el examen';
      lineas = [
        '🔔 Suena el timbre.',
        'Entregás la hoja entre señas, papelitos y miradas de reojo.',
        'Nadie te descubrió… y tampoco terminaste de decidir de qué lado estabas.',
      ];
      cierre = aprobado ? 'Aprobaste.' : 'Desaprobaste.';
    }
    const html = `
      <div class="tarjeta final final-${tipo}">
        <h1>${titulo}</h1>
        <div class="lineas">${lineas.map((l, i) => `<p style="animation-delay:${0.6 + i * 1.1}s">${l}</p>`).join('')}</div>
        <div class="resultado-final" style="animation-delay:${0.8 + lineas.length * 1.1}s">
          <div class="nota-final"><span>Nota</span><b>${nota}</b><span>${tipo === 'traicion' ? 'anulado' : `${correctas} de ${total} correctas`}</span></div>
          <p class="cierre">${cierre}</p>
          <ul class="estadisticas">
            <li>Señas leídas: <b>${s.seniasLeidas}</b> · contestadas: <b>${s.seniasRespondidas}</b></li>
            <li>Papelitos devueltos: <b>${s.papelitosDevueltos}</b></li>
            <li>Tiempo con el machete abierto: <b>${s.tiempoMachete} s</b></li>
          </ul>
          <button class="boton-grande" data-accion="denuevo">Jugar de nuevo</button>
        </div>
      </div>`;
    this.final = this.div(`pantalla menu pantalla-final pantalla-${tipo}`, html);
    this.final.style.cursor = 'default';
    this.final.querySelector('[data-accion="denuevo"]').addEventListener('click', () => location.reload());
    this.pausa.style.display = 'none';
  }
}
