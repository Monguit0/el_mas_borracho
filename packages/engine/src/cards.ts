/**
 * El mazo: 52 cartas de póker, cada una un personaje (el palo hecho muñeco) con su efecto.
 * Los efectos "al pedir" se activan solo cuando la pedís vos; los "siempre" valen mientras la tengas.
 */

export type Suit = 'S' | 'D' | 'H' | 'C';
export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';

export const SUITS: readonly Suit[] = ['S', 'D', 'H', 'C'];
export const RANKS: readonly Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export const SUIT_NAMES: Readonly<Record<Suit, { one: string; many: string; symbol: string; red: boolean }>> = {
  S: { one: 'pica', many: 'picas', symbol: '♠', red: false },
  D: { one: 'diamante', many: 'diamantes', symbol: '♦', red: true },
  H: { one: 'corazón', many: 'corazones', symbol: '♥', red: true },
  C: { one: 'trébol', many: 'tréboles', symbol: '♣', red: false },
};

export interface Card {
  /** Rango + palo: "AS", "10H", "KD". Único en el mazo. */
  readonly id: string;
  readonly rank: Rank;
  readonly suit: Suit;
}

export type EffectKind = 'on' | 'passive';

export interface CardInfo {
  readonly name: string;
  readonly title: string;
  readonly text: string;
  /** "on": se activa cuando la pedís. "passive": vale mientras la tengas. */
  readonly kind: EffectKind;
}

export function cardId(rank: Rank, suit: Suit): string {
  return `${rank}${suit}`;
}

export function parseCardId(id: string): Card | null {
  const suit = id.slice(-1) as Suit;
  const rank = id.slice(0, -1) as Rank;
  return SUITS.includes(suit) && RANKS.includes(rank) ? { id, rank, suit } : null;
}

export function fullDeck(): Card[] {
  return SUITS.flatMap((suit) => RANKS.map((rank) => ({ id: cardId(rank, suit), rank, suit })));
}

/** Valor base: el as cuenta 1 (después se ve si conviene 11), figuras 10. */
export function baseValue(rank: Rank): number {
  if (rank === 'A') return 1;
  if (rank === 'J' || rank === 'Q' || rank === 'K') return 10;
  return Number(rank);
}

export function rankLabel(rank: Rank): string {
  return ({ A: 'As', J: 'Jota', Q: 'Reina', K: 'Rey' } as Record<string, string>)[rank] ?? rank;
}

export function cardLabel(card: Card): string {
  return `${rankLabel(card.rank)} de ${SUIT_NAMES[card.suit].many}`;
}

type Row = [Rank, string, string, string, EffectKind];

const ROWS: Record<Suit, Row[]> = {
  S: [
    ['A', 'Gran Pica Sabia', 'Profecía', 'Mirá las 3 de arriba del mazo y elegí cuál queda arriba. Las otras van al fondo.', 'on'],
    ['2', 'Palito Espía', 'Catalejo', 'Mirá la de arriba del mazo. Dejala arriba o mandala al fondo.', 'on'],
    ['3', 'Pica Curiosa', 'Ojeada', 'Mirá la carta oculta de un rival.', 'on'],
    ['4', 'Pica Exploradora', 'Brújula', 'Decí alta (7 o más) o baja y se da vuelta la de arriba del mazo. Si acertás, ganás 1 ficha.', 'on'],
    ['5', 'Pica Farolera', 'Faro', 'Mirá la de arriba del mazo: quedátela (sin efecto) o mandala al fondo.', 'on'],
    ['6', 'Pica Detective', 'Pista', 'Elegí un rival: todos se enteran si tiene más de 15.', 'on'],
    ['7', 'Pica Relojera', 'Adelanto', 'Mirá la de arriba del mazo y, si querés, dásela a un rival.', 'on'],
    ['8', 'Pica Maga', 'Truco', 'Podés cambiar esta carta por la de arriba del mazo, sin mirarla.', 'on'],
    ['9', 'Pica Astrónoma', 'Eclipse', 'Todos los rivales dan vuelta su carta oculta.', 'on'],
    ['10', 'Pica Ninja', 'Sombra', 'Esta carta queda boca abajo: los rivales no saben que es un 10.', 'on'],
    ['J', 'Jota Sereno', 'Cerrojo', 'El próximo en jugar puede pedir como mucho 1 carta.', 'on'],
    ['Q', 'Dama Noche', 'Oráculo', 'Adiviná el número de la de arriba del mazo. Si acertás, ganás 3 fichas.', 'on'],
    ['K', 'Rey Topo', 'Excavar', 'Podés cambiar esta carta por una del descarte.', 'on'],
  ],
  D: [
    ['A', 'Brillito Trueque', 'Canje', 'Podés cambiar esta carta por una carta a la vista de un rival.', 'on'],
    ['2', 'Diamantito Ahorrista', 'Alcancía', 'Ganás 1 ficha.', 'on'],
    ['3', 'Diamante Feriante', 'Regateo', 'Podés pagar 1 ficha para descartar otra carta tuya.', 'on'],
    ['4', 'Diamante Cambista', 'Cambio chico', 'Podés cambiar tu carta oculta por la de un rival, sin mirar.', 'on'],
    ['5', 'Diamante Apostador', 'Doble o nada', 'Si ganás esta ronda, cobrás el doble.', 'passive'],
    ['6', 'Diamante Joyero', 'Tasación', 'Vale 6 o 4: lo que más te convenga.', 'passive'],
    ['7', 'Diamante Mercader', 'Feria', 'Todos le pasan su carta oculta al de la izquierda.', 'on'],
    ['8', 'Diamante Prestamista', 'Préstamo', 'Ganás 2 fichas. Si perdés la ronda, devolvés 3.', 'on'],
    ['9', 'Diamante Banquero', 'Interés', 'Ganás 1 ficha por cada carta que tengas.', 'on'],
    ['10', 'Diamante Martillero', 'Remate', 'Podés venderle esta carta a un rival: él se la queda y te paga 2 fichas.', 'on'],
    ['J', 'Jota Contrabandista', 'Contrabando', 'Robá 1 ficha a cada rival que tenga más fichas que vos.', 'on'],
    ['Q', 'Reina Tesorera', 'Reembolso', 'Si te pasás de 21, te devuelven la apuesta.', 'passive'],
    ['K', 'Barón Quilates', 'Soborno', 'Si te pasás de 21 por 1 o 2, pagá 1 ficha y quedate en 21.', 'passive'],
  ],
  H: [
    ['A', 'Corazón Cupido', 'Flechazo', 'Si ganás con 21 justo, cobrás el doble.', 'passive'],
    ['2', 'Corazoncito Curita', 'Curita', 'Descartá tu carta más baja (sin contar esta).', 'on'],
    ['3', 'Latido Guardavidas', 'Salvavidas', 'Si te pasás de 21, descartá tu carta más alta. Latido se va con ella.', 'passive'],
    ['4', 'Corazón Abuelo', 'Manta', 'El próximo efecto que te tire un rival no te hace nada.', 'on'],
    ['5', 'Corazón Cartero', 'Abrazo', 'Elegí un rival: los dos ganan 1 ficha.', 'on'],
    ['6', 'Corazón Enfermero', 'Reposo', 'En tu turno podés descartar esta carta cuando quieras.', 'passive'],
    ['7', 'Corazón Escudero', 'Escudo', 'Los efectos de los rivales no te tocan en esta ronda.', 'on'],
    ['8', 'Corazón Bombero', 'Apagafuegos', 'Si te pasás de 21, quedás en 17.', 'passive'],
    ['9', 'Corazón Cocinero', 'Olla popular', 'Todos los jugadores ganan 1 ficha.', 'on'],
    ['10', 'Corazón Gigante', 'Corazón grande', 'Si perdés esta ronda, te devuelven la apuesta.', 'passive'],
    ['J', 'Jota Enamorado', 'Pareja', 'Elegí un rival: si uno de los dos gana la ronda, el otro gana 2 fichas.', 'on'],
    ['Q', 'Reina Ternura', 'Indulto', 'Elegí un rival que se pasó: descarta su última carta y vuelve a la ronda.', 'on'],
    ['K', 'Rey Bonachón', 'Generoso', 'Si ganás la ronda, cada rival gana 1 ficha y vos 2 más.', 'passive'],
  ],
  C: [
    ['A', 'Trébol de la Suerte', 'Suerte', 'Si llegás a 21 con 2 cartas, cobrás el triple.', 'passive'],
    ['2', 'Trebolín Travieso', 'Cosquillas', 'Un rival tiene que pedir 1 carta.', 'on'],
    ['3', 'Trébol Bromista', 'Enroque', 'Cambiá entre sí las cartas ocultas de dos rivales.', 'on'],
    ['4', 'Trébol Ladrón', 'Manotazo', 'Robale 1 ficha a un rival.', 'on'],
    ['5', 'Trébol Payaso', 'Pastelazo', 'Un rival da vuelta su carta oculta.', 'on'],
    ['6', 'Trébol Brujito', 'Desorden', 'La carta oculta de un rival vuelve al mazo y recibe otra.', 'on'],
    ['7', 'Trébol Pirata', 'Abordaje', 'Podés robarle a un rival una carta a la vista y sumarla a tu mano.', 'on'],
    ['8', 'Trébol Boxeador', 'Gancho', 'Un rival pierde 2 fichas.', 'on'],
    ['9', 'Trébol Tormenta', 'Chaparrón', 'Todos los rivales tienen que pedir 1 carta.', 'on'],
    ['10', 'Trébol Gigante', 'Pisotón', 'El rival con más fichas te da 2.', 'on'],
    ['J', 'Jota Pícaro', 'Espejo', 'Copiá el efecto de la última carta que se activó en la ronda.', 'on'],
    ['Q', 'Reina Bruja', 'Maldición', 'Elegí un rival: si se pasa de 21 esta ronda, pierde 1 ficha más.', 'on'],
    ['K', 'Rey Trueno', 'Trueno', 'Los rivales con 18 o más tienen que pedir 1 carta.', 'on'],
  ],
};

export const CARD_INFO: Readonly<Record<string, CardInfo>> = Object.fromEntries(
  SUITS.flatMap((suit) => ROWS[suit].map(([rank, name, title, text, kind]) => [cardId(rank, suit), { name, title, text, kind }])),
);

/** Efectos que le hacen algo a un rival: la Manta y el Escudo los frenan. */
export const HARMFUL: ReadonlySet<string> = new Set([
  '3S', '6S', '7S', '9S', 'JS',
  'AD', '4D', '7D', '10D', 'JD',
  '2C', '3C', '4C', '5C', '6C', '7C', '8C', '9C', '10C', 'QC', 'KC',
]);
