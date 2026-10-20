# 21 · Amigos de la mesa

Veintiuno online por turnos (2 a 6 jugadores, desde el celular) donde cada carta del mazo de póker es un personaje con un efecto. Reemplaza a El Más Borracho (pedido de osky el 20/10: se abandonó ese juego y se reusó el repo). Las reglas están en `docs/reglas-21.md` (copia; la versión viva está en la carpeta del proyecto, `21-personajes/`). Este archivo son las notas para retomar.

## Cómo trabaja osky

- Rioplatense, corto y claro. No es programador: prueba jugando con amigos.
- Si una regla se puede leer de dos maneras, preguntar o avisar cuál se eligió y anotarla acá.
- Para lo visual, mockups antes de programar (las láminas del mazo en `21-personajes/mazo/` fueron el mockup de las cartas).
- Pedir permiso antes de cada subida a `main` (es la rama que va a publicar Render). El trabajo va en ramas con PR.
- El repo de Diez Mil (`Monguit0/diez-mil_2`) no se toca: solo se usó de base para copiar el servidor.

## Estado

Motor, servidor y celular del 21 hechos. `render.yaml` en main: cada subida a main se publica sola en Render (el servicio se sigue llamando `el-mas-borracho`). Repo: github.com/Monguit0/el_mas_borracho. Los paquetes siguen con el prefijo `@borracho/` para no tocar todo.

## Estructura

- `packages/engine`: reglas puras. `applyAction(estado, jugador, acción)` devuelve estado nuevo y eventos, o un error.
  - `cards.ts`: el mazo (`Card` con id tipo `"10H"`, palos S/D/H/C), valores, y `CARD_INFO` con nombre, efecto y tipo (`on` = al pedirla, `passive` = mientras la tengas) de las 52 cartas.
  - `state.ts`: `Rules` (`startChips` 10, `ante` 1, `rounds` 10), jugadores, `Pending` (cuando un efecto pide elegir).
  - `engine.ts`: acciones `HIT`, `STAND`, `REST` (6♥), `CHOOSE`, `NEXT_ROUND`; todos los efectos; `timeoutAction` (lo que se juega solo si vence el tiempo); `removePlayer`.
  - `view.ts`: lo que ve cada uno (las ocultas de los demás no viajan) y `eventsForViewer` (los espiados son privados).
- `packages/protocol`: lo que viaja entre servidor y celular. `WireAction` (= `Action`, `parseWireAction` estricto), `GameView` (= `playerView` + `deadline`), errores en español, opciones de la sala (`rounds` 5/10/15, `turnSeconds` 30/60), emojis.
- `packages/server`: Express 5 + Socket.IO 4, copiado de Diez Mil. Salas con código, sesiones con token, reconexión, anfitrión, límites. `game/gameService.ts` arma la partida y lleva el reloj (`syncDeadline`): si vence el turno se juega `timeoutAction`; entre rondas espera `ROUND_PAUSE_MS` (15 s) y arranca la próxima sola. Ganchos de prueba con `ENABLE_TEST_HOOKS=1`: `/__test__/rooms/:code/{seed,hand,stats,drop}` (`hand` fija las cartas de un jugador y las de arriba del mazo).
- `packages/client`: React 19 + Vite, letras Alfa Slab One y Bricolage Grotesque (empaquetadas: la CSP no deja cargar Google Fonts). `lib/art.ts` dibuja cada personaje en SVG (mismo dibujo que las láminas). `components/PlayingCard.tsx` en tres tamaños (`full` detalle, `table` tu mano, `mini` rivales). `screens/GameScreen.tsx` es la mesa. El "juice": `lib/sound.ts` (sonidos sintetizados con WebAudio, botón de silencio), `lib/fx.ts` (partículas en un canvas: papelitos, chispas, monedas, estrellas, humo), carteles grandes (te pasaste, 21 perfecto, 21 de mano, salvado, bloqueado, ganaste la ronda), avisos de efecto, fichas que suben y bajan, temblor al pasarte, vibración.

## Comandos

- `npm install`, `npm run check` (tipos + pruebas), `npm run build` (arma el celular), `npm start` (servidor en :3001 que también sirve el celular, `/api/health`), `npm run dev:client` (Vite en :5173 con proxy).

## Decisiones e interpretaciones

- Fichas: arrancan con 10 y ponen 1 por ronda (aceptado por osky). No hay apuestas más grandes.
- Los efectos "al pedirla" se activan solo cuando la pedís vos en tu turno; no en el reparto ni en las cartas que te llegan por el efecto de otro (así no se encadenan). Los "mientras la tengas" valen siempre.
- La banca es infinita: las fichas que regalan los efectos salen de la nada.
- Pozo sin ganador (todos se pasaron) queda para la próxima ronda; en un empate el resto que no se reparte también.
- Se rearma el mazo de 52 en cada ronda y el que empieza va rotando.
- Al llegar a 21 te plantás solo.
- Orden al cerrar la mano: Soborno (K♦), Salvavidas (3♥), Apagafuegos (8♥), y recién ahí se ve si te pasaste.
- El nombre "21 · Amigos de la mesa" es provisorio.
