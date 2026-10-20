import { useEffect, type ReactNode } from 'react';
import { sfx } from '../lib/sound';

/** Una hoja que sube desde abajo, sobre la mesa. Tocar afuera la cierra (si se puede cerrar). */
export function Sheet({ children, onClose, label }: { children: ReactNode; onClose?: () => void; label: string }) {
  useEffect(() => sfx.whoosh(), []);
  useEffect(() => {
    if (!onClose) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={label} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
