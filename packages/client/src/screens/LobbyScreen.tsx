import { useState } from 'react';
import type { Ack, RoomOptions, RoomView } from '@borracho/protocol';
import type { OnlineClient } from '../net/OnlineClient';
import { inviteUrl } from '../lib/invite';
import { AVATAR_COLORS } from '../lib/game';
import { BackIcon, CloseIcon, ShareIcon } from '../components/icons';

export function LobbyScreen({ client, room, me }: { client: OnlineClient; room: RoomView; me: string }) {
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const isHost = room.hostPlayerId === me;

  const run = async (p: Promise<Ack<unknown>>) => {
    setError(null);
    const result = await p;
    if (!result.ok) setError(result.error.message);
  };

  const share = async () => {
    const url = inviteUrl(room.code);
    const text = `Vení a jugar al 21. Código ${room.code}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: '21 · Amigos de la mesa', text, url });
        return;
      }
      await navigator.clipboard.writeText(`${text}: ${url}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Canceló el menú de compartir: no pasa nada.
    }
  };

  const option = <K extends keyof RoomOptions>(key: K, label: string, values: { value: RoomOptions[K]; text: string }[]) => (
    <div className="row" style={{ justifyContent: 'space-between' }}>
      <span style={{ fontSize: 15 }}>{label}</span>
      <div className="segmented" role="group" aria-label={label}>
        {values.map((v) => (
          <button
            key={String(v.value)}
            type="button"
            aria-pressed={room.options[key] === v.value}
            disabled={!isHost}
            onClick={() => void run(client.setOptions({ [key]: v.value } as Partial<RoomOptions>))}
          >
            {v.text}
          </button>
        ))}
      </div>
    </div>
  );

  const canStart = room.players.length >= room.minPlayers;

  return (
    <main className="screen" style={{ gap: 18 }}>
      <div className="topbar">
        <button type="button" className="icon-btn" aria-label="Salir de la sala" onClick={() => void run(client.leave())}>
          <BackIcon size={20} />
        </button>
        <div className="label muted" style={{ fontSize: 16, letterSpacing: 3, color: 'var(--muted)' }}>
          Sala de espera
        </div>
        <div style={{ width: 40 }} />
      </div>

      <div className="code-card">
        <div className="label" style={{ color: 'var(--bordo)', letterSpacing: 3 }}>
          Código de la sala
        </div>
        <div className="code">{room.code}</div>
        <button type="button" className="btn btn-bordo btn-sm" style={{ height: 46, boxShadow: 'none' }} onClick={() => void share()}>
          <ShareIcon size={18} />
          {copied ? 'COPIADO' : 'COMPARTIR INVITACIÓN'}
        </button>
      </div>

      {error ? (
        <div className="error" role="alert">
          {error}
        </div>
      ) : null}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div className="row label" style={{ justifyContent: 'space-between' }}>
          <span>Jugadores</span>
          <span>
            {room.players.length} de {room.maxPlayers}
          </span>
        </div>
        {room.players.map((p) => (
          <div key={p.id} className="player-row" style={{ opacity: p.isConnected ? 1 : 0.6 }}>
            <div className="avatar" style={{ background: AVATAR_COLORS[p.seatIndex % AVATAR_COLORS.length] }}>
              {p.name.slice(0, 1).toUpperCase()}
            </div>
            <div className="spacer" style={{ fontSize: 17, fontWeight: 600 }}>
              {p.name} {p.id === me ? <span className="muted" style={{ fontWeight: 400 }}>(vos)</span> : null}
              {p.isConnected ? null : (
                <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>
                  {' '}
                  · desconectado
                </span>
              )}
            </div>
            {p.isHost ? <span className="badge">ANFITRIÓN</span> : null}
            {isHost && p.id !== me && !p.isConnected ? (
              <button type="button" className="icon-btn" style={{ width: 32, height: 32 }} aria-label={`Sacar a ${p.name}`} onClick={() => void run(client.kick(p.id))}>
                <CloseIcon size={16} color="var(--muted)" />
              </button>
            ) : null}
          </div>
        ))}
        {room.players.length < room.maxPlayers ? (
          <div className="row muted" style={{ justifyContent: 'center', height: 44, borderRadius: 12, border: '2px dashed var(--line)', fontSize: 14, color: 'var(--faint)' }}>
            Esperando a los demás…
          </div>
        ) : null}
      </div>

      <div className="panel">
        <div className="label">Opciones{isHost ? '' : ' (las elige el anfitrión)'}</div>
        {option('rounds', 'Rondas', [
          { value: 5, text: '5' },
          { value: 10, text: '10' },
          { value: 15, text: '15' },
        ])}
        {option('turnSeconds', 'Tiempo por turno', [
          { value: 30, text: '30 s' },
          { value: 60, text: '60 s' },
        ])}
        <p className="muted small" style={{ margin: 0 }}>
          Arrancan con 10 fichas y cada ronda ponen 1. El que más cerca de 21 quede se lleva el pozo.
        </p>
      </div>

      <div style={{ marginTop: 'auto' }}>
        {isHost ? (
          <button type="button" className="btn btn-verde" style={{ width: '100%', height: 58, fontSize: 22 }} disabled={!canStart} onClick={() => void run(client.start())}>
            {canStart ? 'EMPEZAR' : 'FALTA UNO MÁS'}
          </button>
        ) : (
          <p className="muted" style={{ textAlign: 'center' }}>
            Cuando estén todos, el anfitrión empieza.
          </p>
        )}
      </div>
    </main>
  );
}
