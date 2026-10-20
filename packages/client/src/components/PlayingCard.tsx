import { memo, useMemo } from 'react';
import { CARD_INFO, SUIT_NAMES, rankLabel, type Card } from '@borracho/engine';
import { cardArt, panelColor } from '../lib/art';

const artCache = new Map<string, string>();
function artFor(id: string): string {
  let svg = artCache.get(id);
  if (svg === undefined) {
    svg = cardArt(id);
    artCache.set(id, svg);
  }
  return svg;
}

export type CardSize = 'full' | 'table' | 'mini';

interface Props {
  card: Card | null;
  size: CardSize;
  /** Boca abajo para los demás (la ves vos, o la espiaste). */
  hidden?: boolean;
  /** Entra volando (recién robada). */
  fresh?: boolean;
  onClick?: () => void;
  className?: string;
}

function Corner({ card, flip }: { card: Card; flip?: boolean }) {
  return (
    <div className={`pc-rank${flip ? ' flip' : ''}`}>
      {card.rank === '6' || card.rank === '9' ? <u>{card.rank}</u> : card.rank}
      <span>{SUIT_NAMES[card.suit].symbol}</span>
    </div>
  );
}

export const PlayingCard = memo(function PlayingCard({ card, size, hidden, fresh, onClick, className = '' }: Props) {
  const svg = useMemo(() => (card ? artFor(card.id) : ''), [card]);
  const classes = `pc pc-${size}${fresh ? ' pc-fresh' : ''}${onClick ? ' pc-tap' : ''} ${className}`;
  if (!card) {
    return (
      <div className={`${classes} pc-back`} aria-label="Carta boca abajo" onClick={onClick}>
        <div className="pc-back-inner">
          <span>21</span>
        </div>
      </div>
    );
  }
  const info = CARD_INFO[card.id]!;
  const red = SUIT_NAMES[card.suit].red;
  const value = card.rank === 'A' ? '1·11' : card.rank === 'J' || card.rank === 'Q' || card.rank === 'K' ? '10' : card.rank;
  const label = `${rankLabel(card.rank)} de ${SUIT_NAMES[card.suit].many}, ${info.name}`;
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag type={onClick ? 'button' : undefined} className={`${classes} ${red ? 'red' : 'blk'}${hidden ? ' pc-hidden' : ''}`} aria-label={label} onClick={onClick}>
      <div className="pc-top">
        <Corner card={card} />
        {size === 'full' ? (
          <div className="pc-vale">
            <small>VALE</small>
            <b>{value}</b>
          </div>
        ) : null}
      </div>
      <div className="pc-panel" style={{ background: panelColor(card.suit) }} dangerouslySetInnerHTML={{ __html: svg }} />
      {size !== 'mini' ? <div className="pc-name">{info.name}</div> : null}
      {size === 'full' ? (
        <>
          <div className="pc-sub">
            {rankLabel(card.rank)} de {SUIT_NAMES[card.suit].many} · {info.kind === 'on' ? 'al pedirla' : 'mientras la tengas'}
          </div>
          <div className="pc-bottom">
            <div className="pc-fx">
              <b>{info.title}.</b> {info.text}
            </div>
            <Corner card={card} flip />
          </div>
        </>
      ) : null}
      {hidden ? <div className="pc-hidden-tag">oculta</div> : null}
    </Tag>
  );
});
