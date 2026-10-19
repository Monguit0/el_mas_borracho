# El Más Borracho

Juego de cartas online por turnos (2 a 6 jugadores, desde el celular). Las reglas están en
`docs/reglas-el-mas-borracho.md` (copia; la versión viva está en la carpeta del proyecto). Este archivo son las notas para retomar.

## Cómo trabaja osky

- Rioplatense, corto y claro. No es programador: prueba jugando con amigos.
- Si una regla se puede leer de dos maneras, preguntar o avisar cuál se eligió y anotarla acá.
- Para lo visual, mockups antes de programar.
- Pedir permiso antes de cada subida a `main` (es la rama que va a publicar Render). El trabajo va en ramas con PR.
- El repo de Diez Mil (`Monguit0/diez-mil_2`) no se toca: solo se usó de base para copiar el servidor. El Más Borracho se publica como un servicio aparte.
- Guía general: el spec base de Diez Mil (subido al proyecto) con plataforma, salas, pruebas y plan por fases.

## Estado

Fases 1 a 3 hechas (motor, servidor y pantallas en estilo A "barra de madera", elegido por osky). Fase 4: `render.yaml` en main; osky crea el servicio en Render (Web Service, raíz del repo, Node 22) y cada subida a main se publica sola. Repo: github.com/Monguit0/el_mas_borracho.

## Estructura

- `packages/engine`: reglas puras. `applyAction(estado, jugador, acción)` devuelve estado nuevo y eventos, o un error.
  - `cards.ts`: catálogo (64 nombres + Vaso común, copias según uso, atributos impresos con semilla fija) y recetario de 35 cócteles.
  - `specials.ts`: las 12 cartas especiales y sus rarezas (31 cartas).
  - `rules.ts`: todos los números del juego (`DEFAULT_RULES`, `makeRules`).
  - `scoring.ts`: puntos del cóctel (base + bonus) y validación de recetas.
  - `view.ts`: lo que ve cada jugador según su borrachera (mano, carta de la mesa y `recipeBook`: completo / solo_nombres / ilegible). Las cartas viajan con `handle` que cambia cada turno; el servidor los traduce con `resolveHandles`.
  - `sim/`: bot y partidas simuladas.
  - `removePlayer`: el que se va de la sala en medio de la partida queda afuera (`outReason: 'abandono'`).
- `packages/protocol`: lo que viaja entre servidor y celular. `WireAction` (las cartas de la mano van por handle, no por id; `parseWireAction` valida estricto), `RoomView` (la partida es el `playerView` del motor + `defenseEndsAt`), eventos de Socket.IO, errores en español, opciones de la sala (`barMax` 100/150, `defenseSeconds` 6/10, `deckCopies` 1/2), emojis.
- `packages/server`: Express 5 + Socket.IO 4, copiado de Diez Mil y adaptado. Salas con código, sesiones con token (se guarda el hash), reconexión, anfitrión, límites de pedidos. `game/gameService.ts` traduce handles con `resolveHandles` (si no cuadran, `CARDS_CHANGED`) y arranca el reloj de respuesta; si vence, `autoDrink`. Ganchos de prueba con `ENABLE_TEST_HOOKS=1`: `/__test__/rooms/:code/{seed,hand,stats,drop}`.

- `packages/client`: las pantallas (React 19 + Vite, Oswald y Barlow). Dibujos de cartas en `public/art` (cuadrados, webp), por nombre de carta y código de cóctel en `lib/art.ts`; los genera osky con Nano Banana en estilo art déco pixelado; la que no tiene dibujo sigue con el ícono, y borracho (nombre mezclado) tampoco se ve. `net/OnlineClient.ts` copiado de Diez Mil (sesión en sessionStorage/localStorage, reconexión). Pantallas: `HomeScreen`, `LobbyScreen`, `GameScreen`; hojas: `CocktailSheet`, `ResponseSheet`, `RecipeSheet`. Las jugadas quedan abajo en un dock fijo; con más de 8 cartas la mano va en 5 columnas. El servidor sirve `packages/client/dist`.

## Comandos

- `npm install`, `npm run check` (tipos + pruebas de los tres paquetes), `npm run sim -- 50` (partidas simuladas por cantidad de jugadores), `npm run build` (arma el celular), `npm start` (servidor en :3001 que también sirve el celular, `/api/health`), `npm run dev:client` (Vite en :5173 con proxy al servidor).

## Decisiones e interpretaciones

- Armar y lanzar un cóctel es una sola jugada (no hay bandeja). Después se reponen las cartas usadas.
- Cóctel mal armado: +5% al que lo armó, cartas al descarte, también repone.
- Quiebra al pasar del 100%; justo 100% sigue.
- Café: dura el turno en que se toma y los 2 siguientes propios.
- El shot exige descartar al menos 1 carta. Sin límite por turno, pero cambiar, shot, agua y café cuestan el doble con cada uso en el mismo turno (`actionCost`, `usesThisTurn`). Las defensas no se duplican.
- Shot por pasar: lo sacó osky. Ahora `mustPlay`: no se puede cerrar el turno (`MUST_PLAY`) sin una jugada (`playedThisTurn`): cóctel bien lanzado o descarte por coincidencia bien hecho. Un cóctel mal armado no cuenta.
- Cartas especiales (decidido por osky el 19/10: se compran con puntos, Jarra entre rivales, Ronda para todos incluido el que la juega, rareza según poder). Mano aparte (`specials`), arranca con 2, tope 3, `BUY_SPECIAL` 4 puntos que se duplica en el turno. Clases: turno (`PLAY_SPECIAL`), cóctel (`specialIds` en `MAKE_COCKTAIL`, se pierden si sale mal), respuesta (`RESPOND choice:'special'`). Rechazar/devolver con puntos ya no existe.
- La ventana de respuesta se abre si el rival tiene cualquier especial (no delata si es de respuesta); el servidor pone el tiempo límite y, si vence, manda `RESPOND drink`.
- Interpretaciones de especiales: la comida no baja shots propios ni castigos, mitades para arriba; choripán y conductor terminan al empezar tu próximo turno; al conductor le pueden responder lo que él tira, pero no tirarle ni pasarle con Doblalo; si todos los rivales son conductores se puede cerrar sin jugar; Doblalo pasa al siguiente vivo no conductor (puede ser el que lo armó, que entonces no cobra), con `senderId` para saber a quién le vuelve un Tomátelo vos; Probá el mío no se puede responder.
- Jugar especiales no cuenta como jugada para `mustPlay`.
- `recipeMode: 'flexible'` (ingredientes por nombre, el resto cualquiera de su categoría) existe como opción en prueba, no está decidido; con el bot las partidas terminan en ~2 vueltas. `'exacta'` es el modo viejo (solo el Vaso común como comodín).
- Vasos (pedido de osky el 19/10, porque pasaban muchos turnos sin poder armar): `recipeMode: 'vaso'` por defecto, cualquier vaso sirve. El de la receta +1 punto (`bonus.rightGlass`); otro vaso o el Vaso común −1 punto (`bonus.wrongGlass`) y el cóctel pega 5% menos (`wrongGlassAlcohol`). Interpretación: "coctelería" = cristalería; utensilios y técnicas siguen exactos (con ellos también flexibles las partidas duraban ~5 vueltas). Simulación: los turnos que arrancan con un cóctel posible pasan de 10% a 19%, y las partidas de ~20-25 a ~14-17 vueltas. Todas las recetas llevan justo un vaso (se valida al cargar).
- Copias por nombre según en cuántas recetas aparece (`copiesFor`): 177 cartas; mazo chico = mitad de copias.
- La carta "Vaso de plástico" ahora se llama Botella cortada y el Fernet con coca va en ella (también el Trago de la previa), pedido de osky el 19/10. El mazo sigue en 177: Botella cortada pasa a 3 copias y Vaso de pinta a 2.
- Se roban 3 por turno y no hay límite de cócteles por turno (`cocktailsPerTurn: 99`), decidido por osky. Con especiales y cualquier vaso, la simulación da ~14/17/17 vueltas con 2/4/6 jugadores.
- Descarte por coincidencia (`MATCH_DISCARD`), decidido por osky: una vez por turno, cada carta tiene que coincidir en número o símbolo con la carta de la mesa (tope del descarte), no en cadena. Si alguna no coincide: papelón (`shame`), no se descarta nada, shot de castigo (`PENALTY_SHOT`, al precio del próximo shot) y se corta el turno (`forceEndTurn`, sobrantes al azar abajo de la mesa). Con 3 papelones, afuera por vergüenza (`outReason: 'verguenza'`). Interpretación: cada error = 1 papelón.
- Al borde (90%+) el símbolo no se ve (`symbol: null`, se muestra "?") y el color sigue en visión doble, decidido por osky el 19/10. En pantalla (pedido de osky): las cartas tiemblan más cuanto más alcohol (propuesta: leve desde mareado, fuerte al borde) y desde en pedo se ve una copia corrida de la mano (visión doble). Es solo del celular, el motor no cambia (`drunkIntensity` en `client/src/lib/game.ts`, clases `drunk-1..3`).
- La carta de la mesa se muestra con la borrachera del que mira (`tableCard` en la vista). Se da vuelta una al empezar; al rearmar el mazo y al sacar a un jugador, la carta de la mesa no cambia.
- Opción `cocktailTarget: 'todos'` (en prueba, no decidida; por defecto 'uno'): el cóctel le pega a todos los rivales, empezando por el elegido y en orden de mesa. Cada uno se defiende por separado (`pending.queue`); el que lanza cobra una sola vez. En la simulación, 6 jugadores bajan de ~180 a ~63 turnos; con 2 no cambia nada.
- Celular (pedido de osky el 19/10): arriba de la mano, "Podés armar" muestra solo los cócteles que salen con tu mano. Tocás uno, se elige solo con sus cartas, y la hoja pregunta a quién y si sumás una especial de cóctel. El recetario queda como guía. Interpretación: mareado la lista muestra los nombres pero las cartas las elegís vos; en pedo no hay lista y se elige a ojo (con los nombres mezclados). El recetario se borronea en pedo.
- Servidor: una desconexión no pasa el turno. Si al que le tiran un cóctel no responde (o está desconectado), al vencer el tiempo se lo toma. Un jugador que se va en medio de la partida queda afuera; si era su turno pasa al siguiente, y si tenía un cóctel enfrente, el cóctel sigue con el próximo de la cola o se pierde (el que lo tiró no cobra).
