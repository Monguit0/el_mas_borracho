import { useCallback, useEffect, useRef, useState } from 'react';
import { CARD_INFO, type Card, type GameEvent, type SeatView } from '@borracho/engine';
import { REACTION_EMOJIS, type Ack, type GameView, type Reaction, type RoomView, type WireAction } from '@borracho/protocol';
import type { OnlineClient } from '../net/OnlineClient';
import type { ConnectionStatus } from '../types';
import { PlayingCard } from '../components/PlayingCard';
import { Sheet } from '../components/Sheet';
import { BackIcon, SoundIcon, MuteIcon } from '../components/icons';
import { STATUS_LABEL, cardName, effectTitle, seatBadges, seatColor, suitOf } from '../lib/game';
import { burst, centerOf, rain } from '../lib/fx';
import { isMuted, onMuteChange, setMuted, sfx, vibrate } from '../lib/sound';

interface Props {
  client: OnlineClient;
  room: RoomView;
  game: GameView;
  connection: ConnectionStatus;
}

type BannerKind = 'bust' | 'win21' | 'natural' | 'saved' | 'blocked' | 'roundWin' | 'roundLose' | 'turn' | 'other21' | 'otherBust';

interface Banner {
  id: number;
  kind: BannerKind;
  title: string;
  sub?: string;
}

interface Toast {
  id: number;
  cardId: string;
  who: string;
}

interface Bubble {
  id: string;
  emoji: string;
  playerId: string;
}

let seq = 0;

function useNow(active: boolean, ms = 250): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [active, ms]);
  return now;
}

function seatEl(id: string): Element | null {
  return document.querySelector(`[data-seat="${id}"]`);
}

export function GameScreen({ client, room, game, connection }: Props) {
  const me = game.me;
  const byId = useCallback((id: string) => game.players.find((p) => p.id === id), [game.players]);
  const nameOf = useCallback((id: string) => (id === me ? 'Vos' : (byId(id)?.name ?? '¿?')), [byId, me]);
  const mine = byId(me)!;
  const rivals = game.order.map((id) => byId(id)!).filter((p) => p && p.id !== me);
  // Los que quedaron afuera antes de esta ronda no están en el orden: igual se muestran.
  const outsiders = game.players.filter((p) => p.id !== me && !game.order.includes(p.id));
  const myTurn = game.phase === 'playing' && game.currentId === me;
  const seatIndex = (id: string) => room.players.find((p) => p.id === id)?.seatIndex ?? game.players.findIndex((p) => p.id === id);

  const [banners, setBanners] = useState<Banner[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [floats, setFloats] = useState<{ id: number; playerId: string; delta: number }[]>([]);
  const [detail, setDetail] = useState<Card | null>(null);
  const [peek, setPeek] = useState<Card[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [muted, setMutedState] = useState(isMuted);
  const [menu, setMenu] = useState(false);
  const [hideResults, setHideResults] = useState(false);
  useEffect(() => onMuteChange(() => setMutedState(isMuted())), []);

  const pushBanner = useCallback((kind: BannerKind, title: string, sub?: string, ms = 1700) => {
    const id = ++seq;
    setBanners((b) => [...b.filter((x) => x.kind !== 'turn'), { id, kind, title, ...(sub ? { sub } : {}) }]);
    setTimeout(() => setBanners((b) => b.filter((x) => x.id !== id)), ms);
  }, []);

  // --- Los eventos de la partida: sonidos, carteles y partículas ---
  const nameRef = useRef(nameOf);
  nameRef.current = nameOf;
  useEffect(() => {
    const handle = (events: readonly GameEvent[]) => {
      let delay = 0;
      // En la última ronda el festejo lo hace la pantalla final.
      const gameOver = events.some((e) => e.type === 'GAME_OVER');
      const later = (fn: () => void, step = 0) => {
        const at = delay;
        delay += step;
        if (at === 0) fn();
        else setTimeout(fn, at);
      };
      for (const e of events) {
        const name = nameRef.current;
        switch (e.type) {
          case 'DREW':
            later(() => sfx.draw(), 120);
            break;
          case 'DEALT':
            later(() => sfx.draw(), 90);
            break;
          case 'REVEAL':
            later(() => sfx.flip(), 120);
            break;
          case 'EFFECT': {
            later(() => {
              sfx.effect(suitOf(e.effectId));
              const id = ++seq;
              setToasts((t) => [...t.slice(-2), { id, cardId: e.effectId, who: name(e.playerId) }]);
              setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2600);
              const at = centerOf(seatEl(e.playerId));
              burst('stars', at.x, at.y, 18, 260);
            }, 350);
            break;
          }
          case 'CHIPS':
            later(() => {
              sfx.chip(e.delta > 0);
              const id = ++seq;
              setFloats((f) => [...f, { id, playerId: e.playerId, delta: e.delta }]);
              setTimeout(() => setFloats((f) => f.filter((x) => x.id !== id)), 1400);
              if (e.delta > 0) {
                const at = centerOf(seatEl(e.playerId));
                burst('coins', at.x, at.y, Math.min(4 + e.delta * 2, 16), 300);
              }
            }, 80);
            break;
          case 'BUST':
            later(() => {
              const at = centerOf(seatEl(e.playerId));
              burst('smoke', at.x, at.y, 26, 120);
              burst('sparks', at.x, at.y, 30, 380);
              if (e.playerId === me) {
                sfx.bust();
                vibrate([80, 60, 160]);
                setShake(true);
                setTimeout(() => setShake(false), 600);
                pushBanner('bust', '¡TE PASASTE!', `${e.total}`, 2000);
              } else {
                // Se pasó por poquito: "uuuh" de la mesa.
                if (e.total <= 23) sfx.ooh();
                else sfx.thud();
                pushBanner('otherBust', `${name(e.playerId)} se pasó`, `${e.total}`, 1500);
              }
            }, 500);
            break;
          case 'TWENTY_ONE':
            later(() => {
              const at = centerOf(seatEl(e.playerId));
              sfx.twentyOne(e.natural);
              if (e.playerId === me) {
                vibrate([40, 40, 40, 40, 120]);
                rain('confetti', e.natural ? 220 : 150);
                burst('sparks', at.x, at.y, 60, 600);
                pushBanner(e.natural ? 'natural' : 'win21', e.natural ? '¡21 DE MANO!' : '¡21 PERFECTO!', e.natural ? 'Blackjack' : undefined, 2300);
              } else {
                burst('confetti', at.x, at.y, 50, 480);
                pushBanner('other21', `¡${name(e.playerId)} hizo 21!`, undefined, 1600);
              }
            }, 600);
            break;
          case 'SAVED':
            later(() => {
              sfx.saved();
              const at = centerOf(seatEl(e.playerId));
              burst('stars', at.x, at.y, 30, 420);
              pushBanner('saved', '¡SALVADO!', `${cardName(e.cardId)} · ${e.playerId === me ? 'a vos' : name(e.playerId)}`, 1800);
            }, 500);
            break;
          case 'BLOCKED':
            later(() => {
              sfx.blocked();
              const at = centerOf(seatEl(e.playerId));
              burst('sparks', at.x, at.y, 24, 300);
              pushBanner('blocked', '¡BLOQUEADO!', `${e.with === 'escudo' ? 'Escudo' : 'Manta'} de ${e.playerId === me ? 'vos' : name(e.playerId)}`, 1500);
            }, 400);
            break;
          case 'PEEK':
            if (e.playerId === me) later(() => setPeek([...e.cards]), 0);
            break;
          case 'TURN':
            if (e.playerId === me)
              later(() => {
                sfx.turn();
                vibrate(30);
                pushBanner('turn', 'Te toca', undefined, 1100);
              }, 0);
            break;
          case 'ROUND_OVER':
            later(() => {
              setHideResults(false);
              if (gameOver) return;
              if (e.winners.includes(me)) {
                sfx.winRound();
                rain('coins', 70);
                rain('confetti', 80);
                pushBanner('roundWin', '¡GANASTE LA RONDA!', undefined, 2000);
              } else if (e.winners.length === 0) {
                sfx.loseRound();
              } else {
                sfx.loseRound();
              }
            }, 700);
            break;
          case 'GAME_OVER':
            later(() => {
              const won = e.winnerId === me;
              sfx.gameOver(won);
              if (won) {
                rain('confetti', 260);
                rain('coins', 120);
              }
            }, 900);
            break;
          case 'ROUND_STARTED':
            later(() => (e.round === 1 ? sfx.start() : sfx.shuffle()), 600);
            break;
          default:
            break;
        }
      }
    };
    const offGame = client.feed.on('game', handle);
    const offReaction = client.feed.on('reaction', (r: Reaction) => {
      setBubbles((b) => [...b.slice(-8), { id: r.id, emoji: r.emoji, playerId: r.playerId }]);
      setTimeout(() => setBubbles((b) => b.filter((x) => x.id !== r.id)), 2200);
      sfx.pop();
    });
    return () => {
      offGame();
      offReaction();
    };
  }, [client, me, pushBanner]);

  // --- Cartas nuevas: entran volando ---
  const seen = useRef(new Set<string>());
  const keyOf = (pid: string, i: number, c: Card | null) => `${game.round}:${pid}:${i}:${c?.id ?? 'x'}`;
  useEffect(() => {
    for (const p of game.players) p.cards.forEach((c, i) => seen.current.add(keyOf(p.id, i, c.card)));
  });
  const isFresh = (pid: string, i: number, c: Card | null) => !seen.current.has(keyOf(pid, i, c));

  // --- Reloj ---
  const now = useNow(game.deadline !== null);
  const secondsLeft = game.deadline !== null ? Math.max(0, Math.ceil((game.deadline - now) / 1000)) : null;
  const lastTick = useRef<number | null>(null);
  useEffect(() => {
    if (myTurn && secondsLeft !== null && secondsLeft <= 5 && secondsLeft > 0 && lastTick.current !== secondsLeft) sfx.tick();
    lastTick.current = secondsLeft;
  }, [secondsLeft, myTurn]);

  // Latido de nervios: en tu turno, de 17 a 20, más rápido cuanto más cerca de 21.
  const nervous = myTurn && !game.pending && mine.status === 'playing' && mine.total >= 17 && mine.total < 21;
  useEffect(() => {
    if (!nervous) return;
    const every = 1300 - (mine.total - 17) * 220;
    sfx.heartbeat();
    const id = setInterval(() => sfx.heartbeat(), every);
    return () => clearInterval(id);
  }, [nervous, mine.total]);

  const run = async (p: Promise<Ack<unknown>>) => {
    setError(null);
    setBusy(true);
    const result = await p;
    setBusy(false);
    if (!result.ok) setError(result.error.message);
  };
  const act = (action: WireAction) => {
    void run(client.act(action));
  };

  const hasRest = mine.cards.some((c) => c.card?.id === '6H') && myTurn && !game.pending;
  const finished = room.status === 'FINISHED' || game.phase === 'finished';
  const current = game.currentId ? byId(game.currentId) : undefined;
  const choosing = game.choosing && game.choosing.playerId !== me ? game.choosing : null;
  const timerPct = game.deadline !== null && secondsLeft !== null ? Math.min(100, (secondsLeft / (game.phase === 'roundOver' ? 15 : room.options.turnSeconds)) * 100) : 0;
  const lastLog = game.log[game.log.length - 1] ?? '';

  return (
    <main className={`screen game${shake ? ' shake' : ''}${myTurn ? ' my-turn' : ''}`}>
      <div className="topbar">
        <button type="button" className="icon-btn" aria-label="Menú" onClick={() => setMenu(true)}>
          <BackIcon size={20} />
        </button>
        <div className="hud">
          <div className="hud-item">
            <small>RONDA</small>
            <b>
              {game.round}/{game.rounds}
            </b>
          </div>
          <div className="hud-item pot">
            <small>POZO</small>
            <b>
              <span className="chip-dot" /> {game.pot}
            </b>
          </div>
        </div>
        <button type="button" className="icon-btn" aria-label={muted ? 'Activar sonido' : 'Silenciar'} onClick={() => setMuted(!muted)}>
          {muted ? <MuteIcon size={20} /> : <SoundIcon size={20} />}
        </button>
      </div>

      {connection !== 'connected' ? <div className="error">Reconectando…</div> : null}

      <section className="rivals" aria-label="Rivales">
        {[...rivals, ...outsiders].map((p) => (
          <Seat
            key={p.id}
            p={p}
            color={seatColor(seatIndex(p.id))}
            current={game.currentId === p.id}
            timerPct={game.currentId === p.id ? timerPct : 0}
            choosing={choosing?.playerId === p.id}
            isFresh={(i, c) => isFresh(p.id, i, c)}
            onCard={(c) => c && setDetail(c)}
            floats={floats.filter((f) => f.playerId === p.id)}
            bubbles={bubbles.filter((b) => b.playerId === p.id)}
          />
        ))}
      </section>

      <section className="table-center">
        <div className="deck" aria-label={`Mazo: ${game.deckCount} cartas`}>
          <PlayingCard card={null} size="mini" />
          <span>{game.deckCount}</span>
        </div>
        <div className="ticker" aria-live="polite">
          {game.phase === 'playing' && current ? (
            <div className="whose">{current.id === me ? '¡Te toca!' : `Le toca a ${current.name}`}</div>
          ) : null}
          <div key={game.log.length + lastLog} className="log-line">
            {lastLog}
          </div>
        </div>
        <div className="deck">
          {game.discardTop ? <PlayingCard card={game.discardTop} size="mini" onClick={() => setDetail(game.discardTop)} /> : <div className="pc pc-mini pc-empty" />}
          <span>descarte</span>
        </div>
      </section>

      <section className={`me${myTurn ? ' active' : ''}${mine.status === 'busted' ? ' busted' : ''}`} data-seat={me}>
        <div className="me-head">
          <div className="avatar" style={{ background: seatColor(seatIndex(me)) }}>
            {mine.name.slice(0, 1).toUpperCase()}
          </div>
          <div className="spacer">
            <div className="me-name">{mine.name}</div>
            <div className="me-chips">
              <span className="chip-dot" /> {mine.chips} fichas
              {floats
                .filter((f) => f.playerId === me)
                .map((f) => (
                  <span key={f.id} className={`float ${f.delta > 0 ? 'up' : 'down'}`}>
                    {f.delta > 0 ? `+${f.delta}` : f.delta}
                  </span>
                ))}
            </div>
            <div className="badges">
              {seatBadges(mine).map((b) => (
                <span key={b.label} className="badge-fx" title={b.label}>
                  {b.icon} {b.label}
                </span>
              ))}
            </div>
          </div>
          <div className={`total total-big${mine.total > 21 ? ' over' : mine.total === 21 ? ' perfect' : ''}`} key={mine.total}>
            {mine.total}
            <small>{STATUS_LABEL[mine.status]}</small>
          </div>
        </div>
        <div className={`hand${mine.cards.length > 4 ? ' tight' : ''}`}>
          {mine.cards.map((c, i) => (
            <PlayingCard key={keyOf(me, i, c.card)} card={c.card} size="table" hidden={c.hidden} fresh={isFresh(me, i, c.card)} onClick={() => c.card && setDetail(c.card)} />
          ))}
        </div>
        {bubbles
          .filter((b) => b.playerId === me)
          .map((b) => (
            <span key={b.id} className="bubble me-bubble">
              {b.emoji}
            </span>
          ))}
      </section>

      {error ? (
        <div className="error" role="alert" onClick={() => setError(null)}>
          {error}
        </div>
      ) : null}

      <div className="dock">
        {myTurn && !game.pending ? (
          <>
            <div className="timer">
              <div className="timer-bar" style={{ width: `${timerPct}%` }} />
            </div>
            <div className="row">
              <button type="button" className="btn btn-hit" disabled={busy} onClick={() => act({ type: 'HIT' })}>
                PEDIR
              </button>
              <button type="button" className="btn btn-stand" disabled={busy} onClick={() => act({ type: 'STAND' })}>
                PLANTARME
              </button>
            </div>
            {hasRest ? (
              <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => act({ type: 'REST' })}>
                Descartar al Corazón Enfermero
              </button>
            ) : null}
          </>
        ) : (
          <div className="row waiting-row">
            <div className="spacer muted">
              {game.phase === 'playing' && current && current.id !== me
                ? choosing
                  ? `${current.name} está eligiendo (${effectTitle(choosing.sourceId)})…`
                  : `Esperando a ${current.name}${secondsLeft !== null ? ` · ${secondsLeft}s` : ''}`
                : game.phase === 'playing' && mine.status !== 'playing'
                  ? 'Ya jugaste esta ronda'
                  : ''}
            </div>
            <button type="button" className="icon-btn emoji-btn" aria-label="Reacciones" onClick={() => setEmojiOpen((o) => !o)}>
              😂
            </button>
          </div>
        )}
        {emojiOpen ? (
          <div className="emoji-row">
            {REACTION_EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => {
                  setEmojiOpen(false);
                  void client.react(e);
                }}
              >
                {e}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {/* Carteles grandes */}
      <div className="banners" aria-live="assertive">
        {banners.map((b) => (
          <div key={b.id} className={`banner banner-${b.kind}`}>
            <div className="banner-title">{b.title}</div>
            {b.sub ? <div className="banner-sub">{b.sub}</div> : null}
          </div>
        ))}
      </div>

      {/* Efectos que se activan */}
      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className="toast">
            <PlayingCard card={{ id: t.cardId, rank: t.cardId.slice(0, -1) as Card['rank'], suit: t.cardId.slice(-1) as Card['suit'] }} size="mini" />
            <div>
              <div className="toast-title">{CARD_INFO[t.cardId]?.title}</div>
              <div className="toast-sub">
                {t.who} · {CARD_INFO[t.cardId]?.name}
              </div>
            </div>
          </div>
        ))}
      </div>

      {game.pending && myTurn ? (
        <Sheet label="Elegí">
          <div className="pending-head">
            <PlayingCard card={cardOf(game.pending.sourceId)} size="mini" />
            <div>
              <div className="label">{effectTitle(game.pending.effectId)}</div>
              <div className="pending-prompt">{game.pending.prompt}</div>
            </div>
          </div>
          <div className="options">
            {game.pending.options.map((o) => (
              <button key={o.id} type="button" className={`option${o.card ? ' with-card' : ''}`} disabled={busy} onClick={() => act({ type: 'CHOOSE', optionId: o.id })}>
                {o.card ? <PlayingCard card={o.card} size="mini" /> : null}
                <span>{o.label}</span>
              </button>
            ))}
          </div>
          {secondsLeft !== null ? <div className="muted small">Si no elegís en {secondsLeft}s, va la primera.</div> : null}
        </Sheet>
      ) : null}

      {peek ? (
        <Sheet label="Lo que espiaste" onClose={() => setPeek(null)}>
          <div className="label">Espiaste</div>
          <div className="peek-row">
            {peek.map((c) => (
              <PlayingCard key={c.id} card={c} size="table" />
            ))}
          </div>
          <button type="button" className="btn btn-gold" onClick={() => setPeek(null)}>
            LISTO
          </button>
        </Sheet>
      ) : null}

      {detail ? (
        <Sheet label="Carta" onClose={() => setDetail(null)}>
          <div className="detail">
            <PlayingCard card={detail} size="full" />
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDetail(null)}>
            Cerrar
          </button>
        </Sheet>
      ) : null}

      {game.phase === 'roundOver' && game.results && !hideResults ? (
        <Sheet label="Fin de la ronda" onClose={() => setHideResults(true)}>
          <div className="label">Fin de la ronda {game.round}</div>
          <Results game={game} nameOf={nameOf} />
          <button type="button" className="btn btn-hit" disabled={busy} onClick={() => act({ type: 'NEXT_ROUND' })}>
            SIGUIENTE RONDA{secondsLeft !== null ? ` · ${secondsLeft}` : ''}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setHideResults(true)}>
            Ver la mesa
          </button>
        </Sheet>
      ) : null}
      {game.phase === 'roundOver' && hideResults ? (
        <button type="button" className="btn btn-hit floating-next" disabled={busy} onClick={() => act({ type: 'NEXT_ROUND' })}>
          SIGUIENTE RONDA{secondsLeft !== null ? ` · ${secondsLeft}` : ''}
        </button>
      ) : null}

      {finished ? (
        <div className="overlay">
          <div className="final">
            <div className="trophy">{game.winnerId === me ? '🏆' : '🃏'}</div>
            <div className="final-title">{game.winnerId === me ? '¡GANASTE!' : `Ganó ${game.winnerId ? nameOf(game.winnerId) : 'nadie'}`}</div>
            {game.results ? <Results game={game} nameOf={nameOf} /> : null}
            <div className="standings">
              {[...game.players]
                .sort((a, b) => b.chips - a.chips)
                .map((p, i) => (
                  <div key={p.id} className={`standing${p.id === game.winnerId ? ' first' : ''}`}>
                    <span>{i + 1}.</span>
                    <span className="spacer">{p.id === me ? `${p.name} (vos)` : p.name}</span>
                    <span>
                      <span className="chip-dot" /> {p.chips}
                    </span>
                  </div>
                ))}
            </div>
            <button type="button" className="btn btn-hit" onClick={() => void run(client.reopen())}>
              OTRA PARTIDA
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => void run(client.leave())}>
              Salir
            </button>
          </div>
        </div>
      ) : null}

      {menu ? (
        <Sheet label="Menú" onClose={() => setMenu(false)}>
          <div className="label">Sala {room.code}</div>
          <p className="muted">Si salís en medio de la partida, quedás afuera.</p>
          <button type="button" className="btn btn-bordo" onClick={() => void run(client.leave())}>
            Salir de la partida
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMenu(false)}>
            Seguir jugando
          </button>
        </Sheet>
      ) : null}
    </main>
  );
}

function cardOf(id: string): Card {
  return { id, rank: id.slice(0, -1) as Card['rank'], suit: id.slice(-1) as Card['suit'] };
}

function Results({ game, nameOf }: { game: GameView; nameOf: (id: string) => string }) {
  return (
    <div className="results">
      {game.results!.map((r) => (
        <div key={r.playerId} className={`result${r.winner ? ' win' : ''}${r.busted ? ' bust' : ''}`}>
          <span className="spacer">
            {r.winner ? '👑 ' : ''}
            {nameOf(r.playerId)}
            {r.note ? <small> · {r.note}</small> : null}
          </span>
          <span className="result-total">{r.busted ? `${r.total} ✗` : r.total}</span>
          <span className={`result-delta${r.delta > 0 ? ' up' : r.delta < 0 ? ' down' : ''}`}>{r.delta > 0 ? `+${r.delta}` : r.delta}</span>
        </div>
      ))}
    </div>
  );
}

function Seat({
  p,
  color,
  current,
  timerPct,
  choosing,
  isFresh,
  onCard,
  floats,
  bubbles,
}: {
  p: SeatView;
  color: string;
  current: boolean;
  timerPct: number;
  choosing: boolean;
  isFresh: (i: number, c: Card | null) => boolean;
  onCard: (c: Card | null) => void;
  floats: { id: number; delta: number }[];
  bubbles: Bubble[];
}) {
  const badges = seatBadges(p);
  return (
    <div className={`seat seat-${p.status}${current ? ' current' : ''}`} data-seat={p.id}>
      {current ? <div className="seat-timer" style={{ width: `${timerPct}%` }} /> : null}
      <div className="seat-head">
        <div className="avatar avatar-sm" style={{ background: color }}>
          {p.name.slice(0, 1).toUpperCase()}
        </div>
        <div className="seat-name">{p.name}</div>
        <div className={`seat-total${p.totalKnown && p.total === 21 ? ' perfect' : ''}${p.status === 'busted' ? ' over' : ''}`}>
          {p.total}
          {p.totalKnown ? '' : '+?'}
        </div>
      </div>
      <div className="seat-cards">
        {p.cards.map((c, i) => (
          <PlayingCard key={`${i}:${c.card?.id ?? 'x'}`} card={c.card} size="mini" hidden={c.hidden && c.card !== null} fresh={isFresh(i, c.card)} onClick={c.card ? () => onCard(c.card) : undefined} />
        ))}
      </div>
      <div className="seat-foot">
        <span>
          <span className="chip-dot" /> {p.chips}
        </span>
        <span className="seat-status">{choosing ? 'Eligiendo…' : STATUS_LABEL[p.status]}</span>
        {badges.map((b) => (
          <span key={b.label} title={b.label}>
            {b.icon}
          </span>
        ))}
      </div>
      {floats.map((f) => (
        <span key={f.id} className={`float ${f.delta > 0 ? 'up' : 'down'}`}>
          {f.delta > 0 ? `+${f.delta}` : f.delta}
        </span>
      ))}
      {bubbles.map((b) => (
        <span key={b.id} className="bubble">
          {b.emoji}
        </span>
      ))}
    </div>
  );
}
