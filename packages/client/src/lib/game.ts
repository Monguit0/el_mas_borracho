import { CARD_INFO, SUIT_NAMES, parseCardId, type SeatView } from '@borracho/engine';

export const AVATAR_COLORS = ['#b51f2e', '#2f6f63', '#3a6fc4', '#c97a1a', '#7a4a9a', '#4f7a4a'];

export function seatColor(index: number): string {
  return AVATAR_COLORS[((index % AVATAR_COLORS.length) + AVATAR_COLORS.length) % AVATAR_COLORS.length]!;
}

export const STATUS_LABEL: Record<SeatView['status'], string> = {
  waiting: 'Espera',
  playing: 'Juega',
  stood: 'Plantado',
  busted: 'Se pasó',
  out: 'Afuera',
};

/** Las marcas que deja un efecto sobre un jugador, para mostrar en su asiento. */
export function seatBadges(p: SeatView): { icon: string; label: string }[] {
  const out: { icon: string; label: string }[] = [];
  if (p.shield) out.push({ icon: '🛡️', label: 'Escudo' });
  if (p.blankets > 0) out.push({ icon: '🧣', label: 'Manta' });
  if (p.maxHits !== null) out.push({ icon: '🔒', label: 'Cerrojo' });
  if (p.cursed) out.push({ icon: '🧪', label: 'Maldición' });
  if (p.loan) out.push({ icon: '💸', label: 'Préstamo' });
  if (p.partnerId) out.push({ icon: '💞', label: 'Pareja' });
  return out;
}

export function effectTitle(cardId: string): string {
  return CARD_INFO[cardId]?.title ?? '';
}

export function cardName(cardId: string): string {
  return CARD_INFO[cardId]?.name ?? cardId;
}

export function suitOf(cardId: string): string {
  return parseCardId(cardId)?.suit ?? 'H';
}

export function suitSymbol(cardId: string): string {
  const card = parseCardId(cardId);
  return card ? SUIT_NAMES[card.suit].symbol : '';
}
