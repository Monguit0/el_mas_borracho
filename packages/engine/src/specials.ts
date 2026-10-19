// Las cartas especiales: una mano aparte, secreta, que se compra con puntos.
// Cuanto más poderosa la carta, menos copias hay en el mazo (decidido por osky).

/** 'turno': se juega en tu turno. 'coctel': se suma a un cóctel que lanzás. 'respuesta': cuando te tiran un cóctel. */
export type SpecialKind = 'turno' | 'coctel' | 'respuesta';
export type Rarity = 'comun' | 'poco_comun' | 'rara' | 'ultra_rara';

export type SpecialCode =
  | 'no_gracias'
  | 'mani'
  | 'semana_dificil'
  | 'vos_tambien'
  | 'empanadas'
  | 'ronda_shots'
  | 'tomatelo_vos'
  | 'choripan'
  | 'conductor'
  | 'doblalo'
  | 'jarra'
  | 'proba_el_mio';

export interface SpecialDef {
  code: SpecialCode;
  name: string;
  kind: SpecialKind;
  rarity: Rarity;
  text: string;
}

export interface SpecialCard {
  id: string;
  code: SpecialCode;
  name: string;
  kind: SpecialKind;
  rarity: Rarity;
}

export const COPIES_BY_RARITY: Record<Rarity, number> = { comun: 4, poco_comun: 3, rara: 2, ultra_rara: 1 };

export const SPECIAL_DEFS: readonly SpecialDef[] = [
  { code: 'no_gracias', name: 'No, gracias', kind: 'respuesta', rarity: 'comun', text: 'Rechazás el cóctel: nadie lo toma y nadie cobra.' },
  { code: 'mani', name: 'Maní', kind: 'turno', rarity: 'comun', text: 'El próximo cóctel que tomes te pega la mitad.' },
  { code: 'semana_dificil', name: 'Semana difícil', kind: 'coctel', rarity: 'comun', text: 'El cóctel que tirás pega 15% más.' },
  { code: 'vos_tambien', name: '¡Vos también!', kind: 'respuesta', rarity: 'poco_comun', text: 'Te lo tomás, pero el que te lo tiró también.' },
  { code: 'empanadas', name: 'Empanadas', kind: 'turno', rarity: 'poco_comun', text: 'Los próximos 2 cócteles que tomes te pegan la mitad.' },
  { code: 'ronda_shots', name: 'Ronda de shots', kind: 'turno', rarity: 'poco_comun', text: 'Todos toman un shot, vos también.' },
  { code: 'tomatelo_vos', name: '¡Tomátelo vos!', kind: 'respuesta', rarity: 'rara', text: 'El que te lo tiró se lo toma y no cobra.' },
  { code: 'choripan', name: 'Choripán', kind: 'turno', rarity: 'rara', text: 'Hasta tu próximo turno, todo lo que te hagan tomar te pega la mitad.' },
  { code: 'conductor', name: 'Conductor designado', kind: 'turno', rarity: 'rara', text: 'Hasta tu próximo turno nadie te puede tirar nada.' },
  { code: 'doblalo', name: 'Doblalo y dáselo al siguiente', kind: 'respuesta', rarity: 'rara', text: 'El cóctel pasa al siguiente en la mesa con el doble de alcohol.' },
  { code: 'jarra', name: 'Jarra grande', kind: 'coctel', rarity: 'ultra_rara', text: 'El cóctel pega el doble y se reparte entre todos los rivales.' },
  { code: 'proba_el_mio', name: '¡Probá el mío!', kind: 'respuesta', rarity: 'ultra_rara', text: 'Te lo tomás y le tirás un cóctel de tu mano al que te lo tiró. No se puede responder.' },
];

export const SPECIAL_BY_CODE = new Map(SPECIAL_DEFS.map((d) => [d.code, d]));

/** El mazo especial impreso: las copias de cada carta según su rareza. */
export function printedSpecials(): Omit<SpecialCard, 'id'>[] {
  return SPECIAL_DEFS.flatMap((d) =>
    Array.from({ length: COPIES_BY_RARITY[d.rarity] }, () => ({ code: d.code, name: d.name, kind: d.kind, rarity: d.rarity })),
  );
}
