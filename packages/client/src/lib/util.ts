export function sameIds(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedB = [...b].sort();
  return [...a].sort().every((id, i) => id === sortedB[i]);
}

/** localStorage/sessionStorage pueden no existir o tirar error (modo privado, bloqueos). */
export function readStorage<T>(kind: 'local' | 'session', key: string): T | null {
  try {
    const storage = kind === 'local' ? window.localStorage : window.sessionStorage;
    const raw = storage.getItem(key);
    return raw === null ? null : (JSON.parse(raw) as T);
  } catch {
    return null;
  }
}

export function writeStorage(kind: 'local' | 'session', key: string, value: unknown): void {
  try {
    const storage = kind === 'local' ? window.localStorage : window.sessionStorage;
    if (value === null || value === undefined) storage.removeItem(key);
    else storage.setItem(key, JSON.stringify(value));
  } catch {
    // Sin almacenamiento la partida funciona igual; solo no se recupera al recargar.
  }
}

type Handler<T> = (payload: T) => void;

/** Emisor mínimo y tipado. */
export class Emitter<Events extends Record<string, unknown>> {
  private handlers = new Map<keyof Events, Set<Handler<never>>>();

  on<K extends keyof Events>(type: K, handler: Handler<Events[K]>): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(handler as Handler<never>);
    return () => set.delete(handler as Handler<never>);
  }

  emit<K extends keyof Events>(type: K, payload: Events[K]): void {
    for (const handler of this.handlers.get(type) ?? []) (handler as Handler<Events[K]>)(payload);
  }
}
