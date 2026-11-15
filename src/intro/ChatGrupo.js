import { NOMBRES } from '../characters/config.js';

// Colores de cada amigo en el chat = color de su buzo en el aula (así el jugador los reconoce)
const COLORES = {
  [NOMBRES.mensajero]: '#5fbf7f',
  [NOMBRES.senias]: '#7cc8f2',
  [NOMBRES.grupo]: '#c3a6f0',
};

// Guion del grupo. "elegir" muestra opciones de respuesta; cada opción puede tener su propia continuación.
const GUION = [
  { sistema: `${NOMBRES.mensajero} creó el grupo "Operación Machete 📝"` },
  { sistema: `${NOMBRES.mensajero} te añadió` },
  { de: NOMBRES.mensajero, texto: 'bueno gente 🫡' },
  { de: NOMBRES.mensajero, texto: 'mañana es el parcial y ninguno abrió la carpeta' },
  { de: NOMBRES.senias, texto: 'yo ni sé qué temas entran jajaja' },
  { de: NOMBRES.grupo, texto: 'si me llevo esta materia mis viejos me matan 😭😭' },
  { de: NOMBRES.mensajero, texto: 'tranqui que ya está todo pensado' },
  { de: NOMBRES.mensajero, texto: 'vos que sos el único que estudia 👀 armás el machete con las respuestas de todos' },
  { de: NOMBRES.senias, texto: 'yo me siento atrás. hago 3 golpes con la lapicera y te muestro los dedos: 1=A 2=B 3=C 4=D' },
  { de: NOMBRES.mensajero, texto: 'y yo te tiro papelitos. vos me los devolvés con la respuesta 🏀' },
  { de: NOMBRES.grupo, texto: 'dale porfa, sin vos no hay plan 🙏' },
  { de: NOMBRES.mensajero, texto: 'dejá esa carpeta y vení a jugar con los pibes, con el machete no hace falta estudiar' },
  {
    elegir: [
      { texto: 'Dale, cuenten conmigo', id: 'si' },
      {
        texto: 'No sé... ¿y si nos agarran?',
        id: 'duda',
        luego: [
          { de: NOMBRES.senias, texto: 'ay no seas así 🙄' },
          { de: NOMBRES.mensajero, texto: 'somos un equipo o no?' },
          { de: NOMBRES.grupo, texto: 'nos vas a dejar tirados justo ahora??' },
          { de: NOMBRES.mensajero, texto: 'la profe no ve nada, ya lo hicimos mil veces' },
          { elegir: [{ texto: 'Bueno, está bien. Lo armo.', id: 'si' }] },
        ],
      },
    ],
  },
  { de: NOMBRES.mensajero, texto: 'ESAAA 🔥🔥🔥' },
  { de: NOMBRES.senias, texto: 'sos un genio' },
  { de: NOMBRES.mensajero, texto: 'y dónde lo vas a esconder?' },
  {
    elegir: [
      { texto: '✏️ En la cartuchera', id: 'cartuchera', luego: [{ de: NOMBRES.senias, texto: 'clásico. tarda en abrirse pero no hace ruido 🤫' }] },
      { texto: '👕 En la manga del buzo', id: 'manga', luego: [{ de: NOMBRES.mensajero, texto: 'rapidísimo. pero ojo con el gesto que la profe no es ciega' }] },
      { texto: '📱 En el celular', id: 'celular', luego: [{ de: NOMBRES.grupo, texto: 'se lee re bien… pero si te lo ve, fuiste 💀' }] },
    ],
    escondite: true,
  },
  { de: NOMBRES.mensajero, texto: 'listo. mañana en el aula 🤝' },
  { de: NOMBRES.mensajero, texto: 'que no te vea la profe 👀' },
];

const esc = (t) => t.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

/**
 * Chat del grupo en un celular (HTML). Los mensajes llegan solos con "escribiendo…";
 * clic, Espacio o Enter apuran el siguiente. Las respuestas se eligen con el mouse o con 1–3.
 * Devuelve { escondite } con lo que eligió el jugador.
 */
export class ChatGrupo {
  constructor(contenedor, { sonar }) {
    this.sonar = sonar ?? (() => {});
    this.el = document.createElement('div');
    this.el.className = 'chat-celular';
    this.el.innerHTML = `
      <div class="chat-marco">
        <div class="chat-cabecera">
          <span class="chat-volver">‹</span>
          <span class="chat-avatar">📝</span>
          <div><b>Operación Machete</b><small class="chat-estado">${NOMBRES.mensajero}, ${NOMBRES.senias}, ${NOMBRES.grupo}, vos</small></div>
        </div>
        <div class="chat-mensajes" aria-live="polite"></div>
        <div class="chat-pie"><div class="chat-entrada">Mensaje</div></div>
      </div>
      <p class="chat-ayuda">Clic o Espacio para seguir</p>`;
    contenedor.appendChild(this.el);
    this.mensajes = this.el.querySelector('.chat-mensajes');
    this.pie = this.el.querySelector('.chat-pie');
    this.estado = this.el.querySelector('.chat-estado');
    this.apurar = null;
    this.cancelado = false;
    this.alTeclear = (e) => {
      if (['Space', 'Enter'].includes(e.code)) {
        e.preventDefault();
        this.apurar?.();
      }
      const n = ['Digit1', 'Digit2', 'Digit3'].indexOf(e.code);
      if (n >= 0) this.el.querySelectorAll('.chat-opcion')[n]?.click();
    };
    this.alClic = (e) => {
      if (!e.target.closest('.chat-opcion')) this.apurar?.();
    };
    window.addEventListener('keydown', this.alTeclear);
    this.el.addEventListener('click', this.alClic);
  }

  // Espera que se puede apurar con clic/tecla
  esperar(segundos) {
    return new Promise((resolver) => {
      const id = setTimeout(fin, segundos * 1000);
      function fin() {
        clearTimeout(id);
        resolver();
      }
      this.apurar = () => {
        this.apurar = null;
        fin();
      };
    });
  }

  agregar(html, clase) {
    const div = document.createElement('div');
    div.className = clase;
    div.innerHTML = html;
    this.mensajes.appendChild(div);
    this.mensajes.scrollTop = this.mensajes.scrollHeight;
    return div;
  }

  hora() {
    this.minuto = (this.minuto ?? 47) + (Math.random() < 0.4 ? 1 : 0);
    return `23:${String(Math.min(59, this.minuto)).padStart(2, '0')}`;
  }

  async mensaje(m) {
    if (m.sistema) {
      this.agregar(esc(m.sistema), 'chat-sistema');
      await this.esperar(0.9);
      return;
    }
    // "escribiendo…"
    this.estado.textContent = `${m.de} está escribiendo…`;
    const escribiendo = this.agregar(`<span></span><span></span><span></span>`, 'chat-escribiendo');
    await this.esperar(Math.min(1.7, 0.55 + m.texto.length * 0.018));
    escribiendo.remove();
    this.estado.textContent = `${NOMBRES.mensajero}, ${NOMBRES.senias}, ${NOMBRES.grupo}, vos`;
    this.agregar(
      `<b style="color:${COLORES[m.de] ?? '#ddd'}">${esc(m.de)}</b><span>${esc(m.texto)}</span><time>${this.hora()}</time>`,
      'chat-burbuja chat-otro',
    );
    this.sonar('notificacion');
    await this.esperar(0.35 + m.texto.length * 0.012);
  }

  elegir(opciones) {
    return new Promise((resolver) => {
      this.pie.innerHTML = opciones
        .map((o, i) => `<button class="chat-opcion"><kbd>${i + 1}</kbd> ${esc(o.texto)}</button>`)
        .join('');
      this.pie.classList.add('eligiendo');
      this.pie.querySelectorAll('.chat-opcion').forEach((b, i) =>
        b.addEventListener('click', () => {
          this.pie.classList.remove('eligiendo');
          this.pie.innerHTML = '<div class="chat-entrada">Mensaje</div>';
          this.agregar(`<span>${esc(opciones[i].texto)}</span><time>${this.hora()} ✓✓</time>`, 'chat-burbuja chat-mio');
          this.sonar('enviado');
          resolver(opciones[i]);
        }),
      );
    });
  }

  async reproducir(guion = GUION) {
    const resultado = { escondite: null };
    const correr = async (lista) => {
      for (const m of lista) {
        if (this.cancelado) return;
        if (m.elegir) {
          const op = await this.elegir(m.elegir);
          if (m.escondite) resultado.escondite = op.id;
          await this.esperar(0.6);
          if (op.luego) await correr(op.luego);
        } else await this.mensaje(m);
      }
    };
    await correr(guion);
    if (!this.cancelado) await this.esperar(1.6);
    return resultado;
  }

  cerrar() {
    this.cancelado = true;
    this.apurar?.();
    window.removeEventListener('keydown', this.alTeclear);
    this.el.classList.add('saliendo');
    setTimeout(() => this.el.remove(), 700);
  }
}
