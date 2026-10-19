# El Más Borracho

Juego de cartas online por turnos (2 a 6 jugadores, desde el celular). Las reglas están en
`docs/reglas-el-mas-borracho.md` (copia; la versión viva está en la carpeta del proyecto). Este archivo son las notas para retomar.

## Cómo trabaja osky

- Rioplatense, corto y claro. No es programador: prueba jugando con amigos.
- Si una regla se puede leer de dos maneras, preguntar o avisar cuál se eligió y anotarla acá.
- Para lo visual, mockups antes de programar.

## Estado

Fase 1 (motor y pruebas) en curso. Todavía no hay servidor ni pantallas. Repo: github.com/Monguit0/el_mas_borracho.

## Estructura

- `packages/engine`: reglas puras. `applyAction(estado, jugador, acción)` devuelve estado nuevo y eventos, o un error.
  - `cards.ts`: catálogo (64 nombres + Vaso común, copias según uso, atributos impresos con semilla fija) y recetario de 35 cócteles.
  - `specials.ts`: las 12 cartas especiales y sus rarezas (31 cartas).
  - `rules.ts`: todos los números del juego (`DEFAULT_RULES`, `makeRules`).
  - `scoring.ts`: puntos del cóctel (base + bonus) y validación de recetas.
  - `view.ts`: lo que ve cada jugador según su borrachera (mano, carta de la mesa y `recipeBook`: completo / solo_nombres / ilegible). Las cartas viajan con `handle` que cambia cada turno; el servidor los traduce con `resolveHandles`.
  - `sim/`: bot y partidas simuladas.

## Comandos

- `npm install`, `npm run check` (tipos + pruebas), `npm run sim -- 50` (partidas simuladas por cantidad de jugadores).

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
- `recipeMode: 'flexible'` (ingredientes por nombre, el resto cualquiera de su categoría) existe como opción en prueba, no está decidido.
- Vaso común: comodín de vaso en cualquier receta, −1 punto (`bonus.commonGlass`). Todas las recetas llevan justo un vaso (se valida al cargar).
- Copias por nombre según en cuántas recetas aparece (`copiesFor`): 177 cartas; mazo chico = mitad de copias.
- Se roban 3 por turno y no hay límite de cócteles por turno (`cocktailsPerTurn: 99`), decidido por osky. Con especiales, la simulación da ~19/23/25 vueltas con 2/4/6 jugadores.
- Descarte por coincidencia (`MATCH_DISCARD`), decidido por osky: una vez por turno, cada carta tiene que coincidir en número o símbolo con la carta de la mesa (tope del descarte), no en cadena. Si alguna no coincide: papelón (`shame`), no se descarta nada, shot de castigo (`PENALTY_SHOT`, al precio del próximo shot) y se corta el turno (`forceEndTurn`, sobrantes al azar abajo de la mesa). Con 3 papelones, afuera por vergüenza (`outReason: 'verguenza'`). Interpretación: cada error = 1 papelón.
- La carta de la mesa se muestra con la borrachera del que mira (`tableCard` en la vista). Se da vuelta una al empezar; al rearmar el mazo y al sacar a un jugador, la carta de la mesa no cambia.
- Opción `cocktailTarget: 'todos'` (en prueba, no decidida; por defecto 'uno'): el cóctel le pega a todos los rivales, empezando por el elegido y en orden de mesa. Cada uno se defiende por separado (`pending.queue`); el que lanza cobra una sola vez. En la simulación, 6 jugadores bajan de ~180 a ~63 turnos; con 2 no cambia nada.
