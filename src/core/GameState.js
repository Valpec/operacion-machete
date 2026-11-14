// Estado global de la partida: lo que distintos sistemas necesitan leer o escribir.
export function crearEstadoInicial() {
  return {
    escondite: 'cartuchera',   // 'cartuchera' | 'manga' | 'celular'
    acto: 2,                   // 2, 3 o 4
    tiempo: 0,                 // segundos transcurridos de examen
    pausado: false,
    debug: false,
    // Acciones que el jugador está haciendo en este instante
    accion: {
      modoHoja: false,
      machete: false,          // machete abierto (o abriéndose)
      mirandoSenia: false,     // mirando a Sofi mientras hace señas
      mostrandoDedos: 0,       // 1-4 si está respondiendo una seña con la mano
      apuntando: false,        // cargando el lanzamiento de un papelito
      abriendoPapel: false,    // abriendo un papelito bajo el banco
      debugTrampa: false,      // sólo para probar la visión desde el modo debug
    },
    // Multiplicador de sospecha cuando la profesora ve la trampa (depende del escondite y la acción)
    factorVisibilidadTrampa: 1,
    macheteGuardado: false,
    papelEnMano: null,         // pedido del papelito atrapado { pregunta, consultado }
    intercambios: 0,           // intercambios completados (hace escalar la tensión)
    // Registro de "compromiso con el grupo"
    registro: {
      seniasLeidas: 0,
      seniasRespondidas: 0,
      papelitosDevueltos: 0,
      tiempoMachete: 0,
      ignorados: 0,
      ultimaParticipacion: 0,  // estado.tiempo de la última vez que participó de una trampa
    },
    compromiso: 0,
    sabe: new Set(),           // preguntas cuya respuesta el jugador vio en el machete o en una seña
    final: null,
  };
}

export const estado = crearEstadoInicial();

export function reiniciarEstado() {
  const conservar = { escondite: estado.escondite, opciones: estado.opciones };
  Object.assign(estado, crearEstadoInicial(), conservar);
}

// ¿El jugador está haciendo algo que cuenta como trampa?
export function haciendoTrampa() {
  const a = estado.accion;
  return !a.modoHoja && (a.machete || a.mirandoSenia || a.mostrandoDedos > 0 || a.apuntando || a.abriendoPapel || a.debugTrampa);
}

// Suma al compromiso con el grupo y marca la participación (lo usan los finales)
export function participar(puntos, { intercambio = false } = {}) {
  estado.compromiso += puntos;
  estado.registro.ultimaParticipacion = estado.tiempo;
  if (intercambio) estado.intercambios += 1;
}
