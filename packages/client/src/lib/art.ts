// Dibujos de las cartas (los genera osky y van en public/art). Las que no tienen dibujo siguen con el ícono.

/** Por nombre de carta. Borracho el nombre llega mezclado y no matchea: se ve el ícono, no se delata la carta. */
const CARD_ART: Record<string, string> = {
  'Botella cortada': '/art/botella-cortada.webp',
};

/** Por código de cóctel. */
const COCKTAIL_ART: Record<string, string> = {
  C02: '/art/fernet-con-coca.webp',
};

export const cardArt = (name: string): string | undefined => CARD_ART[name];
export const cocktailArt = (code: string): string | undefined => COCKTAIL_ART[code];
