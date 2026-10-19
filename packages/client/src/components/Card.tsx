import type { CSSProperties } from 'react';
import type { HandCardView } from '@borracho/engine';
import { CATEGORY_LABEL, COLOR_HEX } from '../lib/game';
import { ArtIcon, SymbolIcon } from './icons';

type CardView = Omit<HandCardView, 'handle'>;

interface CardProps {
  card: CardView;
  selected?: boolean;
  small?: boolean;
  onClick?: () => void;
  /** Para el temblor: cada carta con su propio ritmo. */
  shakeIndex?: number;
}

/**
 * Una carta de ingrediente tal como la ve el jugador: con visión doble trae dos colores (el segundo
 * se dibuja como un marco corrido) y lo que ya no ve llega en null y se muestra "?".
 */
export function Card({ card, selected = false, small = false, onClick, shakeIndex }: CardProps) {
  const [first, second] = card.colors;
  const color = COLOR_HEX[first ?? 'bordo'];
  const style = { '--c': color, ...(second ? { '--c2': COLOR_HEX[second] } : {}) } as CSSProperties;
  const label = `${card.name}, ${CATEGORY_LABEL[card.category]}, ${card.symbol ?? 'símbolo desconocido'}, ${card.number ?? 'número desconocido'}`;
  const body = (
    <>
      {second ? <span className="ghost" /> : null}
      <span className="top">
        {card.symbol ? <SymbolIcon symbol={card.symbol} /> : <span>?</span>}
        <span>{card.number ?? '?'}</span>
      </span>
      <span className="art">
        <span className={`disc${card.art === 'blurred' ? ' blurred' : ''}`}>
          <ArtIcon category={card.category} size={small ? 22 : 26} />
        </span>
      </span>
      <span className="name">{card.name}</span>
      <span className="band">{CATEGORY_LABEL[card.category].toUpperCase()}</span>
    </>
  );
  const className = `card${selected ? ' selected' : ''}${small ? ' small' : ''}`;
  const node = onClick ? (
    <button type="button" className={className} style={style} onClick={onClick} aria-pressed={selected} aria-label={label}>
      {body}
    </button>
  ) : (
    <div className={className} style={style} aria-label={label} role="img">
      {body}
    </div>
  );
  if (shakeIndex === undefined) return node;
  return (
    <div className="shake" style={{ animationDuration: `${0.22 + (shakeIndex % 4) * 0.05}s`, animationDelay: `-${shakeIndex * 0.07}s` }}>
      {node}
    </div>
  );
}
