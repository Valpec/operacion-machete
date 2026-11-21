import * as THREE from 'three';
import balance from './data/balance.json';
import datosExamen from './data/examen.json';
import './ui/hud.css';
import './ui/fase4.css';
import './ui/menus.css';
import './ui/intro.css';
import { Intro } from './intro/Intro.js';
import { Game } from './core/Game.js';
import { Input } from './core/Input.js';
import { CONTROLES } from './core/controles.js';
import { estado } from './core/GameState.js';
import { bus } from './core/EventBus.js';
import { CamaraPrimeraPersona } from './core/CamaraPrimeraPersona.js';
import { crearAula } from './world/Aula.js';
import { crearElenco } from './characters/Elenco.js';
import { precargarModelos } from './characters/Personaje.js';
import { rutasModelos } from './characters/config.js';
import { Navegacion } from './world/Navegacion.js';
import { ProfesoraIA } from './systems/ProfesoraIA.js';
import { Debug } from './systems/Debug.js';
import { Examen } from './systems/Examen.js';
import { ModoHoja } from './systems/ModoHoja.js';
import { PanelExamen } from './ui/PanelExamen.js';
import { HUD } from './ui/HUD.js';
import { Resaltado } from './systems/Resaltado.js';
import { BrazosJugador } from './systems/BrazosJugador.js';
import { Machete } from './systems/Machete.js';
import { Senias } from './systems/Senias.js';
import { Papelitos } from './systems/Papelitos.js';
import { Grupo } from './systems/Grupo.js';
import { Finales } from './systems/Finales.js';
import { Panico } from './systems/Panico.js';
import { Postprocesado } from './fx/Postprocesado.js';
import { AudioManager } from './audio/AudioManager.js';
import { Pantallas, cargarOpciones } from './ui/Pantallas.js';
import { Calidad } from './core/Calidad.js';

// ---------- Opciones del jugador (se recuerdan entre partidas si el navegador lo permite) ----------
estado.opciones = {
  sensibilidad: 1,
  subtitulos: true,
  volumenGeneral: 0.8,
  volumenEfectos: 1,
  intensidadDesenfoque: 1,
  intensidadVibracion: 1,
  calidad: 'auto',     // 'auto' | 'alta' | 'media' | 'baja'
  mostrarFps: false,
};
cargarOpciones(estado.opciones);
// Atajo para pruebas: ?escondite=manga|celular|cartuchera preselecciona el escondite
const esconditeURL = new URLSearchParams(location.search).get('escondite');
if (['cartuchera', 'manga', 'celular'].includes(esconditeURL)) estado.escondite = esconditeURL;

// ---------- Motor, mundo y personajes ----------
const game = new Game(document.getElementById('app'), balance);
const input = new Input(game.renderer.domElement);
game.scene.background = new THREE.Color(0xd9ecff);

// ---------- Pantallas: bienvenida, menú, pausa, opciones y finales ----------
let audio = null;
let intro = null;
const pantallas = new Pantallas({
  alEmpezar: async () => {
    audio.iniciar(); // el audio sólo puede arrancar con un gesto del usuario
    await input.bloquear();
  },
  alContinuar: () => input.bloquear(),
  alVerIntro: async () => {
    pantallas.ocultarInicio();
    await verIntro();
  },
});
// Acto I: la cena y el chat del grupo; al terminar (o saltarla) aparece el menú principal
async function verIntro() {
  const r = await intro.reproducir();
  if (r.escondite) estado.escondite = r.escondite;
  pantallas.mostrarInicio(r.escondite);
}
pantallas.crearBienvenida({
  alEntrar: async (saltarIntro) => {
    THREE.AudioContext.getContext().resume();
    pantallas.ocultarBienvenida();
    if (saltarIntro) pantallas.mostrarInicio();
    else await verIntro();
  },
});

const aula = crearAula(balance);
game.scene.add(aula.grupo);
// Los modelos se cargan antes de armar el elenco (se les arma el esqueleto al crearlos)
await precargarModelos(rutasModelos(), pantallas.bienvenidaProgreso);
const elenco = crearElenco(aula, game.scene);

// Cámara del jugador anclada al cuello del protagonista
const camara = new CamaraPrimeraPersona(game.camera, input, balance, estado.opciones);
camara.anclar(game.scene, aula.bancoCentral.asiento);

// IA de la profesora sobre el grafo de pasillos
const nav = new Navegacion(aula, balance);
const profesora = new ProfesoraIA({ personaje: elenco.profesora, aula, nav, balance, camera: game.camera, elenco });
const debug = new Debug({ game, scene: game.scene, profesora, nav, balance, aula });

// ---------- Examen, modo hoja y HUD ----------
const examen = new Examen(datosExamen, balance);
const modoHoja = new ModoHoja({ input, camara, protagonista: elenco.protagonista, balance });
const panelExamen = new PanelExamen({ examen, input, balance });
const hud = new HUD({ camera: game.camera, profesora, examen, balance });
hud.registrarAcciones(() =>
  estado.accion.modoHoja
    ? [
        { tecla: '1–4', texto: 'marcar opción' },
        { tecla: '← →', texto: 'cambiar pregunta' },
        { tecla: 'Soltar Espacio', texto: 'levantar la vista' },
      ]
    : [{ tecla: 'Mantener Espacio', texto: 'mirar tu hoja' }],
);

// ---------- Trampas: machete, señas, papelitos y el grupo ----------
const resaltado = new Resaltado(camara);
const brazos = new BrazosJugador(elenco.protagonista);
const machete = new Machete({ input, examen, balance, camara, hud });
const senias = new Senias({ personaje: elenco.senias, profesora, camara, hud, examen, balance, resaltado });
const papelitos = new Papelitos({ scene: game.scene, aula, elenco, profesora, camara, hud, examen, balance, input, resaltado, brazos });
const grupo = new Grupo({ elenco, profesora, camara, hud, balance });
hud.registrarAcciones(() => {
  if (estado.accion.modoHoja || estado.macheteGuardado) return [];
  return [
    { tecla: 'Mantener E', texto: `machete (${estado.escondite})` },
    { tecla: 'G', texto: 'guardar el machete para siempre' },
  ];
});

// ---------- Audio y finales ----------
const finales = new Finales({ input, camara, profesora, elenco, aula, examen, papelitos, senias, grupo, hud, panelExamen, pantallas, balance });

// ---------- Orden de actualización ----------
// (el panel del examen consume el mouse antes que la cámara cuando la hoja está a la vista)
game.agregar({
  update: (dt) => {
    if (!estado.final) estado.tiempo += dt;
    aula.reloj.actualizar(estado.tiempo);
  },
});
game.agregar(modoHoja);
game.agregar(panelExamen);
game.agregar(camara);
game.agregar(examen);
game.agregar(machete);
game.agregar(senias);
game.agregar(papelitos);
game.agregar(grupo);
game.agregar(brazos);
game.agregar(resaltado);
game.agregar(profesora);
game.agregar(finales);
const panico = game.agregar(new Panico({ profesora, aula, camara, balance }));
const postpro = game.agregar(new Postprocesado(game, balance));
postpro.ia = profesora;
audio = game.agregar(new AudioManager({ camera: game.camera, profesora, elenco, aula, balance }));
game.agregar({ update: (dt, t) => elenco.update(dt, t) });
game.agregar(hud);
game.agregar(debug);
// Calidad gráfica (resolución, sombras, contornos del fondo) y contador de FPS
const calidad = game.agregar(new Calidad({ game, aula, elenco, postpro, hud }));
window.__calidad = calidad;
intro = game.agregar(new Intro(game));

// ---------- Pausa: al soltar el mouse (Esc) ----------
estado.pausado = true;
bus.on('pointerlock', (bloqueado) => {
  if (estado.final) return;
  if (bloqueado) {
    if (!estado.iniciado) {
      estado.iniciado = true;
      pantallas.ocultarInicio();
      document.getElementById('ui').classList.add('jugando'); // recién ahora se ve el HUD
    }
    pantallas.mostrarPausa(false);
    estado.pausado = false;
  } else if (estado.iniciado) {
    estado.pausado = true;
    pantallas.mostrarPausa(true);
  }
});

// Evita que la barra espaciadora "clickee" botones con foco
window.addEventListener('keydown', (e) => {
  if (e.code === CONTROLES.modoHoja && document.activeElement?.tagName === 'BUTTON') e.preventDefault();
});

game.iniciar();
pantallas.bienvenidaLista();

// Acceso rápido desde la consola del navegador para depurar
window.__parcial = { game, aula, elenco, camara, estado, profesora, nav, examen, input, senias, papelitos, machete, hud, panico, postpro, audio, finales, grupo, pantallas, intro };
