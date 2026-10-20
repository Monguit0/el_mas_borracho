/**
 * Reacciones: emojis que cualquier jugador puede mandar a la sala. Solo se aceptan los de esta
 * lista, así nadie puede mandar texto libre por acá.
 */
export const REACTION_EMOJIS = ['😂', '🔥', '😱', '👏', '🍀', '💀', '😎', '🙏', '😡', '🤫', '🃏', '🎉'] as const;

export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

export function isReactionEmoji(value: unknown): value is ReactionEmoji {
  return typeof value === 'string' && (REACTION_EMOJIS as readonly string[]).includes(value);
}

/** Lo que reciben todos en la sala cuando alguien reacciona. */
export interface Reaction {
  /** Único dentro del servidor, para animar cada burbuja por separado. */
  readonly id: string;
  readonly playerId: string;
  readonly emoji: ReactionEmoji;
}
