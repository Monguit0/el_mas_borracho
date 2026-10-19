// Juega partidas enteras con bots y revisa que nada se rompa.

import { applyAction, createGame, currentPlayer, type GameEvent } from '../engine.js';
import { mulberry32 } from '../rng.js';
import { DEFAULT_RULES, type RulesConfig } from '../rules.js';
import { printedSpecials } from '../specials.js';
import type { GameState } from '../state.js';
import { botDefense, botTurnAction } from './bot.js';

export interface GameReport {
  seed: number;
  players: number;
  turns: number;
  rounds: number;
  winnerSeat: number;
  stuck: boolean;
  problems: string[];
  counts: Record<string, number>;
  cocktails: Record<string, number>;
  cocktailPoints: number[];
  specials: Record<string, number>;
  brokeBy: Record<string, number>;
}

const MAX_ACTIONS = 20000;
const SPECIAL_TOTAL = printedSpecials().length;

export function playGame(seed: number, numPlayers: number, rules: RulesConfig = DEFAULT_RULES): GameReport {
  const rand = mulberry32(seed ^ 0x9e3779b9);
  const players = Array.from({ length: numPlayers }, (_, i) => ({ id: `p${i}`, name: `Jugador ${i + 1}` }));
  let { state } = createGame({ players, seed, rules });
  const report: GameReport = {
    seed,
    players: numPlayers,
    turns: 0,
    rounds: 0,
    winnerSeat: -1,
    stuck: false,
    problems: [],
    counts: {},
    cocktails: {},
    cocktailPoints: [],
    specials: {},
    brokeBy: {},
  };
  let lastCause = 'cóctel';

  for (let i = 0; i < MAX_ACTIONS && state.phase !== 'finished'; i++) {
    const actorId = state.phase === 'defense' ? state.pending!.targetId : currentPlayer(state).id;
    const action = state.phase === 'defense' ? botDefense(state, rand) : botTurnAction(state, rand);
    const res = applyAction(state, actorId, action);
    if (!res.ok) {
      report.problems.push(`acción rechazada ${action.type}: ${res.error} (turno ${state.turn})`);
      break;
    }
    const prevTurnPlayer = currentPlayer(state).id;
    let special: string | null = null; // la especial que se jugó en esta acción, para saber de qué quebró
    for (const e of res.events) {
      tally(report, e);
      if (e.type === 'SHOT_TAKEN') lastCause = 'shot';
      if (e.type === 'PENALTY_SHOT') lastCause = 'shot de castigo por papelón';
      if (e.type === 'COCKTAIL_FAILED') lastCause = 'cóctel mal armado';
      if (e.type === 'SPECIAL_PLAYED') special = e.special.name;
      if (e.type === 'COCKTAIL_DRUNK') lastCause = special ? `cóctel con ${special}` : 'cóctel';
      if (e.type === 'SHOT_ROUND') lastCause = 'Ronda de shots';
      if (e.type === 'PLAYER_SHAMED') {
        report.brokeBy['vergüenza (3 papelones)'] = (report.brokeBy['vergüenza (3 papelones)'] ?? 0) + 1;
      }
      if (e.type === 'PLAYER_BROKE') {
        report.brokeBy[lastCause] = (report.brokeBy[lastCause] ?? 0) + 1;
        lastCause = 'cóctel';
      }
    }
    if (action.type === 'END_TURN') {
      const ended = res.state.players.find((p) => p.id === prevTurnPlayer)!;
      if (ended.hand.length > rules.handSize) report.problems.push(`mano de ${ended.hand.length} al cerrar turno`);
    }
    checkInvariants(res.state, report);
    if (report.problems.length > 0) break;
    state = res.state;
  }

  if (state.phase !== 'finished') report.stuck = true;
  report.turns = state.turn;
  report.rounds = state.turn / numPlayers;
  report.winnerSeat = state.winnerId ? Number(state.winnerId.slice(1)) : -1;
  return report;
}

function tally(report: GameReport, e: GameEvent) {
  report.counts[e.type] = (report.counts[e.type] ?? 0) + 1;
  if (e.type === 'COCKTAIL_MADE') {
    report.cocktails[e.cocktailCode] = (report.cocktails[e.cocktailCode] ?? 0) + 1;
    report.cocktailPoints.push(e.points.total);
  }
  if (e.type === 'SPECIAL_PLAYED') report.specials[e.special.name] = (report.specials[e.special.name] ?? 0) + 1;
}

function checkInvariants(state: GameState, report: GameReport) {
  const inHands = state.players.reduce((n, p) => n + p.hand.length, 0);
  const total = inHands + state.deck.length + state.discard.length;
  if (total !== state.totalCards) report.problems.push(`cartas: ${total} en vez de ${state.totalCards}`);
  const ids = new Set<string>();
  for (const c of [...state.deck, ...state.discard, ...state.players.flatMap((p) => p.hand)]) {
    if (ids.has(c.id)) report.problems.push(`carta duplicada ${c.id}`);
    ids.add(c.id);
  }
  const specials = [...state.specialDeck, ...state.specialDiscard, ...state.players.flatMap((p) => p.specials)];
  if (specials.length !== SPECIAL_TOTAL) report.problems.push(`especiales: ${specials.length} en vez de ${SPECIAL_TOTAL}`);
  if (new Set(specials.map((x) => x.id)).size !== specials.length) report.problems.push('especial duplicada');
  const alive = state.players.filter((p) => !p.eliminated);
  if (alive.length === 0) report.problems.push('no quedó nadie');
  if (state.phase === 'finished' && alive.length !== 1) report.problems.push(`${alive.length} ganadores`);
  if (state.phase !== 'finished' && currentPlayer(state).eliminated) report.problems.push('turno de un quebrado');
  for (const p of state.players) {
    if (p.points < 0) report.problems.push(`puntos negativos ${p.id}`);
    if (p.alcohol < 0) report.problems.push(`alcohol negativo ${p.id}`);
    if (p.eliminated && p.hand.length > 0) report.problems.push(`quebrado con cartas ${p.id}`);
    if (p.specials.length > state.rules.specialHandMax) report.problems.push(`demasiadas especiales ${p.id}`);
  }
}
