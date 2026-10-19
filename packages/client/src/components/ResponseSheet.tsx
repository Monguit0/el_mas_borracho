import { useEffect, useState, type CSSProperties } from 'react';
import { COCKTAILS } from '@borracho/engine';
import type { GameView, WireAction } from '@borracho/protocol';
import { COLOR_HEX, KIND_COLOR, KIND_LABEL, cocktailName, scrambleText } from '../lib/game';
import { Card } from './Card';
import { Sheet } from './Sheet';

/** Segundos que faltan hasta `endsAt`, actualizándose solos. */
export function useSecondsLeft(endsAt: number | null): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (endsAt === null) return;
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, [endsAt]);
  return endsAt === null ? null : Math.max(0, Math.ceil((endsAt - now) / 1000));
}

export function Countdown({ endsAt, total }: { endsAt: number | null; total: number }) {
  const left = useSecondsLeft(endsAt);
  const frac = left === null ? 1 : Math.min(1, left / total);
  const len = 2 * Math.PI * 28;
  return (
    <div className="countdown" aria-label={left === null ? undefined : `Quedan ${left} segundos`}>
      <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden="true">
        <circle cx="32" cy="32" r="28" fill="none" stroke="rgba(0,0,0,.12)" strokeWidth="6" />
        <circle cx="32" cy="32" r="28" fill="none" stroke="#6E1F2E" strokeWidth="6" strokeLinecap="round" strokeDasharray={len} strokeDashoffset={len * (1 - frac)} transform="rotate(-90 32 32)" />
      </svg>
      <span>{left ?? ''}</span>
    </div>
  );
}

interface Props {
  game: GameView;
  defenseSeconds: number;
  name: (id: string) => string;
  onRespond: (action: WireAction) => void;
}

/** Te tiran un cóctel: tomártelo o responder con una especial, antes de que se acabe el tiempo. */
export function ResponseSheet({ game, defenseSeconds, name, onRespond }: Props) {
  const pending = game.pending!;
  const [counter, setCounter] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [cards, setCards] = useState<string[]>([]);
  const book = game.you.recipeBook;
  const counterId = game.you.specials.find((s) => s.code === 'proba_el_mio')?.id;

  const nextName = () => {
    const n = game.players.length;
    const at = game.players.findIndex((p) => p.id === game.you.id);
    for (let k = 1; k < n; k++) {
      const p = game.players[(at + k) % n]!;
      if (!p.eliminated && !p.driver) return p.id === game.you.id ? null : name(p.id);
    }
    return null;
  };

  const sub = (code: string): string => {
    const sender = name(pending.senderId);
    switch (code) {
      case 'no_gracias':
        return `Nadie lo toma y ${name(pending.fromId)} no cobra.`;
      case 'tomatelo_vos':
        return `Se lo toma ${sender} y no cobra.`;
      case 'vos_tambien':
        return `Te lo tomás, pero ${sender} también.`;
      case 'doblalo': {
        const next = nextName();
        return next ? `Le llega a ${next} con ${pending.alcohol * 2}%.` : 'Pasa al siguiente con el doble.';
      }
      case 'proba_el_mio':
        return `Te lo tomás y le tirás a ${sender} un cóctel tuyo, sin respuesta.`;
      default:
        return 'Es de otra clase: no sirve para responder.';
    }
  };

  if (counter && counterId) {
    const options = book.mode === 'completo' ? book.canMake : [];
    const pickCocktail = (c: string) => {
      setCode(c);
      const o = options.find((x) => x.cocktailCode === c);
      if (o) setCards(o.handles);
    };
    const toggle = (h: string) => setCards((cs) => (cs.includes(h) ? cs.filter((x) => x !== h) : [...cs, h]));
    return (
      <Sheet label="Probá el mío">
        <div className="row">
          <Countdown endsAt={game.defenseEndsAt} total={defenseSeconds} />
          <h2>¡Probá el mío!</h2>
        </div>
        <div className="label">Elegí las cartas</div>
        <div className="hand-grid" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
          {game.you.hand.map((c) => (
            <Card key={c.handle} card={c} selected={cards.includes(c.handle)} onClick={() => toggle(c.handle)} />
          ))}
        </div>
        <div className="label">Y el cóctel</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
          {COCKTAILS.map((c, i) => {
            const option = options.find((o) => o.cocktailCode === c.code);
            return (
              <button key={c.code} type="button" className="option" aria-pressed={code === c.code} style={{ '--k': COLOR_HEX[c.color], padding: '8px 12px' } as CSSProperties} onClick={() => pickCocktail(c.code)}>
                <span className="stripe" />
                <span className="main">
                  <span className="title" style={{ fontSize: 16 }}>
                    {book.mode === 'ilegible' ? scrambleText(c.name, game.turn * 17 + i) : c.name}
                  </span>
                  {option ? <span className="sub">Te sale: {option.points.total} pts</span> : null}
                </span>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          className="btn btn-dark"
          disabled={!code || cards.length === 0}
          onClick={() => code && onRespond({ type: 'RESPOND', choice: 'special', specialId: counterId, counter: { cocktailCode: code, cards } })}
        >
          TOMÁ
        </button>
        <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--bordo)', borderColor: 'var(--bordo)' }} onClick={() => setCounter(false)}>
          Volver
        </button>
      </Sheet>
    );
  }

  return (
    <Sheet label="Te tiran un cóctel">
      <div className="row" style={{ gap: 14, alignItems: 'center' }}>
        <Countdown endsAt={game.defenseEndsAt} total={defenseSeconds} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span className="label">Te tiran un cóctel</span>
          <h2>
            {name(pending.senderId)} te mandó un {cocktailName(pending.cocktailCode)}
          </h2>
          <span style={{ fontSize: 14 }}>Pega {pending.alcohol}% · si no hacés nada, te lo tomás</span>
        </div>
      </div>
      {game.you.specials.length > 0 ? <div className="label">Respondé con una especial</div> : null}
      {game.you.specials.map((s) => {
        const usable = s.kind === 'respuesta';
        return (
          <button
            key={s.id}
            type="button"
            className="option"
            disabled={!usable}
            style={{ '--k': KIND_COLOR[s.kind] } as CSSProperties}
            onClick={() => (s.code === 'proba_el_mio' ? setCounter(true) : onRespond({ type: 'RESPOND', choice: 'special', specialId: s.id }))}
          >
            <span className="stripe" />
            <span className="main">
              <span className="title">{s.name}</span>
              <span className="sub">{usable ? sub(s.code) : `${KIND_LABEL[s.kind]}: no sirve para responder.`}</span>
            </span>
          </button>
        );
      })}
      <button type="button" className="btn btn-dark" onClick={() => onRespond({ type: 'RESPOND', choice: 'drink' })}>
        ME LO TOMO
      </button>
    </Sheet>
  );
}
