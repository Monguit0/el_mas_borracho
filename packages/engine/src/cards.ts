// Catálogo de cartas: categorías, atributos, nombres del mazo y recetario.
// Los textos largos y dibujos van en el cliente; acá solo lo que usa la regla.

import { mulberry32, shuffleInPlace } from './rng.js';

export const CATEGORIES = ['ingrediente', 'cristaleria', 'utensilio', 'tecnica'] as const;
export type Category = (typeof CATEGORIES)[number];

export const COLORS = ['bordo', 'verde', 'azul', 'mostaza'] as const;
export type Color = (typeof COLORS)[number];

export const SYMBOLS = ['estrella', 'triangulo', 'circulo', 'rombo'] as const;
export type CardSymbol = (typeof SYMBOLS)[number];

export const NUMBERS = [0, 1, 2, 3] as const;
export type CardNumber = (typeof NUMBERS)[number];

/** Un nombre de carta del mazo (Vodka, Copa margarita…). Hay 16 por categoría, más el Vaso común. */
export interface CardDef {
  code: string; // I01, E02, U03, T04
  name: string;
  category: Category;
}

/** Una copia física del mazo: el nombre más sus atributos impresos. */
export interface Card {
  id: string; // opaco, distinto en cada partida
  defCode: string;
  name: string;
  category: Category;
  color: Color;
  symbol: CardSymbol;
  number: CardNumber;
}

const NAMES: Record<Category, { prefix: string; names: string[] }> = {
  ingrediente: {
    prefix: 'I',
    names: [
      'Vodka', 'Tequila', 'Gin', 'Whisky', 'Ron blanco', 'Fernet', 'Cachaça', 'Pisco',
      'Campari', 'Vermut rosso', 'Licor de naranja', 'Espumante', 'Jugo de naranja', 'Lima', 'Coca', 'Sal',
    ],
  },
  cristaleria: {
    prefix: 'E',
    names: [
      'Vaso highball', 'Copa margarita', 'Copa martini', 'Vaso corto', 'Copa coupé', 'Copa flauta',
      'Vaso de pinta', 'Vaso shot', 'Taza de cobre', 'Copa de vino', 'Copa balón', 'Vaso tiki', 'Jarra',
      'Porrón', 'Botella cortada', 'Bota de vidrio', 'Vaso común',
    ],
  },
  utensilio: {
    prefix: 'U',
    names: [
      'Coctelera', 'Medidor', 'Cuchara de bar', 'Colador', 'Exprimidor', 'Mortero', 'Pinza de hielo',
      'Vaso mezclador', 'Licuadora', 'Soplete', 'Sifón', 'Balde de hielo', 'Pajita', 'Sombrillita',
      'Posavasos', 'Rodaja de decoración',
    ],
  },
  tecnica: {
    prefix: 'T',
    names: [
      'Agitar', 'Revolver', 'Construir', 'Colar', 'Macerar', 'Escarchar', 'Licuar', 'Flotar en capas',
      'Doble colado', 'Flamear', 'Ahumar', 'Fondo blanco', 'Frapé', 'Decorar', 'Con hielo', 'Completar',
    ],
  },
};

/** Sirve de vaso en cualquier receta, pero resta puntos. No está en el recetario. */
export const COMMON_GLASS = 'Vaso común';
export const COMMON_GLASS_COPIES = 4;

export const CARD_DEFS: CardDef[] = CATEGORIES.flatMap((category) => {
  const { prefix, names } = NAMES[category];
  return names.map((name, i) => ({ code: `${prefix}${String(i + 1).padStart(2, '0')}`, name, category }));
});

const DEF_BY_NAME = new Map(CARD_DEFS.map((d) => [d.name, d]));

export interface CocktailDef {
  code: string;
  name: string;
  color: Color;
  symbol: CardSymbol;
  recipe: string[]; // nombres de CARD_DEFS, cada uno una vez
  basePoints: number;
  alcohol: number; // en puntos porcentuales de la barra
}

export const COCKTAILS: CocktailDef[] = [
  { code: 'C01', name: 'Destornillador', color: 'bordo', symbol: 'estrella', basePoints: 4, alcohol: 15,
    recipe: ['Vodka', 'Jugo de naranja', 'Vaso highball', 'Construir'] },
  { code: 'C02', name: 'Fernet con coca', color: 'bordo', symbol: 'rombo', basePoints: 3, alcohol: 15,
    recipe: ['Fernet', 'Coca', 'Botella cortada'] },
  { code: 'C03', name: 'Margarita', color: 'bordo', symbol: 'triangulo', basePoints: 5, alcohol: 20,
    recipe: ['Tequila', 'Lima', 'Licor de naranja', 'Copa margarita', 'Agitar'] },
  { code: 'C04', name: 'Cuba libre', color: 'verde', symbol: 'rombo', basePoints: 4, alcohol: 15,
    recipe: ['Ron blanco', 'Coca', 'Lima', 'Vaso highball'] },
  { code: 'C05', name: 'Caipirinha', color: 'verde', symbol: 'circulo', basePoints: 4, alcohol: 20,
    recipe: ['Cachaça', 'Lima', 'Mortero', 'Vaso corto'] },
  { code: 'C06', name: 'Mimosa', color: 'verde', symbol: 'triangulo', basePoints: 3, alcohol: 10,
    recipe: ['Espumante', 'Jugo de naranja', 'Copa flauta'] },
  { code: 'C07', name: 'Negroni', color: 'azul', symbol: 'circulo', basePoints: 5, alcohol: 25,
    recipe: ['Gin', 'Vermut rosso', 'Campari', 'Vaso corto', 'Revolver'] },
  { code: 'C08', name: 'Martini', color: 'azul', symbol: 'estrella', basePoints: 4, alcohol: 25,
    recipe: ['Gin', 'Vermut rosso', 'Copa martini', 'Revolver'] },
  { code: 'C09', name: 'Daiquiri', color: 'azul', symbol: 'rombo', basePoints: 5, alcohol: 20,
    recipe: ['Ron blanco', 'Lima', 'Coctelera', 'Colar', 'Copa coupé'] },
  { code: 'C10', name: 'Whisky con hielo', color: 'mostaza', symbol: 'estrella', basePoints: 3, alcohol: 20,
    recipe: ['Whisky', 'Vaso corto', 'Pinza de hielo'] },
  { code: 'C11', name: 'Shot de tequila', color: 'mostaza', symbol: 'triangulo', basePoints: 4, alcohol: 20,
    recipe: ['Tequila', 'Sal', 'Lima', 'Vaso shot'] },
  { code: 'C12', name: 'Pisco sour', color: 'mostaza', symbol: 'circulo', basePoints: 5, alcohol: 20,
    recipe: ['Pisco', 'Lima', 'Coctelera', 'Agitar', 'Copa coupé'] },
  { code: 'C13', name: 'Moscow mule', color: 'azul', symbol: 'triangulo', basePoints: 4, alcohol: 15,
    recipe: ['Vodka', 'Lima', 'Sifón', 'Taza de cobre'] },
  { code: 'C14', name: 'Spritz de Campari', color: 'bordo', symbol: 'circulo', basePoints: 4, alcohol: 15,
    recipe: ['Campari', 'Espumante', 'Copa de vino', 'Con hielo'] },
  { code: 'C15', name: 'Fernet en jarra', color: 'mostaza', symbol: 'rombo', basePoints: 4, alcohol: 20,
    recipe: ['Fernet', 'Coca', 'Jarra', 'Balde de hielo'] },
  { code: 'C16', name: 'Gin tonic', color: 'verde', symbol: 'estrella', basePoints: 4, alcohol: 15,
    recipe: ['Gin', 'Lima', 'Sifón', 'Copa balón'] },
  { code: 'C17', name: 'Tiki de ron', color: 'mostaza', symbol: 'circulo', basePoints: 5, alcohol: 20,
    recipe: ['Ron blanco', 'Licor de naranja', 'Lima', 'Vaso tiki', 'Sombrillita'] },
  { code: 'C18', name: 'Porrón de vermut', color: 'bordo', symbol: 'triangulo', basePoints: 3, alcohol: 10,
    recipe: ['Vermut rosso', 'Sifón', 'Porrón'] },
  { code: 'C19', name: 'Trago de la previa', color: 'verde', symbol: 'rombo', basePoints: 4, alcohol: 15,
    recipe: ['Vodka', 'Jugo de naranja', 'Botella cortada', 'Pajita'] },
  { code: 'C20', name: 'Whiscola en bota', color: 'azul', symbol: 'estrella', basePoints: 4, alcohol: 25,
    recipe: ['Whisky', 'Coca', 'Bota de vidrio', 'Fondo blanco'] },
  { code: 'C21', name: 'Margarita frozen', color: 'verde', symbol: 'triangulo', basePoints: 5, alcohol: 20,
    recipe: ['Tequila', 'Lima', 'Licuadora', 'Copa margarita', 'Frapé'] },
  { code: 'C22', name: 'Caipiroska', color: 'azul', symbol: 'circulo', basePoints: 5, alcohol: 20,
    recipe: ['Vodka', 'Lima', 'Mortero', 'Macerar', 'Vaso corto'] },
  { code: 'C23', name: 'Cosmopolitan', color: 'bordo', symbol: 'rombo', basePoints: 5, alcohol: 20,
    recipe: ['Vodka', 'Licor de naranja', 'Lima', 'Medidor', 'Copa martini'] },
  { code: 'C24', name: 'Old fashioned', color: 'mostaza', symbol: 'estrella', basePoints: 4, alcohol: 25,
    recipe: ['Whisky', 'Rodaja de decoración', 'Cuchara de bar', 'Vaso corto'] },
  { code: 'C25', name: 'Paloma', color: 'azul', symbol: 'rombo', basePoints: 5, alcohol: 15,
    recipe: ['Tequila', 'Sal', 'Sifón', 'Vaso highball', 'Escarchar'] },
  { code: 'C26', name: 'Shot en capas', color: 'bordo', symbol: 'estrella', basePoints: 4, alcohol: 15,
    recipe: ['Licor de naranja', 'Vermut rosso', 'Vaso shot', 'Flotar en capas'] },
  { code: 'C27', name: 'Ron flameado', color: 'mostaza', symbol: 'triangulo', basePoints: 4, alcohol: 25,
    recipe: ['Ron blanco', 'Soplete', 'Vaso shot', 'Flamear'] },
  { code: 'C28', name: 'Negroni ahumado', color: 'verde', symbol: 'circulo', basePoints: 5, alcohol: 25,
    recipe: ['Gin', 'Vermut rosso', 'Campari', 'Vaso corto', 'Ahumar'] },
  { code: 'C29', name: 'Gimlet', color: 'azul', symbol: 'triangulo', basePoints: 5, alcohol: 20,
    recipe: ['Gin', 'Lima', 'Coctelera', 'Doble colado', 'Copa coupé'] },
  { code: 'C30', name: 'Vodka martini', color: 'bordo', symbol: 'circulo', basePoints: 5, alcohol: 25,
    recipe: ['Vodka', 'Vermut rosso', 'Vaso mezclador', 'Colador', 'Copa martini'] },
  { code: 'C31', name: 'Tequila sunrise', color: 'mostaza', symbol: 'rombo', basePoints: 4, alcohol: 15,
    recipe: ['Tequila', 'Jugo de naranja', 'Exprimidor', 'Vaso highball'] },
  { code: 'C32', name: 'Campari tonic', color: 'verde', symbol: 'rombo', basePoints: 4, alcohol: 10,
    recipe: ['Campari', 'Sifón', 'Vaso highball', 'Completar'] },
  { code: 'C33', name: 'Piscola', color: 'azul', symbol: 'estrella', basePoints: 4, alcohol: 15,
    recipe: ['Pisco', 'Coca', 'Vaso de pinta', 'Posavasos'] },
  { code: 'C34', name: 'Batido de ron', color: 'mostaza', symbol: 'circulo', basePoints: 4, alcohol: 15,
    recipe: ['Ron blanco', 'Jugo de naranja', 'Licuar', 'Copa balón'] },
  { code: 'C35', name: 'Espumante de festejo', color: 'bordo', symbol: 'triangulo', basePoints: 4, alcohol: 10,
    recipe: ['Espumante', 'Rodaja de decoración', 'Copa flauta', 'Decorar'] },
];

export const COCKTAIL_BY_CODE = new Map(COCKTAILS.map((c) => [c.code, c]));

// Si alguien escribe mal un nombre en una receta, que explote al cargar y no en medio de una partida.
for (const c of COCKTAILS) {
  for (const n of c.recipe) {
    if (!DEF_BY_NAME.has(n)) throw new Error(`Receta ${c.code} usa una carta que no existe: ${n}`);
  }
  if (new Set(c.recipe).size !== c.recipe.length) throw new Error(`Receta ${c.code} repite una carta`);
  if (c.recipe.filter((n) => DEF_BY_NAME.get(n)!.category === 'cristaleria').length !== 1) {
    throw new Error(`Receta ${c.code} tiene que llevar justo un vaso`);
  }
}

/**
 * Cuántas copias lleva cada nombre: lo que entra en muchas recetas aparece más (la Lima está en 13).
 * Mazo completo: 177 cartas. Con "mazo chico" se usa la mitad de copias de cada nombre (redondeando para arriba).
 */
export function copiesFor(name: string): number {
  if (name === COMMON_GLASS) return COMMON_GLASS_COPIES;
  const uses = COCKTAILS.filter((c) => c.recipe.includes(name)).length;
  if (uses >= 8) return 6;
  if (uses >= 4) return 4;
  if (uses >= 2) return 3;
  return 2;
}

type Combo = { color: Color; symbol: CardSymbol; number: CardNumber };

/** Semilla fija: los atributos impresos de cada copia son siempre los mismos, como un mazo físico. */
const PRINT_SEED = 20261018;

export interface PrintedCard {
  defCode: string;
  name: string;
  category: Category;
  copy: number;
  color: Color;
  symbol: CardSymbol;
  number: CardNumber;
}

/**
 * El mazo impreso. Los atributos salen de recorrer las 64 combinaciones de color × símbolo × número
 * mezcladas, una y otra vez, así cada color, símbolo y número aparece casi la misma cantidad de veces.
 * Las copias de un mismo nombre nunca son iguales.
 */
export const PRINTED_DECK: PrintedCard[] = (() => {
  const rand = mulberry32(PRINT_SEED);
  const all: Combo[] = [];
  for (const color of COLORS) for (const symbol of SYMBOLS) for (const number of NUMBERS) all.push({ color, symbol, number });
  let pool: Combo[] = [];
  const out: PrintedCard[] = [];
  for (const def of CARD_DEFS) {
    const taken = new Set<string>();
    for (let copy = 0; copy < copiesFor(def.name); copy++) {
      if (pool.length === 0) pool = shuffleInPlace([...all], rand);
      let i = pool.findIndex((c) => !taken.has(`${c.color}|${c.symbol}|${c.number}`));
      if (i < 0) i = 0;
      const combo = pool.splice(i, 1)[0]!;
      taken.add(`${combo.color}|${combo.symbol}|${combo.number}`);
      out.push({ defCode: def.code, name: def.name, category: def.category, copy, ...combo });
    }
  }
  return out;
})();
