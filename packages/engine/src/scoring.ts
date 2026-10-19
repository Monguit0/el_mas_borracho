import { CARD_DEFS, COMMON_GLASS, type Card, type Category, type CocktailDef } from './cards.js';
import type { BonusConfig, RecipeMode, RulesConfig } from './rules.js';

const CATEGORY_BY_NAME = new Map(CARD_DEFS.map((d) => [d.name, d.category]));

/**
 * Qué carta pide cada lugar de la receta. En modo 'exacta', ese nombre (el Vaso común sirve de vaso).
 * En modo 'vaso', cualquier vaso sirve: el de la receta suma y otro resta. En modo 'flexible', los
 * ingredientes siguen siendo ese nombre, pero vaso, utensilio y técnica pueden ser cualquiera de su categoría.
 */
function slotAccepts(slotName: string, card: Card, mode: RecipeMode): boolean {
  const category: Category = CATEGORY_BY_NAME.get(slotName)!;
  if (category === 'cristaleria' && card.name === COMMON_GLASS) return true;
  if (mode === 'vaso' && category === 'cristaleria') return card.category === category;
  if (mode === 'flexible' && category !== 'ingrediente') return card.category === category;
  return card.name === slotName;
}

export interface PointsBreakdown {
  base: number;
  color: number;
  symbol: number;
  sameNumber: number;
  /** El vaso de la receta suma; otro vaso (o el Vaso común) resta. */
  glass: number;
  total: number;
}

/** Vasos usados que no son los de la receta (el Vaso común nunca es el de la receta). */
export function wrongGlasses(cocktail: CocktailDef, cards: Card[]): number {
  return cards.filter((c) => c.category === 'cristaleria' && !cocktail.recipe.includes(c.name)).length;
}

/** Puntos de un cóctel: la base más los extras por las cartas que se usaron. */
export function scoreCocktail(cocktail: CocktailDef, cards: Card[], bonus: BonusConfig): PointsBreakdown {
  const color = cards.filter((c) => c.color === cocktail.color).length * bonus.perMatchingColor;
  const symbol = cards.filter((c) => c.symbol === cocktail.symbol).length * bonus.perMatchingSymbol;
  const sameNumber = cards.length > 0 && cards.every((c) => c.number === cards[0]!.number) ? bonus.allSameNumber : 0;
  const wrong = wrongGlasses(cocktail, cards);
  const right = cards.filter((c) => c.category === 'cristaleria').length - wrong;
  const glass = right * bonus.rightGlass + wrong * bonus.wrongGlass;
  const base = cocktail.basePoints;
  return { base, color, symbol, sameNumber, glass, total: Math.max(0, base + color + symbol + sameNumber + glass) };
}

/** Cuánto pega un cóctel bien armado: con otro vaso pega menos. */
export function cocktailAlcohol(cocktail: CocktailDef, cards: Card[], rules: RulesConfig): number {
  return Math.max(0, cocktail.alcohol - wrongGlasses(cocktail, cards) * rules.wrongGlassAlcohol);
}

/** ¿Estas cartas son exactamente la receta? (cada lugar cubierto por una carta distinta, sin sobrantes) */
export function matchesRecipe(cocktail: CocktailDef, cards: Card[], mode: RecipeMode = 'exacta'): boolean {
  if (cards.length !== cocktail.recipe.length) return false;
  const used = new Set<string>();
  const fill = (i: number): boolean => {
    if (i === cocktail.recipe.length) return true;
    for (const c of cards) {
      if (used.has(c.id) || !slotAccepts(cocktail.recipe[i]!, c, mode)) continue;
      used.add(c.id);
      if (fill(i + 1)) return true;
      used.delete(c.id);
    }
    return false;
  };
  return fill(0);
}

export interface CocktailOption {
  cocktailCode: string;
  cardIds: string[];
  points: PointsBreakdown;
  /** Si el vaso no es el de la receta. */
  wrongGlass: boolean;
}

/** La mejor forma de armar cada cóctel posible con esta mano (la que más puntos da). */
export function bestCocktailOptions(
  hand: Card[],
  cocktails: CocktailDef[],
  bonus: BonusConfig,
  mode: RecipeMode = 'exacta',
): CocktailOption[] {
  const out: CocktailOption[] = [];
  for (const cocktail of cocktails) {
    const choices = cocktail.recipe.map((n) => hand.filter((c) => slotAccepts(n, c, mode)));
    if (choices.some((ch) => ch.length === 0)) continue;
    let best: CocktailOption | null = null;
    const pick = (i: number, acc: Card[]) => {
      if (i === choices.length) {
        const points = scoreCocktail(cocktail, acc, bonus);
        if (!best || points.total > best.points.total) {
          best = { cocktailCode: cocktail.code, cardIds: acc.map((c) => c.id), points, wrongGlass: wrongGlasses(cocktail, acc) > 0 };
        }
        return;
      }
      for (const c of choices[i]!) if (!acc.includes(c)) pick(i + 1, [...acc, c]);
    };
    pick(0, []);
    if (best) out.push(best);
  }
  return out.sort((a, b) => b.points.total - a.points.total);
}
