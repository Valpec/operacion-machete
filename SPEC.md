# Proyecto: "El Parcial" — prototipo jugable en three.js

## Contexto
Estamos desarrollando un videojuego de simulación para la materia Creatividad y Desarrollo de Entornos Virtuales (UTN FRC). El jugador es un estudiante que rinde un examen parcial sentado en el banco central de un aula, mientras sus amigos, ubicados en las esquinas, intentan copiarse en grupo mediante señas y papelitos. La profesora patrulla el aula. El jugador debe decidir si sigue cooperando con las trampas (riesgo creciente, pánico, posible anulación del examen) o si resuelve el examen por su cuenta (calma, ayuda de su propia memoria, aprobación por mérito propio).

Alcance de este prototipo: solo la escena del aula (Actos II, III y IV). No hay introducción jugable en la casa; se reemplaza por una pantalla de inicio breve.

## Stack y estructura técnica
- Vite + npm, JavaScript con módulos ES (sin TypeScript ni frameworks de UI).
- three.js instalado por npm con versión fija (usar una versión estable de al menos dos semanas de antigüedad), más los addons necesarios desde `three/examples/jsm` (PointerLockControls o control de cámara propio, EffectComposer, ShaderPass, GLTFLoader).
- HUD y menús en HTML/CSS superpuestos al canvas.
- Audio con Web Audio API y THREE.PositionalAudio. Todos los sonidos deben generarse proceduralmente (latido, respiración, golpes de lapicera, pasos, papel, timbre) para que el proyecto funcione sin archivos externos; dejar preparada la carga opcional de archivos en `public/audio/` para reemplazarlos más adelante.
- Comentarios del código y textos de la interfaz en español rioplatense.
- Estructura sugerida:
  src/
    main.js
    core/ (loop, input, estado global del juego, máquina de estados de la partida)
    world/ (aula, mobiliario, iluminación)
    characters/ (fábrica de personajes, configuración, animaciones simples)
    systems/ (profesora IA, pánico, machete, señas, papelitos, examen, memoria, finales)
    fx/ (postprocesado: desenfoque, viñeta, color grading)
    audio/
    ui/ (HUD, menús, pantallas de final)
    data/ (preguntas del examen y parámetros de balance en JSON)
- Incluir un README con instrucciones para correr el proyecto (`npm install`, `npm run dev`) y la lista de controles.

## Estética
- 3D estilizado con cel-shading: MeshToonMaterial con rampa de 3 tonos y contornos (outline por mesh invertida o postproceso).
- Paleta como mecánica: en tensión, la imagen se vuelve fría y desaturada; en concentración (mirando la hoja), cálida y luminosa.
- Aula: pizarrón verde, bancos de madera en grilla de 5 columnas por 5 filas, piso de madera clara, ventanas con luz de mañana a un costado, puerta, escritorio de la profesora al frente, reloj de pared.
- Objetos interactivos con un resaltado sutil (contorno o brillo) cuando el jugador los mira.

## Personajes (placeholders con código, reemplazables)
Construir cada personaje con primitivas (cápsula para el cuerpo, esfera para la cabeza, cilindros para brazos con articulación en hombro y codo para poder animar señas y lanzamientos). Toda la apariencia debe venir de un archivo de configuración (`characters/config.js`) para que más adelante se puedan cambiar por modelos GLB sin tocar la lógica: la fábrica de personajes debe aceptar `{ tipo: "placeholder" }` o `{ tipo: "glb", ruta }`.
- Protagonista (jugador, primera persona): buzo blanco. Solo se ven sus manos y antebrazos en cámara.
- Profesora: saco rojo oscuro, pollera azul marino, pelo gris recogido, anteojos. Es la única con rojo.
- Compañera de las señas (esquina del fondo a la izquierda): buzo celeste, pelo negro con cola de caballo. Golpea la lapicera tres veces y muestra dedos.
- Compañero mensajero (esquina del fondo a la derecha): buzo verde oscuro. Lanza papelitos.
- Compañera del grupo (fila de adelante, extremo derecho): buzo lila, pelo rubio. No tiene mecánica propia; hace gestos de reclamo y de presión hacia el jugador.
- Compañero aplicado (banco cercano al protagonista, fuera del grupo): buzo mostaza, anteojos. Escribe todo el tiempo sin levantar la vista.
- Resto de los bancos: estudiantes de relleno en tonos grises y apagados.
La identificación de cada amigo no debe depender solo del color: agregar una diferencia de silueta (cola de caballo, gorra o capucha, etc.).

## Cámara y controles
- Primera persona, sentado. La cámara está anclada al cuello del personaje: se gira con el mouse (Pointer Lock), con giro horizontal limitado a ±110° y vertical limitado, sin poder ver hacia atrás. FOV algo reducido (aprox. 60°) para reforzar la sensación de visión limitada.
- Controles (todos configurables desde una constante):
  - Mouse: mirar alrededor.
  - Espacio (mantener): bajar la vista a la hoja propia (modo hoja).
  - E (mantener): espiar el machete.
  - Clic izquierdo: atrapar un papelito en el aire / interactuar.
  - Clic derecho (mantener y soltar): apuntar y lanzar el papelito, con barra de fuerza y arco de trayectoria visible.
  - G: guardar el machete definitivamente (pide confirmación; es irreversible y es la decisión clave del Camino 2).
  - Esc: pausa y opciones.
- Pantalla de inicio: título, instrucciones claras de controles y objetivos, y una elección previa de dónde esconder el machete (cartuchera, manga del buzo o celular). Cada opción cambia el balance:
  - Cartuchera: abrir tarda más, es silencioso.
  - Manga: es rápido, pero el gesto es más visible para la profesora.
  - Celular: se lee mejor, pero si la profesora lo ve se suma mucha más sospecha.

## Sistemas de juego

### 1. Profesora (IA con máquina de estados)
- Estados: Patrulla fija (recorre waypoints por los pasillos y va al pizarrón), Sospecha (deja el recorrido fijo y deambula entre bancos acercándose al origen de los ruidos y al centro), Inspección (se detiene junto a un banco y observa unos segundos) y Descubrimiento.
- Visión: cono de visión con ángulo y distancia configurables, más un raycast para comprobar línea de vista. Ve al jugador haciendo trampa solo si está dentro del cono mientras el jugador realiza una acción de trampa.
- Escucha: los ruidos (papelito que cae, golpes de lapicera fuertes, movimientos bruscos) generan eventos con posición e intensidad; si superan un umbral, la profesora cambia a Sospecha y se dirige al lugar.
- Medidor de sospecha de 0 a 100: sube al ver o escuchar trampas, baja lentamente con el tiempo. Al llegar a 100 con el jugador en flagrancia, se dispara el Camino 1.
- Escalada progresiva: cuanto más tiempo y más intercambios ocurren, más frecuente es la Sospecha y más se acerca al banco central (Acto III).
- Pasos con audio posicional estéreo, para que el jugador pueda ubicarla de oído aunque esté a sus espaldas.
- Modo debug (tecla F1): mostrar el cono de visión, los waypoints y el valor de sospecha.

### 2. Pánico por proximidad
- Se activa solo cuando la profesora está dentro de un radio cercano al banco central y el jugador está realizando una acción de trampa (machete abierto, mirando señas, apuntando un papelito).
- Nivel de pánico de 0 a 1 que sube y baja de forma suave.
- Efectos según el nivel: desenfoque periférico y general (shader propio en EffectComposer), viñeta, imagen fría y desaturada, leve vibración de cámara, latido y respiración agitada que tapan el sonido ambiente, temblor en la mira al apuntar (afecta la trayectoria del lanzamiento) y texto del machete más difícil de leer.
- Al alejarse la profesora, todo vuelve a la normalidad de forma gradual.

### 3. Modo hoja y destellos de memoria
- Al mantener Espacio, la cámara baja hacia la hoja del examen sobre el banco. Mientras se esté en modo hoja, el pánico desaparece por completo, aunque la profesora pase al lado; la imagen se vuelve nítida y cálida y el sonido ambiente se atenúa.
- El examen se muestra como un panel HTML con estética de papel (o como textura en la hoja 3D) con preguntas de opción múltiple.
- Si el jugador tarda más de N segundos (configurable, por ejemplo 6) en una pregunta, aparecen destellos animados sobre palabras clave del enunciado que lo orientan a la respuesta correcta. Es la mecánica que demuestra que el personaje sí estudió.
- Mirar la hoja nunca suma sospecha.

### 4. Machete
- Al mantener E, aparece el machete en primer plano según el escondite elegido.
- Contiene algunas respuestas propias y las respuestas que le corresponde pasar a los amigos.
- Mientras está abierto, cuenta como acción de trampa.

### 5. Reto de las señas
- La compañera de las señas golpea la lapicera tres veces (sonido posicional, más un indicador visual direccional en el HUD por accesibilidad) cuando la profesora está de espaldas o lejos.
- Luego levanta entre 1 y 4 dedos, que corresponden a una opción de una pregunta (A, B, C o D).
- El jugador debe girar la cabeza y mantener la mirada sobre ella aproximadamente un segundo para descifrar la seña. Con pánico alto, la seña se ve borrosa y es casi imposible de leer.
- Las señas pueden ser pedidos ("¿qué va en la 3?") o respuestas que ella le pasa.

### 6. Reto del mensajero
- El compañero mensajero calcula un momento en que la profesora está distraída y lanza un papelito en parábola física hacia el banco central.
- El jugador debe atraparlo con clic izquierdo cuando entra en su zona de alcance. Si no lo atrapa, el papelito cae y hace ruido.
- Una vez atrapado, lo abre bajo el banco (pequeña animación) y lee el pedido. Debe consultar su machete y luego devolverlo apuntando hacia el banco del mensajero.
- Lanzamiento: mantener clic derecho para cargar fuerza, con un arco de trayectoria visible; el temblor del pánico desvía el arco. Si falla, el papelito cae en el pasillo, hace ruido y genera un gran aumento de sospecha.

### 7. Examen
- 8 preguntas de opción múltiple cargadas desde `data/examen.json`, con contenido de ejemplo genérico y fácilmente reemplazable. Cada pregunta incluye enunciado, opciones, respuesta correcta y palabras clave para los destellos.
- Tiempo límite configurable (por defecto 8 minutos de tiempo real), visible en el HUD.
- La nota final se calcula según las respuestas correctas.

### 8. Decisiones y finales (Acto IV)
Llevar un registro de "compromiso con el grupo" (señas leídas, papelitos devueltos, tiempo con el machete abierto).
- Camino 1 — Traición del grupo: si el jugador sigue participando de las trampas, cuando el compromiso supera un umbral se activa el reto final: un pedido urgente del mensajero con la profesora deambulando cerca del centro. El lanzamiento falla por el temblor (o cualquier descubrimiento con sospecha al 100 lleva aquí). Secuencia: el papel cae con ruido, la profesora gira hacia el banco central, todos los amigos bajan las manos al instante y miran sus hojas, la profesora camina hasta el jugador y le retira el examen. Luego, una pantalla de final con texto: timbre, los amigos pasan sin defenderlo ("uh, qué mala suerte tuviste, quedaste re regalado ahí") y el aula queda vacía. Mensaje final: desaprobó una materia que sabía resolver.
- Camino 2 — Mérito propio: si el jugador presiona G para guardar el machete definitivamente, o ignora todas las señas y papelitos durante un tiempo prolongado, el juego pasa a ser de concentración: los amigos hacen gestos de bronca desde las esquinas, la profesora pasa junto a su banco y sigue de largo. Al entregar el examen (botón en el panel) o al terminar el tiempo, pantalla de final con nota y texto: aprueba por mérito propio, vuelve a su casa tranquilo y recibe las felicitaciones de sus padres.
- Si el tiempo se termina sin que se active ninguno de los dos caminos, mostrar un final neutral con la nota obtenida.
- Las pantallas de final deben ofrecer "Jugar de nuevo".

## HUD y accesibilidad
- HUD: tiempo restante, barra de sospecha (con número, no solo color), indicador de pulso o pánico, acciones disponibles según el contexto, e indicadores direccionales visuales para sonidos importantes (pasos cercanos, golpes de lapicera).
- Menú de opciones: sensibilidad del mouse, volumen general y de efectos, intensidad de los efectos de desenfoque y vibración (incluyendo la opción de reducirlos), y activar o desactivar subtítulos de sonidos.
- Ninguna información importante debe depender solo del sonido o solo del color.

## Balance
Todos los valores numéricos (radios, velocidades, umbrales, tiempos, aumentos de sospecha) deben estar en `data/balance.json` para poder ajustarlos sin tocar código.

## Forma de trabajo
1. Antes de programar, presentame un plan breve con la arquitectura y las fases, y esperá mi confirmación.
2. Implementá por fases, dejando el juego ejecutable al final de cada una:
   - Fase 1: proyecto Vite, aula con mobiliario e iluminación, personajes placeholder, cámara en primera persona con límites.
   - Fase 2: profesora con patrulla, visión, escucha y sospecha; modo debug.
   - Fase 3: modo hoja, examen, destellos de memoria, temporizador y HUD.
   - Fase 4: machete, señas, papelitos y física de lanzamiento.
   - Fase 5: sistema de pánico con postprocesado y audio procedural.
   - Fase 6: decisiones, finales, pantalla de inicio, menú de opciones y README.
3. Al terminar cada fase, contame qué se puede probar y cómo.
4. Si algo de este documento es ambiguo o contradictorio, preguntame antes de decidir por tu cuenta.