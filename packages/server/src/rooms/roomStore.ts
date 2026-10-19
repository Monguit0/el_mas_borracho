import type { Room } from './types.js';

/**
 * Almacenamiento de salas. La versión del MVP es en memoria: un
 * reinicio del servidor termina las partidas. Para escalar con Redis basta
 * con otra implementación de esta interfaz; el motor no cambia.
 */
export interface RoomStore {
  get(id: string): Room | undefined;
  getByCode(code: string): Room | undefined;
  insert(room: Room): void;
  delete(id: string): void;
  all(): IterableIterator<Room>;
  readonly size: number;
}

export class InMemoryRoomStore implements RoomStore {
  private readonly byId = new Map<string, Room>();
  private readonly idByCode = new Map<string, string>();

  get(id: string): Room | undefined {
    return this.byId.get(id);
  }

  getByCode(code: string): Room | undefined {
    const id = this.idByCode.get(code);
    return id === undefined ? undefined : this.byId.get(id);
  }

  insert(room: Room): void {
    if (this.idByCode.has(room.code)) throw new Error('Código de sala repetido');
    this.byId.set(room.id, room);
    this.idByCode.set(room.code, room.id);
  }

  delete(id: string): void {
    const room = this.byId.get(id);
    if (!room) return;
    this.byId.delete(id);
    this.idByCode.delete(room.code);
  }

  all(): IterableIterator<Room> {
    return this.byId.values();
  }

  get size(): number {
    return this.byId.size;
  }
}
