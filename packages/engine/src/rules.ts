// Todos los números del juego en un solo lugar. Las opciones de la sala solo cambian esto,
// y queda congelado al empezar la partida.

export interface BonusConfig {
  /** Por cada carta del mismo color que el cóctel. */
  perMatchingColor: number;
  /** Por cada carta del mismo símbolo que el cóctel. */
  perMatchingSymbol: number;
  /** Si todas las cartas de la receta tienen el mismo número. */
  allSameNumber: number;
  /** Por cada Vaso común usado (negativo: resta). */
  commonGlass: number;
}

/** 'exacta': cada carta de la receta por nombre. 'flexible': ingredientes por nombre, el resto cualquiera de su categoría. */
export type RecipeMode = 'exacta' | 'flexible';

export interface RulesConfig {
  recipeMode: RecipeMode;
  handSize: number;
  drawPerTurn: number;
  barMax: number;
  /** 2 = mazo completo, 1 = mazo chico (la mitad de copias de cada nombre). */
  deckCopies: 1 | 2;
  cocktailsPerTurn: number;
  /** Alcohol que suma un cóctel mal armado (lo probaste). */
  failAlcohol: number;
  swapCost: number;
  shotAlcohol: number;
  shotsPerTurn: number;
  /** Descartes por coincidencia con la carta de la mesa, por turno. */
  matchDiscardsPerTurn: number;
  /** Papelones con los que perdés ("estás pasando vergüenza"). */
  shameLimit: number;
  /** 'uno': el cóctel le pega al rival que elegís. 'todos': le pega a todos los rivales. */
  cocktailTarget: 'uno' | 'todos';
  /** No podés cerrar el turno sin jugar algo (un cóctel o un descarte por coincidencia). */
  mustPlay: boolean;
  waterCost: number;
  waterAmount: number;
  coffeeCost: number;
  /** Turnos propios que dura el café, contando el turno en que lo tomás. */
  coffeeTurns: number;
  coffeeReduction: number;
  /** Precio de comprar una carta especial (se duplica con cada compra del turno). */
  specialCost: number;
  /** Tope de la mano especial. */
  specialHandMax: number;
  /** Cartas especiales con las que arranca cada uno. */
  specialStart: number;
  /** Lo que suma "Semana difícil" al cóctel. */
  hardWeekAlcohol: number;
  bonus: BonusConfig;
}

export const DEFAULT_RULES: RulesConfig = Object.freeze({
  recipeMode: 'exacta',
  handSize: 8,
  drawPerTurn: 3,
  barMax: 100,
  deckCopies: 2,
  cocktailsPerTurn: 99, // sin límite en la práctica
  failAlcohol: 5,
  swapCost: 1,
  shotAlcohol: 5,
  shotsPerTurn: 99, // sin límite: cada shot del turno pega el doble que el anterior
  mustPlay: true,
  cocktailTarget: 'uno',
  matchDiscardsPerTurn: 1,
  shameLimit: 3,
  waterCost: 2,
  waterAmount: 10,
  coffeeCost: 3,
  coffeeTurns: 3,
  coffeeReduction: 25,
  specialCost: 4,
  specialHandMax: 3,
  specialStart: 2,
  hardWeekAlcohol: 15,
  bonus: Object.freeze({ perMatchingColor: 1, perMatchingSymbol: 1, allSameNumber: 2, commonGlass: -1 }),
}) as RulesConfig;

export function makeRules(overrides: Partial<Omit<RulesConfig, 'bonus'>> & { bonus?: Partial<BonusConfig> } = {}): RulesConfig {
  const { bonus, ...rest } = overrides;
  return Object.freeze({
    ...DEFAULT_RULES,
    ...rest,
    bonus: Object.freeze({ ...DEFAULT_RULES.bonus, ...bonus }),
  });
}

/** Niveles de borrachera según la barra (en % de barMax). */
export const DRUNK_LEVELS = [
  { level: 'sobrio', from: 0 },
  { level: 'alegre', from: 25 },
  { level: 'mareado', from: 50 },
  { level: 'en_pedo', from: 75 },
  { level: 'al_borde', from: 90 },
] as const;
export type DrunkLevel = (typeof DRUNK_LEVELS)[number]['level'];

export function drunkLevel(alcohol: number, barMax: number): DrunkLevel {
  const pct = (Math.max(0, alcohol) / barMax) * 100;
  let current: DrunkLevel = 'sobrio';
  for (const l of DRUNK_LEVELS) if (pct >= l.from) current = l.level;
  return current;
}
