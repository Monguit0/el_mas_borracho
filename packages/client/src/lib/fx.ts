/**
 * Partículas sobre toda la pantalla: papelitos, chispas, monedas y estrellas. Un solo canvas que no
 * toca los toques (pointer-events: none). Se anima solo mientras haya algo que mover.
 */

export type ParticleKind = 'confetti' | 'sparks' | 'coins' | 'stars' | 'smoke';

interface Particle {
  kind: ParticleKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  size: number;
  color: string;
  life: number;
  maxLife: number;
}

const CONFETTI = ['#e8b93e', '#e0505e', '#3fb39a', '#7aa7e0', '#9a7be0', '#f3ead8', '#f2a23a'];
const MAX = 600;

let canvas: HTMLCanvasElement | null = null;
let g: CanvasRenderingContext2D | null = null;
let particles: Particle[] = [];
let raf = 0;
let last = 0;

const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function attachCanvas(el: HTMLCanvasElement | null): void {
  canvas = el;
  g = el?.getContext('2d') ?? null;
  resize();
}

export function resize(): void {
  if (!canvas) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  g?.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function rand(a: number, b: number): number {
  return a + Math.random() * (b - a);
}

function make(kind: ParticleKind, x: number, y: number, power: number): Particle {
  const angle = kind === 'confetti' || kind === 'coins' ? rand(-Math.PI * 0.95, -Math.PI * 0.05) : rand(0, Math.PI * 2);
  const speed = rand(0.4, 1) * power;
  const life = kind === 'smoke' ? rand(0.8, 1.4) : kind === 'sparks' ? rand(0.4, 0.9) : rand(1.2, 2.2);
  return {
    kind,
    x,
    y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    rot: rand(0, Math.PI * 2),
    vr: rand(-8, 8),
    size: kind === 'coins' ? rand(7, 11) : kind === 'stars' ? rand(6, 12) : kind === 'smoke' ? rand(10, 22) : rand(5, 9),
    color:
      kind === 'sparks' ? (Math.random() < 0.5 ? '#ffd56a' : '#fff6c9') : kind === 'smoke' ? 'rgba(40,30,30,' : kind === 'stars' ? '#e8b93e' : CONFETTI[Math.floor(Math.random() * CONFETTI.length)]!,
    life,
    maxLife: life,
  };
}

/** Una explosión de partículas en un punto de la pantalla. */
export function burst(kind: ParticleKind, x: number, y: number, count = 40, power = 520): void {
  if (!canvas || reduced()) return;
  for (let i = 0; i < count && particles.length < MAX; i++) particles.push(make(kind, x, y, power));
  start();
}

/** Lluvia desde arriba (para festejar en grande). */
export function rain(kind: ParticleKind, count = 120): void {
  if (!canvas || reduced()) return;
  const w = window.innerWidth;
  for (let i = 0; i < count && particles.length < MAX; i++) {
    const p = make(kind, rand(0, w), rand(-80, -10), 120);
    p.vy = rand(80, 260);
    p.vx = rand(-60, 60);
    p.life = p.maxLife = rand(2.2, 3.6);
    particles.push(p);
  }
  start();
}

/** Centro de un elemento en la pantalla (para que las partículas salgan de ahí). */
export function centerOf(el: Element | null | undefined): { x: number; y: number } {
  if (!el) return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

function start(): void {
  if (raf) return;
  last = performance.now();
  raf = requestAnimationFrame(step);
}

function step(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!g || !canvas) {
    raf = 0;
    return;
  }
  g.clearRect(0, 0, window.innerWidth, window.innerHeight);
  particles = particles.filter((p) => (p.life -= dt) > 0);
  for (const p of particles) {
    const gravity = p.kind === 'smoke' ? -40 : p.kind === 'sparks' ? 300 : 520;
    const drag = p.kind === 'confetti' ? 0.985 : p.kind === 'smoke' ? 0.96 : 0.99;
    p.vx *= drag;
    p.vy = p.vy * drag + gravity * dt;
    if (p.kind === 'confetti') p.vy = Math.min(p.vy, 240);
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.rot += p.vr * dt;
    const alpha = Math.min(1, p.life / (p.maxLife * 0.35));
    draw(g, p, alpha);
  }
  if (particles.length > 0) raf = requestAnimationFrame(step);
  else {
    g.clearRect(0, 0, window.innerWidth, window.innerHeight);
    raf = 0;
  }
}

function draw(c: CanvasRenderingContext2D, p: Particle, alpha: number): void {
  c.save();
  c.globalAlpha = alpha;
  c.translate(p.x, p.y);
  c.rotate(p.rot);
  switch (p.kind) {
    case 'confetti':
      c.fillStyle = p.color;
      c.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2 + Math.abs(Math.sin(p.rot * 2)) * p.size * 0.6);
      break;
    case 'sparks':
      c.fillStyle = p.color;
      c.beginPath();
      c.arc(0, 0, p.size * 0.35 * (p.life / p.maxLife + 0.3), 0, Math.PI * 2);
      c.fill();
      break;
    case 'coins': {
      const squash = Math.abs(Math.cos(p.rot));
      c.scale(Math.max(0.15, squash), 1);
      c.fillStyle = '#e8b93e';
      c.strokeStyle = '#1c1a17';
      c.lineWidth = 2;
      c.beginPath();
      c.arc(0, 0, p.size, 0, Math.PI * 2);
      c.fill();
      c.stroke();
      c.fillStyle = '#ffd98a';
      c.beginPath();
      c.arc(0, 0, p.size * 0.55, 0, Math.PI * 2);
      c.fill();
      break;
    }
    case 'stars': {
      c.fillStyle = p.color;
      c.beginPath();
      const s = p.size;
      c.moveTo(0, -s);
      c.quadraticCurveTo(s * 0.15, -s * 0.15, s, 0);
      c.quadraticCurveTo(s * 0.15, s * 0.15, 0, s);
      c.quadraticCurveTo(-s * 0.15, s * 0.15, -s, 0);
      c.quadraticCurveTo(-s * 0.15, -s * 0.15, 0, -s);
      c.fill();
      break;
    }
    case 'smoke':
      c.fillStyle = `${p.color}${(0.2 * alpha).toFixed(2)})`;
      c.beginPath();
      c.arc(0, 0, p.size * (1.6 - p.life / p.maxLife), 0, Math.PI * 2);
      c.fill();
      break;
  }
  c.restore();
}
