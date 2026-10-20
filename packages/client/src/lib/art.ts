/**
 * Los dibujos de las cartas: cada palo hecho personaje, con sombrero, cara y accesorio. Todo es SVG
 * armado en texto (sin imágenes), igual que las láminas del mazo.
 */
import { parseCardId, type Suit } from '@borracho/engine';

type SuitKey = 'picas' | 'diamantes' | 'corazones' | 'treboles';

const SUIT_KEY: Record<Suit, SuitKey> = { S: 'picas', D: 'diamantes', H: 'corazones', C: 'treboles' };

/** Color del panel del dibujo y los dos tonos del palo. */
export const SUIT_LOOK: Record<SuitKey, { panel: string; fondo: readonly [string, string] }> = {
  picas: { panel: '#2c2548', fondo: ['#4c4672', '#3a3560'] },
  diamantes: { panel: '#123b38', fondo: ['#e0505e', '#a8222f'] },
  corazones: { panel: '#1d2c4f', fondo: ['#e0505e', '#c22e3d'] },
  treboles: { panel: '#3b2418', fondo: ['#4f7a4a', '#3c6038'] },
};

export function panelColor(suit: Suit): string {
  return SUIT_LOOK[SUIT_KEY[suit]].panel;
}

/** [sombrero, cara, accesorio] de cada carta. */
const CARD_LOOK: Record<string, readonly [string, string, string]> = {
  // Picas
  'AS': ['wizard', 'happy', 'stars'],
  '2S': ['detective', 'sly', 'spyglass'],
  '3S': ['none', 'surprised', 'magnifier'],
  '4S': ['explorer', 'happy', 'compass'],
  '5S': ['none', 'happy', 'lantern'],
  '6S': ['detective', 'sly', 'magnifier'],
  '7S': ['beret', 'happy', 'clock'],
  '8S': ['tophat', 'wink', 'wand'],
  '9S': ['none', 'glasses', 'moon'],
  '10S': ['ninja', 'sly', 'stars'],
  'JS': ['jcap', 'sleepy', 'key'],
  'QS': ['tiara', 'wink', 'crystal'],
  'KS': ['crown', 'mustache', 'shovel'],
  // Diamantes
  'AD': ['cap', 'wink', 'swap'],
  '2D': ['none', 'happy', 'piggy'],
  '3D': ['beret', 'happy', 'chips'],
  '4D': ['cap', 'glasses', 'swap'],
  '5D': ['tophat', 'sly', 'dice'],
  '6D': ['none', 'monocle', 'gem'],
  '7D': ['turban', 'happy', 'bag'],
  '8D': ['tophat', 'monocle', 'coins'],
  '9D': ['tophat', 'mustache', 'chips'],
  '10D': ['none', 'surprised', 'gavel'],
  'JD': ['jcap', 'patch', 'bag'],
  'QD': ['tiara', 'glasses', 'chips'],
  'KD': ['crown', 'baron', 'coins'],
  // Corazones
  'AH': ['halo', 'happy', 'bow'],
  '2H': ['none', 'happy', 'bandaid'],
  '3H': ['visor', 'happy', 'buoy'],
  '4H': ['beret', 'glasses', 'blanket'],
  '5H': ['cap', 'happy', 'letter'],
  '6H': ['nurse', 'happy', 'bandaid'],
  '7H': ['helmet', 'sly', 'shield'],
  '8H': ['fire', 'surprised', 'hose'],
  '9H': ['chef', 'happy', 'pot'],
  '10H': ['none', 'happy', 'sparkles'],
  'JH': ['jcap', 'sleepy', 'guitar'],
  'QH': ['tiara', 'happy', 'rose'],
  'KH': ['crown', 'mustache', 'cake'],
  // Tréboles
  'AC': ['tophat', 'wink', 'horseshoe'],
  '2C': ['propeller', 'wink', 'feather'],
  '3C': ['jester', 'sly', 'swap'],
  '4C': ['ninja', 'sly', 'bag'],
  '5C': ['clown', 'surprised', 'pie'],
  '6C': ['wizard', 'sly', 'wand'],
  '7C': ['pirate', 'patch', 'sword'],
  '8C': ['headband', 'sly', 'glove'],
  '9C': ['none', 'surprised', 'cloud'],
  '10C': ['none', 'mustache', 'boot'],
  'JC': ['jcap', 'wink', 'mirror'],
  'QC': ['witch', 'sly', 'cauldron'],
  'KC': ['crown', 'mustache', 'bolt'],
};

const O = '#1c1a17', CREAM = '#f3ead8', GOLD = '#e8b93e', RED = '#b51f2e';
const st = (w = 4): string => `stroke='${O}' stroke-width='${w}' stroke-linejoin='round' stroke-linecap='round'`;
const sparkle = (x: number, y: number, s: number, c: string): string => `<path d='M${x} ${y - s} l${s * .3} ${s * .7} l${s * .7} ${s * .3} l-${s * .7} ${s * .3} l-${s * .3} ${s * .7} l-${s * .3} -${s * .7} l-${s * .7} -${s * .3} l${s * .7} -${s * .3} z' fill='${c}'/>`;

// ---------- formas de los palos ----------
// hat: dónde apoya el sombrero; ey: altura de los ojos
const SHAPES: Record<SuitKey, { hat: number; ey: number; draw: (fondo: readonly [string, string]) => string }> = {
  picas: {
    hat: 64, ey: 128,
    draw: ([a, b]: readonly [string, string]): string => {
      const d = 'M170 34 C128 84 94 106 94 144 C94 178 132 188 160 168 L148 220 L192 220 L180 168 C208 188 246 178 246 144 C246 106 212 84 170 34 Z';
      return `<path d='${d}' fill='${a}'/><path d='M170 34 C212 84 246 106 246 144 C246 178 208 188 180 168 L192 220 L170 220 Z' fill='${b}'/><path d='${d}' fill='none' ${st(5)}/>`;
    },
  },
  diamantes: {
    hat: 74, ey: 128,
    draw: ([a, b]: readonly [string, string]): string => `<path d='M170 52 L246 136 L170 222 L94 136 Z' fill='${a}'/><path d='M170 52 L246 136 L170 136 Z' fill='#d23c4b'/><path d='M94 136 L170 136 L170 222 Z' fill='#c22e3d'/><path d='M170 136 L246 136 L170 222 Z' fill='${b}'/><path d='M170 52 L246 136 L170 222 L94 136 Z' fill='none' ${st(5)}/>`,
  },
  corazones: {
    hat: 90, ey: 130,
    draw: ([a, b]: readonly [string, string]): string => {
      const d = 'M170 218 C104 172 88 132 104 104 C120 76 156 78 170 104 C184 78 220 76 236 104 C252 132 236 172 170 218 Z';
      return `<path d='${d}' fill='${a}'/><path d='M170 104 C184 78 220 76 236 104 C252 132 236 172 170 218 Z' fill='${b}'/><path d='${d}' fill='none' ${st(5)}/>`;
    },
  },
  treboles: {
    hat: 50, ey: 116,
    draw: ([a, b]: readonly [string, string]): string => {
      const circ = (f: string, s: string): string => `<circle cx='170' cy='86' r='42' ${f} ${s}/><circle cx='122' cy='146' r='42' ${f} ${s}/><circle cx='218' cy='146' r='42' ${f} ${s}/><path d='M160 170 L148 222 L192 222 L180 170 Z' ${f} ${s}/>`;
      return circ(`fill='${O}'`, `stroke='${O}' stroke-width='10' stroke-linejoin='round'`) + circ(`fill='${a}'`, '') +
        `<circle cx='218' cy='146' r='42' fill='${b}'/><path d='M170 170 L180 170 L192 222 L170 222 Z' fill='${b}'/><circle cx='170' cy='132' r='38' fill='${a}'/>`;
    },
  },
};

// ---------- sombreros (b = línea donde apoya) ----------
const HATS: Record<string, (b: number) => string> = {
  none: (): string => '',
  crown: (b: number): string => `<path d='M132 ${b} L124 ${b - 44} L148 ${b - 22} L170 ${b - 52} L192 ${b - 22} L216 ${b - 44} L208 ${b} Z' fill='${GOLD}' ${st()}/>
    <circle cx='124' cy='${b - 46}' r='5' fill='${GOLD}' ${st(3)}/><circle cx='170' cy='${b - 54}' r='5' fill='${GOLD}' ${st(3)}/><circle cx='216' cy='${b - 46}' r='5' fill='${GOLD}' ${st(3)}/>
    <circle cx='170' cy='${b - 14}' r='6' fill='#e0505e' ${st(3)}/><circle cx='148' cy='${b - 12}' r='4' fill='#3fb39a' ${st(2)}/><circle cx='192' cy='${b - 12}' r='4' fill='#3fb39a' ${st(2)}/>`,
  tiara: (b: number): string => `<path d='M138 ${b} Q170 ${b - 14} 202 ${b} L196 ${b - 18} L184 ${b - 10} L170 ${b - 34} L156 ${b - 10} L144 ${b - 18} Z' fill='${GOLD}' ${st()}/><circle cx='170' cy='${b - 20}' r='5' fill='#9a7be0' ${st(2)}/>`,
  jcap: (b: number): string => `<path d='M128 ${b} Q132 ${b - 36} 172 ${b - 34} Q210 ${b - 32} 214 ${b} Z' fill='#3a6fc4' ${st()}/><path d='M128 ${b} L214 ${b}' ${st(6)}/>
    <path d='M196 ${b - 30} Q236 ${b - 70} 250 ${b - 52} Q232 ${b - 40} 200 ${b - 26} Z' fill='#e0505e' ${st(3)}/>`,
  wizard: (b: number): string => `<path d='M126 ${b} L170 ${b - 74} L214 ${b} Z' fill='#5b3fa0' ${st()}/><path d='M118 ${b} Q170 ${b + 10} 222 ${b}' fill='none' ${st(6)}/>${sparkle(166, b - 34, 9, GOLD)}${sparkle(186, b - 14, 6, GOLD)}`,
  detective: (b: number): string => `<path d='M130 ${b} Q170 ${b - 40} 210 ${b} Z' fill='#b07a46' ${st()}/><path d='M122 ${b} Q170 ${b - 10} 222 ${b} L218 ${b + 8} Q170 ${b - 2} 126 ${b + 8} Z' fill='#c98a4b' ${st()}/>`,
  explorer: (b: number): string => `<path d='M134 ${b} Q136 ${b - 38} 170 ${b - 38} Q204 ${b - 38} 206 ${b} Z' fill='#d9c08a' ${st()}/><path d='M116 ${b + 2} Q170 ${b - 12} 224 ${b + 2} Q170 ${b + 10} 116 ${b + 2} Z' fill='#d9c08a' ${st()}/><path d='M136 ${b - 8} L204 ${b - 8}' stroke='#8a5a2b' stroke-width='5'/>`,
  beret: (b: number): string => `<ellipse cx='166' cy='${b - 10}' rx='44' ry='16' fill='#c0392b' ${st()} transform='rotate(-8 166 ${b - 10})'/><path d='M166 ${b - 26} l2 -8' ${st(5)}/>`,
  tophat: (b: number): string => `<rect x='144' y='${b - 52}' width='52' height='50' rx='4' fill='#26222e' ${st()}/><rect x='144' y='${b - 18}' width='52' height='9' fill='${RED}'/><path d='M124 ${b} Q170 ${b - 8} 216 ${b}' ${st(8)}/>`,
  ninja: (b: number): string => `<path d='M112 ${b + 30} Q170 ${b + 16} 228 ${b + 30} L228 ${b + 46} Q170 ${b + 32} 112 ${b + 46} Z' fill='#26222e' ${st(3)}/><path d='M228 ${b + 36} Q252 ${b + 30} 262 ${b + 44} M228 ${b + 40} Q248 ${b + 50} 254 ${b + 64}' stroke='#26222e' stroke-width='7' fill='none' stroke-linecap='round'/>`,
  headband: (b: number): string => `<path d='M112 ${b + 24} Q170 ${b + 10} 228 ${b + 24} L228 ${b + 36} Q170 ${b + 22} 112 ${b + 36} Z' fill='${RED}' ${st(3)}/><path d='M228 ${b + 30} Q252 ${b + 24} 262 ${b + 38} M228 ${b + 32} Q248 ${b + 44} 254 ${b + 58}' stroke='${RED}' stroke-width='7' fill='none' stroke-linecap='round'/>`,
  cap: (b: number): string => `<path d='M132 ${b} Q170 ${b - 40} 208 ${b} Z' fill='#2f6f63' ${st()}/><path d='M196 ${b - 2} Q226 ${b - 4} 238 ${b + 6} L200 ${b + 6} Z' fill='#2f6f63' ${st()}/><circle cx='170' cy='${b - 22}' r='5' fill='${GOLD}' ${st(3)}/>`,
  turban: (b: number): string => `<path d='M128 ${b} Q122 ${b - 42} 170 ${b - 46} Q218 ${b - 42} 212 ${b} Z' fill='#f2a23a' ${st()}/><path d='M134 ${b - 10} Q170 ${b - 34} 206 ${b - 12}' stroke='#c97a1a' stroke-width='4' fill='none'/><path d='M170 ${b - 30} l8 10 l-8 10 l-8 -10 z' fill='#3fb39a' ${st(3)}/>`,
  halo: (b: number): string => `<ellipse cx='170' cy='${b - 22}' rx='36' ry='9' fill='none' stroke='${GOLD}' stroke-width='7'/>`,
  visor: (b: number): string => `<path d='M128 ${b + 6} Q170 ${b - 22} 212 ${b + 6} L222 ${b + 16} Q170 ${b} 118 ${b + 16} Z' fill='${GOLD}' ${st()}/>`,
  nurse: (b: number): string => `<path d='M140 ${b} L146 ${b - 26} L194 ${b - 26} L200 ${b} Z' fill='#fff' ${st()}/><path d='M170 ${b - 22} v14 M163 ${b - 15} h14' stroke='${RED}' stroke-width='5'/>`,
  helmet: (b: number): string => `<path d='M128 ${b + 4} Q128 ${b - 40} 170 ${b - 40} Q212 ${b - 40} 212 ${b + 4} Z' fill='#b9c0cc' ${st()}/><path d='M170 ${b - 40} Q172 ${b - 62} 190 ${b - 64}' stroke='#e0505e' stroke-width='8' fill='none' stroke-linecap='round'/>`,
  fire: (b: number): string => `<path d='M128 ${b} Q128 ${b - 40} 170 ${b - 40} Q212 ${b - 40} 212 ${b} Z' fill='#d23c2b' ${st()}/><path d='M112 ${b + 4} Q170 ${b - 6} 228 ${b + 4}' ${st(8)}/><path d='M170 ${b - 30} l10 6 v12 l-10 6 l-10 -6 v-12 z' fill='${GOLD}' ${st(3)}/>`,
  chef: (b: number): string => `<rect x='140' y='${b - 18}' width='60' height='18' fill='#fff' ${st()}/><path d='M140 ${b - 18} Q122 ${b - 40} 144 ${b - 54} Q156 ${b - 74} 172 ${b - 60} Q190 ${b - 76} 200 ${b - 54} Q220 ${b - 40} 200 ${b - 18} Z' fill='#fff' ${st()}/>`,
  propeller: (b: number): string => `<path d='M134 ${b} Q170 ${b - 46} 206 ${b} Z' fill='#3fb39a' ${st()}/><path d='M134 ${b} Q170 ${b - 46} 170 ${b - 46} L170 ${b} Z' fill='#e8b93e'/><path d='M134 ${b} Q170 ${b - 46} 206 ${b} Z' fill='none' ${st()}/><path d='M170 ${b - 46} v-10' ${st(4)}/><ellipse cx='156' cy='${b - 58}' rx='14' ry='5' fill='#e0505e' ${st(3)}/><ellipse cx='184' cy='${b - 58}' rx='14' ry='5' fill='#3a6fc4' ${st(3)}/>`,
  jester: (b: number): string => `<path d='M132 ${b} Q118 ${b - 40} 98 ${b - 44} Q138 ${b - 44} 170 ${b - 20} Q202 ${b - 44} 242 ${b - 44} Q222 ${b - 40} 208 ${b} Z' fill='#9a3fb0' ${st()}/><path d='M170 ${b - 20} Q202 ${b - 44} 242 ${b - 44} Q222 ${b - 40} 208 ${b} L170 ${b} Z' fill='${GOLD}'/><path d='M132 ${b} Q118 ${b - 40} 98 ${b - 44} Q138 ${b - 44} 170 ${b - 20} Q202 ${b - 44} 242 ${b - 44} Q222 ${b - 40} 208 ${b} Z' fill='none' ${st()}/><circle cx='98' cy='${b - 44}' r='6' fill='${GOLD}' ${st(3)}/><circle cx='242' cy='${b - 44}' r='6' fill='#9a3fb0' ${st(3)}/>`,
  clown: (b: number): string => `<path d='M146 ${b} L170 ${b - 50} L194 ${b} Z' fill='#3fb39a' ${st()}/><circle cx='170' cy='${b - 52}' r='8' fill='#e0505e' ${st(3)}/><circle cx='160' cy='${b - 18}' r='4' fill='${GOLD}'/><circle cx='178' cy='${b - 30}' r='4' fill='${GOLD}'/>`,
  pirate: (b: number): string => `<path d='M118 ${b} Q124 ${b - 44} 170 ${b - 46} Q216 ${b - 44} 222 ${b} Q170 ${b - 14} 118 ${b} Z' fill='#26222e' ${st()}/><path d='M162 ${b - 30} l16 12 M178 ${b - 30} l-16 12' stroke='${CREAM}' stroke-width='4' stroke-linecap='round'/>`,
  witch: (b: number): string => `<path d='M138 ${b - 4} L178 ${b - 80} L196 ${b - 60} L188 ${b - 58} L202 ${b - 4} Z' fill='#3a2f5a' ${st()}/><path d='M110 ${b} Q170 ${b - 14} 230 ${b} Q170 ${b + 8} 110 ${b} Z' fill='#3a2f5a' ${st()}/><rect x='146' y='${b - 18}' width='52' height='8' fill='#9a7be0'/>`,
};

// ---------- caras ----------
function face(kind: string, ey: number): string {
  const L = 150, R = 190, M = ey + 28;
  const eye = (x: number, big?: number): string => `<circle cx='${x}' cy='${ey}' r='${big ? 13 : 11}' fill='${CREAM}' ${st()}/><circle cx='${x + 3}' cy='${ey + 1}' r='${big ? 6 : 5}' fill='${O}'/>`;
  const smile = `<path d='M${L + 4} ${M - 2} Q170 ${M + 12} ${R - 4} ${M - 2}' ${st()} fill='none'/>`;
  const blush = `<circle cx='${L - 18}' cy='${ey + 22}' r='7' fill='#f4a3a3' opacity='.85'/><circle cx='${R + 18}' cy='${ey + 22}' r='7' fill='#f4a3a3' opacity='.85'/>`;
  const wink = `<path d='${'M' + (R - 10) + ' ' + ey + ' Q' + R + ' ' + (ey - 10) + ' ' + (R + 10) + ' ' + ey}' ${st(5)} fill='none'/>`;
  const monocle = `<circle cx='${R}' cy='${ey}' r='17' fill='none' stroke='${GOLD}' stroke-width='5'/><path d='M${R + 15} ${ey + 8} Q${R + 24} ${ey + 30} ${R + 18} ${ey + 46}' stroke='${GOLD}' stroke-width='3' stroke-dasharray='4 4' fill='none'/>`;
  const stache = `<path d='M170 ${M - 6} Q156 ${M - 14} 142 ${M - 6} Q130 ${M + 2} 120 ${M - 6} Q126 ${M + 10} 142 ${M + 6} Q158 ${M + 4} 170 ${M - 2} Q182 ${M + 4} 198 ${M + 6} Q214 ${M + 10} 220 ${M - 6} Q210 ${M + 2} 198 ${M - 6} Q184 ${M - 14} 170 ${M - 6} Z' fill='${GOLD}' ${st(3)}/>`;
  switch (kind) {
    case 'happy': return eye(L) + eye(R) + smile + blush;
    case 'wink': return eye(L) + wink + `<path d='M${L + 2} ${M - 4} Q170 ${M + 14} ${R + 2} ${M - 6}' ${st()} fill='${CREAM}'/>` + blush;
    case 'sly': return eye(L) + eye(R) + `<path d='M${L - 14} ${ey - 20} L${L + 10} ${ey - 15} M${R - 10} ${ey - 15} L${R + 14} ${ey - 20}' ${st(5)}/>` + `<path d='M${L + 6} ${M} Q${R - 6} ${M + 6} ${R + 4} ${M - 8}' ${st()} fill='none'/>` + blush;
    case 'surprised': return eye(L, 1) + eye(R, 1) + `<ellipse cx='170' cy='${M + 2}' rx='8' ry='10' fill='${O}'/>` + blush;
    case 'glasses': return eye(L) + eye(R) + `<circle cx='${L}' cy='${ey}' r='17' fill='none' ${st(4)}/><circle cx='${R}' cy='${ey}' r='17' fill='none' ${st(4)}/><path d='M${L + 17} ${ey} L${R - 17} ${ey}' ${st(4)}/>` + smile + blush;
    case 'monocle': return eye(L) + eye(R) + monocle + smile + blush;
    case 'mustache': return eye(L) + eye(R) + `<path d='M${L - 12} ${ey - 18} L${L + 10} ${ey - 16} M${R - 10} ${ey - 16} L${R + 12} ${ey - 18}' ${st(5)}/>` + stache + blush;
    case 'baron': return eye(L) + `<path d='M${L - 14} ${ey - 16} L${L + 10} ${ey - 14}' ${st(5)}/>` + eye(R) + monocle + stache;
    case 'sleepy': return `<path d='M${L - 10} ${ey} Q${L} ${ey + 8} ${L + 10} ${ey} M${R - 10} ${ey} Q${R} ${ey + 8} ${R + 10} ${ey}' ${st(5)} fill='none'/>` + `<path d='M162 ${M} Q170 ${M + 6} 178 ${M}' ${st()} fill='none'/>` + blush;
    case 'patch': return `<path d='M${L - 26} ${ey - 22} L${R + 26} ${ey - 4}' ${st(4)}/><ellipse cx='${L}' cy='${ey}' rx='14' ry='12' fill='${O}'/>` + eye(R) + `<path d='M${L + 6} ${M} Q${R - 6} ${M + 6} ${R + 4} ${M - 8}' ${st()} fill='none'/>` + blush;
  }
  return '';
}

// ---------- accesorios (a la derecha, salvo los que dicen otra cosa) ----------
const X = 276, Y = 150;
const PROPS: Record<string, (ey: number) => string> = {
  stars: (): string => sparkle(276, 90, 14, GOLD) + sparkle(62, 150, 10, GOLD) + sparkle(290, 170, 8, '#cfc6e8'),
  spyglass: (ey: number): string => `<rect x='180' y='${ey - 13}' width='70' height='26' rx='4' fill='${GOLD}' ${st()}/><rect x='245' y='${ey - 19}' width='26' height='38' rx='5' fill='${GOLD}' ${st()}/><path d='M205 ${ey - 13} v26 M228 ${ey - 13} v26' ${st(3)}/><circle cx='186' cy='${ey}' r='12' fill='#bfe3ea' ${st()}/>`,
  magnifier: (): string => `<path d='M298 196 L268 166' stroke='#8a5a2b' stroke-width='10' stroke-linecap='round'/><circle cx='258' cy='154' r='22' fill='#bfe3ea' ${st(5)}/><path d='M248 146 q6 -8 14 -6' stroke='#fff' stroke-width='4' fill='none' stroke-linecap='round'/>`,
  compass: (): string => `<circle cx='${X}' cy='${Y}' r='26' fill='${GOLD}' ${st()}/><circle cx='${X}' cy='${Y}' r='18' fill='${CREAM}' ${st(3)}/><path d='M${X} ${Y - 15} l6 15 h-12 z' fill='${RED}'/><path d='M${X} ${Y + 15} l6 -15 h-12 z' fill='${O}'/>`,
  lantern: (): string => `<path d='M${X} 92 v14' ${st(4)}/><path d='M${X - 18} 106 h36 l-4 60 h-28 z' fill='#ffd56a' ${st()}/><path d='M${X - 18} 106 h36 M${X - 22} 166 h44' ${st(6)}/><circle cx='${X}' cy='136' r='9' fill='#fff6c9'/>`,
  clock: (): string => `<circle cx='${X}' cy='${Y}' r='28' fill='${CREAM}' ${st(5)}/><path d='M${X} ${Y - 18} V${Y} L${X + 12} ${Y + 8}' ${st(4)} fill='none'/><path d='M${X - 18} ${Y - 30} l-8 -6 M${X + 18} ${Y - 30} l8 -6' ${st(5)}/>`,
  wand: (): string => `<path d='M250 200 L292 130' stroke='${O}' stroke-width='9' stroke-linecap='round'/><path d='M286 140 L292 130' stroke='#fff' stroke-width='9' stroke-linecap='round'/>${sparkle(298, 116, 14, GOLD)}${sparkle(270, 104, 7, GOLD)}`,
  moon: (): string => `<path d='M286 66 a26 26 0 1 0 24 34 a20 20 0 1 1 -24 -34 z' fill='${CREAM}' opacity='.9'/>` + sparkle(60, 80, 10, GOLD) + sparkle(64, 180, 7, '#cfc6e8'),
  key: (): string => `<circle cx='${X}' cy='128' r='16' fill='none' stroke='${GOLD}' stroke-width='8'/><path d='M${X} 144 v48 M${X} 172 h12 M${X} 186 h10' stroke='${GOLD}' stroke-width='8' stroke-linecap='round'/>`,
  crystal: (): string => `<circle cx='${X}' cy='140' r='28' fill='#9fd3f0' ${st()}/><path d='M${X - 12} 128 q8 -10 18 -8' stroke='#fff' stroke-width='5' fill='none' stroke-linecap='round'/><path d='M${X - 24} 166 h48 l-6 16 h-36 z' fill='#8a5a2b' ${st()}/>`,
  shovel: (): string => `<path d='M${X} 94 v80' stroke='#8a5a2b' stroke-width='9' stroke-linecap='round'/><path d='M${X - 10} 92 h20' ${st(8)}/><path d='M${X - 20} 172 h40 l-4 26 q-16 14 -32 0 z' fill='#b9c0cc' ${st()}/>`,
  swap: (): string => `<path d='M50 150 Q50 120 80 120 L90 120' stroke='${GOLD}' stroke-width='6' fill='none' stroke-linecap='round'/><path d='M84 110 L96 120 L84 130' stroke='${GOLD}' stroke-width='6' fill='none' stroke-linecap='round' stroke-linejoin='round'/><path d='M290 160 Q290 190 260 190 L250 190' stroke='${GOLD}' stroke-width='6' fill='none' stroke-linecap='round'/><path d='M256 180 L244 190 L256 200' stroke='${GOLD}' stroke-width='6' fill='none' stroke-linecap='round' stroke-linejoin='round'/><g transform='rotate(14 262 110)'><rect x='240' y='78' width='44' height='62' rx='7' fill='${CREAM}' ${st()}/><text x='262' y='121' font-family='Alfa Slab One' font-size='24' fill='${O}' text-anchor='middle'>?</text></g>`,
  piggy: (): string => `<ellipse cx='${X}' cy='168' rx='32' ry='24' fill='#f4a3b8' ${st()}/><circle cx='${X + 30}' cy='162' r='9' fill='#f4a3b8' ${st(3)}/><path d='M${X - 18} 146 l-4 -12 l12 6' fill='#f4a3b8' ${st(3)}/><path d='M${X - 10} 146 h18' stroke='${O}' stroke-width='5' stroke-linecap='round'/><circle cx='${X}' cy='118' r='11' fill='${GOLD}' ${st(3)}/>`,
  chips: (): string => [0, 1, 2, 3].map((i) => `<ellipse cx='${X}' cy='${196 - i * 12}' rx='26' ry='9' fill='${GOLD}' ${st(3)}/>`).join('') + [0, 1, 2].map((i) => `<ellipse cx='66' cy='${200 - i * 12}' rx='22' ry='8' fill='${GOLD}' ${st(3)}/>`).join(''),
  dice: (): string => `<g transform='rotate(-12 ${X} ${Y})'><rect x='${X - 22}' y='${Y - 22}' width='44' height='44' rx='9' fill='${CREAM}' ${st()}/><circle cx='${X - 10}' cy='${Y - 10}' r='4' fill='${O}'/><circle cx='${X}' cy='${Y}' r='4' fill='${O}'/><circle cx='${X + 10}' cy='${Y + 10}' r='4' fill='${O}'/></g><g transform='rotate(18 66 180)'><rect x='48' y='162' width='36' height='36' rx='8' fill='${CREAM}' ${st()}/><circle cx='58' cy='172' r='3.5' fill='${RED}'/><circle cx='74' cy='188' r='3.5' fill='${RED}'/></g>`,
  gem: (): string => `<path d='M${X - 22} 140 l10 -14 h24 l10 14 l-22 30 z' fill='#7fe0d0' ${st()}/><path d='M${X - 22} 140 h44 M${X - 12} 126 l6 14 l6 30 M${X + 12} 126 l-6 14' ${st(2)} fill='none'/>` + sparkle(X + 26, 116, 8, '#fff'),
  bag: (): string => `<path d='M${X - 26} 196 Q${X - 34} 150 ${X - 12} 138 L${X + 12} 138 Q${X + 34} 150 ${X + 26} 196 Z' fill='#c98a4b' ${st()}/><path d='M${X - 12} 138 l-6 -12 h36 l-6 12' fill='#c98a4b' ${st()}/><text x='${X}' y='182' font-family='Alfa Slab One' font-size='24' fill='${O}' text-anchor='middle'>$</text>`,
  coins: (): string => [0, 1, 2, 3].map((i) => `<ellipse cx='66' cy='${200 - i * 12}' rx='26' ry='9' fill='${GOLD}' ${st(3)}/>`).join('') + [0, 1, 2].map((i) => `<ellipse cx='${X}' cy='${200 - i * 12}' rx='26' ry='9' fill='${GOLD}' ${st(3)}/>`).join(''),
  gavel: (): string => `<path d='M${X - 26} 196 L${X + 6} 150' stroke='#8a5a2b' stroke-width='9' stroke-linecap='round'/><rect x='${X - 10}' y='118' width='44' height='22' rx='5' fill='#8a5a2b' ${st()} transform='rotate(35 ${X + 12} 129)'/>`,
  bow: (): string => `<path d='M262 100 Q306 150 262 200' fill='none' stroke='#8a5a2b' stroke-width='6'/><path d='M262 100 L262 200' stroke='${CREAM}' stroke-width='2'/><path d='M238 150 H300' ${st(4)}/><path d='M300 150 l-10 -7 v14 z' fill='${RED}'/>`,
  bandaid: (): string => `<g transform='rotate(-30 ${X} ${Y})'><rect x='${X - 34}' y='${Y - 12}' width='68' height='24' rx='12' fill='#f0c99a' ${st()}/><rect x='${X - 12}' y='${Y - 12}' width='24' height='24' fill='#e8b384' ${st(2)}/></g>`,
  buoy: (): string => `<path d='M100 186 A70 24 0 0 0 240 186' fill='none' stroke='${O}' stroke-width='30'/><path d='M100 186 A70 24 0 0 0 240 186' fill='none' stroke='${CREAM}' stroke-width='22'/><path d='M100 186 A70 24 0 0 0 240 186' fill='none' stroke='${RED}' stroke-width='22' stroke-dasharray='22 30'/>`,
  buoyBack: (): string => `<path d='M0 214 Q20 204 40 214 T80 214 T120 214 T160 214 T200 214 T240 214 T280 214 T320 214 T360 214 V258 H0 Z' fill='#2f5fa8'/><path d='M100 186 A70 24 0 0 1 240 186' fill='none' stroke='${O}' stroke-width='30'/><path d='M100 186 A70 24 0 0 1 240 186' fill='none' stroke='${CREAM}' stroke-width='22'/>`,
  blanket: (): string => `<path d='M90 176 Q170 150 250 176 L240 214 Q170 196 100 214 Z' fill='#7aa7e0' ${st()}/><path d='M118 172 l-6 36 M146 166 l-4 36 M176 164 v36 M206 166 l4 36 M232 172 l6 36' stroke='#4c7cc0' stroke-width='3'/>`,
  letter: (): string => `<g transform='rotate(10 ${X} ${Y})'><rect x='${X - 30}' y='${Y - 20}' width='60' height='40' rx='4' fill='${CREAM}' ${st()}/><path d='M${X - 30} ${Y - 20} L${X} ${Y + 4} L${X + 30} ${Y - 20}' fill='none' ${st(3)}/><path d='M${X} ${Y + 14} c-8 -6 -8 -12 -3 -13 c2 0 3 1 3 3 c0 -2 1 -3 3 -3 c5 1 5 7 -3 13z' fill='${RED}'/></g>`,
  shield: (): string => `<path d='M${X} 112 L${X + 30} 122 Q${X + 30} 172 ${X} 194 Q${X - 30} 172 ${X - 30} 122 Z' fill='#b9c0cc' ${st()}/><path d='M${X} 136 c-14 -10 -14 -20 -6 -22 c3 0 6 2 6 6 c0 -4 3 -6 6 -6 c8 2 8 12 -6 22z' fill='${RED}' transform='translate(0 20)'/>`,
  hose: (): string => `<g transform='translate(18 12)'><path d='M300 210 Q300 170 270 160 L250 156' stroke='#d23c2b' stroke-width='12' fill='none' stroke-linecap='round'/><rect x='236' y='148' width='18' height='16' fill='${GOLD}' ${st(3)}/><path d='M230 150 q-10 -10 -4 -24 M226 160 q-14 -4 -16 -18 M230 164 q-8 6 -22 6' stroke='#7fc4f0' stroke-width='5' fill='none' stroke-linecap='round'/></g>`,
  pot: (): string => `<path d='M${X - 30} 160 h60 l-6 36 h-48 z' fill='#b9c0cc' ${st()}/><path d='M${X - 36} 160 h72' ${st(6)}/><path d='M${X - 10} 150 q-6 -12 2 -22 M${X + 8} 150 q-6 -12 2 -22' stroke='#fff' stroke-width='4' fill='none' stroke-linecap='round'/>`,
  sparkles: (): string => sparkle(64, 90, 14, GOLD) + sparkle(280, 80, 12, GOLD) + sparkle(290, 180, 9, '#fff') + sparkle(54, 186, 8, '#fff'),
  guitar: (): string => `<g transform='rotate(30 ${X} ${Y})'><rect x='${X - 4}' y='${Y - 70}' width='8' height='60' fill='#8a5a2b' ${st(3)}/><circle cx='${X}' cy='${Y + 6}' r='18' fill='#e8a84a' ${st()}/><circle cx='${X}' cy='${Y + 30}' r='22' fill='#e8a84a' ${st()}/><circle cx='${X}' cy='${Y + 8}' r='6' fill='${O}'/></g>`,
  rose: (): string => `<path d='M${X} 140 q4 30 -6 58' stroke='#3c8a4a' stroke-width='6' fill='none'/><path d='M${X - 2} 172 q-20 -6 -22 -18 q16 0 22 14' fill='#4f9a4a'/><circle cx='${X}' cy='130' r='18' fill='${RED}' ${st()}/><path d='M${X - 8} 126 q8 -10 16 0 q-8 10 -16 0' fill='none' stroke='#7a1420' stroke-width='3'/>`,
  cake: (): string => `<rect x='${X - 30}' y='160' width='60' height='34' rx='4' fill='#f4c6d4' ${st()}/><path d='M${X - 30} 172 q10 8 20 0 q10 8 20 0 q10 8 20 0' fill='none' stroke='${CREAM}' stroke-width='5'/><rect x='${X - 3}' y='140' width='6' height='20' fill='${CREAM}' ${st(2)}/><path d='M${X} 128 q6 6 0 12 q-6 -6 0 -12' fill='${GOLD}'/>`,
  horseshoe: (): string => `<path d='M${X - 22} 116 V156 a22 22 0 0 0 44 0 V116' fill='none' stroke='#b9c0cc' stroke-width='14' stroke-linecap='round'/><path d='M${X - 22} 116 V156 a22 22 0 0 0 44 0 V116' fill='none' stroke='${O}' stroke-width='3'/>` + sparkle(64, 100, 10, GOLD),
  feather: (): string => `<path d='M300 100 Q250 120 246 196 Q290 170 300 100 Z' fill='${CREAM}' ${st()}/><path d='M298 104 Q262 150 246 196' ${st(3)} fill='none'/>`,
  pie: (): string => `<ellipse cx='${X}' cy='160' rx='34' ry='12' fill='#c98a4b' ${st()}/><path d='M${X - 30} 156 Q${X - 20} 128 ${X} 132 Q${X + 22} 126 ${X + 30} 156 Z' fill='#fff' ${st()}/><circle cx='${X}' cy='128' r='6' fill='${RED}' ${st(2)}/>`,
  sword: (): string => `<path d='M${X - 18} 196 L${X + 20} 104' stroke='#d6dbe3' stroke-width='10' stroke-linecap='round'/><path d='M${X - 18} 196 L${X + 20} 104' stroke='${O}' stroke-width='2'/><path d='M${X - 26} 170 L${X + 2} 182' ${st(8)}/>`,
  glove: (): string => `<path d='M${X - 26} 140 q0 -26 26 -26 q28 0 28 26 v24 q0 18 -24 18 h-12 q-18 0 -18 -18 z' fill='#d23c2b' ${st()}/><path d='M${X - 18} 182 h32 v16 h-32 z' fill='${CREAM}' ${st()}/><path d='M${X - 26} 146 q-12 -2 -10 14 q2 10 14 6' fill='#d23c2b' ${st(3)}/>`,
  cloud: (): string => `<path d='M220 74 q-2 -24 24 -24 q8 -18 30 -8 q22 -4 24 18 q18 6 8 22 h-80 q-14 -2 -6 -8 z' fill='#b9c0cc' ${st()}/><path d='M232 98 l-4 12 M252 98 l-4 12 M272 98 l-4 12 M292 98 l-4 12' stroke='#7fc4f0' stroke-width='4' stroke-linecap='round'/><path d='M260 98 l-10 18 h10 l-8 16' stroke='${GOLD}' stroke-width='5' fill='none' stroke-linejoin='round'/>`,
  boot: (): string => `<path d='M${X - 14} 118 h28 v52 h24 q8 0 8 12 v12 h-60 z' fill='#8a5a2b' ${st()}/><path d='M${X - 14} 186 h60' stroke='${O}' stroke-width='5'/>`,
  mirror: (): string => `<ellipse cx='${X}' cy='138' rx='22' ry='30' fill='#bfe3ea' ${st(5)}/><path d='M${X} 168 v30' stroke='${GOLD}' stroke-width='9' stroke-linecap='round'/><path d='M${X - 8} 124 l10 -10 M${X - 8} 138 l18 -18' stroke='#fff' stroke-width='4' stroke-linecap='round'/>`,
  cauldron: (): string => `<path d='M${X - 32} 160 q0 40 32 40 q32 0 32 -40 z' fill='#26222e' ${st()}/><ellipse cx='${X}' cy='160' rx='34' ry='8' fill='#6fd06a' ${st()}/><circle cx='${X - 8}' cy='146' r='6' fill='#6fd06a' ${st(2)}/><circle cx='${X + 10}' cy='136' r='4' fill='#6fd06a' ${st(2)}/>`,
  bolt: (): string => `<path d='M${X + 6} 96 L${X - 18} 150 H${X} L${X - 10} 200 L${X + 24} 136 H${X + 6} L${X + 18} 96 Z' fill='${GOLD}' ${st()}/>` + `<path d='M60 70 l-10 22 h10 l-6 18' stroke='${GOLD}' stroke-width='5' fill='none'/>`,
};

/** El dibujo de una carta: el palo hecho personaje, con su sombrero, su cara y su accesorio. SVG en texto. */
export function cardArt(cardId: string): string {
  const card = parseCardId(cardId);
  const look = CARD_LOOK[cardId];
  if (!card || !look) return '';
  const key = SUIT_KEY[card.suit];
  const [hat, faceKind, prop] = look;
  const S = SHAPES[key];
  const back = prop === 'buoy' ? PROPS['buoyBack']!(S.ey) : `<ellipse cx='170' cy='238' rx='80' ry='10' fill='#000' opacity='.25'/>`;
  const front = prop === 'spyglass' ? '' : (PROPS[prop]?.(S.ey) ?? '');
  const behindFace = prop === 'spyglass' ? PROPS['spyglass']!(S.ey) : '';
  return `<svg width='100%' height='100%' viewBox='0 0 340 258' preserveAspectRatio='xMidYMid slice' aria-hidden='true'>
    ${sparkle(58, 54, 11, GOLD)}${sparkle(300, 44, 7, 'rgba(255,255,255,.6)')}${sparkle(40, 220, 6, 'rgba(255,255,255,.45)')}
    ${back}${S.draw(SUIT_LOOK[key].fondo)}${face(faceKind, S.ey)}${behindFace}${HATS[hat]!(S.hat)}${front}</svg>`;
}
