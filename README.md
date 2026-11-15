# Operación Machete — prototipo jugable (three.js)

Simulación para **Creatividad y Desarrollo de Entornos Virtuales** (UTN FRC).

Sos un estudiante que rinde un parcial sentado en el banco central del aula. Tus amigos, desde las esquinas,
intentan copiarse en grupo con señas y papelitos, y la profesora patrulla. ¿Seguís cooperando con las trampas
(riesgo creciente, pánico, posible anulación) o resolvés el examen por tu cuenta?

## Cómo correrlo

Requiere **Node.js 18 o superior**.

```bash
npm install
npm run dev
```

Se abre el navegador en `http://localhost:5173`. Para una versión estática: `npm run build` (queda en `dist/`)
y `npm run preview` para probarla.

> Recomendado: auriculares. Los pasos de la profesora se escuchan en estéreo (además hay indicadores visuales y subtítulos).

## Flujo del juego

1. **Bienvenida:** "Hacé clic para empezar" (el navegador necesita ese clic para habilitar el audio).
   También se puede saltar la intro e ir directo al menú.
2. **Intro — Acto I (≈1 minuto, se salta con Esc):** la noche anterior al parcial. El chico cena en el comedor con
   la mesa tapada de apuntes; sus padres caminan alrededor retándolo. **Nunca se les ve la cara**: quedan fuera de
   cuadro o desenfocados (profundidad de campo), como si él no pudiera levantar la vista. Sus voces son "habla"
   sintetizada que no se entiende (un hombre y una mujer); lo que dicen está en los subtítulos. La presión sube con
   el latido, el tic-tac del reloj, la imagen que se enfría y desenfoca y frases que rebotan en pantalla, hasta un
   corte a silencio. Vibra el celular: sus amigos lo agregaron al grupo **"Operación Machete"**.
3. **Chat del grupo:** los mensajes llegan solos (clic o Espacio para apurar). El jugador elige respuestas: puede
   dudar, pero el grupo lo presiona hasta que acepta. Al final elige **dónde esconder el machete** (queda
   preseleccionado en el menú).
4. **Menú principal:** cómo se juega, controles, escondite, opciones y "Ver la intro de nuevo".
5. **El aula** (Actos II a IV). "Jugar de nuevo" y "Reiniciar" vuelven directo al menú, sin repetir la intro.

Atajo para pruebas: `?intro=0` en la URL va directo al menú.

## Controles

| Control | Acción |
|---|---|
| Mouse | Mirar alrededor (giro limitado a ±110°: no podés darte vuelta) |
| **Espacio** (mantener) | Bajar la vista a tu hoja. Desaparece el pánico; mirar la hoja nunca suma sospecha |
| Clic / **1–4** (en la hoja) | Marcar la opción A–D · **← →** cambiar de pregunta |
| **E** (mantener) | Espiar el machete |
| **Clic izquierdo** | Atrapar un papelito en el aire |
| **Clic derecho** (mantener y soltar) | Apuntar y lanzar el papelito (barra de fuerza + arco de trayectoria) |
| Mirar a Sofi ~1 s | Leer su seña · **1–4** mirándola: contestarle con los dedos |
| **G** | Guardar el machete para siempre (pide confirmación con **S**/**N**; irreversible) |
| **Esc** | Pausa y opciones |
| **F1** | Modo debug (en debug: **N** ruido en tu banco, **T** simular trampa, **V** vista cenital) |

Todas las teclas se cambian en [`src/core/controles.js`](src/core/controles.js).

## Cómo se juega

- **Examen:** 8 preguntas de opción múltiple, 8 minutos. Si te quedás unos segundos en una pregunta,
  aparecen **destellos de memoria** sobre las palabras clave y después un recuerdo: el personaje sí estudió.
- **Machete:** se elige el escondite al empezar (cartuchera: lenta y silenciosa; manga: rápida pero se nota;
  celular: se lee mejor pero si te ven la sospecha se dispara). Tiene tus respuestas y las que tenés que pasarle al grupo.
- **Señas (Sofi, fondo izquierda):** golpea la lapicera tres veces, levanta un cartelito con el número de pregunta
  y muestra dedos (1–4 = A–D). A veces te pasa una respuesta, a veces te pregunta algo.
- **Papelitos (Tomi, fondo derecha):** te tira un papelito; atrapalo, leelo bajo el banco, consultá el machete y devolvéselo.
  Si el tiro no llega, cae en el pasillo: ruido y mucha sospecha.
- **Profesora:** patrulla, sospecha (va hacia los ruidos), inspecciona bancos y te descubre si la sospecha llega a 100
  mientras te ve haciendo trampa. Con el tiempo y los intercambios, se acerca cada vez más al centro (Acto III).
- **Pánico:** si está cerca de tu banco mientras hacés trampa: imagen fría y borrosa, latido, respiración,
  temblor (que desvía tus lanzamientos) y machete difícil de leer.

### Finales
- **Camino 1 — Traición del grupo:** si seguís participando, llega un pedido urgente con la profesora rondando
  tu banco… y el lanzamiento falla. (También: cualquier descubrimiento con la sospecha al 100.)
- **Camino 2 — Mérito propio:** guardá el machete (G) o ignorá señas y papelitos durante un buen rato.
- **Final neutral:** se termina el tiempo (o entregás) sin que se active ninguno de los dos.

## Estructura

```
src/
  main.js            arma todo y define el orden de actualización (bienvenida → intro → menú → aula)
  intro/             Acto I: comedor, padres sin rostro, voces sintetizadas, chat del grupo
  core/              loop (Game), input, controles, estado global, bus de eventos, cámara en primera persona
  world/             aula, mobiliario, iluminación, materiales toon + contornos, grafo de pasillos
  characters/        config.js (apariencia), fábrica de personajes, auto-rig de modelos, poses y animaciones
  systems/           profesora IA, pánico, machete, señas, papelitos, examen, modo hoja, grupo, finales, debug
  fx/                postprocesado (desenfoque, viñeta, color grading)
  audio/             síntesis procedural y AudioManager (posicional, buses, ducking)
  ui/                HUD, panel del examen, pantallas (inicio, pausa, opciones, finales) y estilos
  data/              examen.json (preguntas) y balance.json (todos los números del juego)
public/audio/        audio opcional para reemplazar los sonidos procedurales
public/modelos/      modelos 3D optimizados (profesora, protagonista, Sofi, Tomi)
herramientas/        script para optimizar modelos GLB
```

## Cómo modificarlo

- **Balance:** todos los valores (radios, velocidades, umbrales, tiempos, aumentos de sospecha, volúmenes)
  están en [`src/data/balance.json`](src/data/balance.json).
- **Preguntas:** [`src/data/examen.json`](src/data/examen.json). Cada pregunta tiene `enunciado`, `opciones`,
  `correcta` (índice desde 0), `claves` (texto exacto del enunciado que brilla) y `recuerdo`. La sección `machete`
  define qué respuestas tiene el machete, cuáles pide el grupo y cuáles pasa Sofi.
- **Personajes:** toda la apariencia está en [`src/characters/config.js`](src/characters/config.js).
  La profesora, el protagonista, Sofi y Tomi usan modelos 3D (`public/modelos/`). Los **padres** (intro,
  `Comedor.js`) reutilizan los modelos de Tomi (papá) y Sofi (mamá) con otra remera y otro pelo. Los **alumnos
  de fondo** reutilizan los modelos de Tomi, Sofi y el protagonista, sólo de la cintura para arriba
  (`soloTorso`), con remera azul marino y el pelo en distintos colores (`configRelleno`). Juli y Martín siguen
  como placeholders hechos con primitivas.
- **Recolorear un modelo:** en `modelo` se puede poner `remera: 0xRRGGBB` y/o `pelo: 0xRRGGBB`;
  [`Recolor.js`](src/characters/Recolor.js) clasifica los vértices (pelo / remera) por altura y color de textura
  y un shader cambia el color conservando el detalle. `soloTorso: true` descarta las piernas.
- **Manos:** [`Manos.js`](src/characters/Manos.js) detecta los dedos en la malla y arma por mano un pulgar y
  cuatro dedos de tres falanges. Poses de mano en `POSES_MANO` (reposo, puño, plana, señalar, lapicera, pinza…);
  `MANOS_POR_POSE` en `animaciones.js` asigna una a cada pose de brazo, y las señas de Sofi usan los dedos reales.
- **Modelos 3D con esqueleto automático:** los GLB son mallas estáticas en pose A (sin huesos). Al cargarlos,
  [`AutoRig.js`](src/characters/AutoRig.js) detecta las articulaciones cortando el cuerpo en rebanadas, arma un
  esqueleto con **los mismos nombres que el placeholder** (cadera, torso, cuello, cabeza, hombro/codo/muñeca,
  pierna/rodilla/tobillo) y calcula los pesos de piel. Por eso el `Animador` y todos los sistemas funcionan igual:
  caminan, se sientan, hacen señas y lanzan papelitos. Para sumar un modelo nuevo, agregá
  `modelo: { ruta, altura, rotacionY: Math.PI }` a la entrada del personaje.
- **Optimizar modelos:** los originales pesaban ~17 MB cada uno (360 mil triángulos y texturas de 4K).
  [`herramientas/optimizar-modelos.mjs`](herramientas/optimizar-modelos.mjs) los reduce a ~1 MB (≈30 mil
  triángulos, textura de color de 1024 px; el juego usa materiales toon, así que normal y rugosidad sobran).
  Uso: `npm i -D @gltf-transform/core @gltf-transform/functions meshoptimizer sharp` y
  `node herramientas/optimizar-modelos.mjs carpeta-originales public/modelos`. Los originales siguen en el historial de git.
- **Intro:** guion, planos de cámara y diálogos en [`src/intro/Intro.js`](src/intro/Intro.js); el comedor en
  [`Comedor.js`](src/intro/Comedor.js); los mensajes del grupo en [`ChatGrupo.js`](src/intro/ChatGrupo.js).
- **Profesora:** la locomoción (aceleración, frenado, radio de las esquinas) se ajusta en `balance.json` →
  `profesora.locomocion` (opcional; si no está, usa valores por defecto) y el largo del paso con `zancada` en `config.js`.
- **Audio:** todo se genera por código. Para reemplazar un sonido por un archivo, ver
  [`public/audio/LEEME.txt`](public/audio/LEEME.txt).
- **Consola:** `window.__parcial` expone los sistemas para depurar, por ejemplo
  `__parcial.profesora.inspeccionar(__parcial.aula.bancoCentral)` o `__parcial.estado.compromiso = 6`.

## Decisiones de diseño (sobre puntos abiertos del documento)

- **Contestar una seña:** mirando a Sofi y apretando 1–4 (el protagonista levanta la mano con esos dedos).
- **El número de pregunta de una seña** se ve en un cartelito que Sofi levanta; los dedos indican la opción.
- **Responder en la hoja** con un cursor virtual (lapicera) para no soltar el Pointer Lock, o con el teclado.
- **El lanzamiento final del Camino 1 falla siempre** (el temblor se exagera), para que el final narrativo se cumpla.
- **Sin flagrancia la sospecha no pasa de 99:** la profesora va a revisar tu banco; solo te descubre si te ve haciendo trampa.
- **El machete y las señas traen siempre respuestas correctas:** el costo de hacer trampa es el riesgo.
- **Tres bancos vacíos** en diagonal para que haya línea de vista directa a los amigos de las esquinas.
- Con el giro limitado a ±110°, las esquinas del fondo quedan "de reojo": la lectura de señas tolera 24° y el brazo
  lanza un poco más girado que la mirada (`lanzamiento.factorGiroBrazo`). El arco visible siempre muestra el tiro real.

## Tecnologías

- [three.js](https://threejs.org/) **0.186.1** (versión fija) + addons de `three/examples/jsm` (GLTFLoader, EffectComposer, ShaderPass, OutputPass).
- [Vite](https://vite.dev/) 8.3.4, JavaScript con módulos ES, sin frameworks de UI.
- Web Audio API + `THREE.PositionalAudio`.
