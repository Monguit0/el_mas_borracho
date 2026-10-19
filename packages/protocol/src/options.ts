/** Opciones de la sala: las elige el anfitrión en la sala de espera. */
export interface RoomOptions {
  /** Tamaño de la barra: 100 (normal) o 150 (partida larga). */
  readonly barMax: 100 | 150;
  /** Segundos para responder cuando te tiran un cóctel. */
  readonly defenseSeconds: 6 | 10;
  /** 2 = mazo completo, 1 = mazo chico. */
  readonly deckCopies: 1 | 2;
}

export const DEFAULT_ROOM_OPTIONS: RoomOptions = Object.freeze({ barMax: 100, defenseSeconds: 6, deckCopies: 2 });

export const OPTION_VALUES: { readonly [K in keyof RoomOptions]: readonly RoomOptions[K][] } = {
  barMax: [100, 150],
  defenseSeconds: [6, 10],
  deckCopies: [1, 2],
};

export const PLAYER_LIMITS = Object.freeze({ min: 2, max: 6 });
