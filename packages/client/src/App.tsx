import { useSyncExternalStore } from 'react';
import { OnlineClient } from './net/OnlineClient';
import { HomeScreen } from './screens/HomeScreen';
import { LobbyScreen } from './screens/LobbyScreen';
import { GameScreen } from './screens/GameScreen';

// Una sola conexión para toda la página: vive fuera de React.
const client = new OnlineClient();

export function App() {
  const state = useSyncExternalStore(client.subscribe, client.getState);
  const { room, session } = state;
  if (!room || !session) return <HomeScreen client={client} state={state} />;
  if (room.status === 'WAITING' || !room.game) return <LobbyScreen client={client} room={room} me={session.playerId} />;
  return <GameScreen client={client} room={room} game={room.game} connection={state.connection} />;
}
