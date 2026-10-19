import { useState } from 'react';
import { CARD_DEFS, DEFAULT_RULES, type Category } from '@borracho/engine';
import type { GameView, WireAction } from '@borracho/protocol';
import { CATEGORY_LABEL } from '../lib/game';
import { Sheet } from './Sheet';

interface Props {
  game: GameView;
  /** Las 3 cartas elegidas de la mano (todas de la misma categoría). */
  selected: string[];
  busy: boolean;
  onClose: () => void;
  onAsk: (action: WireAction) => void;
}

/** Las 3 elegidas, si son de una misma categoría: cuál, y si a la vista son todas del mismo color. */
export function askable(game: GameView, selected: string[]): { category: Category; sameColor: boolean } | null {
  if (!game.you.canAsk || selected.length !== DEFAULT_RULES.askCards) return null;
  const cards = selected.map((h) => game.you.hand.find((c) => c.handle === h)).filter((c) => c !== undefined);
  if (cards.length !== selected.length) return null;
  const category = cards[0]!.category;
  if (!cards.every((c) => c.category === category)) return null;
  // En visión doble no sabés el color: solo cuenta si ves uno y es el mismo en las 3.
  const color = cards[0]!.colors.length === 1 ? cards[0]!.colors[0] : undefined;
  const sameColor = color !== undefined && cards.every((c) => c.colors.length === 1 && c.colors[0] === color);
  return { category, sameColor };
}

/**
 * Pedir ingrediente: entregás 3 cartas de una categoría y recibís 3. Elegís 1 de esa categoría
 * (2 si las 3 son del mismo color) y el resto sale al azar del mazo.
 */
export function AskSheet({ game, selected, busy, onClose, onAsk }: Props) {
  const info = askable(game, selected);
  const [names, setNames] = useState<string[]>([]);
  if (!info) return null;
  const max = info.sameColor ? 2 : 1;
  const options = CARD_DEFS.filter((d) => d.category === info.category)
    .map((d) => d.name)
    .sort((a, b) => a.localeCompare(b, 'es'));
  const toggle = (n: string) =>
    setNames((xs) => (xs.includes(n) ? xs.filter((x) => x !== n) : max === 1 ? [n] : xs.length < max ? [...xs, n] : xs));
  const random = DEFAULT_RULES.askCards - Math.max(1, names.length);

  return (
    <Sheet label="Pedir ingrediente" onClose={onClose}>
      <span className="label">Pedir · {CATEGORY_LABEL[info.category]}</span>
      <h2>¿Qué pedís?</h2>
      <p style={{ margin: 0, fontSize: 15 }}>
        {info.sameColor
          ? 'Las 3 son del mismo color: elegís 2 y la otra sale al azar.'
          : 'Elegís 1 y las otras 2 salen al azar (de cualquier tipo y color).'}
      </p>
      <div className="ask-grid">
        {options.map((n) => (
          <button key={n} type="button" className="ask-name" aria-pressed={names.includes(n)} onClick={() => toggle(n)}>
            {n}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="btn btn-verde"
        disabled={busy || names.length === 0}
        onClick={() => onAsk({ type: 'ASK_INGREDIENT', cards: selected, names })}
      >
        {names.length === 0 ? `ELEGÍ ${max === 2 ? 'HASTA 2' : '1'}` : `PEDIR${random > 0 ? ` + ${random} AL AZAR` : ''}`}
      </button>
    </Sheet>
  );
}
