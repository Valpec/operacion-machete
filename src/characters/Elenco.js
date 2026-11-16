import { crearPersonaje } from './Personaje.js';
import { PERSONAJES, UBICACIONES, BANCOS_VACIOS, configRelleno } from './config.js';
import { aleatorioConSemilla } from '../world/materiales.js';

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

  // Amigos y compañero aplicado
  const ocupados = new Set();
  for (const [clave, ub] of Object.entries(UBICACIONES)) {
    const banco = aula.buscarBanco(ub.col, ub.fila);
    elenco[clave] = sentar(crearPersonaje(PERSONAJES[clave], clave), banco);
    ocupados.add(banco);
  }

  // Protagonista en el banco central
  elenco.protagonista = sentar(crearPersonaje(PERSONAJES.protagonista, 'protagonista'), aula.bancoCentral);
  ocupados.add(aula.bancoCentral);

  for (const v of BANCOS_VACIOS) ocupados.add(aula.buscarBanco(v.col, v.fila));

  // Relleno en el resto de los bancos
  for (const banco of aula.bancos) {
    if (ocupados.has(banco)) continue;
    const p = sentar(crearPersonaje(configRelleno(rnd), 'relleno'), banco);
    p.animador.poseInicial('escribirFondo');
    p.animador.capa('escribir', 0.4 + rnd() * 0.6);
    elenco.relleno.push(p);
  }

  // Poses iniciales
  elenco.aplicado.animador.poseInicial('escribir');
  elenco.aplicado.animador.capa('escribir', 1);
  elenco.senias.mostrarLapicera(true);
  elenco.senias.animador.poseInicial('escribir');
  elenco.mensajero.animador.poseInicial('sentado');
  elenco.grupo.animador.poseInicial('escribir');
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
