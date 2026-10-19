import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RoomView } from '@borracho/protocol';
import {
  DESTORNILLADOR,
  FERNET,
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

const handles = (room: RoomView, names: string[]) => {
  const hand = [...room.game!.you.hand];
  return names.map((name) => {
    const i = hand.findIndex((c) => c.name === name);
    if (i < 0) throw new Error(`No tengo ${name}`);
    return hand.splice(i, 1)[0]!.handle;
  });
};

/** Le arma la mano a uno y espera a que su celular la vea. */
async function giveHand(code: string, seat: Seat, cards: string[], specials?: string[]) {
  const before = seat.view.room?.version ?? 0;
  await hook(t, code, 'hand', { name: seat.name, cards, ...(specials ? { specials } : {}) });
  return until(seat, (r) => r.version > before);
}

const filler = (n: number) => Array.from({ length: n }, () => 'Bota de vidrio');

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
    expect(expectError(await request(beto.socket, 'room:setOptions', { barMax: 150 }))).toBe('NOT_HOST');
    expect(expectError(await request(ana.socket, 'room:setOptions', { barMax: 120 }))).toBe('INVALID_OPTIONS');
    expect(expectError(await request(ana.socket, 'room:setOptions', { trampa: 1 }))).toBe('INVALID_OPTIONS');
    const seen = until(beto, (r) => r.options.barMax === 150);
    expectOk(await request(ana.socket, 'room:setOptions', { barMax: 150, defenseSeconds: 10 }));
    expect((await seen).options).toEqual({ barMax: 150, defenseSeconds: 10, deckCopies: 2 });
  });

  it('las opciones pasan a la partida', async () => {
    const { seats } = await seatPlayers(t, ['Ana', 'Beto']);
    expectOk(await request(seats[0]!.socket, 'room:setOptions', { barMax: 150, deckCopies: 1 }));
    expectOk(await request(seats[0]!.socket, 'room:start', {}));
    const room = await until(seats[1]!, (r) => r.status === 'PLAYING');
    expect(room.game!.barMax).toBe(150);
    expect(room.game!.deckCount).toBe(97 - 16 - 1 - 3);
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
    expect(expectError(await request(c, 'game:action', { type: 'WATER' }))).toBe('NOT_IN_ROOM');
  });
});

describe('partida', () => {
  it('cada uno ve su mano; de los demás, solo cuántas cartas tienen', async () => {
    const { current, others } = await startGame(t, ['Ana', 'Beto', 'Caro']);
    const mine = current.view.room!.game!;
    expect(mine.you.hand).toHaveLength(11);
    expect(mine.you.specials).toHaveLength(2);
    expect(mine.players.find((p) => p.id === current.id)).toMatchObject({ handCount: 11, specialCount: 2 });
    for (const other of others) {
      const theirs = other.view.room!.game!;
      expect(theirs.you.id).toBe(other.id);
      expect(theirs.you.hand).toHaveLength(8);
    }
  });

  it('privacidad: nadie recibe la mano, las especiales ni el token de otro', async () => {
    const table = await seatPlayers(t, ['Ana', 'Beto']);
    const [ana, beto] = table.seats as [Seat, Seat];
    const seenByBeto: string[] = [];
    for (const event of ['room:state', 'game:events', 'room:notice'] as const) {
      beto.socket.on(event, (payload: unknown) => seenByBeto.push(JSON.stringify(payload)));
    }
    expectOk(await request(ana.socket, 'room:start', {}));
    await until(beto, (r) => r.status === 'PLAYING');
    // Ana pasa a tener cartas que Beto no tiene y especiales con ids conocidos.
    await giveHand(table.code, ana, ['Soplete', 'Soplete', 'Flamear'], ['jarra', 'choripan']);
    await until(beto, (r) => r.version >= ana.view.room!.version);
    const room = roomOf(t, table.code);
    const anaState = room.game!.players.find((p) => p.id === ana.id)!;
    const all = seenByBeto.join('\n');
    expect(all).not.toContain(ana.grant.token);
    for (const sp of anaState.specials) expect(all).not.toContain(sp.id);
    for (const card of anaState.hand) expect(all).not.toContain(`"${card.id}"`);
    // Lo que robó Ana, Beto lo ve tachado.
    const drawn = seenByBeto
      .filter((s) => s.startsWith('{"version"'))
      .flatMap((s) => (JSON.parse(s) as { events: { type: string; playerId?: string; cardIds?: string[] }[] }).events)
      .filter((e) => e.type === 'CARDS_DRAWN' && e.playerId === ana.id);
    expect(drawn.length).toBeGreaterThan(0);
    for (const e of drawn) expect(e.cardIds!.every((id) => id === '?')).toBe(true);
    // Nunca viaja el mazo, la semilla ni la sal.
    expect(all).not.toContain('rngState');
    expect(all).not.toContain('viewSalt');
    expect(all).not.toContain('"deck"');
  });

  it('un cóctel con respuesta: el rival lo rechaza con "No, gracias"', async () => {
    const { code, current, others } = await startGame(t, ['Ana', 'Beto']);
    const rival = others[0]!;
    const view = await giveHand(code, current, [...DESTORNILLADOR, ...filler(4)]);
    await giveHand(code, rival, filler(8), ['no_gracias']);
    const offered = until(rival, (r) => r.game?.phase === 'defense');
    expectOk(
      await request(current.socket, 'game:action', {
        type: 'MAKE_COCKTAIL',
        cocktailCode: 'C01',
        cards: handles(current.view.room ?? view, DESTORNILLADOR),
        targetId: rival.id,
      }),
    );
    const defense = await offered;
    expect(defense.game!.pending).toMatchObject({ targetId: rival.id, alcohol: 15 });
    expect(defense.game!.defenseEndsAt).toBeGreaterThan(0);
    expect(expectError(await request(current.socket, 'game:action', { type: 'WATER' }))).toBe('WRONG_PHASE');
    const specialId = defense.game!.you.specials[0]!.id;
    const done = until(current, (r) => r.game?.phase === 'main' && r.game.pending === null);
    expectOk(await request(rival.socket, 'game:action', { type: 'RESPOND', choice: 'special', specialId }));
    const after = await done;
    expect(after.game!.players.map((p) => p.alcohol)).toEqual([0, 0]);
    expect(after.game!.you.points).toBe(0);
  });

  it('si no responde a tiempo, se lo toma', async () => {
    await t.close();
    t = await startTestServer({ defenseTimeoutMs: 150 });
    const { code, current, others } = await startGame(t, ['Ana', 'Beto']);
    const rival = others[0]!;
    await giveHand(code, current, [...DESTORNILLADOR, ...filler(4)]);
    await giveHand(code, rival, filler(8), ['mani']);
    expectOk(
      await request(current.socket, 'game:action', {
        type: 'MAKE_COCKTAIL',
        cocktailCode: 'C01',
        cards: handles(current.view.room!, DESTORNILLADOR),
        targetId: rival.id,
      }),
    );
    await until(rival, (r) => r.game?.phase === 'defense');
    const drunk = await until(rival, (r) => r.game?.phase === 'main');
    expect(drunk.game!.you.alcohol).toBe(15);
    expect(drunk.game!.defenseEndsAt).toBeNull();
    expect(drunk.game!.players.find((p) => p.id === current.id)!.points).toBe(6);
  });

  it('¡Probá el mío! viaja con handles y le devuelve un cóctel', async () => {
    const { code, current, others } = await startGame(t, ['Ana', 'Beto']);
    const rival = others[0]!;
    await giveHand(code, current, [...DESTORNILLADOR, ...filler(4)]);
    await giveHand(code, rival, [...FERNET, ...filler(5)], ['proba_el_mio']);
    expectOk(
      await request(current.socket, 'game:action', {
        type: 'MAKE_COCKTAIL',
        cocktailCode: 'C01',
        cards: handles(current.view.room!, DESTORNILLADOR),
        targetId: rival.id,
      }),
    );
    const defense = await until(rival, (r) => r.game?.phase === 'defense');
    expectOk(
      await request(rival.socket, 'game:action', {
        type: 'RESPOND',
        choice: 'special',
        specialId: defense.game!.you.specials[0]!.id,
        counter: { cocktailCode: 'C02', cards: handles(defense, FERNET) },
      }),
    );
    const after = await until(current, (r) => r.game?.phase === 'main' && r.game.you.alcohol > 0);
    expect(after.game!.players.map((p) => p.alcohol)).toEqual([15, 15]);
    expect(after.game!.you.points).toBe(6);
  });

  it('un handle viejo o inventado no sirve', async () => {
    const { current } = await startGame(t, ['Ana', 'Beto']);
    expect(expectError(await request(current.socket, 'game:action', { type: 'SWAP', card: 'hinventado' }))).toBe('CARDS_CHANGED');
    expect(expectError(await request(current.socket, 'game:action', { type: 'SWAP', card: 42 }))).toBe('INVALID_PAYLOAD');
  });

  it('jugadas fuera de turno se rechazan con el mensaje en español', async () => {
    const { others } = await startGame(t, ['Ana', 'Beto']);
    const ack = await request(others[0]!.socket, 'game:action', { type: 'WATER' });
    expect(ack).toEqual({ ok: false, error: { code: 'NOT_YOUR_TURN', message: 'No es tu turno.' } });
  });

  it('los eventos llegan a cada uno: lo que roba otro, tachado', async () => {
    const { code, current, others } = await startGame(t, ['Ana', 'Beto']);
    await giveHand(code, current, filler(9));
    const mine = next(current.socket, 'game:events', (b) => b.events.some((e) => e.type === 'CARDS_DRAWN'));
    const theirs = next(others[0]!.socket, 'game:events', (b) => b.events.some((e) => e.type === 'CARDS_DRAWN'));
    expectOk(await request(current.socket, 'game:action', { type: 'SHOT', cards: handles(current.view.room!, filler(2)) }));
    const drawnMine = (await mine).events.find((e) => e.type === 'CARDS_DRAWN');
    const drawnTheirs = (await theirs).events.find((e) => e.type === 'CARDS_DRAWN');
    expect(drawnMine).toMatchObject({ cardIds: [expect.stringMatching(/^h/), expect.stringMatching(/^h/)] });
    expect(drawnTheirs).toMatchObject({ cardIds: ['?', '?'] });
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
    expect(grant.room.game!.you.hand).toHaveLength(8);
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
    expect(room.game!.players.find((p) => p.id === gone.id)!.eliminated).toBe(true);
    expect(room.game!.currentPlayerId).not.toBe(gone.id);
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
    expectOk(await request(seats[0]!.socket, 'room:react', { emoji: '🍻' }));
    expect(expectError(await request(seats[0]!.socket, 'room:react', { emoji: 'hola' }))).toBe('INVALID_PAYLOAD');
    await pause(50);
    expect(got.map((r) => r.emoji)).toEqual(['🍻']);
  });
});
