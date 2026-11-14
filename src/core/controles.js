// Mapa de controles del juego. Cambiá acá cualquier tecla o botón.
// Las teclas usan KeyboardEvent.code (independiente del idioma del teclado).
// Los botones del mouse: 0 = izquierdo, 1 = medio, 2 = derecho.
export const CONTROLES = {
  modoHoja: 'Space',          // mantener: bajar la vista a la hoja
  espiarMachete: 'KeyE',      // mantener: mirar el machete
  guardarMachete: 'KeyG',     // guardar el machete para siempre (pide confirmación)
  pausa: 'Escape',            // pausa y opciones
  debug: 'F1',                // mostrar cono de visión, waypoints y sospecha
  dedos: ['Digit1', 'Digit2', 'Digit3', 'Digit4'], // responder una seña con los dedos
  // En el modo hoja: marcar la opción A-D y cambiar de pregunta
  opciones: ['Digit1', 'Digit2', 'Digit3', 'Digit4'],
  preguntaAnterior: 'ArrowLeft',
  preguntaSiguiente: 'ArrowRight',
  // Sólo funcionan con el modo debug activo
  debugRuido: 'KeyN',         // genera un ruido fuerte en el banco central
  debugTrampa: 'KeyT',        // simula que el jugador está haciendo trampa
  debugCenital: 'KeyV',       // vista desde arriba del aula
  botonInteractuar: 0,        // clic izquierdo: atrapar papelito / interactuar
  botonLanzar: 2,             // clic derecho (mantener y soltar): lanzar papelito
};
