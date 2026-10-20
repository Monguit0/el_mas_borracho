import { useEffect, useRef, useSyncExternalStore } from 'react';
import { OnlineClient } from './net/OnlineClient';
import { HomeScreen } from './screens/HomeScreen';
import { LobbyScreen } from './screens/LobbyScreen';
import { GameScreen } from './screens/GameScreen';
import { attachCanvas, resize } from './lib/fx';
import { sfx, unlockAudio } from './lib/sound';

// Una sola conexión para toda la página: vive fuera de React.
const client = new OnlineClient();

/** El lienzo de las partículas: arriba de todo y sin tocar los toques. */
function FxCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    attachCanvas(ref.current);
    window.addEventListener('resize', resize);
    // El navegador no deja sonar nada hasta el primer toque.
    const unlock = () => unlockAudio();
    // Todo botón suena: las cartas con un "chic" de cartón, el resto con un "toc".
    const click = (e: MouseEvent) => {
      const el = e.target instanceof Element ? e.target.closest('button') : null;
      if (!el || (el as HTMLButtonElement).disabled) return;
      if (el.classList.contains('pc')) sfx.cardTap();
      else sfx.click();
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('click', click, true);
    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('click', click, true);
      attachCanvas(null);
    };
  }, []);
  return <canvas ref={ref} className="fx-canvas" aria-hidden="true" />;
}

function Screen() {
  const state = useSyncExternalStore(client.subscribe, client.getState);
  const { room, session } = state;
  if (!room || !session) return <HomeScreen client={client} state={state} />;
  if (room.status === 'WAITING' || !room.game) return <LobbyScreen client={client} room={room} me={session.playerId} />;
  return <GameScreen client={client} room={room} game={room.game} connection={state.connection} />;
}

export function App() {
  return (
    <>
      <Screen />
      <FxCanvas />
    </>
  );
}
