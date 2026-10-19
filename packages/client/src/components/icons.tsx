import type { ReactNode } from 'react';
import type { CardSymbol, Category } from '@borracho/engine';

interface IconProps {
  size?: number;
  color?: string;
  width?: number;
}

function stroke(path: ReactNode) {
  return function Icon({ size = 16, color = 'currentColor', width = 2 }: IconProps) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {path}
      </svg>
    );
  };
}

export const BackIcon = stroke(<path d="M15 18l-6-6 6-6" />);
export const CloseIcon = stroke(<path d="M6 6l12 12M18 6L6 18" />);
export const ShareIcon = stroke(
  <>
    <circle cx="18" cy="5" r="3" />
    <circle cx="6" cy="12" r="3" />
    <circle cx="18" cy="19" r="3" />
    <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
  </>,
);
export const ResumeIcon = stroke(
  <>
    <path d="M3 12a9 9 0 1 0 3-6.7" />
    <path d="M3 4v5h5" />
  </>,
);
export const StarIcon = stroke(<path d="M12 3l2.6 5.6 6.1.6-4.6 4.1 1.3 6L12 16.3 6.6 19.3l1.3-6L3.3 9.2l6.1-.6z" />);
export const CardsIcon = stroke(
  <>
    <rect x="3" y="6" width="12" height="15" rx="2" />
    <path d="M8 3h11a2 2 0 0 1 2 2v13" />
  </>,
);
export const ShameIcon = stroke(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M8 15c2-1.5 6-1.5 8 0" />
    <path d="M9 9.5h.01M15 9.5h.01" />
  </>,
);
export const CarIcon = stroke(
  <>
    <path d="M5 16l1.5-5h11l1.5 5" />
    <rect x="3" y="16" width="18" height="4" rx="1" />
  </>,
);
export const FoodIcon = stroke(
  <>
    <path d="M4 14h16a8 8 0 0 1-16 0z" />
    <path d="M8 10c0-2 2-2 2-4M13 10c0-2 2-2 2-4" />
  </>,
);
export const BookIcon = stroke(
  <>
    <path d="M4 4h7a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4z" />
    <path d="M20 4h-6a3 3 0 0 0-3 3" />
    <path d="M20 4v14h-6" />
  </>,
);
export const GlassIcon = stroke(<path d="M6 3h12l-1.5 17a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1z" />);
export const DropIcon = stroke(<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z" />);
export const CupIcon = stroke(
  <>
    <path d="M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z" />
    <path d="M17 11h1.5a2.5 2.5 0 0 1 0 5H17" />
  </>,
);
export const SwapIcon = stroke(
  <>
    <path d="M7 7h11l-3-3" />
    <path d="M17 17H6l3 3" />
  </>,
);
export const PlusIcon = stroke(<path d="M12 5v14M5 12h14" />);
export const CheckIcon = stroke(<path d="M5 12l5 5 9-10" />);
export const InfoIcon = stroke(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8v5M12 16h.01" />
  </>,
);
export const MenuIcon = stroke(<path d="M4 7h16M4 12h16M4 17h16" />);

const SYMBOL_PATHS: Record<CardSymbol, ReactNode> = {
  estrella: <path d="M12 2l3 6.5 7 .8-5.2 4.8 1.4 7L12 17.6 5.8 21l1.4-7L2 9.3l7-.8z" />,
  triangulo: <path d="M12 3l10 18H2z" />,
  circulo: <circle cx="12" cy="12" r="9.5" />,
  rombo: <path d="M12 2l10 10-10 10L2 12z" />,
};

export function SymbolIcon({ symbol, size = 13, color = 'currentColor' }: { symbol: CardSymbol; size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-label={symbol}>
      {SYMBOL_PATHS[symbol]}
    </svg>
  );
}

const ART_PATHS: Record<Category, ReactNode> = {
  ingrediente: (
    <>
      <path d="M10 2h4v4l2 3v12a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V9l2-3z" />
      <path d="M8 13h8" />
    </>
  ),
  cristaleria: (
    <>
      <path d="M6 3h12l-1.5 17a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1z" />
      <path d="M6.5 8h11" />
    </>
  ),
  utensilio: (
    <>
      <path d="M8 8h8l-1 13H9z" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" />
      <path d="M11 3h2" />
    </>
  ),
  tecnica: (
    <>
      <path d="M4 14c2-4 6-4 8 0s6 4 8 0" />
      <path d="M4 9c2-4 6-4 8 0s6 4 8 0" />
    </>
  ),
};

export function ArtIcon({ category, size = 26, color = '#F1E8D6' }: { category: Category; size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ART_PATHS[category]}
    </svg>
  );
}

export function GlassLogo() {
  return (
    <svg width="70" height="80" viewBox="0 0 70 80" fill="none" stroke="#2A1A12" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 8h54L37 40v28" />
      <path d="M22 72h30" />
      <path d="M15 16h40" />
      <circle cx="50" cy="12" r="9" stroke="#2F5E2B" />
      <path d="M50 3v18M41 12h18" stroke="#2F5E2B" />
    </svg>
  );
}
