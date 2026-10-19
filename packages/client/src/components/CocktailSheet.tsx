import { useMemo, useState, type CSSProperties } from 'react';
import { COCKTAILS } from '@borracho/engine';
import type { GameView, WireAction } from '@borracho/protocol';
import { COLOR_HEX, KIND_COLOR, scrambleText, targetsFor } from '../lib/game';
import { Sheet } from './Sheet';

interface Props {
  game: GameView;
  selected: string[];
  onSelect: (handles: string[]) => void;
  onClose: () => void;
  onLaunch: (action: WireAction) => void;
}

/**
 * Armar y lanzar un cóctel. Sobrio el recetario te dice qué podés armar y con qué cartas; mareado
 * solo los nombres; en pedo no se lee nada y los nombres salen mezclados: elegís a ojo.
 */
export function CocktailSheet({ game, selected, onSelect, onClose, onLaunch }: Props) {
  const book = game.you.recipeBook;
  const targets = targetsFor(game);
  const [code, setCode] = useState<string | null>(null);
  const [targetId, setTargetId] = useState<string | null>(targets[0]?.id ?? null);
  const [specialIds, setSpecialIds] = useState<string[]>([]);
  const cocktailSpecials = game.you.specials.filter((s) => s.kind === 'coctel');

  const canMake = useMemo(() => new Set(book.mode === 'ilegible' ? [] : book.canMake.map((o) => o.cocktailCode)), [book]);
  const others = COCKTAILS.filter((c) => !canMake.has(c.code));
  const readable = book.mode !== 'ilegible';

  const pick = (cocktailCode: string) => {
    setCode(cocktailCode);
    if (book.mode === 'completo') {
      const option = book.canMake.find((o) => o.cocktailCode === cocktailCode);
      if (option) onSelect(option.handles);
    }
  };

  const toggleSpecial = (id: string) => setSpecialIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  const ready = code !== null && targetId !== null && selected.length > 0;

  return (
    <Sheet label="Armar cóctel" onClose={onClose}>
      <h2>Armar cóctel</h2>
      <p className="muted" style={{ margin: 0, fontSize: 14 }}>
        {book.mode === 'completo'
          ? canMake.size > 0
            ? 'Tocá uno de los que podés armar y se eligen las cartas solas.'
            : 'Con tu mano no sale ninguno entero. Si querés, probá a mano con las cartas que elegiste.'
          : book.mode === 'solo_nombres'
            ? 'Mareado: sabés cuáles salen, pero las cartas las elegís vos.'
            : 'En pedo no se lee el recetario. Elegí las cartas y el cóctel a ojo.'}{' '}
        Si sale mal, te lo tomás vos (+5%).
      </p>

      {canMake.size > 0 ? <div className="label">Podés armar</div> : null}
      {book.mode === 'completo'
        ? book.canMake.map((o) => {
            const c = COCKTAILS.find((x) => x.code === o.cocktailCode)!;
            return (
              <button key={o.cocktailCode} type="button" className="option" aria-pressed={code === o.cocktailCode} style={{ '--k': COLOR_HEX[c.color] } as CSSProperties} onClick={() => pick(o.cocktailCode)}>
                <span className="stripe" />
                <span className="main">
                  <span className="title">{c.name}</span>
                  <span className="sub">
                    {o.points.total} pts · pega {c.alcohol}%
                  </span>
                </span>
              </button>
            );
          })
        : book.mode === 'solo_nombres'
          ? book.canMake.map((o) => {
              const c = COCKTAILS.find((x) => x.code === o.cocktailCode)!;
              return (
                <button key={o.cocktailCode} type="button" className="option" aria-pressed={code === o.cocktailCode} style={{ '--k': COLOR_HEX[c.color] } as CSSProperties} onClick={() => pick(o.cocktailCode)}>
                  <span className="stripe" />
                  <span className="main">
                    <span className="title">{c.name}</span>
                    <span className="sub">pega {c.alcohol}%</span>
                  </span>
                </button>
              );
            })
          : null}

      <details>
        <summary className="label" style={{ cursor: 'pointer' }}>
          {canMake.size > 0 ? 'Otro, a mano' : 'Elegir el cóctel'}
        </summary>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
          {others.map((c, i) => (
            <button key={c.code} type="button" className="option" aria-pressed={code === c.code} style={{ '--k': COLOR_HEX[c.color], padding: '8px 12px' } as CSSProperties} onClick={() => pick(c.code)}>
              <span className="stripe" />
              <span className="main">
                <span className="title" style={{ fontSize: 16 }}>
                  {readable ? c.name : scrambleText(c.name, game.turn * 31 + i)}
                </span>
                {readable ? <span className="sub">{c.recipe.join(' · ')}</span> : null}
              </span>
            </button>
          ))}
        </div>
      </details>

      <div className="label">A quién</div>
      {targets.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>
          No hay a quién tirarle: todos son conductores designados.
        </p>
      ) : (
        <div className="row" style={{ flexWrap: 'wrap' }}>
          {targets.map((p) => (
            <button key={p.id} type="button" className="option" aria-pressed={targetId === p.id} style={{ width: 'auto', flex: '1 0 40%', padding: '10px 12px' }} onClick={() => setTargetId(p.id)}>
              <span className="main">
                <span className="title" style={{ fontSize: 17 }}>
                  {p.name}
                </span>
                <span className="sub">
                  {Math.round((p.alcohol / game.barMax) * 100)}%{p.specialCount > 0 ? ` · ${p.specialCount} especial${p.specialCount === 1 ? '' : 'es'}` : ''}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}

      {cocktailSpecials.length > 0 ? (
        <>
          <div className="label">Sumale una especial</div>
          {cocktailSpecials.map((s) => (
            <button key={s.id} type="button" className="option" aria-pressed={specialIds.includes(s.id)} style={{ '--k': KIND_COLOR.coctel } as CSSProperties} onClick={() => toggleSpecial(s.id)}>
              <span className="stripe" />
              <span className="main">
                <span className="title">{s.name}</span>
                <span className="sub">{s.text}</span>
              </span>
            </button>
          ))}
        </>
      ) : null}

      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        {selected.length === 0 ? 'Todavía no elegiste cartas: cerrá esto y tocá las de tu mano.' : `Van ${selected.length} carta${selected.length === 1 ? '' : 's'} de tu mano.`}
      </p>
      <button
        type="button"
        className="btn btn-dark"
        disabled={!ready}
        onClick={() =>
          ready &&
          onLaunch({ type: 'MAKE_COCKTAIL', cocktailCode: code, cards: selected, targetId, ...(specialIds.length > 0 ? { specialIds } : {}) })
        }
      >
        LANZAR
      </button>
    </Sheet>
  );
}
