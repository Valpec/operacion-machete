import { crearPersonaje } from './Personaje.js';
import { PERSONAJES, ubicaciones, DISTANCIA_LINEA_VISTA, configRelleno } from './config.js';
import { aleatorioConSemilla } from '../world/materiales.js';

// Distancia (en el plano del piso) de un punto p al segmento a-b
function distanciaASegmento(p, a, b) {
  const abx = b.x - a.x;
  const abz = b.z - a.z;
  const largo2 = abx * abx + abz * abz || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.z - a.z) * abz) / largo2));
  return Math.hypot(p.x - (a.x + abx * t), p.z - (a.z + abz * t));
}

/**
 * Ubica a todos los personajes en el aula.
 * Devuelve { protagonista, profesora, senias, mensajero, grupo, aplicado, relleno[], todos[] }.
 */
export function crearElenco(aula, scene) {
  const rnd = aleatorioConSemilla(42);
  const elenco = { relleno: [], todos: [] };

  const sentar = (personaje, banco) => {
    personaje.raiz.position.copy(banco.asiento);
    personaje.banco = banco;
    scene.add(personaje.raiz);
    elenco.todos.push(personaje);
    return personaje;
  };

  // Amigos y compañero aplicado (las ubicaciones dependen del tamaño de la grilla)
  const ocupados = new Set();
  const columnas = Math.max(...aula.bancos.map((b) => b.col)) + 1;
  const filas = Math.max(...aula.bancos.map((b) => b.fila)) + 1;
  if (columnas < 3 || filas < 3) {
    console.warn(`[aula] Con ${columnas}×${filas} bancos no entran todos los personajes: se recomienda al menos 3×3.`);
  }
  for (const [clave, ub] of Object.entries(ubicaciones(columnas, filas))) {
    let banco = aula.buscarBanco(ub.col, ub.fila);
    // Si el banco no existe o ya está tomado, se usa el libre más cercano a esa posición
    if (!banco || ocupados.has(banco) || banco === aula.bancoCentral) {
      banco = aula.bancos
        .filter((b) => !ocupados.has(b) && b !== aula.bancoCentral)
        .sort((a, c) => Math.hypot(a.col - ub.col, a.fila - ub.fila) - Math.hypot(c.col - ub.col, c.fila - ub.fila))[0];
    }
    if (!banco) throw new Error(`[aula] No hay bancos suficientes para sentar a "${clave}". Agrandá aula.columnas / aula.filas en balance.json.`);
    elenco[clave] = sentar(crearPersonaje(PERSONAJES[clave], clave), banco);
    ocupados.add(banco);
  }

  // Protagonista en el banco central
  elenco.protagonista = sentar(crearPersonaje(PERSONAJES.protagonista, 'protagonista'), aula.bancoCentral);
  ocupados.add(aula.bancoCentral);

  // Bancos vacíos: los que tapan la línea de vista entre el banco central y cada amigo
  const desde = aula.bancoCentral.asiento;
  for (const amigo of [elenco.senias, elenco.mensajero, elenco.grupo]) {
    const hasta = amigo.banco.asiento;
    for (const b of aula.bancos) {
      if (ocupados.has(b)) continue;
      if (distanciaASegmento(b.asiento, desde, hasta) < DISTANCIA_LINEA_VISTA) ocupados.add(b);
    }
  }

  // Relleno en el resto de los bancos
  for (const banco of aula.bancos) {
    if (ocupados.has(banco)) continue;
    const p = sentar(crearPersonaje(configRelleno(rnd), 'relleno'), banco);
    p.animador.poseInicial('escribirFondo');
    p.animador.capa('escribir', 0.4 + rnd() * 0.6);
    elenco.relleno.push(p);
  }

  // Poses iniciales
  elenco.aplicado.animador.poseInicial('escribirFondo');
  elenco.aplicado.animador.capa('escribir', 1);
  elenco.senias.mostrarLapicera(true);
  elenco.senias.animador.poseInicial('escribirFondo'); // (pose calibrada para los modelos: manos sobre el banco)
  elenco.mensajero.animador.poseInicial('escribirFondo');
  elenco.grupo.animador.poseInicial('escribirFondo');
  elenco.grupo.animador.capa('escribir', 0.5);

  // Profesora: parada al frente, de cara a los alumnos (los personajes miran a -Z)
  const profesora = crearPersonaje(PERSONAJES.profesora, 'profesora');
  profesora.raiz.position.set(0.8, 0, aula.limites.zMin + 1.3);
  profesora.raiz.rotation.y = Math.PI;
  profesora.animador.poseInicial('manosAtras');
  scene.add(profesora.raiz);
  elenco.profesora = profesora;
  elenco.todos.push(profesora);

  elenco.update = (dt, t) => {
    for (const p of elenco.todos) p.update(dt, t);
  };

  return elenco;
}
