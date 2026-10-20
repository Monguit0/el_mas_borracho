import { useEffect, useRef, useSyncExternalStore } from 'react';
import { OnlineClient } from './net/OnlineClient';
import { HomeScreen } from './screens/HomeScreen';
import { LobbyScreen } from './screens/LobbyScreen';
import { GameScreen } from './screens/GameScreen';
import { attachCanvas, resize } from './lib/fx';
import { unlockAudio } from './lib/sound';

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
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointerdown', unlock);
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
