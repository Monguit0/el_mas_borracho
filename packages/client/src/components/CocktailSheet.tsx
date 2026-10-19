import { useState, type CSSProperties } from 'react';
import { COCKTAILS } from '@borracho/engine';
import type { GameView, WireAction } from '@borracho/protocol';
import { COCKTAIL_BY_CODE, COLOR_HEX, KIND_COLOR, optionAlcohol, scrambleText, targetsFor } from '../lib/game';
import { Sheet } from './Sheet';

interface Props {
  game: GameView;
  selected: string[];
  /** El cóctel ya elegido (desde la lista de "Podés armar"): arranca en el paso de a quién. */
  initialCode?: string | null;
  onSelect: (handles: string[]) => void;
  onClose: () => void;
  onLaunch: (action: WireAction) => void;
}

/**
 * Armar y lanzar un cóctel en dos pasos: qué cóctel (solo los que salen con tu mano) y a quién, con
 * las especiales de cóctel que quieras sumarle. Sobrio las cartas se eligen solas; mareado sabés
 * cuáles salen pero elegís las cartas; en pedo no sabés qué sale y elegís a ojo.
 */
export function CocktailSheet({ game, selected, initialCode = null, onSelect, onClose, onLaunch }: Props) {
  const book = game.you.recipeBook;
  const targets = targetsFor(game);
  const [code, setCode] = useState<string | null>(initialCode);
  const [targetId, setTargetId] = useState<string | null>(targets.length === 1 ? targets[0]!.id : null);
  const [specialIds, setSpecialIds] = useState<string[]>([]);
  const cocktailSpecials = game.you.specials.filter((s) => s.kind === 'coctel');

  const pick = (cocktailCode: string) => {
    setCode(cocktailCode);
    if (book.mode === 'completo') {
      const option = book.canMake.find((o) => o.cocktailCode === cocktailCode);
      if (option) onSelect(option.handles);
    }
  };

  const toggleSpecial = (id: string) => setSpecialIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  // Paso 1: qué cóctel.
  if (code === null) {
    return (
      <Sheet label="Armar cóctel" onClose={onClose}>
        <h2>¿Qué armás?</h2>
        {book.mode === 'completo' ? (
          book.canMake.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>
              Con lo que tenés en la mano no sale ningún cóctel. Probá cambiar cartas o tomarte un shot.
            </p>
          ) : (
            <>
              <p className="muted" style={{ margin: 0, fontSize: 14 }}>
                Estos salen con lo que tenés. Tocá uno y las cartas se eligen solas.
              </p>
              {book.canMake.map((o) => {
                const c = COCKTAIL_BY_CODE.get(o.cocktailCode)!;
                return (
                  <button key={o.cocktailCode} type="button" className="option" style={{ '--k': COLOR_HEX[c.color] } as CSSProperties} onClick={() => pick(o.cocktailCode)}>
                    <span className="stripe" />
                    <span className="main">
                      <span className="title">{c.name}</span>
                      <span className="sub">
                        {o.points.total} pts · pega {optionAlcohol(o.cocktailCode, o.wrongGlass)}%
                        {o.wrongGlass ? ' · en otro vaso' : ''}
                      </span>
                    </span>
                  </button>
                );
              })}
            </>
          )
        ) : book.mode === 'solo_nombres' ? (
          book.canMake.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>
              Con lo que tenés en la mano no sale ningún cóctel.
            </p>
          ) : (
            <>
              <p className="muted" style={{ margin: 0, fontSize: 14 }}>
                Mareado: sabés cuáles salen, pero las cartas las elegís vos. Si te equivocás, te lo tomás vos (+5%).
              </p>
              {book.canMake.map((o) => {
                const c = COCKTAIL_BY_CODE.get(o.cocktailCode)!;
                return (
                  <button key={o.cocktailCode} type="button" className="option" style={{ '--k': COLOR_HEX[c.color] } as CSSProperties} onClick={() => pick(o.cocktailCode)}>
                    <span className="stripe" />
                    <span className="main">
                      <span className="title">{c.name}</span>
                      <span className="sub">pega {c.alcohol}%</span>
                    </span>
                  </button>
                );
              })}
            </>
          )
        ) : (
          <>
            <p className="muted" style={{ margin: 0, fontSize: 14 }}>
              En pedo no te das cuenta qué sale. Elegí las cartas de tu mano y el cóctel a ojo; si sale mal, te lo tomás vos (+5%).
            </p>
            {COCKTAILS.map((c, i) => (
              <button key={c.code} type="button" className="option" style={{ '--k': COLOR_HEX[c.color], padding: '8px 12px' } as CSSProperties} onClick={() => pick(c.code)}>
                <span className="stripe" />
                <span className="main">
                  <span className="title" style={{ fontSize: 16 }}>
                    {scrambleText(c.name, game.turn * 31 + i)}
                  </span>
                </span>
              </button>
            ))}
          </>
        )}
      </Sheet>
    );
  }

  // Paso 2: a quién y con qué especiales.
  const cocktail = COCKTAIL_BY_CODE.get(code)!;
  const option = book.mode === 'completo' ? book.canMake.find((o) => o.cocktailCode === code) : undefined;
  const manual = !option;
  const ready = targetId !== null && selected.length > 0;
  const shownName = book.mode === 'ilegible' ? scrambleText(cocktail.name, game.turn * 31 + COCKTAILS.indexOf(cocktail)) : cocktail.name;

  return (
    <Sheet label="Lanzar cóctel" onClose={onClose}>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <span style={{ width: 10, alignSelf: 'stretch', borderRadius: 3, background: COLOR_HEX[cocktail.color] }} />
        <div className="spacer">
          <span className="label">Armaste</span>
          <h2>{shownName}</h2>
          <span className="muted" style={{ fontSize: 14 }}>
            {option ? `${option.points.total} pts · ` : ''}pega {optionAlcohol(code, option?.wrongGlass)}%
          </span>
          {option?.wrongGlass ? (
            <span className="muted" style={{ display: 'block', fontSize: 13 }}>
              No tenés el vaso de la receta: va en otro, −1 punto y pega 5% menos.
            </span>
          ) : null}
        </div>
        <button type="button" className="btn btn-sm" style={{ background: 'transparent', color: 'var(--bordo)', border: '1px solid rgba(0,0,0,.15)' }} onClick={() => setCode(null)}>
          Cambiar
        </button>
      </div>

      {manual ? (
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          {selected.length === 0
            ? 'Todavía no elegiste cartas: cerrá esto, tocá las de tu mano y volvé a Armar cóctel.'
            : `Van las ${selected.length} carta${selected.length === 1 ? '' : 's'} que elegiste de tu mano.`}
        </p>
      ) : null}

      <div className="label">¿A quién se lo tirás?</div>
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
          <div className="label">¿Le sumás una especial?</div>
          {cocktailSpecials.map((s) => (
            <button key={s.id} type="button" className="option" aria-pressed={specialIds.includes(s.id)} style={{ '--k': KIND_COLOR.coctel } as CSSProperties} onClick={() => toggleSpecial(s.id)}>
              <span className="stripe" />
              <span className="main">
                <span className="title">
                  {s.name}
                  {specialIds.includes(s.id) ? ' · va' : ''}
                </span>
                <span className="sub">{s.text}</span>
              </span>
            </button>
          ))}
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            Si no tocás ninguna, va sin especial. Si el cóctel sale mal, la especial se pierde igual.
          </p>
        </>
      ) : null}

      <button
        type="button"
        className="btn btn-dark"
        disabled={!ready}
        onClick={() => ready && onLaunch({ type: 'MAKE_COCKTAIL', cocktailCode: code, cards: selected, targetId, ...(specialIds.length > 0 ? { specialIds } : {}) })}
      >
        {targetId ? `TIRÁRSELO A ${(targets.find((t) => t.id === targetId)?.name ?? '').toUpperCase()}` : 'ELEGÍ A QUIÉN'}
      </button>
    </Sheet>
  );
}
