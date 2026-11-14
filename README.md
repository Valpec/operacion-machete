# El Parcial — prototipo jugable (three.js)

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
  main.js            arma todo y define el orden de actualización
  core/              loop (Game), input, controles, estado global, bus de eventos, cámara en primera persona
  world/             aula, mobiliario, iluminación, materiales toon + contornos, grafo de pasillos
  characters/        config.js (apariencia), fábrica de personajes (placeholder o GLB), poses y animaciones
  systems/           profesora IA, pánico, machete, señas, papelitos, examen, modo hoja, grupo, finales, debug
  fx/                postprocesado (desenfoque, viñeta, color grading)
  audio/             síntesis procedural y AudioManager (posicional, buses, ducking)
  ui/                HUD, panel del examen, pantallas (inicio, pausa, opciones, finales) y estilos
  data/              examen.json (preguntas) y balance.json (todos los números del juego)
public/audio/        audio opcional para reemplazar los sonidos procedurales
```

## Cómo modificarlo

- **Balance:** todos los valores (radios, velocidades, umbrales, tiempos, aumentos de sospecha, volúmenes)
  están en [`src/data/balance.json`](src/data/balance.json).
- **Preguntas:** [`src/data/examen.json`](src/data/examen.json). Cada pregunta tiene `enunciado`, `opciones`,
  `correcta` (índice desde 0), `claves` (texto exacto del enunciado que brilla) y `recuerdo`. La sección `machete`
  define qué respuestas tiene el machete, cuáles pide el grupo y cuáles pasa Sofi.
- **Personajes:** toda la apariencia está en [`src/characters/config.js`](src/characters/config.js).
  Para usar un modelo, cambiá la entrada por `{ tipo: 'glb', ruta: '/modelos/x.glb', escala, huesos: {...} }`
  (los modelos van en `public/modelos/`); la lógica no cambia.
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
