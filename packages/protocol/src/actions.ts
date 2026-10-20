/**
 * Las jugadas tal como las manda el celular. Todo se valida con un esquema estricto: un campo de más
 * o de otro tipo y se rechaza. Las opciones de una elección van por el id que trae la vista.
 */
import type { Action } from '@borracho/engine';

export type WireAction = Action;

const MAX_ID = 32;

type Obj = Record<string, unknown>;

function isPlainObject(value: unknown): value is Obj {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function only(o: Obj, keys: readonly string[]): boolean {
  return keys.every((k) => k in o) && Object.keys(o).every((k) => keys.includes(k));
}

/** Devuelve la jugada validada, o null si no tiene la forma correcta. */
export function parseWireAction(payload: unknown): WireAction | null {
  if (!isPlainObject(payload) || typeof payload['type'] !== 'string') return null;
  const p = payload;
  switch (p['type']) {
    case 'HIT':
    case 'STAND':
    case 'REST':
    case 'NEXT_ROUND':
      return only(p, ['type']) ? { type: p['type'] } : null;
    case 'CHOOSE': {
      const id = p['optionId'];
      return only(p, ['type', 'optionId']) && typeof id === 'string' && id.length > 0 && id.length <= MAX_ID ? { type: 'CHOOSE', optionId: id } : null;
    }
    default:
      return null;
  }
}
