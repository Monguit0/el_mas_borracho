import type { GameEvent } from '@borracho/engine';
import type { Reaction, RoomNotice } from '@borracho/protocol';

export interface FeedEvents extends Record<string, unknown> {
  game: readonly GameEvent[];
  notice: RoomNotice;
  reaction: Reaction;
}

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';
