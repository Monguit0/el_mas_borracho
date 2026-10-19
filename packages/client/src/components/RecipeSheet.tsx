import type { CSSProperties } from 'react';
import { COCKTAILS } from '@borracho/engine';
import type { GameView } from '@borracho/protocol';
import { COLOR_HEX } from '../lib/game';
import { SymbolIcon } from './icons';
import { Sheet } from './Sheet';

/** El recetario de costado: entero sobrio, solo los nombres que salen mareado, ilegible en pedo. */
export function RecipeSheet({ game, onClose }: { game: GameView; onClose: () => void }) {
  const book = game.you.recipeBook;
  const points = new Map(book.mode === 'completo' ? book.canMake.map((o) => [o.cocktailCode, o.points.total]) : []);
  const canMake = new Set(book.mode === 'ilegible' ? [] : book.canMake.map((o) => o.cocktailCode));
  const blur = book.mode === 'ilegible';
  const sorted = [...COCKTAILS].sort((a, b) => Number(canMake.has(b.code)) - Number(canMake.has(a.code)));
  return (
    <Sheet label="Recetario" onClose={onClose}>
      <h2>Recetario</h2>
      <p className="muted" style={{ margin: 0, fontSize: 14 }}>
        {book.mode === 'completo'
          ? 'Arriba, los que podés armar con tu mano y cuánto pagan.'
          : book.mode === 'solo_nombres'
            ? 'Mareado: el recetario te dice cuáles salen, pero no cuánto pagan.'
            : 'En pedo no se lee nada. Suerte.'}
      </p>
      <div className={blur ? 'recipe-blur' : undefined} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {sorted.map((c) => (
          <div key={c.code} className="option" aria-pressed={canMake.has(c.code)} style={{ '--k': COLOR_HEX[c.color], padding: '8px 12px' } as CSSProperties}>
            <span className="stripe" />
            <span className="main">
              <span className="row" style={{ gap: 6 }}>
                <span className="title" style={{ fontSize: 16 }}>
                  {c.name}
                </span>
                <SymbolIcon symbol={c.symbol} color={COLOR_HEX[c.color]} />
                <span className="spacer" />
                <span className="sub">
                  {points.has(c.code) ? `${points.get(c.code)} pts` : `${c.basePoints} pts base`} · {c.alcohol}%
                </span>
              </span>
              <span className="sub">{c.recipe.join(' · ')}</span>
            </span>
          </div>
        ))}
      </div>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        Bonus: +1 por carta del color del cóctel, +1 por carta de su símbolo, +2 si todas tienen el mismo número. El Vaso común sirve de vaso en cualquier receta, pero resta 1.
      </p>
    </Sheet>
  );
}
