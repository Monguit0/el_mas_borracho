/**
 * Qué conexión (socket) corresponde a qué jugador. Una identidad tiene
 * como mucho una conexión activa a la vez.
 */
export interface Binding {
  readonly roomId: string;
  readonly playerId: string;
}

export class ConnectionService {
  private readonly bySocket = new Map<string, Binding>();
  private readonly byPlayer = new Map<string, string>();

  bind(socketId: string, binding: Binding): void {
    this.unbind(socketId);
    this.bySocket.set(socketId, binding);
    this.byPlayer.set(key(binding), socketId);
  }

  /** Devuelve la asociación que tenía el socket, si tenía. */
  unbind(socketId: string): Binding | null {
    const binding = this.bySocket.get(socketId);
    if (!binding) return null;
    this.bySocket.delete(socketId);
    if (this.byPlayer.get(key(binding)) === socketId) this.byPlayer.delete(key(binding));
    return binding;
  }

  bindingOf(socketId: string): Binding | null {
    return this.bySocket.get(socketId) ?? null;
  }

  socketOf(binding: Binding): string | null {
    return this.byPlayer.get(key(binding)) ?? null;
  }

  get size(): number {
    return this.bySocket.size;
  }
}

function key(binding: Binding): string {
  return `${binding.roomId}:${binding.playerId}`;
}
