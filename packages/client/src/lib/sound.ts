/**
 * Sonidos sintetizados con WebAudio: nada que descargar. El navegador no deja sonar nada hasta que
 * la persona toca algo, así que el contexto se arma en el primer toque.
 */
import { readStorage, writeStorage } from './util';

const MUTE_KEY = 'veintiuno.mute';

type Wave = OscillatorType;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = readStorage<boolean>('local', MUTE_KEY) ?? false;
const listeners = new Set<() => void>();

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

let unlocked = false;

/**
 * Llamar en cada toque: destraba el audio (el navegador no deja sonar nada antes) y lo despierta si
 * el celular lo suspendió. En iPhone pide sesión de "reproducción" para que suene aunque el
 * celular esté en silencio, como un video.
 */
export function unlockAudio(): void {
  const c = audio();
  if (!c || unlocked) return;
  unlocked = true;
  try {
    const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
    if (session) session.type = 'playback';
  } catch {
    // Navegadores sin audioSession.
  }
  // Un sonido mudo dentro del toque termina de destrabar Safari.
  const src = c.createBufferSource();
  src.buffer = c.createBuffer(1, 1, 22050);
  src.connect(c.destination);
  src.start(0);
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(value: boolean): void {
  muted = value;
  writeStorage('local', MUTE_KEY, value);
  for (const l of listeners) l();
}

export function onMuteChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function tone(freq: number, start: number, dur: number, opts: { wave?: Wave; gain?: number; slide?: number; attack?: number } = {}): void {
  const c = audio();
  if (!c || !master || muted) return;
  const t0 = c.currentTime + start;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = opts.wave ?? 'triangle';
  osc.frequency.setValueAtTime(freq, t0);
  if (opts.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq * opts.slide), t0 + dur);
  const peak = opts.gain ?? 0.3;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + (opts.attack ?? 0.01));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

function noise(start: number, dur: number, opts: { gain?: number; freq?: number; q?: number; sweep?: number } = {}): void {
  const c = audio();
  if (!c || !master || muted) return;
  const t0 = c.currentTime + start;
  const buffer = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buffer;
  const filter = c.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(opts.freq ?? 2000, t0);
  if (opts.sweep) filter.frequency.exponentialRampToValueAtTime(opts.sweep, t0 + dur);
  filter.Q.value = opts.q ?? 1;
  const g = c.createGain();
  g.gain.setValueAtTime(opts.gain ?? 0.3, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filter).connect(g).connect(master);
  src.start(t0);
}

const NOTES = { C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880, B5: 987.77, C6: 1046.5, E6: 1318.5, G6: 1568 };

export const sfx = {
  /** Una carta que sale del mazo. */
  draw() {
    noise(0, 0.12, { gain: 0.25, freq: 3000, sweep: 900, q: 0.8 });
  },
  flip() {
    noise(0, 0.06, { gain: 0.3, freq: 1800, q: 2 });
    tone(900, 0.02, 0.05, { wave: 'square', gain: 0.04 });
  },
  tap() {
    tone(660, 0, 0.06, { wave: 'sine', gain: 0.15 });
  },
  /** Te toca. */
  turn() {
    tone(NOTES.E5, 0, 0.12, { wave: 'sine', gain: 0.22 });
    tone(NOTES.A5, 0.1, 0.18, { wave: 'sine', gain: 0.22 });
  },
  tick() {
    tone(1200, 0, 0.03, { wave: 'square', gain: 0.05 });
  },
  chip(up = true) {
    const base = up ? 1800 : 900;
    tone(base, 0, 0.07, { wave: 'square', gain: 0.07 });
    tone(base * 1.5, 0.05, 0.09, { wave: 'square', gain: 0.06 });
  },
  /** Se activa el efecto de un personaje. Un acorde distinto por palo. */
  effect(suit: string) {
    const chords: Record<string, number[]> = {
      S: [NOTES.D5, NOTES.F5, NOTES.A5],
      D: [NOTES.E5, NOTES.G5, NOTES.C6],
      H: [NOTES.C5, NOTES.E5, NOTES.G5],
      C: [NOTES.D5, NOTES.G5, NOTES.B5],
    };
    (chords[suit] ?? chords['H']!).forEach((f, i) => tone(f, i * 0.06, 0.35, { wave: 'triangle', gain: 0.16 }));
    noise(0, 0.25, { gain: 0.06, freq: 6000, q: 3 });
  },
  /** Te pasaste: un "uaaa-uaaa" que baja. */
  bust() {
    tone(392, 0, 0.32, { wave: 'sawtooth', gain: 0.14, slide: 0.94 });
    tone(370, 0.3, 0.32, { wave: 'sawtooth', gain: 0.14, slide: 0.94 });
    tone(349, 0.6, 0.7, { wave: 'sawtooth', gain: 0.14, slide: 0.7 });
    noise(0, 0.25, { gain: 0.25, freq: 200, q: 0.7 });
  },
  /** Otro se pasó: un golpe sordo. */
  thud() {
    tone(140, 0, 0.25, { wave: 'sine', gain: 0.4, slide: 0.5 });
  },
  /** ¡21! Fanfarria que sube. */
  twentyOne(natural = false) {
    const seq = [NOTES.C5, NOTES.E5, NOTES.G5, NOTES.C6];
    seq.forEach((f, i) => tone(f, i * 0.09, 0.22, { wave: 'square', gain: 0.1 }));
    tone(NOTES.E6, 0.38, 0.5, { wave: 'triangle', gain: 0.18 });
    tone(NOTES.G6, 0.38, 0.6, { wave: 'triangle', gain: 0.12 });
    if (natural) [NOTES.C6, NOTES.E6, NOTES.G6].forEach((f, i) => tone(f, 0.7 + i * 0.07, 0.4, { wave: 'sine', gain: 0.12 }));
    noise(0.38, 0.6, { gain: 0.08, freq: 8000, q: 2 });
  },
  /** Algo te salvó. */
  saved() {
    tone(NOTES.G5, 0, 0.12, { wave: 'sine', gain: 0.2 });
    tone(NOTES.C6, 0.1, 0.3, { wave: 'sine', gain: 0.2 });
  },
  blocked() {
    tone(220, 0, 0.08, { wave: 'square', gain: 0.12 });
    noise(0, 0.15, { gain: 0.3, freq: 4000, q: 4 });
  },
  winRound() {
    [NOTES.G5, NOTES.C6, NOTES.E6, NOTES.G6].forEach((f, i) => tone(f, i * 0.07, 0.3, { wave: 'triangle', gain: 0.14 }));
    for (let i = 0; i < 6; i++) tone(1800 + Math.random() * 900, 0.3 + i * 0.06, 0.08, { wave: 'square', gain: 0.05 });
  },
  loseRound() {
    tone(330, 0, 0.2, { wave: 'triangle', gain: 0.15 });
    tone(262, 0.18, 0.4, { wave: 'triangle', gain: 0.15 });
  },
  gameOver(won: boolean) {
    if (!won) return sfx.loseRound();
    const seq = [NOTES.C5, NOTES.E5, NOTES.G5, NOTES.C6, NOTES.G5, NOTES.C6, NOTES.E6];
    seq.forEach((f, i) => tone(f, i * 0.12, 0.3, { wave: 'square', gain: 0.09 }));
    tone(NOTES.G6, seq.length * 0.12, 0.9, { wave: 'triangle', gain: 0.16 });
  },
  pop() {
    tone(500, 0, 0.08, { wave: 'sine', gain: 0.2, slide: 2 });
  },
  /** Un botón cualquiera: un "toc" de madera. */
  click() {
    tone(320, 0, 0.05, { wave: 'sine', gain: 0.22, slide: 0.6 });
    noise(0, 0.03, { gain: 0.12, freq: 2500, q: 3 });
  },
  /** Tocás una carta. */
  cardTap() {
    noise(0, 0.05, { gain: 0.22, freq: 2600, q: 1.5 });
    tone(1400, 0, 0.04, { wave: 'sine', gain: 0.06 });
  },
  /** Se abre una hoja desde abajo. */
  whoosh() {
    noise(0, 0.22, { gain: 0.14, freq: 500, sweep: 2600, q: 0.9 });
  },
  /** Alguien entra a la sala. */
  join() {
    tone(NOTES.C5, 0, 0.12, { wave: 'triangle', gain: 0.16 });
    tone(NOTES.G5, 0.09, 0.2, { wave: 'triangle', gain: 0.16 });
  },
  /** Alguien se va de la sala. */
  leave() {
    tone(NOTES.G5, 0, 0.12, { wave: 'triangle', gain: 0.14 });
    tone(NOTES.C5, 0.09, 0.2, { wave: 'triangle', gain: 0.14 });
  },
  /** Mezclar el mazo: un "rrrrr" de cartas. */
  shuffle() {
    for (let i = 0; i < 14; i++) noise(i * 0.035, 0.04, { gain: 0.16, freq: 2200 + Math.random() * 1500, q: 1.2 });
    noise(0.52, 0.09, { gain: 0.25, freq: 900, q: 0.8 });
  },
  /** Arranca la partida: mezcla y un acorde de "¡vamos!". */
  start() {
    sfx.shuffle();
    [NOTES.C5, NOTES.E5, NOTES.G5].forEach((f, i) => tone(f, 0.7 + i * 0.08, 0.3, { wave: 'square', gain: 0.08 }));
  },
  /** Latido de nervios cuando estás cerca de 21. Más rápido cuanto más cerca. */
  heartbeat() {
    tone(70, 0, 0.12, { wave: 'sine', gain: 0.5, slide: 0.7 });
    tone(62, 0.16, 0.14, { wave: 'sine', gain: 0.38, slide: 0.7 });
  },
  /** Un rival estuvo cerca: "uuuh". */
  ooh() {
    tone(NOTES.E5, 0, 0.5, { wave: 'sine', gain: 0.1, slide: 0.85, attack: 0.12 });
    tone(NOTES.G5, 0, 0.5, { wave: 'sine', gain: 0.07, slide: 0.85, attack: 0.12 });
  },
};

export function vibrate(pattern: number | number[]): void {
  try {
    if (!muted) navigator.vibrate?.(pattern);
  } catch {
    // Algunos navegadores no lo tienen.
  }
}
