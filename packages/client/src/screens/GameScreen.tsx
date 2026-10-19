import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { DEFAULT_RULES } from '@borracho/engine';
import { REACTION_EMOJIS, type GameView, type Reaction, type RoomView, type WireAction } from '@borracho/protocol';
import type { OnlineClient } from '../net/OnlineClient';
import type { ConnectionStatus } from '../types';
import {
  AVATAR_COLORS,
  HAND_SIZE,
  KIND_COLOR,
  KIND_LABEL,
  LEVEL_LABEL,
  barColor,
  cocktailName,
  describeEvent,
  drunkIntensity,
  targetsFor,
} from '../lib/game';
import { Card } from '../components/Card';
import { CocktailSheet } from '../components/CocktailSheet';
import { Countdown, ResponseSheet } from '../components/ResponseSheet';
import { RecipeSheet } from '../components/RecipeSheet';
import { Sheet } from '../components/Sheet';
import {
  BookIcon,
  CarIcon,
  CardsIcon,
  CupIcon,
  DropIcon,
  FoodIcon,
  GlassIcon,
  InfoIcon,
  MenuIcon,
  PlusIcon,
  ShameIcon,
  StarIcon,
  SwapIcon,
} from '../components/icons';

interface Props {
  client: OnlineClient;
  room: RoomView;
  game: GameView;
  connection: ConnectionStatus;
}

type Panel = null | 'cocktail' | 'recipes' | 'menu' | { special: string };
interface Toast {
  id: number;
  text: string;
  bad?: boolean;
}

const OUT_LABEL = { quiebra: 'se pasó', verguenza: 'por vergüenza', abandono: 'se fue' } as const;

export function GameScreen({ client, room, game, connection }: Props) {
  const me = game.you;
  const [selected, setSelected] = useState<string[]>([]);
  const [panel, setPanel] = useState<Panel>(null);
  const [log, setLog] = useState<string[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [bubbles, setBubbles] = useState<(Reaction & { x: number })[]>([]);
  const [showReactions, setShowReactions] = useState(false);
  const [busy, setBusy] = useState(false);
  const toastId = useRef(0);

  const names = useMemo(() => new Map(game.players.map((p) => [p.id, p.name])), [game.players]);
  const name = (id: string) => names.get(id) ?? 'Alguien';
  const seats = useMemo(() => new Map(room.players.map((p) => [p.id, p])), [room.players]);
  const seatIndex = (id: string) => game.players.findIndex((p) => p.id === id);

  const myTurn = game.currentPlayerId === me.id && game.phase === 'main' && !me.eliminated;
  const finished = game.phase === 'finished' || game.winnerId !== null;
  const defendingMe = game.phase === 'defense' && game.pending?.targetId === me.id;
  const intensity = drunkIntensity(me.seeingLevel);
  const excess = Math.max(0, me.hand.length - HAND_SIZE);

  // Los handles cambian cada turno: lo elegido que ya no está en la mano se suelta.
  const handles = me.hand.map((c) => c.handle).join('|');
  useEffect(() => {
    setSelected((s) => s.filter((h) => me.hand.some((c) => c.handle === h)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handles]);

  const toast = (text: string, bad = false) => {
    const id = ++toastId.current;
    setToasts((t) => [...t.slice(-2), { id, text, bad }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), bad ? 3500 : 2600);
  };

  useEffect(() => {
    const offGame = client.feed.on('game', (events) => {
      const lines = events.map((e) => describeEvent(e, name, me.id)).filter((l): l is string => l !== null);
      if (lines.length > 0) setLog((l) => [...l, ...lines].slice(-4));
      for (const e of events) {
        if (e.type === 'COCKTAIL_DRUNK' && e.drinkerId === me.id) toast(`Te tomaste un ${cocktailName(e.cocktailCode)}: +${e.alcohol}%`);
        if (e.type === 'SHAME' && e.playerId === me.id) toast('¡Papelón! Esas cartas no coincidían con la de la mesa.', true);
        if (e.type === 'COCKTAIL_FAILED' && e.playerId === me.id) toast('Te salió mal: te lo tomaste vos (+5%).', true);
        if (e.type === 'TURN_STARTED' && e.playerId === me.id) toast('¡Te toca!');
      }
    });
    const offReaction = client.feed.on('reaction', (r) => {
      const x = 20 + Math.random() * 60;
      setBubbles((b) => [...b.slice(-5), { ...r, x }]);
      setTimeout(() => setBubbles((b) => b.filter((y) => y.id !== r.id)), 1900);
    });
    return () => {
      offGame();
      offReaction();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, me.id, names]);

  const act = async (action: WireAction, after?: () => void) => {
    setBusy(true);
    const result = await client.act(action);
    setBusy(false);
    if (!result.ok) {
      toast(result.error.message, true);
      return;
    }
    setSelected([]);
    after?.();
  };

  const toggle = (h: string) => setSelected((s) => (s.includes(h) ? s.filter((x) => x !== h) : [...s, h]));

  const pct = (alcohol: number) => Math.round((alcohol / game.barMax) * 100);
  const enough = (cost: number) => me.points >= cost;
  const noTargets = targetsFor(game).length === 0;
  const canEnd = !me.mustPlay || me.hand.length === 0 || noTargets;

  const hint = (() => {
    if (me.eliminated) return null;
    if (myTurn && excess > 0 && canEnd) return `Sobran ${excess}: elegí cuáles tirar y terminá el turno.`;
    if (selected.length > 0) return `${selected.length} elegida${selected.length === 1 ? '' : 's'}.`;
    if (!myTurn) return null;
    if (me.recipeBook.mode === 'completo' && me.recipeBook.canMake.length > 0)
      return `Podés armar ${me.recipeBook.canMake.length === 1 ? 'un cóctel' : `${me.recipeBook.canMake.length} cócteles`}: tocá Armar cóctel.`;
    if (me.seeingLevel === 'en_pedo' || me.seeingLevel === 'al_borde') return 'No ves los números ni sabés bien qué tenés. Suerte.';
    return 'Tocá cartas para elegirlas.';
  })();

  const endTurn = () => {
    if (excess > 0 && selected.length !== excess) {
      toast(`Elegí ${excess} carta${excess === 1 ? '' : 's'} para tirar.`, true);
      return;
    }
    void act({ type: 'END_TURN', discards: excess > 0 ? selected : [] });
  };

  const rivals = game.players.filter((p) => p.id !== me.id);
  const current = game.players.find((p) => p.id === game.currentPlayerId);
  const pending = game.pending;
  const specialPanel = panel !== null && typeof panel === 'object' ? me.specials.find((s) => s.id === panel.special) : undefined;

  const handGrid = (ghost: boolean) => (
    <div className={`hand-grid${me.hand.length > HAND_SIZE ? ' five' : ''}${ghost ? ' ghost-hand' : ''}`} aria-hidden={ghost || undefined}>
      {me.hand.map((c, i) => (
        <Card
          key={c.handle}
          card={c}
          selected={selected.includes(c.handle)}
          onClick={ghost || me.eliminated ? undefined : () => toggle(c.handle)}
          shakeIndex={intensity > 0 ? i : undefined}
        />
      ))}
    </div>
  );

  return (
    <main className={`screen drunk-${intensity}`} style={{ gap: 9 }}>
      <div className="topbar">
        <button type="button" className="icon-btn" aria-label="Menú" onClick={() => setPanel('menu')}>
          <MenuIcon size={18} />
        </button>
        <div className="row" style={{ gap: 8 }}>
          <span className="turn-title">{finished ? 'Terminó' : myTurn ? 'Tu turno' : `Turno de ${current?.name ?? ''}`}</span>
        </div>
        <button type="button" className="icon-btn" aria-label="Reacciones" aria-pressed={showReactions} onClick={() => setShowReactions((v) => !v)} style={{ fontSize: 18 }}>
          🍻
        </button>
      </div>

      {showReactions ? (
        <div className="reactions">
          {REACTION_EMOJIS.map((e) => (
            <button key={e} type="button" aria-label={`Mandar ${e}`} onClick={() => void client.react(e)}>
              {e}
            </button>
          ))}
        </div>
      ) : null}

      {connection !== 'connected' ? <div className="banner">Sin conexión. Reconectando…</div> : null}

      <div className="rivals">
        {rivals.map((p) => {
          const seat = seats.get(p.id);
          return (
            <div key={p.id} className={`rival${p.id === game.currentPlayerId && !finished ? ' current' : ''}${p.eliminated ? ' out' : ''}`}>
              <div className="row" style={{ gap: 6 }}>
                <div className="avatar sm" style={{ background: AVATAR_COLORS[seatIndex(p.id) % AVATAR_COLORS.length] }}>
                  {p.name.slice(0, 1).toUpperCase()}
                </div>
                <div className="name">{p.name}</div>
                {p.driver ? <CarIcon size={12} color="var(--gold)" /> : null}
                {p.choripan || p.foodHalves > 0 ? <FoodIcon size={12} color="var(--gold)" /> : null}
              </div>
              <div className="bar" style={{ height: 5 }}>
                <div style={{ width: `${Math.min(100, pct(p.alcohol))}%`, background: barColor(pct(p.alcohol)) }} />
              </div>
              <div className="stats">
                {p.eliminated ? (
                  <span>Afuera, {p.outReason ? OUT_LABEL[p.outReason] : ''}</span>
                ) : (
                  <>
                    <span>{pct(p.alcohol)}%</span>
                    <span className="stat">
                      <StarIcon size={11} />
                      {p.points}
                    </span>
                    <span className="stat">
                      <CardsIcon size={11} />
                      {p.specialCount}
                    </span>
                    {p.shame > 0 ? (
                      <span className="stat">
                        <ShameIcon size={11} />
                        {p.shame}
                      </span>
                    ) : null}
                  </>
                )}
              </div>
              {seat && !seat.isConnected && !p.eliminated ? <div className="stats">desconectado</div> : null}
            </div>
          );
        })}
      </div>

      <div className="table">
        <div className="pile">
          <div className="card-back" aria-hidden="true">
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#F1E8D6" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="9" cy="10" r="5" />
              <path d="M9 5v10M4 10h10M5.5 6.5l7 7M12.5 6.5l-7 7" />
              <rect x="14" y="13" width="6" height="6" rx="1.2" />
            </svg>
          </div>
          <span>Mazo · {game.deckCount}</span>
        </div>
        <div className="pile">
          {game.tableCard ? <Card card={game.tableCard} small /> : <div className="card-back" style={{ opacity: 0.3 }} />}
          <span>Mesa</span>
        </div>
        <div className="log" aria-live="polite">
          {log.length === 0 ? <span>Arranca la partida.</span> : log.slice(-3).map((l, i, all) => <span key={`${i}-${l}`} style={i === all.length - 1 ? { color: 'var(--cream)' } : undefined}>{l}</span>)}
        </div>
      </div>

      {pending && !defendingMe && !finished ? (
        <div className="banner row">
          <span className="spacer">
            {pending.targetId === me.id ? 'Te tiraron' : `${name(pending.targetId)} decide qué hace con`} el {cocktailName(pending.cocktailCode)} de {name(pending.senderId)} ({pending.alcohol}%).
          </span>
          <div style={{ transform: 'scale(.6)', margin: -12 }}>
            <Countdown endsAt={game.defenseEndsAt} total={room.options.defenseSeconds} />
          </div>
        </div>
      ) : null}

      <div className="me">
        <div className="spacer" style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <div className="row" style={{ alignItems: 'baseline', gap: 8 }}>
            <span className="pct">{pct(me.alcohol)}%</span>
            <span className="level">{LEVEL_LABEL[me.level]}</span>
            {me.coffeeTurnsLeft > 0 ? <span className="muted" style={{ fontSize: 12 }}>café · ves como {LEVEL_LABEL[me.seeingLevel].toLowerCase()}</span> : null}
            <span className="spacer" />
            <span className="stat" style={{ fontSize: 15, fontWeight: 600, gap: 4 }}>
              <StarIcon size={15} color="var(--gold)" />
              {me.points} pts
            </span>
          </div>
          <div className="bar" style={{ height: 9 }}>
            <div style={{ width: `${Math.min(100, pct(me.alcohol))}%`, background: barColor(pct(me.alcohol)) }} />
          </div>
        </div>
        <button type="button" className="btn btn-sm" style={{ border: '1px solid var(--line)', background: 'var(--panel)', fontFamily: 'var(--body)', textTransform: 'none', letterSpacing: 0, fontSize: 13 }} onClick={() => setPanel('recipes')}>
          <BookIcon size={16} />
          Recetario
        </button>
      </div>

      {me.eliminated ? (
        <div className="banner">Quedaste afuera. Mirá cómo sigue la partida.</div>
      ) : (
        <div className="hand">
          {handGrid(false)}
          {intensity >= 2 ? handGrid(true) : null}
        </div>
      )}

      {hint ? (
        <div className="row muted" style={{ fontSize: 13, gap: 8 }}>
          <InfoIcon size={16} />
          <span>{hint}</span>
        </div>
      ) : null}

      {me.specials.length > 0 && !me.eliminated ? (
        <div className="specials">
          {me.specials.map((s) => (
            <button key={s.id} type="button" className="special" onClick={() => setPanel({ special: s.id })}>
              <span className="kind" style={{ '--k': KIND_COLOR[s.kind] } as CSSProperties}>
                <i />
                {KIND_LABEL[s.kind]}
              </span>
              <span className="title">{s.name}</span>
              <span className="text">{s.text}</span>
            </button>
          ))}
        </div>
      ) : null}

      {myTurn ? (
        <div className="dock">
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn btn-verde" style={{ flex: 1.3, height: 50, fontSize: 19 }} disabled={busy} onClick={() => setPanel('cocktail')}>
              Armar cóctel
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ flex: 1, height: 50, fontSize: 17, borderColor: 'var(--bordo)', color: 'var(--cream)' }}
              disabled={busy || selected.length === 0}
              onClick={() => void act({ type: 'MATCH_DISCARD', cards: selected })}
            >
              Descartar
            </button>
          </div>
          <div className="row" style={{ gap: 6 }}>
            <button type="button" className="chip-btn" disabled={busy || selected.length === 0} onClick={() => void act({ type: 'SHOT', cards: selected })}>
              <span className="t">
                <GlassIcon size={15} />
                Shot
              </span>
              <span className="c">+{me.costs.shot}%</span>
            </button>
            <button type="button" className="chip-btn" disabled={busy || selected.length !== 1 || !enough(me.costs.swap)} onClick={() => void act({ type: 'SWAP', card: selected[0]! })}>
              <span className="t">
                <SwapIcon size={15} />
                Cambiar
              </span>
              <span className="c">{me.costs.swap} pt</span>
            </button>
            <button type="button" className="chip-btn" disabled={busy || !enough(me.costs.water) || me.alcohol === 0} onClick={() => void act({ type: 'WATER' })}>
              <span className="t">
                <DropIcon size={15} />
                Agua
              </span>
              <span className="c">{me.costs.water} pts</span>
            </button>
            <button type="button" className="chip-btn" disabled={busy || !enough(me.costs.coffee)} onClick={() => void act({ type: 'COFFEE' })}>
              <span className="t">
                <CupIcon size={15} />
                Café
              </span>
              <span className="c">{me.costs.coffee} pts</span>
            </button>
            <button
              type="button"
              className="chip-btn"
              disabled={busy || !enough(me.costs.buy) || me.specials.length >= DEFAULT_RULES.specialHandMax || game.specialDeckCount === 0}
              onClick={() => void act({ type: 'BUY_SPECIAL' })}
            >
              <span className="t">
                <PlusIcon size={15} />
                Especial
              </span>
              <span className="c">{me.costs.buy} pts</span>
            </button>
          </div>
          <button
            type="button"
            className="btn btn-sm"
            style={{ height: 42, border: canEnd ? 'none' : '1px dashed var(--line)', background: canEnd ? 'var(--gold)' : 'transparent', color: canEnd ? 'var(--wood)' : 'var(--muted)' }}
            disabled={busy || !canEnd}
            onClick={endTurn}
          >
            {canEnd ? (excess > 0 ? `TIRAR ${excess} Y TERMINAR` : 'TERMINAR TURNO') : 'Terminar turno · primero hacé una jugada'}
          </button>
        </div>
      ) : null}

      {intensity >= 2 ? <div className="vignette" /> : null}

      {defendingMe && !finished ? (
        <ResponseSheet key={`${game.turn}-${pending?.senderId}-${pending?.alcohol}`} game={game} defenseSeconds={room.options.defenseSeconds} name={name} onRespond={(a) => void act(a)} />
      ) : null}

      {panel === 'cocktail' && myTurn ? (
        <CocktailSheet game={game} selected={selected} onSelect={setSelected} onClose={() => setPanel(null)} onLaunch={(a) => void act(a, () => setPanel(null))} />
      ) : null}

      {panel === 'recipes' ? <RecipeSheet game={game} onClose={() => setPanel(null)} /> : null}

      {specialPanel ? (
        <Sheet label={specialPanel.name} onClose={() => setPanel(null)}>
          <span className="label" style={{ color: KIND_COLOR[specialPanel.kind] }}>
            {KIND_LABEL[specialPanel.kind]}
          </span>
          <h2>{specialPanel.name}</h2>
          <p style={{ margin: 0 }}>{specialPanel.text}</p>
          {specialPanel.kind === 'turno' ? (
            <button type="button" className="btn btn-dark" disabled={!myTurn || busy} onClick={() => void act({ type: 'PLAY_SPECIAL', specialId: specialPanel.id }, () => setPanel(null))}>
              {myTurn ? 'JUGARLA' : 'SE JUEGA EN TU TURNO'}
            </button>
          ) : (
            <p className="muted" style={{ margin: 0, fontSize: 14 }}>
              {specialPanel.kind === 'coctel' ? 'Se suma desde Armar cóctel, cuando lo lanzás.' : 'Se juega cuando te tiran un cóctel.'}
            </p>
          )}
        </Sheet>
      ) : null}

      {panel === 'menu' ? (
        <Sheet label="Menú" onClose={() => setPanel(null)}>
          <h2>Sala {room.code}</h2>
          <button type="button" className="btn btn-dark" onClick={() => setPanel('recipes')}>
            RECETARIO
          </button>
          <button
            type="button"
            className="btn btn-bordo"
            onClick={() => {
              if (finished || window.confirm('Si te vas, quedás afuera de la partida. ¿Seguro?')) void client.leave();
            }}
          >
            SALIR DE LA PARTIDA
          </button>
        </Sheet>
      ) : null}

      {finished ? <GameOver game={game} room={room} client={client} /> : null}

      <div className="toast-stack" aria-live="assertive">
        {toasts.map((t) => (
          <div key={t.id} className={`toast${t.bad ? ' bad' : ''}`}>
            {t.text}
          </div>
        ))}
      </div>
      {bubbles.map((b) => (
        <span key={b.id} className="bubble" style={{ left: `${b.x}%`, bottom: 120 }} aria-hidden="true">
          {b.emoji}
        </span>
      ))}
    </main>
  );
}

function GameOver({ game, room, client }: { game: GameView; room: RoomView; client: OnlineClient }) {
  const winner = game.players.find((p) => p.id === game.winnerId);
  const isHost = room.hostPlayerId === game.you.id;
  const ranking = [...game.players].sort((a, b) => Number(a.eliminated) - Number(b.eliminated) || b.points - a.points);
  return (
    <Sheet label="Terminó la partida">
      <span className="label">Terminó la partida</span>
      <h2>{winner ? (winner.id === game.you.id ? '¡Ganaste! Sos el que más aguantó.' : `Ganó ${winner.name}`) : 'Terminó la partida'}</h2>
      {ranking.map((p) => (
        <div key={p.id} className="option" style={{ padding: '8px 12px' }}>
          <span className="main">
            <span className="title" style={{ fontSize: 17 }}>
              {p.name}
              {p.id === game.you.id ? ' (vos)' : ''}
            </span>
            <span className="sub">
              {p.points} pts · {Math.round((p.alcohol / game.barMax) * 100)}%{p.eliminated && p.outReason ? ` · afuera, ${OUT_LABEL[p.outReason]}` : ''}
            </span>
          </span>
        </div>
      ))}
      {isHost ? (
        <button type="button" className="btn btn-verde" onClick={() => void client.reopen()}>
          JUGAR OTRA
        </button>
      ) : (
        <p className="muted" style={{ margin: 0 }}>
          El anfitrión puede armar otra con la misma sala.
        </p>
      )}
      <button type="button" className="btn btn-dark" onClick={() => void client.leave()}>
        SALIR
      </button>
    </Sheet>
  );
}
