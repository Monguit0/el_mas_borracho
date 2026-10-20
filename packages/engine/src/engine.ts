/**
 * El motor del 21. applyAction(estado, jugador, jugada) devuelve un estado nuevo y los eventos, o un
 * error. Nunca toca el estado que recibe.
 */
import { CARD_INFO, HARMFUL, RANKS, baseValue, cardLabel, fullDeck, rankLabel, type Card } from './cards.js';
import type { ChoiceOption, GameState, HandCard, Pending, PlayerState, RoundResult, Rules } from './state.js';
import { DEFAULT_RULES } from './state.js';

export type Action =
  | { readonly type: 'HIT' }
  | { readonly type: 'STAND' }
  /** Corazón Enfermero: descartarlo en tu turno. */
  | { readonly type: 'REST' }
  | { readonly type: 'CHOOSE'; readonly optionId: string }
  | { readonly type: 'NEXT_ROUND' };

export type ErrorCode =
  | 'GAME_OVER'
  | 'NOT_YOUR_TURN'
  | 'WRONG_PHASE'
  | 'UNKNOWN_PLAYER'
  | 'PLAYER_OUT'
  | 'MUST_CHOOSE'
  | 'BAD_OPTION'
  | 'NO_REST_CARD'
  | 'DECK_EMPTY'
  | 'HIT_LIMIT';

export type GameEvent =
  | { readonly type: 'ROUND_STARTED'; readonly round: number; readonly pot: number }
  /** Las 2 del reparto. La oculta va como null para los demás. */
  | { readonly type: 'DEALT'; readonly playerId: string; readonly cards: readonly (Card | null)[] }
  | { readonly type: 'TURN'; readonly playerId: string }
  | { readonly type: 'DREW'; readonly playerId: string; readonly card: Card | null; readonly forced: boolean }
  | { readonly type: 'EFFECT'; readonly playerId: string; readonly cardId: string; readonly effectId: string }
  | { readonly type: 'BLOCKED'; readonly playerId: string; readonly byId: string; readonly with: 'manta' | 'escudo' }
  | { readonly type: 'PEEK'; readonly playerId: string; readonly cards: readonly Card[] }
  | { readonly type: 'REVEAL'; readonly playerId: string; readonly card: Card }
  | { readonly type: 'CHIPS'; readonly playerId: string; readonly delta: number }
  | { readonly type: 'SAVED'; readonly playerId: string; readonly cardId: string }
  | { readonly type: 'BUST'; readonly playerId: string; readonly total: number }
  | { readonly type: 'TWENTY_ONE'; readonly playerId: string; readonly natural: boolean }
  | { readonly type: 'STAND'; readonly playerId: string }
  | { readonly type: 'LOG'; readonly text: string }
  | { readonly type: 'ROUND_OVER'; readonly winners: readonly string[]; readonly results: readonly RoundResult[] }
  | { readonly type: 'PLAYER_OUT'; readonly playerId: string; readonly reason: 'fundido' | 'abandono' }
  | { readonly type: 'GAME_OVER'; readonly winnerId: string | null };

export type Result = { readonly ok: true; readonly state: GameState; readonly events: GameEvent[] } | { readonly ok: false; readonly error: ErrorCode };

interface Ctx {
  readonly s: GameState;
  readonly events: GameEvent[];
}

const LOG_MAX = 40;

// ---------------------------------------------------------------------------
// Azar

function rand(s: GameState): number {
  s.rngState = (s.rngState + 0x6d2b79f5) >>> 0;
  let t = s.rngState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function shuffle<T>(s: GameState, arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand(s) * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

// ---------------------------------------------------------------------------
// Cuentas

/** El total de un jugador: el as vale 11 si conviene, el 6♦ vale 4 si conviene. */
export function handTotal(cards: readonly Card[], adjust = 0): number {
  const base = cards.reduce((sum, c) => sum + baseValue(c.rank), 0) + adjust;
  const hasAce = cards.some((c) => c.rank === 'A');
  const hasJeweler = cards.some((c) => c.id === '6D');
  let best = -1;
  let worst = Infinity;
  for (const ace of hasAce ? [0, 10] : [0]) {
    for (const six of hasJeweler ? [0, -2] : [0]) {
      const t = base + ace + six;
      if (t <= 21 && t > best) best = t;
      if (t < worst) worst = t;
    }
  }
  return best >= 0 ? best : worst;
}

export function playerTotal(p: PlayerState): number {
  return handTotal(
    p.cards.map((h) => h.card),
    p.adjust,
  );
}

function has(p: PlayerState, id: string): boolean {
  return p.cards.some((h) => h.card.id === id);
}

function isNatural(p: PlayerState): boolean {
  return p.cards.length === 2 && p.adjust === 0 && playerTotal(p) === 21;
}

// ---------------------------------------------------------------------------
// Ayudas

function player(s: GameState, id: string): PlayerState | undefined {
  return s.players.find((p) => p.id === id);
}

function say(ctx: Ctx, text: string): void {
  ctx.s.log.push(text);
  if (ctx.s.log.length > LOG_MAX) ctx.s.log.splice(0, ctx.s.log.length - LOG_MAX);
  ctx.events.push({ type: 'LOG', text });
}

function chips(ctx: Ctx, p: PlayerState, delta: number): number {
  const real = delta < 0 ? -Math.min(-delta, p.chips) : delta;
  if (real === 0) return 0;
  p.chips += real;
  ctx.events.push({ type: 'CHIPS', playerId: p.id, delta: real });
  return real;
}

function inGame(p: PlayerState): boolean {
  return p.status !== 'out';
}

/** Sigue en la ronda: no se pasó ni está afuera. */
function alive(p: PlayerState): boolean {
  return p.status === 'waiting' || p.status === 'playing' || p.status === 'stood';
}

function rivals(s: GameState, actorId: string, filter: (p: PlayerState) => boolean = alive): PlayerState[] {
  const ordered = s.order.map((id) => player(s, id)!).filter(Boolean);
  return ordered.filter((p) => p.id !== actorId && filter(p));
}

function hiddenIndex(p: PlayerState, unrevealedOnly = true): number {
  return p.cards.findIndex((h) => h.hidden && (!unrevealedOnly || !h.revealed));
}

function ensureDeck(ctx: Ctx): void {
  const { s } = ctx;
  if (s.deck.length > 0 || s.discard.length === 0) return;
  s.deck = shuffle(s, s.discard);
  s.discard = [];
  say(ctx, 'Se mezcló el descarte para seguir.');
}

function peekTop(ctx: Ctx, n: number): Card[] {
  ensureDeck(ctx);
  return ctx.s.deck.slice(-n).reverse();
}

function draw(ctx: Ctx): Card | null {
  ensureDeck(ctx);
  return ctx.s.deck.pop() ?? null;
}

function give(ctx: Ctx, p: PlayerState, card: Card, opts: { hidden?: boolean; forced: boolean; seenBy?: string[] }): void {
  const hidden = opts.hidden ?? false;
  p.cards.push({ card, hidden, revealed: false, seenBy: opts.seenBy ?? [] });
  ctx.events.push({ type: 'DREW', playerId: p.id, card: hidden ? null : card, forced: opts.forced });
}

function removeCard(p: PlayerState, cardId: string): HandCard | null {
  const i = p.cards.findIndex((h) => h.card.id === cardId);
  return i >= 0 ? p.cards.splice(i, 1)[0]! : null;
}

function discardFrom(ctx: Ctx, p: PlayerState, cardId: string): Card | null {
  const h = removeCard(p, cardId);
  if (!h) return null;
  ctx.s.discard.push(h.card);
  return h.card;
}

/** Manta y Escudo: frenan lo que un rival le hace. true si lo frenó. */
function blocked(ctx: Ctx, target: PlayerState, actor: PlayerState, effectId: string): boolean {
  if (target.id === actor.id || !HARMFUL.has(effectId)) return false;
  if (target.shield) {
    ctx.events.push({ type: 'BLOCKED', playerId: target.id, byId: actor.id, with: 'escudo' });
    say(ctx, `El Escudo de ${target.name} frenó a ${actor.name}.`);
    return true;
  }
  if (target.blankets > 0) {
    target.blankets--;
    ctx.events.push({ type: 'BLOCKED', playerId: target.id, byId: actor.id, with: 'manta' });
    say(ctx, `La Manta de ${target.name} frenó a ${actor.name}.`);
    return true;
  }
  return false;
}

/** Mira si se pasó (y si algo lo salva) o si llegó a 21. */
function settle(ctx: Ctx, p: PlayerState): void {
  if (!inGame(p) || p.status === 'busted') return;
  let t = playerTotal(p);
  if (t > 21 && !p.usedBribe && has(p, 'KD') && t - 21 <= 2 && p.chips >= 1) {
    p.usedBribe = true;
    chips(ctx, p, -1);
    ctx.s.pot += 1;
    p.adjust += 21 - t;
    ctx.events.push({ type: 'SAVED', playerId: p.id, cardId: 'KD' });
    say(ctx, `${p.name} sobornó al Barón Quilates y quedó en 21.`);
    t = 21;
  }
  if (t > 21 && has(p, '3H')) {
    const others = p.cards.filter((h) => h.card.id !== '3H');
    const highest = others.reduce<HandCard | null>((best, h) => (!best || baseValue(h.card.rank) > baseValue(best.card.rank) ? h : best), null);
    if (highest) discardFrom(ctx, p, highest.card.id);
    discardFrom(ctx, p, '3H');
    ctx.events.push({ type: 'SAVED', playerId: p.id, cardId: '3H' });
    say(ctx, `¡Latido Guardavidas salvó a ${p.name}!${highest ? ` Se fue con ${cardLabel(highest.card)}.` : ''}`);
    t = playerTotal(p);
  }
  if (t > 21 && !p.usedFirefighter && has(p, '8H')) {
    p.usedFirefighter = true;
    p.adjust += 17 - t;
    ctx.events.push({ type: 'SAVED', playerId: p.id, cardId: '8H' });
    say(ctx, `¡El Corazón Bombero apagó el incendio! ${p.name} queda en 17.`);
    t = 17;
  }
  if (t > 21) {
    p.status = 'busted';
    for (const h of p.cards) h.revealed = true;
    ctx.events.push({ type: 'BUST', playerId: p.id, total: t });
    say(ctx, `${p.name} se pasó: ${t}.`);
    return;
  }
  if (t === 21 && !p.announced21) {
    p.announced21 = true;
    const natural = isNatural(p);
    ctx.events.push({ type: 'TWENTY_ONE', playerId: p.id, natural });
    say(ctx, natural ? `¡${p.name} tiene 21 de mano!` : `¡${p.name} llegó a 21!`);
  } else if (t !== 21) {
    p.announced21 = false;
  }
}

function setPending(ctx: Ctx, actor: PlayerState, sourceId: string, effectId: string, prompt: string, options: ChoiceOption[], step = 1, data: Record<string, string> = {}): void {
  ctx.s.pending = { playerId: actor.id, sourceId, effectId, step, prompt, options, data };
}

const NO = (label: string): ChoiceOption => ({ id: 'no', label });
const targetOptions = (ps: PlayerState[]): ChoiceOption[] => ps.map((p) => ({ id: p.id, label: p.name }));

// ---------------------------------------------------------------------------
// Los efectos "al pedir"

type Trigger = (ctx: Ctx, actor: PlayerState, sourceId: string, effectId: string) => void;
type Resolve = (ctx: Ctx, actor: PlayerState, pending: Pending, optionId: string) => void;

/** Elegí un rival: con la lista vacía, no hace nada. */
function chooseRival(ctx: Ctx, actor: PlayerState, sourceId: string, effectId: string, prompt: string, targets: PlayerState[], optional = false): void {
  if (targets.length === 0) {
    say(ctx, `${actor.name}: no había a quién.`);
    return;
  }
  setPending(ctx, actor, sourceId, effectId, prompt, [...(optional ? [NO('Nadie')] : []), ...targetOptions(targets)]);
}

function forcedDraw(ctx: Ctx, target: PlayerState): void {
  const card = draw(ctx);
  if (!card) return;
  give(ctx, target, card, { forced: true });
  settle(ctx, target);
}

function swapHidden(ctx: Ctx, a: PlayerState, b: PlayerState): boolean {
  const ia = hiddenIndex(a, false);
  const ib = hiddenIndex(b, false);
  if (ia < 0 || ib < 0) return false;
  const ca = a.cards[ia]!;
  const cb = b.cards[ib]!;
  a.cards[ia] = { card: cb.card, hidden: true, revealed: cb.revealed, seenBy: [b.id] };
  b.cards[ib] = { card: ca.card, hidden: true, revealed: ca.revealed, seenBy: [a.id] };
  return true;
}

const TRIGGERS: Record<string, Trigger> = {
  AS: (ctx, a, src, eff) => {
    const top = peekTop(ctx, 3);
    if (top.length < 2) return say(ctx, `${a.name} miró el mazo, pero no había para elegir.`);
    setPending(ctx, a, src, eff, '¿Cuál queda arriba del mazo? Las otras van al fondo.', top.map((c) => ({ id: c.id, label: cardLabel(c), card: c })));
  },
  '2S': (ctx, a, src, eff) => {
    const [top] = peekTop(ctx, 1);
    if (!top) return;
    setPending(ctx, a, src, eff, 'Esta es la de arriba del mazo.', [
      { id: 'top', label: 'Dejarla arriba', card: top },
      { id: 'bottom', label: 'Mandarla al fondo' },
    ]);
  },
  '3S': (ctx, a, src, eff) => chooseRival(ctx, a, src, eff, '¿A quién le espiás la carta oculta?', rivals(ctx.s, a.id, (p) => inGame(p) && hiddenIndex(p) >= 0)),
  '4S': (ctx, a, src, eff) =>
    setPending(ctx, a, src, eff, '¿La de arriba del mazo es alta (7 o más) o baja?', [
      { id: 'high', label: 'Alta' },
      { id: 'low', label: 'Baja' },
    ]),
  '5S': (ctx, a, src, eff) => {
    const [top] = peekTop(ctx, 1);
    if (!top) return;
    setPending(ctx, a, src, eff, 'Esta es la de arriba del mazo.', [
      { id: 'bottom', label: 'Mandarla al fondo', card: top },
      { id: 'take', label: 'Quedármela' },
    ]);
  },
  '6S': (ctx, a, src, eff) => chooseRival(ctx, a, src, eff, '¿De quién querés saber si tiene más de 15?', rivals(ctx.s, a.id)),
  '7S': (ctx, a, src, eff) => {
    const [top] = peekTop(ctx, 1);
    if (!top) return;
    const targets = rivals(ctx.s, a.id);
    setPending(ctx, a, src, eff, 'Esta es la de arriba del mazo. ¿Se la das a alguien?', [
      { id: 'no', label: 'A nadie', card: top },
      ...targetOptions(targets),
    ]);
  },
  '8S': (ctx, a, src, eff) =>
    setPending(ctx, a, src, eff, '¿Cambiás esta carta por la de arriba del mazo, sin mirarla?', [
      NO('Me la quedo'),
      { id: 'swap', label: 'Cambiarla' },
    ]),
  '9S': (ctx, a, _src, eff) => {
    for (const r of rivals(ctx.s, a.id, inGame)) {
      if (hiddenIndex(r) < 0 || blocked(ctx, r, a, eff)) continue;
      for (const h of r.cards) {
        if (h.hidden && !h.revealed) {
          h.revealed = true;
          ctx.events.push({ type: 'REVEAL', playerId: r.id, card: h.card });
        }
      }
    }
    say(ctx, `Eclipse: ${a.name} hizo dar vuelta las cartas ocultas.`);
  },
  '10S': (ctx, a, src) => {
    const h = a.cards.find((c) => c.card.id === src);
    if (h) h.hidden = true;
    say(ctx, `${a.name} escondió una carta boca abajo.`);
  },
  JS: (ctx, a, _src, eff) => {
    const i = ctx.s.order.indexOf(a.id);
    const next = ctx.s.order
      .slice(i + 1)
      .map((id) => player(ctx.s, id)!)
      .find((p) => p.status === 'waiting');
    if (!next) return say(ctx, `${a.name} puso el Cerrojo, pero no queda nadie por jugar.`);
    if (blocked(ctx, next, a, eff)) return;
    next.maxHits = 1;
    say(ctx, `Cerrojo: ${next.name} va a poder pedir una sola carta.`);
  },
  QS: (ctx, a, src, eff) =>
    setPending(
      ctx,
      a,
      src,
      eff,
      '¿Qué número sale arriba del mazo?',
      RANKS.map((r) => ({ id: r, label: r })),
    ),
  KS: (ctx, a, src, eff) => {
    const seen = new Set<string>();
    const options = [...ctx.s.discard].reverse().filter((c) => !seen.has(c.id) && seen.add(c.id)).slice(0, 12);
    if (options.length === 0) return say(ctx, `${a.name} quiso excavar, pero el descarte está vacío.`);
    setPending(ctx, a, src, eff, '¿La cambiás por una del descarte?', [NO('Me quedo con esta'), ...options.map((c) => ({ id: c.id, label: cardLabel(c), card: c }))]);
  },
  AD: (ctx, a, src, eff) => {
    const options = rivals(ctx.s, a.id).flatMap((r) =>
      r.cards.filter((h) => !h.hidden || h.revealed).map((h) => ({ id: `${r.id}:${h.card.id}`, label: `${cardLabel(h.card)} de ${r.name}`, card: h.card })),
    );
    if (options.length === 0) return say(ctx, `${a.name}: no había cartas para canjear.`);
    setPending(ctx, a, src, eff, '¿Por cuál la cambiás?', [NO('No cambio'), ...options]);
  },
  '2D': (ctx, a) => {
    chips(ctx, a, 1);
    say(ctx, `${a.name} ganó 1 ficha.`);
  },
  '3D': (ctx, a, src, eff) => {
    if (a.chips < 1) return say(ctx, `${a.name} no tenía fichas para regatear.`);
    const options = a.cards
      .filter((h) => h.card.id !== src)
      .map((h) => ({ id: h.card.id, label: `${cardLabel(h.card)}${h.hidden ? ' (oculta)' : ''}`, card: h.card }));
    if (options.length === 0) return;
    setPending(ctx, a, src, eff, '¿Pagás 1 ficha para descartar una carta?', [NO('No'), ...options]);
  },
  '4D': (ctx, a, src, eff) => {
    if (hiddenIndex(a, false) < 0) return say(ctx, `${a.name} no tenía carta oculta para cambiar.`);
    const targets = rivals(ctx.s, a.id, (p) => alive(p) && hiddenIndex(p, false) >= 0);
    chooseRival(ctx, a, src, eff, '¿Con quién cambiás la carta oculta?', targets, true);
  },
  '7D': (ctx, a, _src, eff) => {
    const ring = ctx.s.order
      .map((id) => player(ctx.s, id)!)
      .filter((p) => alive(p) && hiddenIndex(p, false) >= 0)
      .filter((p) => p.id === a.id || !blocked(ctx, p, a, eff));
    if (ring.length < 2) return say(ctx, 'Feria: no hubo con quién cambiar.');
    const passed = ring.map((p) => p.cards.splice(hiddenIndex(p, false), 1)[0]!);
    ring.forEach((p, i) => {
      const from = ring[(i - 1 + ring.length) % ring.length]!;
      const h = passed[(i - 1 + ring.length) % ring.length]!;
      p.cards.unshift({ card: h.card, hidden: true, revealed: h.revealed, seenBy: [from.id] });
    });
    say(ctx, 'Feria: todos le pasaron su carta oculta al de la izquierda.');
    for (const p of ring) settle(ctx, p);
  },
  '8D': (ctx, a) => {
    chips(ctx, a, 2);
    a.loan = true;
    say(ctx, `${a.name} pidió un préstamo: 2 fichas (si pierde, devuelve 3).`);
  },
  '9D': (ctx, a) => {
    chips(ctx, a, a.cards.length);
    say(ctx, `${a.name} cobró intereses: ${a.cards.length} fichas.`);
  },
  '10D': (ctx, a, src, eff) => chooseRival(ctx, a, src, eff, '¿A quién se la vendés por 2 fichas?', rivals(ctx.s, a.id), true),
  JD: (ctx, a, _src, eff) => {
    const mine = a.chips;
    let stolen = 0;
    for (const r of rivals(ctx.s, a.id, inGame)) {
      if (r.chips <= mine || blocked(ctx, r, a, eff)) continue;
      chips(ctx, r, -1);
      chips(ctx, a, 1);
      stolen++;
    }
    say(ctx, `Contrabando: ${a.name} se llevó ${stolen} ficha${stolen === 1 ? '' : 's'}.`);
  },
  '2H': (ctx, a, src) => {
    const others = a.cards.filter((h) => h.card.id !== src);
    const lowest = others.reduce<HandCard | null>((best, h) => (!best || baseValue(h.card.rank) < baseValue(best.card.rank) ? h : best), null);
    if (!lowest) return;
    discardFrom(ctx, a, lowest.card.id);
    say(ctx, `${a.name} se curó: descartó ${cardLabel(lowest.card)}.`);
  },
  '4H': (ctx, a) => {
    a.blankets++;
    say(ctx, `${a.name} se tapó con la Manta.`);
  },
  '5H': (ctx, a, src, eff) => chooseRival(ctx, a, src, eff, '¿A quién abrazás? Los dos ganan 1 ficha.', rivals(ctx.s, a.id, inGame)),
  '7H': (ctx, a) => {
    a.shield = true;
    say(ctx, `${a.name} levantó el Escudo: nada de rivales lo toca esta ronda.`);
  },
  '9H': (ctx, a) => {
    for (const p of ctx.s.players) if (inGame(p)) chips(ctx, p, 1);
    say(ctx, `Olla popular de ${a.name}: todos ganan 1 ficha.`);
  },
  JH: (ctx, a, src, eff) => chooseRival(ctx, a, src, eff, '¿Con quién hacés pareja?', rivals(ctx.s, a.id, inGame)),
  QH: (ctx, a, src, eff) =>
    chooseRival(ctx, a, src, eff, '¿A quién perdonás?', rivals(ctx.s, a.id, (p) => p.status === 'busted')),
  '2C': (ctx, a, src, eff) => chooseRival(ctx, a, src, eff, '¿A quién le hacés pedir una carta?', rivals(ctx.s, a.id)),
  '3C': (ctx, a, src, eff) => {
    const targets = rivals(ctx.s, a.id, (p) => alive(p) && hiddenIndex(p, false) >= 0);
    if (targets.length < 2) return say(ctx, 'Enroque: no había dos rivales con carta oculta.');
    setPending(ctx, a, src, eff, 'Elegí al primer rival.', targetOptions(targets));
  },
  '4C': (ctx, a, src, eff) => chooseRival(ctx, a, src, eff, '¿A quién le robás 1 ficha?', rivals(ctx.s, a.id, (p) => inGame(p) && p.chips > 0)),
  '5C': (ctx, a, src, eff) =>
    chooseRival(ctx, a, src, eff, '¿A quién le tirás el pastelazo?', rivals(ctx.s, a.id, (p) => inGame(p) && hiddenIndex(p) >= 0)),
  '6C': (ctx, a, src, eff) =>
    chooseRival(ctx, a, src, eff, '¿A quién le desordenás la carta oculta?', rivals(ctx.s, a.id, (p) => alive(p) && hiddenIndex(p, false) >= 0)),
  '7C': (ctx, a, src, eff) => {
    const options = rivals(ctx.s, a.id).flatMap((r) =>
      r.cards.filter((h) => !h.hidden || h.revealed).map((h) => ({ id: `${r.id}:${h.card.id}`, label: `${cardLabel(h.card)} de ${r.name}`, card: h.card })),
    );
    if (options.length === 0) return say(ctx, `${a.name}: no había cartas para abordar.`);
    setPending(ctx, a, src, eff, '¿Qué carta le robás?', [NO('Ninguna'), ...options]);
  },
  '8C': (ctx, a, src, eff) => chooseRival(ctx, a, src, eff, '¿A quién le pegás? Pierde 2 fichas.', rivals(ctx.s, a.id, (p) => inGame(p) && p.chips > 0)),
  '9C': (ctx, a, _src, eff) => {
    say(ctx, `¡Chaparrón de ${a.name}! Todos piden una carta.`);
    for (const r of rivals(ctx.s, a.id)) if (!blocked(ctx, r, a, eff)) forcedDraw(ctx, r);
  },
  '10C': (ctx, a, _src, eff) => {
    const rich = rivals(ctx.s, a.id, inGame).reduce<PlayerState | null>((best, p) => (!best || p.chips > best.chips ? p : best), null);
    if (!rich || rich.chips === 0) return say(ctx, `${a.name} pisó fuerte, pero nadie tenía fichas.`);
    if (blocked(ctx, rich, a, eff)) return;
    const taken = -chips(ctx, rich, -2);
    chips(ctx, a, taken);
    say(ctx, `¡Pisotón! ${rich.name} le dio ${taken} ficha${taken === 1 ? '' : 's'} a ${a.name}.`);
  },
  JC: (ctx, a, src) => {
    const copy = ctx.s.lastEffectId;
    if (!copy || copy === 'JC') return say(ctx, `${a.name} se miró al Espejo, pero no había nada para copiar.`);
    say(ctx, `Espejo: ${a.name} copia ${CARD_INFO[copy]!.title}.`);
    trigger(ctx, a, src, copy);
  },
  QC: (ctx, a, src, eff) => chooseRival(ctx, a, src, eff, '¿A quién le echás la maldición?', rivals(ctx.s, a.id)),
  KC: (ctx, a, _src, eff) => {
    say(ctx, `¡Trueno de ${a.name}! Los que tienen 18 o más piden una carta.`);
    for (const r of rivals(ctx.s, a.id)) if (playerTotal(r) >= 18 && !blocked(ctx, r, a, eff)) forcedDraw(ctx, r);
  },
};

function targetOf(ctx: Ctx, optionId: string): PlayerState | undefined {
  return player(ctx.s, optionId);
}

const RESOLVES: Record<string, Resolve> = {
  AS: (ctx, a, _p, id) => {
    const deck = ctx.s.deck;
    const top = deck.splice(-3);
    const chosen = top.find((c) => c.id === id)!;
    deck.unshift(...top.filter((c) => c.id !== id));
    deck.push(chosen);
    say(ctx, `${a.name} acomodó el mazo a su gusto.`);
  },
  '2S': (ctx, a, _p, id) => {
    if (id === 'bottom') ctx.s.deck.unshift(ctx.s.deck.pop()!);
    say(ctx, `${a.name} miró la de arriba y la ${id === 'bottom' ? 'mandó al fondo' : 'dejó arriba'}.`);
  },
  '3S': (ctx, a, p, id) => {
    const t = targetOf(ctx, id)!;
    if (blocked(ctx, t, a, p.effectId)) return;
    const seen = t.cards.filter((h) => h.hidden && !h.revealed);
    for (const h of seen) if (!h.seenBy.includes(a.id)) h.seenBy.push(a.id);
    ctx.events.push({ type: 'PEEK', playerId: a.id, cards: seen.map((h) => h.card) });
    say(ctx, `${a.name} espió la carta oculta de ${t.name}.`);
  },
  '4S': (ctx, a, _p, id) => {
    const card = draw(ctx);
    if (!card) return;
    ctx.s.discard.push(card);
    const high = baseValue(card.rank) >= 7;
    const right = (id === 'high') === high;
    say(ctx, `Salió ${cardLabel(card)}: ${right ? `¡${a.name} acertó!` : `${a.name} no acertó.`}`);
    if (right) chips(ctx, a, 1);
  },
  '5S': (ctx, a, _p, id) => {
    if (id === 'take') {
      const card = draw(ctx);
      if (card) give(ctx, a, card, { forced: true });
      say(ctx, `${a.name} se quedó con la de arriba.`);
    } else {
      ctx.s.deck.unshift(ctx.s.deck.pop()!);
      say(ctx, `${a.name} mandó la de arriba al fondo.`);
    }
  },
  '6S': (ctx, a, p, id) => {
    const t = targetOf(ctx, id)!;
    if (blocked(ctx, t, a, p.effectId)) return;
    say(ctx, `Pista: ${t.name} ${playerTotal(t) > 15 ? 'tiene más de 15' : 'tiene 15 o menos'}.`);
  },
  '7S': (ctx, a, p, id) => {
    if (id === 'no') return say(ctx, `${a.name} miró la de arriba y no se la dio a nadie.`);
    const t = targetOf(ctx, id)!;
    if (blocked(ctx, t, a, p.effectId)) return;
    say(ctx, `${a.name} le adelantó una carta a ${t.name}.`);
    forcedDraw(ctx, t);
  },
  '8S': (ctx, a, p, id) => {
    if (id !== 'swap') return;
    discardFrom(ctx, a, p.sourceId);
    const card = draw(ctx);
    if (card) give(ctx, a, card, { forced: true });
    say(ctx, `¡Truco! ${a.name} cambió su carta por la de arriba del mazo.`);
  },
  QS: (ctx, a, _p, id) => {
    const card = draw(ctx);
    if (!card) return;
    ctx.s.discard.push(card);
    const right = card.rank === id;
    say(ctx, `${a.name} dijo ${rankLabel(id as Card['rank'])} y salió ${cardLabel(card)}${right ? ': ¡acertó!' : '.'}`);
    if (right) chips(ctx, a, 3);
  },
  KS: (ctx, a, p, id) => {
    if (id === 'no') return;
    const i = ctx.s.discard.map((c) => c.id).lastIndexOf(id);
    if (i < 0) return;
    const [card] = ctx.s.discard.splice(i, 1);
    discardFrom(ctx, a, p.sourceId);
    give(ctx, a, card!, { forced: true });
    say(ctx, `${a.name} excavó y sacó ${cardLabel(card!)} del descarte.`);
  },
  AD: (ctx, a, p, id) => {
    if (id === 'no') return;
    const [targetId, cardId] = id.split(':');
    const t = targetOf(ctx, targetId!)!;
    if (blocked(ctx, t, a, p.effectId)) return;
    const theirs = removeCard(t, cardId!);
    const mine = removeCard(a, p.sourceId);
    if (theirs) a.cards.push({ ...theirs, hidden: false, seenBy: [] });
    if (mine) t.cards.push({ ...mine, hidden: false, seenBy: [] });
    say(ctx, `Canje: ${a.name} le cambió una carta a ${t.name}.`);
    settle(ctx, t);
  },
  '3D': (ctx, a, _p, id) => {
    if (id === 'no') return;
    chips(ctx, a, -1);
    ctx.s.pot += 1;
    const card = discardFrom(ctx, a, id);
    say(ctx, `${a.name} pagó 1 ficha y descartó ${card ? cardLabel(card) : 'una carta'}.`);
  },
  '4D': (ctx, a, p, id) => {
    if (id === 'no') return;
    const t = targetOf(ctx, id)!;
    if (blocked(ctx, t, a, p.effectId)) return;
    if (swapHidden(ctx, a, t)) say(ctx, `${a.name} cambió su carta oculta con la de ${t.name}.`);
    settle(ctx, t);
  },
  '10D': (ctx, a, p, id) => {
    if (id === 'no') return;
    const t = targetOf(ctx, id)!;
    if (blocked(ctx, t, a, p.effectId)) return;
    const card = removeCard(a, p.sourceId);
    if (card) t.cards.push({ ...card, hidden: false, seenBy: [] });
    const paid = -chips(ctx, t, -2);
    chips(ctx, a, paid);
    say(ctx, `¡Vendido! ${t.name} se quedó con el Martillero y pagó ${paid} ficha${paid === 1 ? '' : 's'}.`);
    settle(ctx, t);
  },
  '5H': (ctx, a, _p, id) => {
    const t = targetOf(ctx, id)!;
    chips(ctx, a, 1);
    chips(ctx, t, 1);
    say(ctx, `${a.name} abrazó a ${t.name}: los dos ganan 1 ficha.`);
  },
  JH: (ctx, a, _p, id) => {
    const t = targetOf(ctx, id)!;
    a.partnerId = t.id;
    say(ctx, `${a.name} y ${t.name} hacen pareja esta ronda.`);
  },
  QH: (ctx, a, _p, id) => {
    const t = targetOf(ctx, id)!;
    const last = t.cards[t.cards.length - 1];
    if (last) discardFrom(ctx, t, last.card.id);
    t.status = t.played ? 'stood' : 'waiting';
    t.announced21 = false;
    say(ctx, `${a.name} perdonó a ${t.name}: descartó su última carta.`);
    settle(ctx, t);
  },
  '2C': (ctx, a, p, id) => {
    const t = targetOf(ctx, id)!;
    if (blocked(ctx, t, a, p.effectId)) return;
    say(ctx, `${a.name} le hizo cosquillas a ${t.name}: pide una carta.`);
    forcedDraw(ctx, t);
  },
  '3C': (ctx, a, p, id) => {
    if (p.step === 1) {
      const targets = rivals(ctx.s, a.id, (q) => alive(q) && hiddenIndex(q, false) >= 0 && q.id !== id);
      setPending(ctx, a, p.sourceId, p.effectId, 'Elegí al segundo rival.', targetOptions(targets), 2, { first: id });
      return;
    }
    const first = targetOf(ctx, p.data['first']!)!;
    const second = targetOf(ctx, id)!;
    if (blocked(ctx, first, a, p.effectId) || blocked(ctx, second, a, p.effectId)) return;
    swapHidden(ctx, first, second);
    say(ctx, `Enroque: ${first.name} y ${second.name} cambiaron sus cartas ocultas.`);
    settle(ctx, first);
    settle(ctx, second);
  },
  '4C': (ctx, a, p, id) => {
    const t = targetOf(ctx, id)!;
    if (blocked(ctx, t, a, p.effectId)) return;
    const taken = -chips(ctx, t, -1);
    chips(ctx, a, taken);
    say(ctx, `¡Manotazo! ${a.name} le robó 1 ficha a ${t.name}.`);
  },
  '5C': (ctx, a, p, id) => {
    const t = targetOf(ctx, id)!;
    if (blocked(ctx, t, a, p.effectId)) return;
    for (const h of t.cards) {
      if (h.hidden && !h.revealed) {
        h.revealed = true;
        ctx.events.push({ type: 'REVEAL', playerId: t.id, card: h.card });
      }
    }
    say(ctx, `¡Pastelazo! ${t.name} dio vuelta su carta oculta.`);
  },
  '6C': (ctx, a, p, id) => {
    const t = targetOf(ctx, id)!;
    if (blocked(ctx, t, a, p.effectId)) return;
    const i = hiddenIndex(t, false);
    const [old] = t.cards.splice(i, 1);
    const at = Math.floor(rand(ctx.s) * ctx.s.deck.length);
    ctx.s.deck.splice(at, 0, old!.card);
    const card = draw(ctx);
    if (card) {
      t.cards.splice(i, 0, { card, hidden: true, revealed: false, seenBy: [] });
      ctx.events.push({ type: 'DREW', playerId: t.id, card: null, forced: true });
    }
    say(ctx, `${a.name} le desordenó la carta oculta a ${t.name}.`);
    settle(ctx, t);
  },
  '7C': (ctx, a, p, id) => {
    if (id === 'no') return;
    const [targetId, cardId] = id.split(':');
    const t = targetOf(ctx, targetId!)!;
    if (blocked(ctx, t, a, p.effectId)) return;
    const card = removeCard(t, cardId!);
    if (card) a.cards.push({ ...card, hidden: false, seenBy: [] });
    say(ctx, `¡Abordaje! ${a.name} le robó ${card ? cardLabel(card.card) : 'una carta'} a ${t.name}.`);
    settle(ctx, t);
  },
  '8C': (ctx, a, p, id) => {
    const t = targetOf(ctx, id)!;
    if (blocked(ctx, t, a, p.effectId)) return;
    const lost = -chips(ctx, t, -2);
    say(ctx, `¡Gancho! ${t.name} perdió ${lost} ficha${lost === 1 ? '' : 's'}.`);
  },
  QC: (ctx, a, p, id) => {
    const t = targetOf(ctx, id)!;
    if (blocked(ctx, t, a, p.effectId)) return;
    t.cursed = true;
    say(ctx, `${a.name} le echó una maldición a ${t.name}.`);
  },
};

function trigger(ctx: Ctx, actor: PlayerState, sourceId: string, effectId: string): void {
  if (effectId !== 'JC') ctx.s.lastEffectId = effectId;
  ctx.events.push({ type: 'EFFECT', playerId: actor.id, cardId: sourceId, effectId });
  TRIGGERS[effectId]?.(ctx, actor, sourceId, effectId);
}

// ---------------------------------------------------------------------------
// Rondas y turnos

function resetRound(p: PlayerState): void {
  p.status = 'waiting';
  p.cards = [];
  p.adjust = 0;
  p.played = false;
  p.hitsThisTurn = 0;
  p.maxHits = null;
  p.blankets = 0;
  p.shield = false;
  p.loan = false;
  p.cursed = false;
  p.partnerId = null;
  p.usedBribe = false;
  p.usedFirefighter = false;
  p.announced21 = false;
  p.chipsAtStart = p.chips;
}

function startRound(ctx: Ctx): void {
  const { s } = ctx;
  s.round++;
  s.phase = 'playing';
  s.deck = shuffle(s, fullDeck());
  s.discard = [];
  s.lastEffectId = null;
  s.results = null;
  s.pending = null;
  const seated = s.players.filter(inGame);
  for (const p of seated) {
    resetRound(p);
    const paid = -chips(ctx, p, -s.rules.ante);
    s.pot += paid;
  }
  const shift = (s.round - 1) % seated.length;
  s.order = [...seated.slice(shift), ...seated.slice(0, shift)].map((p) => p.id);
  ctx.events.push({ type: 'ROUND_STARTED', round: s.round, pot: s.pot });
  say(ctx, `Ronda ${s.round}. En el pozo: ${s.pot} fichas.`);
  for (const id of s.order) player(s, id)!.cards.push({ card: s.deck.pop()!, hidden: true, revealed: false, seenBy: [] });
  for (const id of s.order) player(s, id)!.cards.push({ card: s.deck.pop()!, hidden: false, revealed: false, seenBy: [] });
  for (const id of s.order) {
    const p = player(s, id)!;
    ctx.events.push({ type: 'DEALT', playerId: id, cards: p.cards.map((h) => h.card) });
    settle(ctx, p);
  }
  nextTurn(ctx);
}

/** Le pasa el turno al próximo que falta jugar; si no queda nadie, termina la ronda. */
function nextTurn(ctx: Ctx): void {
  const { s } = ctx;
  s.currentId = null;
  const next = s.order.map((id) => player(s, id)!).find((p) => p.status === 'waiting');
  if (!next) return endRound(ctx);
  s.currentId = next.id;
  next.status = 'playing';
  next.hitsThisTurn = 0;
  ctx.events.push({ type: 'TURN', playerId: next.id });
  if (playerTotal(next) === 21) {
    say(ctx, `${next.name} ya tiene 21: se planta solo.`);
    stand(ctx, next);
  }
}

function stand(ctx: Ctx, p: PlayerState): void {
  p.played = true;
  if (p.status === 'playing') p.status = 'stood';
  ctx.events.push({ type: 'STAND', playerId: p.id });
  nextTurn(ctx);
}

/** Después de cada jugada del que tiene el turno: si se pasó, llegó a 21 o ya no puede pedir, sigue el próximo. */
function continueTurn(ctx: Ctx): void {
  const { s } = ctx;
  if (s.pending || s.phase !== 'playing' || !s.currentId) return;
  const p = player(s, s.currentId)!;
  settle(ctx, p);
  if (p.status === 'busted') {
    p.played = true;
    return nextTurn(ctx);
  }
  if (p.status !== 'playing') return nextTurn(ctx);
  if (playerTotal(p) === 21) return stand(ctx, p);
  if (p.maxHits !== null && p.hitsThisTurn >= p.maxHits) {
    say(ctx, `${p.name} no puede pedir más (Cerrojo).`);
    stand(ctx, p);
  }
}

function endRound(ctx: Ctx): void {
  const { s } = ctx;
  const seated = s.players.filter(inGame);
  for (const p of seated) for (const h of p.cards) h.revealed = true;
  const contenders = seated.filter((p) => p.status === 'stood');
  const best = Math.max(...contenders.map(playerTotal), -1);
  const winners = contenders.filter((p) => playerTotal(p) === best);
  const notes = new Map<string, string[]>();
  const note = (p: PlayerState, text: string) => notes.set(p.id, [...(notes.get(p.id) ?? []), text]);

  if (winners.length === 0) {
    say(ctx, `Nadie ganó la ronda: el pozo (${s.pot}) queda para la próxima.`);
  } else {
    const share = Math.floor(s.pot / winners.length);
    s.pot -= share * winners.length;
    for (const w of winners) {
      let mult = 1;
      let why = '';
      if (has(w, '5D')) [mult, why] = [2, 'Doble o nada'];
      if (has(w, 'AH') && playerTotal(w) === 21 && mult < 2) [mult, why] = [2, 'Flechazo'];
      if (has(w, 'AC') && isNatural(w)) [mult, why] = [3, 'Suerte'];
      chips(ctx, w, share * mult);
      if (mult > 1) note(w, `${why}: ×${mult}`);
      if (has(w, 'KH')) {
        for (const q of seated) if (q.id !== w.id) chips(ctx, q, 1);
        chips(ctx, w, 2);
        note(w, 'Generoso');
      }
      for (const q of seated) {
        if (q.id === w.id || winners.includes(q)) continue;
        if (q.partnerId === w.id || w.partnerId === q.id) {
          chips(ctx, q, 2);
          note(q, `Pareja de ${w.name}`);
        }
      }
    }
    say(ctx, winners.length === 1 ? `¡${winners[0]!.name} gana la ronda con ${best}!` : `Empate con ${best}: ${winners.map((w) => w.name).join(' y ')} se reparten el pozo.`);
  }

  for (const p of seated) {
    if (winners.includes(p)) continue;
    const busted = p.status === 'busted';
    if (has(p, '10H') || (busted && has(p, 'QD'))) {
      chips(ctx, p, s.rules.ante);
      note(p, has(p, '10H') ? 'Corazón grande' : 'Reembolso');
    }
    if (p.loan) {
      chips(ctx, p, -3);
      note(p, 'Devolvió el préstamo');
    }
    if (busted && p.cursed) {
      chips(ctx, p, -1);
      note(p, 'Maldición');
    }
  }

  const results: RoundResult[] = s.order.map((id) => {
    const p = player(s, id)!;
    return {
      playerId: id,
      total: playerTotal(p),
      busted: p.status === 'busted',
      winner: winners.includes(p),
      delta: p.chips - p.chipsAtStart,
      note: notes.get(id)?.join(' · ') ?? null,
    };
  });
  s.results = results;
  s.currentId = null;
  s.pending = null;
  s.phase = 'roundOver';
  ctx.events.push({ type: 'ROUND_OVER', winners: winners.map((w) => w.id), results });

  const solvent = s.players.filter((p) => inGame(p) && p.chips > 0);
  if (s.round >= s.rules.rounds || solvent.length <= 1) finish(ctx);
}

function finish(ctx: Ctx): void {
  const { s } = ctx;
  const seated = s.players.filter(inGame);
  const winner = seated.reduce<PlayerState | null>((best, p) => (!best || p.chips > best.chips ? p : best), null);
  s.phase = 'finished';
  s.currentId = null;
  s.pending = null;
  s.winnerId = winner?.id ?? null;
  ctx.events.push({ type: 'GAME_OVER', winnerId: s.winnerId });
  say(ctx, winner ? `¡${winner.name} gana la partida con ${winner.chips} fichas!` : 'Terminó la partida.');
}

// ---------------------------------------------------------------------------
// API

export function createGame(opts: { players: readonly { id: string; name: string }[]; seed: number; rules?: Rules }): { state: GameState; events: GameEvent[] } {
  const rules = opts.rules ?? DEFAULT_RULES;
  const state: GameState = {
    rules,
    players: opts.players.map((p) => ({
      id: p.id,
      name: p.name,
      chips: rules.startChips,
      outReason: null,
      status: 'waiting',
      cards: [],
      adjust: 0,
      played: false,
      hitsThisTurn: 0,
      maxHits: null,
      blankets: 0,
      shield: false,
      loan: false,
      cursed: false,
      partnerId: null,
      usedBribe: false,
      usedFirefighter: false,
      announced21: false,
      chipsAtStart: rules.startChips,
    })),
    round: 0,
    phase: 'playing',
    deck: [],
    discard: [],
    order: [],
    currentId: null,
    pending: null,
    pot: 0,
    lastEffectId: null,
    results: null,
    winnerId: null,
    log: [],
    rngState: opts.seed >>> 0,
  };
  const ctx: Ctx = { s: state, events: [] };
  startRound(ctx);
  return { state, events: ctx.events };
}

export function applyAction(state: GameState, playerId: string, action: Action): Result {
  if (state.phase === 'finished') return fail('GAME_OVER');
  const s = structuredClone(state);
  const p = player(s, playerId);
  if (!p) return fail('UNKNOWN_PLAYER');
  if (!inGame(p)) return fail('PLAYER_OUT');
  const ctx: Ctx = { s, events: [] };

  if (action.type === 'NEXT_ROUND') {
    if (s.phase !== 'roundOver') return fail('WRONG_PHASE');
    for (const q of s.players) {
      if (inGame(q) && q.chips <= 0) {
        q.status = 'out';
        q.outReason = 'fundido';
        q.cards = [];
        ctx.events.push({ type: 'PLAYER_OUT', playerId: q.id, reason: 'fundido' });
        say(ctx, `${q.name} se quedó sin fichas.`);
      }
    }
    startRound(ctx);
    return { ok: true, state: s, events: ctx.events };
  }

  if (s.phase !== 'playing') return fail('WRONG_PHASE');
  if (s.currentId !== playerId) return fail('NOT_YOUR_TURN');

  switch (action.type) {
    case 'CHOOSE': {
      const pending = s.pending;
      if (!pending) return fail('WRONG_PHASE');
      if (!pending.options.some((o) => o.id === action.optionId)) return fail('BAD_OPTION');
      s.pending = null;
      RESOLVES[pending.effectId]?.(ctx, p, pending, action.optionId);
      continueTurn(ctx);
      break;
    }
    case 'HIT': {
      if (s.pending) return fail('MUST_CHOOSE');
      if (p.maxHits !== null && p.hitsThisTurn >= p.maxHits) return fail('HIT_LIMIT');
      const card = draw(ctx);
      if (!card) return fail('DECK_EMPTY');
      p.hitsThisTurn++;
      give(ctx, p, card, { forced: false, hidden: card.id === '10S' });
      if (CARD_INFO[card.id]?.kind === 'on') trigger(ctx, p, card.id, card.id);
      continueTurn(ctx);
      break;
    }
    case 'STAND': {
      if (s.pending) return fail('MUST_CHOOSE');
      stand(ctx, p);
      break;
    }
    case 'REST': {
      if (s.pending) return fail('MUST_CHOOSE');
      if (!has(p, '6H')) return fail('NO_REST_CARD');
      discardFrom(ctx, p, '6H');
      say(ctx, `${p.name} mandó a descansar al Corazón Enfermero.`);
      continueTurn(ctx);
      break;
    }
  }
  return { ok: true, state: s, events: ctx.events };
}

/** El que se va de la sala en medio de la partida queda afuera. Si era su turno, sigue el próximo. */
export function removePlayer(state: GameState, playerId: string): Result {
  const s = structuredClone(state);
  const p = player(s, playerId);
  if (!p) return fail('UNKNOWN_PLAYER');
  if (!inGame(p) || s.phase === 'finished') return { ok: true, state: s, events: [] };
  const ctx: Ctx = { s, events: [] };
  p.status = 'out';
  p.outReason = 'abandono';
  s.discard.push(...p.cards.map((h) => h.card));
  p.cards = [];
  ctx.events.push({ type: 'PLAYER_OUT', playerId: p.id, reason: 'abandono' });
  say(ctx, `${p.name} se fue de la partida.`);
  if (s.players.filter(inGame).length <= 1) {
    finish(ctx);
  } else if (s.phase === 'playing' && s.currentId === playerId) {
    s.pending = null;
    nextTurn(ctx);
  }
  return { ok: true, state: s, events: ctx.events };
}

/** Qué hacer si se vence el tiempo: elegir la primera opción, plantarse o pasar a la próxima ronda. */
export function timeoutAction(state: GameState): { playerId: string; action: Action } | null {
  if (state.phase === 'playing' && state.currentId) {
    const pending = state.pending;
    return { playerId: state.currentId, action: pending ? { type: 'CHOOSE', optionId: pending.options[0]!.id } : { type: 'STAND' } };
  }
  if (state.phase === 'roundOver') {
    const any = state.players.find(inGame);
    return any ? { playerId: any.id, action: { type: 'NEXT_ROUND' } } : null;
  }
  return null;
}

function fail(error: ErrorCode): Result {
  return { ok: false, error };
}
