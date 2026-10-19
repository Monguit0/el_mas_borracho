// npm run sim -- [partidas por cantidad de jugadores]

import { COCKTAILS } from '../cards.js';
import { playGame, type GameReport } from './run.js';

const perSize = Number(process.argv[2] ?? 50);
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const pctl = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.floor((xs.length - 1) * p)] ?? 0;

const all: GameReport[] = [];
console.log(`Partidas simuladas: ${perSize} por cada cantidad de jugadores\n`);
console.log('Jugadores | Turnos promedio | Vueltas promedio | Vueltas (10%–90%) | Trabadas | Con problemas');
for (let n = 2; n <= 6; n++) {
  const reports = Array.from({ length: perSize }, (_, i) => playGame(n * 100000 + i, n));
  all.push(...reports);
  const rounds = reports.map((r) => r.rounds);
  console.log(
    `${n} | ${avg(reports.map((r) => r.turns)).toFixed(1)} | ${avg(rounds).toFixed(1)} | ${pctl(rounds, 0.1).toFixed(1)}–${pctl(rounds, 0.9).toFixed(1)} | ${reports.filter((r) => r.stuck).length} | ${reports.filter((r) => r.problems.length).length}`,
  );
}

const problems = all.filter((r) => r.problems.length);
if (problems.length) {
  console.log('\nPrimeros problemas:');
  for (const r of problems.slice(0, 5)) console.log(`  semilla ${r.seed}: ${r.problems[0]}`);
}

const sum = (key: string) => all.reduce((n, r) => n + (r.counts[key] ?? 0), 0);
const games = all.length;
console.log('\nPor partida (promedio):');
for (const [label, key] of [
  ['Cócteles lanzados', 'COCKTAIL_MADE'],
  ['Cócteles mal armados', 'COCKTAIL_FAILED'],
  ['Tomados', 'COCKTAIL_DRUNK'],
  ['Rechazados', 'COCKTAIL_REFUSED'],
  ['Pasados con "Doblalo"', 'COCKTAIL_PASSED'],
  ['Especiales compradas', 'SPECIAL_BOUGHT'],
  ['Especiales jugadas', 'SPECIAL_PLAYED'],
  ['Shots para cambiar cartas', 'SHOT_TAKEN'],
  ['Shots de castigo por papelón', 'PENALTY_SHOT'],
  ['Cambios por punto', 'CARD_SWAPPED'],
  ['Descartes por coincidencia', 'MATCH_DISCARDED'],
  ['Papelones', 'SHAME'],
  ['Vasos de agua', 'WATER_DRUNK'],
  ['Cafés', 'COFFEE_DRUNK'],
  ['Mazo rearmado', 'DECK_RESHUFFLED'],
] as const) {
  console.log(`  ${label}: ${(sum(key) / games).toFixed(2)}`);
}

const pts = all.flatMap((r) => r.cocktailPoints);
console.log(`\nPuntos por cóctel: promedio ${avg(pts).toFixed(2)}, mínimo ${Math.min(...pts)}, máximo ${Math.max(...pts)}`);

console.log('\nCócteles (veces lanzado por partida):');
for (const c of COCKTAILS) {
  const n = all.reduce((k, r) => k + (r.cocktails[c.code] ?? 0), 0);
  console.log(`  ${c.code} ${c.name}: ${(n / games).toFixed(2)}`);
}

console.log('\nEspeciales (veces jugada por partida):');
const sp: Record<string, number> = {};
for (const r of all) for (const [k, v] of Object.entries(r.specials)) sp[k] = (sp[k] ?? 0) + v;
for (const [k, v] of Object.entries(sp).sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${(v / games).toFixed(2)}`);

const broke: Record<string, number> = {};
for (const r of all) for (const [k, v] of Object.entries(r.brokeBy)) broke[k] = (broke[k] ?? 0) + v;
const brokeTotal = Object.values(broke).reduce((a, b) => a + b, 0);
console.log('\nPor qué quedan afuera:');
for (const [k, v] of Object.entries(broke)) console.log(`  ${k}: ${((v / brokeTotal) * 100).toFixed(1)}%`);

console.log('\nGana según el asiento (6 jugadores; el que arranca es al azar):');
const six = all.filter((r) => r.players === 6);
for (let s = 0; s < 6; s++) {
  console.log(`  asiento ${s + 1}: ${((six.filter((r) => r.winnerSeat === s).length / six.length) * 100).toFixed(1)}%`);
}

if (problems.length || all.some((r) => r.stuck)) process.exitCode = 1;
