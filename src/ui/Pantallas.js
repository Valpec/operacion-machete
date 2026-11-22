import { estado } from '../core/GameState.js';
import { bus } from '../core/EventBus.js';
import { NOMBRES } from '../characters/config.js';

const CLAVE_OPCIONES = 'elParcial.opciones';
const CLAVE_SALTAR_INTRO = 'operacionMachete.saltarIntro';

// "Jugar de nuevo" recarga la página: en ese caso se vuelve directo al menú, sin repetir la intro
export function recargarSinIntro() {
  try {
    sessionStorage.setItem(CLAVE_SALTAR_INTRO, '1');
  } catch {
    /* sin almacenamiento */
  }
  location.reload();
}
function haySaltoDeIntro() {
  const porURL = new URLSearchParams(location.search).get('intro') === '0';
  try {
    const guardado = sessionStorage.getItem(CLAVE_SALTAR_INTRO) === '1';
    sessionStorage.removeItem(CLAVE_SALTAR_INTRO);
    return porURL || guardado;
  } catch {
    return porURL;
  }
}

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

// ---------- Finales ilustrados ----------
// Cada final es una secuencia de escenas: un dibujo a pantalla completa y las líneas que aparecen
// abajo, como subtítulos. Entre una escena y la siguiente hay un fundido cruzado.
// Los dibujos van en public/finales/. Si un archivo no existe, se usa el color de fondo (`fondo`),
// así se puede probar el texto antes de tener el dibujo: alcanza con agregar el PNG y recargar.
const RUTA_FINALES = `${import.meta.env.BASE_URL}finales/`;

function guionFinal(tipo, { notaPropia, correctas, aprobado }) {
  if (tipo === 'traicion') {
    const loSuyo = correctas > 0
      ? `— Las que hiciste vos estaban bien. Con lo tuyo ibas por un ${notaPropia}.`
      : '— Ni lo intentaste solo. Y yo sé que podías.';
    return [
      {
        // Corte a negro: los amigos se van (no se ve el dibujo, sólo el texto centrado como en la intro)
        negro: true,
        lineas: [
          { texto: '🔔 Suena el timbre.' },
          { texto: `${NOMBRES.senias}, ${NOMBRES.mensajero} y ${NOMBRES.grupo} pasan al lado de tu banco.` },
          { texto: '— Uh, qué mala suerte tuviste, quedaste re regalado ahí.', quien: NOMBRES.mensajero },
          { texto: 'Se van riéndose.' },
        ],
      },
      {
        // Escena 1, reto: le habla en serio
        imagen: 'traicion-1.png',
        fondo: 'linear-gradient(160deg, #2c3a55, #4b5d7a 55%, #2a3248)',
        lineas: [
          { texto: 'El aula se vacía. La única que se queda es ella.' },
          { texto: loSuyo, quien: 'Profesora' },
          { texto: '— No me preocupa este parcial. Me preocupa que te acostumbres.', quien: 'Profesora' },
        ],
      },
      {
        // Escena 1, reto 2: te mira fijo y se ilumina el fondo (las palabras sabias)
        imagen: 'traicion-2.png',
        fondo: 'radial-gradient(circle at 60% 40%, #f2c98a, #8a7a8c 55%, #34405a)',
        destello: true,
        lineas: [
          { texto: '— Lo fácil sale barato una vez. Después lo pagás todo junto.', quien: 'Profesora' },
          { texto: '— Copiarse no te ahorra el esfuerzo. Te lo deja para más adelante, y con intereses.', quien: 'Profesora' },
          { texto: 'De todos los que estaban en el aula, la única que se quedó fue la que te anuló.' },
        ],
      },
    ];
  }
  if (tipo === 'merito') {
    return [
      {
        // Pasillo vacío
        imagen: 'merito-1.png',
        fondo: 'linear-gradient(170deg, #9aa6b4, #c9ccd0 60%, #7c8592)',
        lineas: [
          { texto: '🔔 Suena el timbre. Entregás la hoja.' },
          { texto: 'Tus amigos no te esperaron a la salida.' },
          { texto: 'En el celular, el grupo «Operación Machete»: <i>gracias por nada.</i>' },
          { texto: `<b>${NOMBRES.mensajero} te eliminó del grupo.</b>` },
        ],
      },
      {
        // Comedor: los mirás a la cara
        imagen: 'merito-2.png',
        fondo: 'radial-gradient(circle at 50% 30%, #ffd9a0, #c8743a 60%, #5a3828)',
        lineas: aprobado
          ? [
              { texto: 'Esa noche, el mismo comedor. La mesa ya no tiene apuntes.' },
              { texto: 'Les mostrás la nota. Y por primera vez, los mirás a la cara.' },
              { texto: '— ¿Viste que podías?', quien: 'Mamá' },
            ]
          : [
              { texto: 'Esa noche, el mismo comedor. La mesa ya no tiene apuntes.' },
              { texto: 'Les mostrás la nota. No alcanzó. Pero por primera vez, los mirás a la cara: cada respuesta fue tuya.' },
              { texto: '— La próxima sale. Esta vez estudiaste de verdad.', quien: 'Papá' },
            ],
      },
      {
        // Bajás la mirada al celular y te acordás de tus amigos
        imagen: 'merito-3.png',
        fondo: 'radial-gradient(circle at 50% 70%, #b7cde6, #a2603a 55%, #3a241a)',
        lineas: [
          { texto: 'Pero lo que te pesa no es la materia: es haber dicho que sí a algo que sabías que no ibas a cumplir.' },
          { texto: 'Antes de dormir, les escribís: <i>«perdón. no tendría que haber dicho que sí. para el recu, si quieren, estudiamos juntos.»</i>' },
          { texto: 'Visto. Nadie contesta. Todavía.' },
        ],
      },
    ];
  }
  return null; // el final neutral sigue siendo la tarjeta de texto
}

// Tiempo que queda cada línea en pantalla si el jugador no la adelanta
const duracionLinea = (texto) => 2.6 + texto.replace(/<[^>]+>/g, '').length * 0.05;

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
  constructor({ alEmpezar, alContinuar, alVerIntro }) {
    this.ui = document.getElementById('ui');
    this.alEmpezar = alEmpezar;
    this.alContinuar = alContinuar;
    this.alVerIntro = alVerIntro;
    this.escondite = estado.escondite;
    this.crearInicio();
    this.crearPausa();
    this.crearOpciones();
    this.fundidoEl = this.div('fundido');
    this.precargarFinales();
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

  // ---------- Bienvenida (el clic habilita el audio del navegador) ----------
  crearBienvenida({ alEntrar }) {
    const volver = haySaltoDeIntro();
    this.bienvenida = this.div(
      'pantalla splash',
      `<h1 class="logo"><small>UTN FRC · Entornos Virtuales</small>Operación Machete</h1>
       <p class="lema">Un parcial. Un grupo de amigos. Un plan para copiarse sin que la profe se dé cuenta.</p>
       <p class="cargando">Cargando personajes…</p>
       <button class="boton-grande" data-accion="entrar" hidden>${volver ? 'Volver al aula' : 'Hacé clic para empezar'}</button>
       <button class="saltar-intro" data-accion="saltar" hidden>Saltar la intro e ir directo al menú</button>
       <p class="nota-auriculares">🎧 Mejor con auriculares</p>`,
    );
    const entrar = this.bienvenida.querySelector('[data-accion="entrar"]');
    const saltar = this.bienvenida.querySelector('[data-accion="saltar"]');
    entrar.addEventListener('click', () => alEntrar(volver));
    saltar.addEventListener('click', () => alEntrar(true));
    this.bienvenidaProgreso = (n, total) => {
      this.bienvenida.querySelector('.cargando').textContent = `Cargando personajes… ${n}/${total}`;
    };
    this.bienvenidaLista = () => {
      this.bienvenida.querySelector('.cargando').textContent = '';
      entrar.hidden = false;
      saltar.hidden = volver;
      entrar.focus();
    };
  }

  ocultarBienvenida() {
    this.bienvenida.style.display = 'none';
  }

  // ---------- Menú principal: cómo se juega, controles y escondite ----------
  crearInicio() {
    this.inicio = this.div(
      'pantalla menu inicio',
      `<div class="tarjeta tarjeta-ancha">
        <h1 class="logo"><small>Primer parcial</small>Operación Machete</h1>
        <p class="bajada">Mañana de parcial. Te sentaron en el banco del medio, a la vista de todos. Desde las esquinas,
          ${NOMBRES.senias} y ${NOMBRES.mensajero} esperan que les pases las respuestas de tu machete, y ${NOMBRES.grupo} te presiona desde adelante.
          La profe patrulla el aula. En tu casa esperan un aprobado <i>sí o sí</i>.</p>
        <div class="pestanas" role="tablist">
          <button class="pestana" role="tab" data-pestana="como" aria-selected="true">Cómo se juega</button>
          <button class="pestana" role="tab" data-pestana="controles" aria-selected="false">Controles</button>
        </div>
        <div class="columnas">
          <section class="panel-pestana" data-panel="como">
            <h2>Objetivo</h2>
            <ul class="mecanicas">
              <li><span>📝</span><div>Respondé las <b>8 preguntas</b> en <b>8 minutos</b>. Mirar tu hoja te calma y nunca levanta sospechas.</div></li>
              <li><span>💡</span><div>Si te trabás en una pregunta, quedate mirándola: <b>tu memoria</b> te ilumina las palabras clave. Sí estudiaste.</div></li>
              <li><span>📄</span><div><b>Machete:</b> tiene tus respuestas y las que le debés al grupo. Abrirlo es trampa.</div></li>
              <li><span>✋</span><div><b>${NOMBRES.senias}</b> (fondo izquierda) golpea la lapicera 3 veces y muestra dedos: 1=A, 2=B, 3=C, 4=D. Mirala para leerla.</div></li>
              <li><span>🏀</span><div><b>${NOMBRES.mensajero}</b> (fondo derecha) te tira papelitos: atrapalos, leelos y devolvé la respuesta.</div></li>
              <li><span>👩‍🏫</span><div><b>La profe</b> ve con un cono de visión y escucha los ruidos. Si te ve haciendo trampa con la sospecha al 100, te anula el examen.</div></li>
              <li><span>💓</span><div><b>Pánico:</b> si está cerca mientras hacés trampa, se te nubla la vista y te tiembla el pulso.</div></li>
            </ul>
            <div class="caminos">
              <div class="camino-1"><b>Seguir con el grupo</b>Más riesgo, más nervios… ¿te van a bancar si te agarran?</div>
              <div class="camino-2"><b>Cortar la red</b>Guardá el machete (G) y resolvelo por tu cuenta.</div>
            </div>
          </section>
          <section class="panel-pestana" data-panel="controles" hidden>
            <h2>Controles</h2>
            ${this.tablaControles()}
            <p class="nota-auriculares">🎧 Los pasos de la profe se escuchan en estéreo (además hay indicadores y subtítulos).</p>
          </section>
          <section>
            <h2>¿Dónde escondés el machete?</h2>
            <div class="escondites" role="radiogroup">
              ${ESCONDITES.map(
                (e) => `<button class="escondite" role="radio" data-id="${e.id}">
                  <span class="esc-icono">${e.icono}</span><b>${e.nombre}</b>
                  <span class="esc-pro">＋ ${e.pro}</span><span class="esc-contra">－ ${e.contra}</span>
                </button>`,
              ).join('')}
            </div>
            <p class="nota-chat" hidden>Es lo que le dijiste al grupo anoche. Todavía podés cambiarlo.</p>
            <h2>Antes de empezar</h2>
            <ul class="mecanicas">
              <li><span>🖱️</span><div>Al empezar se captura el mouse para mirar alrededor. <b>Esc</b> lo suelta y pausa.</div></li>
              <li><span>🪑</span><div>Estás sentado: podés girar la cabeza, pero no darte vuelta del todo.</div></li>
            </ul>
          </section>
        </div>
        <div class="botonera">
          <button class="boton-grande" data-accion="empezar">Empezar el examen</button>
          <button class="boton-secundario" data-accion="opciones">Opciones</button>
          <button class="boton-secundario" data-accion="intro">Ver la intro de nuevo</button>
        </div>
        <p class="aviso-lock" hidden>Hacé clic de nuevo para tomar el control del mouse.</p>
      </div>`,
    );
    this.inicio.style.cursor = 'default';
    this.inicio.style.display = 'none';
    const marcar = () =>
      this.inicio.querySelectorAll('.escondite').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.id === this.escondite)));
    this.marcarEscondite = marcar;
    this.inicio.querySelectorAll('.escondite').forEach((b) =>
      b.addEventListener('click', () => {
        this.escondite = b.dataset.id;
        marcar();
      }),
    );
    marcar();
    // Pestañas: "Cómo se juega" / "Controles"
    this.inicio.querySelectorAll('.pestana').forEach((b) =>
      b.addEventListener('click', () => {
        this.inicio.querySelectorAll('.pestana').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
        this.inicio.querySelectorAll('.panel-pestana').forEach((panel) => (panel.hidden = panel.dataset.panel !== b.dataset.pestana));
      }),
    );
    this.inicio.querySelector('[data-accion="empezar"]').addEventListener('click', () => {
      estado.escondite = this.escondite;
      this.alEmpezar().catch(() => (this.inicio.querySelector('.aviso-lock').hidden = false));
    });
    this.inicio.querySelector('[data-accion="opciones"]').addEventListener('click', () => this.mostrarOpciones(this.inicio));
    this.inicio.querySelector('[data-accion="intro"]').addEventListener('click', () => this.alVerIntro?.());
  }

  // Muestra el menú; si el jugador eligió escondite en el chat, queda preseleccionado
  mostrarInicio(esconditeDelChat) {
    if (esconditeDelChat) {
      this.escondite = esconditeDelChat;
      this.marcarEscondite();
    }
    this.inicio.querySelector('.nota-chat').hidden = !esconditeDelChat;
    this.inicio.style.display = 'flex';
    this.inicio.querySelector('[data-accion="empezar"]').focus();
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
    this.pausa.querySelector('[data-accion="reiniciar"]').addEventListener('click', () => recargarSinIntro());
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
        <label class="opcion"><span>Calidad gráfica</span>
          <select data-clave="calidad">
            ${[['auto', 'Automática'], ['alta', 'Alta'], ['media', 'Media'], ['baja', 'Baja (PC lenta)']]
              .map(([v, t]) => `<option value="${v}" ${(o.calidad ?? 'auto') === v ? 'selected' : ''}>${t}</option>`)
              .join('')}
          </select><output></output></label>
        <label class="opcion casilla"><input type="checkbox" data-clave="mostrarFps" ${o.mostrarFps ? 'checked' : ''}>
          <span>Mostrar FPS</span></label>
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
    this.opciones.querySelector('select[data-clave="calidad"]').addEventListener('change', (e) => {
      o.calidad = e.target.value;
      guardarOpciones(o);
      bus.emit('calidad', o.calidad);
    });
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
  mostrarFinal(datos) {
    this.pausa.style.display = 'none';
    const escenas = guionFinal(datos.tipo, datos);
    if (escenas) this.mostrarFinalIlustrado(datos, escenas);
    else this.mostrarTarjetaFinal(datos);
  }

  // Precarga los dibujos para que el fundido no espere a que bajen
  precargarFinales() {
    for (const f of ['traicion-1.png', 'traicion-2.png', 'merito-1.png', 'merito-2.png', 'merito-3.png']) {
      const img = new Image();
      img.src = RUTA_FINALES + f;
    }
  }

  async mostrarFinalIlustrado(datos, escenas) {
    const { tipo } = datos;
    const el = this.div(`pantalla cine cine-${tipo}`, `
      <div class="cine-escenas">
        ${escenas.map((e) => (e.negro
          ? '<div class="cine-escena cine-escena-negra"></div>'
          : `<div class="cine-escena" style="background:${e.fondo}">
          <img src="${RUTA_FINALES}${e.imagen}" alt="" draggable="false">
        </div>`)).join('')}
      </div>
      <div class="cine-texto"><p class="cine-linea"></p><span class="cine-ayuda">Clic o Espacio para seguir</span></div>
      <button class="cine-saltar">Saltar ▸▸</button>`);
    el.style.cursor = 'default';
    this.final = el;
    // Si falta un dibujo, queda el fondo de color de esa escena
    el.querySelectorAll('.cine-escena img').forEach((img) => {
      img.addEventListener('error', () => img.remove());
    });

    const capas = [...el.querySelectorAll('.cine-escena')];
    const linea = el.querySelector('.cine-linea');
    let saltar = false;
    let avanzar = null;
    const seguir = () => avanzar?.();
    const teclas = (e) => {
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        seguir();
      }
    };
    el.addEventListener('click', seguir);
    window.addEventListener('keydown', teclas);
    el.querySelector('.cine-saltar').addEventListener('click', (e) => {
      e.stopPropagation();
      saltar = true;
      seguir();
    });
    // Espera a que pase el tiempo o a que el jugador adelante (lo que ocurra primero)
    const esperar = (segundos) => new Promise((resolver) => {
      const t = setTimeout(() => { avanzar = null; resolver(); }, segundos * 1000);
      avanzar = () => { clearTimeout(t); avanzar = null; resolver(); };
    });

    void el.offsetWidth; // para que el primer dibujo aparezca con fundido
    for (let i = 0; i < escenas.length && !saltar; i++) {
      capas.forEach((c, j) => c.classList.toggle('activa', j === i));
      // En negro el texto va centrado y grande, como los carteles de la intro
      el.classList.toggle('cine-en-negro', !!escenas[i].negro);
      linea.classList.remove('visible');
      if (escenas[i].destello) bus.emit('destelloMemoria');
      await esperar(escenas[i].negro ? 0.8 : i === 0 ? 1.4 : 1.8); // deja ver el dibujo antes del texto
      for (const l of escenas[i].lineas) {
        if (saltar) break;
        linea.classList.remove('visible');
        linea.innerHTML = l.quien ? `<b>${l.quien}:</b> ${l.texto}` : l.texto;
        void linea.offsetWidth; // reinicia la animación
        linea.classList.add('visible');
        await esperar(duracionLinea(l.texto));
      }
    }

    window.removeEventListener('keydown', teclas);
    el.removeEventListener('click', seguir);
    capas.forEach((c, j) => c.classList.toggle('activa', j === capas.length - 1));
    el.classList.remove('cine-en-negro');
    el.querySelector('.cine-texto').remove();
    el.querySelector('.cine-saltar').remove();
    // Al final aparece la tarjeta con la nota, encima del último dibujo
    const tarjeta = document.createElement('div');
    tarjeta.className = 'cine-resultado';
    tarjeta.innerHTML = this.htmlTarjetaFinal(datos, null);
    el.appendChild(tarjeta);
    tarjeta.querySelector('[data-accion="denuevo"]').addEventListener('click', () => recargarSinIntro());
  }

  mostrarTarjetaFinal(datos) {
    const { tipo, aprobado } = datos;
    const lineas = [
      '🔔 Suena el timbre.',
      'Entregás la hoja entre señas, papelitos y miradas de reojo.',
      'Nadie te descubrió… y tampoco terminaste de decidir de qué lado estabas.',
    ];
    this.final = this.div(`pantalla menu pantalla-final pantalla-${tipo}`, this.htmlTarjetaFinal(datos, lineas));
    this.final.style.cursor = 'default';
    this.final.querySelector('[data-accion="denuevo"]').addEventListener('click', () => recargarSinIntro());
  }

  // Tarjeta con título, nota, cierre y estadísticas. `lineas` (opcional) es el texto narrado.
  htmlTarjetaFinal({ tipo, nota, notaPropia, correctas, total, aprobado, estadisticas: s }, lineas) {
    let titulo;
    let cierre;
    if (tipo === 'traicion') {
      titulo = 'Examen anulado';
      cierre = `Desaprobaste una materia que sabías resolver.<br><small>Con lo que habías respondido vos solo ibas por un <b>${notaPropia}</b>.</small>`;
    } else if (tipo === 'merito') {
      titulo = aprobado ? 'Aprobado por mérito propio' : 'Lo hiciste por tu cuenta';
      cierre = aprobado
        ? 'Aprobaste por mérito propio.<br><small>Ser fiel a vos mismo a veces tiene un precio. Prometer de más, también.</small>'
        : 'Desaprobaste, pero sin deberle nada a nadie.<br><small>Prometer de más también tiene un precio.</small>';
    } else {
      titulo = 'Se terminó el examen';
      cierre = aprobado ? 'Aprobaste.' : 'Desaprobaste.';
    }
    const n = lineas?.length ?? 0;
    return `
      <div class="tarjeta final final-${tipo}">
        <h1>${titulo}</h1>
        ${n ? `<div class="lineas">${lineas.map((l, i) => `<p style="animation-delay:${0.6 + i * 1.1}s">${l}</p>`).join('')}</div>` : ''}
        <div class="resultado-final" style="animation-delay:${n ? 0.8 + n * 1.1 : 0.3}s">
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
  }
}
