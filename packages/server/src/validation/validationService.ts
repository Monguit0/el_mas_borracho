/**
 * Validación de todo lo que llega por Socket.IO. Los esquemas son estrictos: un campo de más o de
 * otro tipo hace que se rechace el pedido. Las jugadas las valida parseWireAction.
 */
import {
  OPTION_VALUES,
  isReactionEmoji,
  normalizeName,
  normalizeRoomCode,
  parseWireAction,
  roomError,
  type AppError,
  type ReactionEmoji,
  type RoomOptions,
  type WireAction,
} from '@borracho/protocol';

export type Valid<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: AppError };

const invalid = (): Valid<never> => ({ ok: false, error: roomError('INVALID_PAYLOAD') });

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

export class ValidationService {
  constructor(
    private readonly nameMaxLength: number,
    private readonly players: { readonly min: number; readonly max: number },
  ) {}

  name(raw: unknown): Valid<string> {
    const name = normalizeName(raw, this.nameMaxLength);
    return name
      ? { ok: true, value: name }
      : { ok: false, error: roomError('INVALID_NAME', `Escribí un nombre de 1 a ${this.nameMaxLength} caracteres.`) };
  }

  capacity(raw: unknown): Valid<number> {
    const { min, max } = this.players;
    return typeof raw === 'number' && Number.isInteger(raw) && raw >= min && raw <= max
      ? { ok: true, value: raw }
      : { ok: false, error: roomError('INVALID_CAPACITY', `La capacidad tiene que ser de ${min} a ${max} jugadores.`) };
  }

  /** Opciones de la sala: solo las conocidas y con sus valores permitidos. */
  options(raw: unknown): Valid<Partial<RoomOptions>> {
    if (!isPlainObject(raw) || !hasOnlyKeys(raw, Object.keys(OPTION_VALUES))) return { ok: false, error: roomError('INVALID_OPTIONS') };
    for (const [key, value] of Object.entries(raw)) {
      const allowed = OPTION_VALUES[key as keyof RoomOptions] as readonly unknown[];
      if (!allowed.includes(value)) return { ok: false, error: roomError('INVALID_OPTIONS') };
    }
    return { ok: true, value: raw as Partial<RoomOptions> };
  }

  createRoom(payload: unknown): Valid<{ name: string; maxPlayers: number; options: Partial<RoomOptions> }> {
    if (!isPlainObject(payload) || !hasOnlyKeys(payload, ['name', 'maxPlayers', 'options'])) return invalid();
    const name = this.name(payload['name']);
    if (!name.ok) return name;
    const maxPlayers = payload['maxPlayers'] === undefined ? { ok: true as const, value: this.players.max } : this.capacity(payload['maxPlayers']);
    if (!maxPlayers.ok) return maxPlayers;
    const options = payload['options'] === undefined ? { ok: true as const, value: {} } : this.options(payload['options']);
    if (!options.ok) return options;
    return { ok: true, value: { name: name.value, maxPlayers: maxPlayers.value, options: options.value } };
  }

  react(payload: unknown): Valid<ReactionEmoji> {
    if (!isPlainObject(payload) || !hasOnlyKeys(payload, ['emoji'])) return invalid();
    const emoji = payload['emoji'];
    return isReactionEmoji(emoji) ? { ok: true, value: emoji } : invalid();
  }

  joinRoom(payload: unknown): Valid<{ name: string; code: string }> {
    if (!isPlainObject(payload) || !hasOnlyKeys(payload, ['name', 'code'])) return invalid();
    const name = this.name(payload['name']);
    if (!name.ok) return name;
    const code = normalizeRoomCode(payload['code']);
    if (!code) return { ok: false, error: roomError('INVALID_CODE') };
    return { ok: true, value: { name: name.value, code } };
  }

  resume(payload: unknown): Valid<{ token: string; takeover: boolean }> {
    if (!isPlainObject(payload) || !hasOnlyKeys(payload, ['token', 'takeover'])) return invalid();
    const { token, takeover } = payload;
    if (typeof token !== 'string' || token.length > 64) return invalid();
    if (takeover !== undefined && typeof takeover !== 'boolean') return invalid();
    return { ok: true, value: { token, takeover: takeover === true } };
  }

  setCapacity(payload: unknown): Valid<number> {
    if (!isPlainObject(payload) || !hasOnlyKeys(payload, ['maxPlayers'])) return invalid();
    return this.capacity(payload['maxPlayers']);
  }

  kick(payload: unknown): Valid<string> {
    if (!isPlainObject(payload) || !hasOnlyKeys(payload, ['playerId'])) return invalid();
    const id = payload['playerId'];
    return typeof id === 'string' && id.length > 0 && id.length <= 64 ? { ok: true, value: id } : invalid();
  }

  empty(payload: unknown): Valid<null> {
    if (payload === undefined || payload === null) return { ok: true, value: null };
    return isPlainObject(payload) && Object.keys(payload).length === 0 ? { ok: true, value: null } : invalid();
  }

  gameAction(payload: unknown): Valid<WireAction> {
    const action = parseWireAction(payload);
    return action ? { ok: true, value: action } : invalid();
  }
}
