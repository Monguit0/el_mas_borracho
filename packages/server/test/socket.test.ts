import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  expectError,
  expectOk,
  hook,
  next,
  pause,
  record,
  request,
  roomOf,
  seatPlayers,
  startGame,
  startTestServer,
  until,
  type Seat,
  type TestServer,
} from './helpers.js';

let t: TestServer;
beforeEach(async () => {
  t = await startTestServer();
});
afterEach(async () => {
  await t.close();
});

/** Le fija las cartas a uno (la primera es la oculta) y las de arriba del mazo, y espera a que su celular lo vea. */
async function giveCards(code: string, seat: Seat, cards: string[], top: string[] = []) {
  const before = seat.view.room?.version ?? 0;
  await hook(t, code, 'hand', { name: seat.name, cards, top });
  return until(seat, (r) => r.version > before);
}

describe('sala de espera', () => {
  it('crear y unirse: todos ven la lista en vivo', async () => {
    const host = await t.client();
    const grant = expectOk(await request(host, 'room:create', { name: 'Ana' }));
    expect(grant.room.code).toMatch(/^[A-Z2-9]{6}$/);
    expect(grant.token).toHaveLength(43);
    const guest = await t.client();
    const seen = next(host, 'room:state', (r) => r.players.length === 2);
    const joined = expectOk(await request(guest, 'room:join', { name: 'Beto', code: grant.room.code.toLowerCase() }));
    expect(joined.room.players.map((p) => p.name)).toEqual(['Ana', 'Beto']);
    expect((await seen).players[1]).toMatchObject({ name: 'Beto', isHost: false, isConnected: true });
  });

  it('rechaza nombres repetidos, códigos que no existen y salas llenas', async () => {
    const { code, seats } = await seatPlayers(t, ['Ana', 'Beto'], 3);
    const c = await t.client();
    expect(expectError(await request(c, 'room:join', { name: 'ana', code }))).toBe('NAME_TAKEN');
    expect(expectError(await request(c, 'room:join', { name: 'Caro', code: 'ZZZZZZ' }))).toBe('ROOM_NOT_FOUND');
    expect(expectError(await request(c, 'room:join', { name: '', code }))).toBe('INVALID_NAME');
    expectOk(await request(seats[0]!.socket, 'room:setCapacity', { maxPlayers: 2 }));
    expect(expectError(await request(c, 'room:join', { name: 'Caro', code }))).toBe('ROOM_FULL');
  });

  it('el anfitrión elige las opciones; nadie más', async () => {
    const { seats } = await seatPlayers(t, ['Ana', 'Beto']);
    const [ana, beto] = seats as [Seat, Seat];
    expect(expectError(await request(beto.socket, 'room:setOptions', { rounds: 5 }))).toBe('NOT_HOST');
    expect(expectError(await request(ana.socket, 'room:setOptions', { rounds: 7 }))).toBe('INVALID_OPTIONS');
    expect(expectError(await request(ana.socket, 'room:setOptions', { trampa: 1 }))).toBe('INVALID_OPTIONS');
    const seen = until(beto, (r) => r.options.rounds === 5);
    expectOk(await request(ana.socket, 'room:setOptions', { rounds: 5, turnSeconds: 60 }));
    expect((await seen).options).toEqual({ rounds: 5, turnSeconds: 60 });
  });

  it('las opciones pasan a la partida', async () => {
    const { seats } = await seatPlayers(t, ['Ana', 'Beto']);
    expectOk(await request(seats[0]!.socket, 'room:setOptions', { rounds: 5 }));
    expectOk(await request(seats[0]!.socket, 'room:start', {}));
    const room = await until(seats[1]!, (r) => r.status === 'PLAYING');
    expect(room.game!.rounds).toBe(5);
    expect(room.game!.deckCount).toBe(52 - 4);
    expect(room.game!.deadline).toBeGreaterThan(0);
  });

  it('no se puede empezar solo ni lo empieza otro que no sea el anfitrión', async () => {
    const { seats } = await seatPlayers(t, ['Ana']);
    expect(expectError(await request(seats[0]!.socket, 'room:start', {}))).toBe('NOT_ENOUGH_PLAYERS');
    const beto = await t.client();
    expectOk(await request(beto, 'room:join', { name: 'Beto', code: seats[0]!.grant.room.code }));
    expect(expectError(await request(beto, 'room:start', {}))).toBe('NOT_HOST');
  });

  it('rechaza pedidos con campos de más', async () => {
    const c = await t.client();
    expect(expectError(await request(c, 'room:create', { name: 'Ana', admin: true }))).toBe('INVALID_PAYLOAD');
    expect(expectError(await request(c, 'game:action', { type: 'HIT' }))).toBe('NOT_IN_ROOM');
  });
});

describe('partida', () => {
  it('cada uno ve sus 2 cartas; de los demás, solo la que está a la vista', async () => {
    const { current, others } = await startGame(t, ['Ana', 'Beto', 'Caro']);
    const mine = current.view.room!.game!;
    const me = mine.players.find((p) => p.id === current.id)!;
    expect(me.cards).toHaveLength(2);
    expect(me.cards.every((c) => c.card !== null)).toBe(true);
    for (const other of others) {
      const seen = mine.players.find((p) => p.id === other.id)!;
      expect(seen.cards[0]!.card).toBeNull();
      expect(seen.cards[1]!.card).not.toBeNull();
      expect(seen.totalKnown).toBe(false);
    }
  });

  it('privacidad: nadie recibe la carta oculta ni el token de otro', async () => {
    const table = await seatPlayers(t, ['Ana', 'Beto']);
    const [ana, beto] = table.seats as [Seat, Seat];
    const seenByBeto: string[] = [];
    for (const event of ['room:state', 'game:events', 'room:notice'] as const) {
      beto.socket.on(event, (payload: unknown) => seenByBeto.push(JSON.stringify(payload)));
    }
    expectOk(await request(ana.socket, 'room:start', {}));
    await until(beto, (r) => r.status === 'PLAYING');
    await pause(50);
    const room = roomOf(t, table.code);
    const hidden = room.game!.players.find((p) => p.id === ana.id)!.cards[0]!.card.id;
    const all = seenByBeto.join('\n');
    expect(all).not.toContain(ana.grant.token);
    expect(all).not.toContain(`"id":"${hidden}"`);
    expect(all).not.toContain('rngState');
    expect(all).not.toContain('"deck"');
  });

  it('pedir hasta pasarse: le toca al otro y todos se enteran', async () => {
    const { code, current, others } = await startGame(t, ['Ana', 'Beto']);
    await giveCards(code, current, ['KS', '9C'], ['5D']);
    const bust = next(others[0]!.socket, 'game:events', (b) => b.events.some((e) => e.type === 'BUST'));
    expectOk(await request(current.socket, 'game:action', { type: 'HIT' }));
    expect((await bust).events.find((e) => e.type === 'BUST')).toMatchObject({ playerId: current.id, total: 24 });
    const room = await until(others[0]!, (r) => r.game!.players.find((p) => p.id === current.id)!.status === 'busted');
    expect(room.game!.currentId).not.toBe(current.id);
  });

  it('un efecto con elección: solo el que elige ve las opciones', async () => {
    const { code, current, others } = await startGame(t, ['Ana', 'Beto']);
    await giveCards(code, current, ['3C', '4C'], ['4C']);
    expectOk(await request(current.socket, 'game:action', { type: 'HIT' }));
    const mine = await until(current, (r) => r.game?.pending !== null);
    expect(mine.game!.pending!.options.map((o) => o.id)).toEqual([others[0]!.id]);
    const theirs = await until(others[0]!, (r) => r.game?.choosing !== null);
    expect(theirs.game!.pending).toBeNull();
    expect(expectError(await request(current.socket, 'game:action', { type: 'CHOOSE', optionId: 'nadie' }))).toBe('BAD_OPTION');
    expectOk(await request(current.socket, 'game:action', { type: 'CHOOSE', optionId: others[0]!.id }));
    const after = await until(current, (r) => r.game?.pending === null);
    expect(after.game!.players.find((p) => p.id === current.id)!.chips).toBe(10);
  });

  it('si no juega a tiempo, se planta solo', async () => {
    await t.close();
    t = await startTestServer({ turnTimeoutMs: 150 });
    const { current } = await startGame(t, ['Ana', 'Beto']);
    const room = await until(current, (r) => r.game?.currentId !== current.id);
    expect(room.game!.players.find((p) => p.id === current.id)!.status).not.toBe('playing');
  });

  it('jugadas fuera de turno se rechazan con el mensaje en español', async () => {
    const { others } = await startGame(t, ['Ana', 'Beto']);
    const ack = await request(others[0]!.socket, 'game:action', { type: 'HIT' });
    expect(ack).toEqual({ ok: false, error: { code: 'NOT_YOUR_TURN', message: 'No es tu turno.' } });
    expect(expectError(await request(others[0]!.socket, 'game:action', { type: 'HIT', card: 'x' }))).toBe('INVALID_PAYLOAD');
  });
});

describe('desconexiones y salidas', () => {
  it('vuelve con su token y sigue la partida donde estaba', async () => {
    const { current, others } = await startGame(t, ['Ana', 'Beto']);
    const rival = others[0]!;
    const notice = next(current.socket, 'room:notice', (n) => n.type === 'PLAYER_DISCONNECTED');
    rival.socket.disconnect();
    await notice;
    const back = await t.client();
    const grant = expectOk(await request(back, 'session:resume', { token: rival.grant.token }));
    expect(grant.playerId).toBe(rival.id);
    expect(grant.room.game!.players.find((p) => p.id === rival.id)!.cards).toHaveLength(2);
    expect(grant.room.players.find((p) => p.id === rival.id)!.isConnected).toBe(true);
  });

  it('la misma sesión en otra pestaña: pregunta, y si la toma, la vieja se entera', async () => {
    const { seats } = await seatPlayers(t, ['Ana', 'Beto']);
    const ana = seats[0]!;
    const other = await t.client();
    expect(expectError(await request(other, 'session:resume', { token: ana.grant.token }))).toBe('SESSION_IN_USE');
    const ended = next(ana.socket, 'session:ended');
    expectOk(await request(other, 'session:resume', { token: ana.grant.token, takeover: true }));
    expect(await ended).toEqual({ reason: 'REPLACED' });
    expect(expectError(await request(other, 'session:resume', { token: 'x'.repeat(43) }))).toBe('SESSION_NOT_FOUND');
  });

  it('si se va uno en una partida de dos, gana el otro, y se puede jugar otra', async () => {
    const { current, others } = await startGame(t, ['Ana', 'Beto']);
    const finished = until(current, (r) => r.status === 'FINISHED');
    expectOk(await request(others[0]!.socket, 'room:leave', {}));
    const room = await finished;
    expect(room.game!.winnerId).toBe(current.id);
    expect(room.game!.players.find((p) => p.id === others[0]!.id)!.outReason).toBe('abandono');
    const waiting = until(current, (r) => r.status === 'WAITING');
    expectOk(await request(current.socket, 'room:reopen', {}));
    expect((await waiting).players.map((p) => p.id)).toEqual([current.id]);
  });

  it('el anfitrión saca a uno desconectado en medio de la partida y sigue el turno', async () => {
    const { seats, current } = await startGame(t, ['Ana', 'Beto', 'Caro']);
    const host = seats[0]!;
    const gone = current === host ? seats[1]! : current;
    expect(expectError(await request(host.socket, 'room:kick', { playerId: gone.id }))).toBe('PLAYER_STILL_CONNECTED');
    const notice = next(host.socket, 'room:notice', (n) => n.type === 'PLAYER_DISCONNECTED');
    gone.socket.disconnect();
    await notice;
    expectOk(await request(host.socket, 'room:kick', { playerId: gone.id }));
    const room = await until(host, (r) => r.players.length === 2);
    expect(room.status).toBe('PLAYING');
    expect(room.game!.players.find((p) => p.id === gone.id)!.status).toBe('out');
    expect(room.game!.currentId).not.toBe(gone.id);
  });

  it('si el anfitrión se va, pasa a otro con aviso', async () => {
    const { seats } = await seatPlayers(t, ['Ana', 'Beto']);
    const notice = next(seats[1]!.socket, 'room:notice', (n) => n.type === 'HOST_CHANGED');
    expectOk(await request(seats[0]!.socket, 'room:leave', {}));
    expect(await notice).toMatchObject({ playerId: seats[1]!.id });
  });

  it('una sala sin nadie se borra después de un rato', async () => {
    const { code, seats } = await seatPlayers(t, ['Ana']);
    seats[0]!.socket.disconnect();
    await pause(50);
    t.clock.advance(31 * 60_000);
    t.server.sweep();
    expect(t.server.rooms.getByCode(code)).toBeUndefined();
  });
});

describe('emojis', () => {
  it('llegan a todos, y solo los de la lista', async () => {
    const { seats } = await seatPlayers(t, ['Ana', 'Beto']);
    const got = record(seats[1]!.socket, 'room:reaction');
    expectOk(await request(seats[0]!.socket, 'room:react', { emoji: '🔥' }));
    expect(expectError(await request(seats[0]!.socket, 'room:react', { emoji: 'hola' }))).toBe('INVALID_PAYLOAD');
    await pause(50);
    expect(got.map((r) => r.emoji)).toEqual(['🔥']);
  });
});
