import assert from 'node:assert/strict';
import { after, before, describe, test, type TestContext } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { Client, type Room } from '@colyseus/sdk';
import {
  GAME,
  ITEMS,
  MISSIONS,
  type GameError,
  type GameSnapshot,
  type SelfState,
} from '@oddbid/shared';
import { createGameServer } from '../apps/server/src/app.js';

interface Peer {
  room: Room<unknown>;
  snapshots: GameSnapshot[];
  selfStates: SelfState[];
  errors: GameError[];
}

/** Poll a condition with a deadline; test correctness never depends on sleeping a fixed duration. */
async function waitFor<T>(read: () => T | undefined, label: string, timeoutMs = 7_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = read();
    if (result !== undefined) return result;
    await delay(10);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

function snapshot(peer: Peer): GameSnapshot {
  const value = peer.snapshots.at(-1);
  assert.ok(value, 'the client received a public snapshot');
  return value;
}

function self(peer: Peer): SelfState {
  const value = peer.selfStates.at(-1);
  assert.ok(value, 'the client received its private state');
  return value;
}

async function observe(t: TestContext, room: Room<unknown>): Promise<Peer> {
  const peer: Peer = { room, snapshots: [], selfStates: [], errors: [] };
  room.onMessage('snapshot', (value: GameSnapshot) => peer.snapshots.push(value));
  room.onMessage('self', (value: SelfState) => peer.selfStates.push(value));
  room.onMessage('error', (value: GameError) => peer.errors.push(value));
  room.onMessage('reaction', () => undefined);
  t.after(async () => {
    room.reconnection.enabled = false;
    if (room.connection.isOpen) await room.leave();
  });
  room.send('sync');
  await waitFor(
    () => (peer.snapshots.length > 0 && peer.selfStates.length > 0 ? true : undefined),
    'initial snapshot and self state',
  );
  return peer;
}

async function sync(peer: Peer): Promise<GameSnapshot> {
  const received = peer.snapshots.length;
  peer.room.send('sync');
  await waitFor(
    () => (peer.snapshots.length > received ? true : undefined),
    'a fresh sync response',
  );
  return snapshot(peer);
}

async function expectError(
  peer: Peer,
  type: string,
  payload: unknown,
  code: string,
): Promise<void> {
  const received = peer.errors.length;
  peer.room.send(type, payload);
  const error = await waitFor(() => peer.errors[received], `${type} rejection ${code}`);
  assert.equal(error.code, code);
  assert.ok(error.message.length > 0);
}

async function readyAndStart(peers: Peer[]): Promise<void> {
  for (const peer of peers) peer.room.send('ready', { ready: true });
  const host = peers[0]!;
  await waitFor(
    () => (snapshot(host).players.every((player) => player.ready) ? true : undefined),
    'everyone ready',
  );
  host.room.send('start');
  await waitFor(
    () =>
      peers.every((peer) => snapshot(peer).phase === 'auction' && self(peer).mission !== null)
        ? true
        : undefined,
    'auction and each private mission',
  );
}

function assertPrivateMissions(peers: Peer[]): void {
  for (const peer of peers) {
    assert.ok(
      peer.selfStates.every((state) => state.playerId === peer.room.sessionId),
      'self messages belong only to their recipient',
    );
    for (const state of peer.snapshots) {
      if (state.phase === 'finished') continue;
      assert.deepEqual(
        state.results,
        [],
        'scores and revealed missions stay hidden until the result screen',
      );
      const serialized = JSON.stringify(state);
      assert.doesNotMatch(serialized, /"(?:mission|missions|missionComplete|missionScore)"\s*:/u);
      for (const mission of MISSIONS) {
        assert.ok(
          !serialized.includes(`"${mission.id}"`),
          `public snapshot leaked mission ${mission.id}`,
        );
        assert.ok(
          !serialized.includes(mission.description),
          'public snapshot leaked a mission description',
        );
      }
    }
  }
}

describe('real Colyseus multiplayer contract', { concurrency: false, timeout: 45_000 }, () => {
  let game: ReturnType<typeof createGameServer>;
  let endpoint: string;

  before(async () => {
    game = createGameServer({ host: '127.0.0.1', port: 0, roundMs: 800, revealMs: 80 });
    endpoint = `ws://127.0.0.1:${await game.listen()}`;
  });

  after(async () => {
    await game?.shutdown();
  });

  async function makeParty(t: TestContext): Promise<Peer[]> {
    const host = await observe(
      t,
      await new Client(endpoint).create('auction', { name: '오리방장' }),
    );
    const second = await observe(
      t,
      await new Client(endpoint).joinById(host.room.roomId, { name: '바나나' }),
    );
    const third = await observe(
      t,
      await new Client(endpoint).joinById(host.room.roomId, { name: '양말도둑' }),
    );
    await waitFor(
      () => (snapshot(host).players.length === 3 ? true : undefined),
      'three players in the same room',
    );
    return [host, second, third];
  }

  test('three players join, ready, and only the host can start; late joins are rejected', async (t) => {
    const host = await observe(
      t,
      await new Client(endpoint).create('auction', { name: '오리방장' }),
    );
    assert.match(host.room.roomId, /^[A-Z0-9]{6}$/u);
    assert.equal(snapshot(host).hostId, host.room.sessionId);
    assert.equal(self(host).mission, null);
    await expectError(host, 'start', undefined, 'NOT_ENOUGH_PLAYERS');

    const second = await observe(
      t,
      await new Client(endpoint).joinById(host.room.roomId, { name: '바나나' }),
    );
    const third = await observe(
      t,
      await new Client(endpoint).joinById(host.room.roomId, { name: '양말도둑' }),
    );
    await expectError(second, 'start', undefined, 'HOST_ONLY');
    await expectError(host, 'start', undefined, 'NOT_READY');
    await expectError(second, 'ready', { ready: 'yes' }, 'INVALID_READY');
    await assert.rejects(new Client(endpoint).joinById(host.room.roomId, { name: '바나나' }));

    const peers = [host, second, third];
    await readyAndStart(peers);
    assert.equal(new Set(peers.map((peer) => self(peer).mission?.id)).size, 3);
    await assert.rejects(new Client(endpoint).joinById(host.room.roomId, { name: '늦은손님' }));
    assert.equal((await sync(host)).players.length, 3);
    assertPrivateMissions(peers);
  });

  test('invalid bids never change the auction; five rounds settle and restart clears game state', async (t) => {
    const peers = await makeParty(t);
    const [host, second, third] = peers as [Peer, Peer, Peer];
    await readyAndStart(peers);

    for (const amount of [0, -5, 3, 5.5, '10', null]) {
      await expectError(host, 'bid', { amount }, 'INVALID_BID');
    }
    await expectError(host, 'bid', { amount: 105 }, 'NOT_ENOUGH_COINS');
    assert.equal((await sync(host)).highestBid, 0);
    host.room.send('bid', { amount: 20 });
    await waitFor(
      () => (snapshot(host).highestBid === 20 ? true : undefined),
      'first accepted bid',
    );
    await expectError(host, 'bid', { amount: 25 }, 'ALREADY_LEADING');
    await expectError(second, 'bid', { amount: 20 }, 'BID_TOO_LOW');
    await expectError(second, 'bid', { amount: 105 }, 'NOT_ENOUGH_COINS');
    const unchanged = await sync(host);
    assert.equal(unchanged.highestBid, 20);
    assert.equal(unchanged.highestBidderId, host.room.sessionId);
    assert.equal(unchanged.bidHistory.length, 1);
    assert.ok(
      unchanged.players.every((player) => player.coins === GAME.startingCoins),
      'coins are charged at settlement, not at bid time',
    );

    second.room.send('bid', { amount: 25 });
    await waitFor(
      () => (snapshot(host).highestBidderId === second.room.sessionId ? true : undefined),
      'a competing player outbids the leader',
    );
    await waitFor(
      () => (snapshot(host).phase === 'reveal' ? true : undefined),
      'first round reveal',
    );
    assert.equal(snapshot(host).roundResults[0]?.winnerId, second.room.sessionId);
    assert.equal(
      snapshot(host).players.find((player) => player.id === second.room.sessionId)?.coins,
      75,
    );
    await expectError(third, 'bid', { amount: 30 }, 'BIDDING_CLOSED');

    for (let round = 2; round <= GAME.rounds; round += 1) {
      await waitFor(
        () =>
          snapshot(host).phase === 'auction' && snapshot(host).round === round ? true : undefined,
        `auction round ${round}`,
      );
      assert.equal(snapshot(host).highestBid, 0);
      assert.equal(snapshot(host).highestBidderId, null);
      host.room.send('bid', { amount: 5 });
      await waitFor(
        () => (snapshot(host).highestBidderId === host.room.sessionId ? true : undefined),
        `accepted bid in round ${round}`,
      );
    }

    await waitFor(
      () => (peers.every((peer) => snapshot(peer).phase === 'finished') ? true : undefined),
      'final results for all clients',
    );
    const finished = snapshot(host);
    assert.equal(finished.roundResults.length, GAME.rounds);
    assert.equal(new Set(finished.roundResults.map((round) => round.itemId)).size, GAME.rounds);
    assert.equal(
      finished.players.reduce((count, player) => count + player.items.length, 0),
      GAME.rounds,
    );
    assert.equal(finished.results.length, 3);
    assert.equal(finished.endsAt, 0);
    assert.equal(finished.players.find((player) => player.id === host.room.sessionId)?.coins, 80);
    assert.equal(finished.players.find((player) => player.id === second.room.sessionId)?.coins, 75);
    assert.equal(finished.players.find((player) => player.id === third.room.sessionId)?.coins, 100);

    for (const result of finished.results) {
      const player = finished.players.find((candidate) => candidate.id === result.playerId);
      assert.ok(player);
      assert.equal(
        result.coins,
        GAME.startingCoins - player.items.reduce((sum, item) => sum + item.price, 0),
      );
      const itemValue = player.items.reduce(
        (sum, item) => sum + ITEMS.find((lot) => lot.id === item.itemId)!.value,
        0,
      );
      assert.equal(result.itemScore, itemValue);
      const expectedComplete = result.mission.targetItem
        ? player.items.some((item) => item.itemId === result.mission.targetItem)
        : result.mission.id === 'collector'
          ? player.items.length >= 2
          : player.items.length >= 1 && player.coins >= 60;
      assert.equal(result.missionComplete, expectedComplete);
      assert.equal(result.missionScore, expectedComplete ? result.mission.bonus : 0);
      assert.equal(result.total, result.coins + itemValue + result.missionScore);
      const owner = peers.find((peer) => peer.room.sessionId === result.playerId);
      assert.deepEqual(result.mission, self(owner!).mission);
    }
    for (let index = 1; index < finished.results.length; index += 1) {
      assert.ok(finished.results[index - 1]!.total >= finished.results[index]!.total);
    }
    for (const peer of peers) assert.deepEqual(snapshot(peer).results, finished.results);
    assertPrivateMissions(peers);

    await expectError(second, 'restart', undefined, 'HOST_ONLY');
    host.room.send('restart');
    await waitFor(
      () =>
        peers.every((peer) => snapshot(peer).phase === 'lobby' && self(peer).mission === null)
          ? true
          : undefined,
      'restart and mission removal for every client',
    );
    for (const peer of peers) {
      const lobby = snapshot(peer);
      assert.equal(lobby.round, 0);
      assert.equal(lobby.currentItem, null);
      assert.equal(lobby.highestBid, 0);
      assert.equal(lobby.highestBidderId, null);
      assert.equal(lobby.endsAt, 0);
      assert.deepEqual(lobby.roundResults, []);
      assert.deepEqual(lobby.results, []);
      assert.deepEqual(lobby.bidHistory, []);
      assert.ok(
        lobby.players.every(
          (player) =>
            player.coins === GAME.startingCoins &&
            player.items.length === 0 &&
            player.ready === false,
        ),
      );
    }
    const newcomer = await observe(
      t,
      await new Client(endpoint).joinById(host.room.roomId, { name: '새손님' }),
    );
    assert.equal(snapshot(newcomer).phase, 'lobby');
    assert.equal(snapshot(newcomer).players.length, 4);
  });

  test('a consenting host departure hands ownership to a remaining player', async (t) => {
    const [host, second, third] = (await makeParty(t)) as [Peer, Peer, Peer];
    await host.room.leave();
    await waitFor(
      () =>
        snapshot(second).players.length === 2 && snapshot(second).hostId === second.room.sessionId
          ? true
          : undefined,
      'host ownership transfer',
    );
    assert.ok(!snapshot(second).players.some((player) => player.id === host.room.sessionId));
    const replacement = await observe(
      t,
      await new Client(endpoint).joinById(second.room.roomId, { name: '새방문자' }),
    );
    await readyAndStart([second, third, replacement]);
    assert.equal(snapshot(third).hostId, second.room.sessionId);
  });

  test('reconnecting with the SDK token restores the same player, mission and auction balance', async (t) => {
    const peers = await makeParty(t);
    const [host, second] = peers as [Peer, Peer, Peer];
    await readyAndStart(peers);
    host.room.send('bid', { amount: 15 });
    await waitFor(
      () => (snapshot(host).highestBidderId === host.room.sessionId ? true : undefined),
      'host bid before connection loss',
    );
    await waitFor(
      () => (snapshot(host).phase === 'auction' && snapshot(host).round === 2 ? true : undefined),
      'a settled purchase before reconnecting',
    );
    const purchased = snapshot(host).players.find((player) => player.id === host.room.sessionId);
    assert.ok(purchased);
    assert.equal(purchased.coins, 85);
    assert.equal(purchased.items.length, 1);
    host.room.send('bid', { amount: 5 });
    await waitFor(
      () => (snapshot(host).highestBidderId === host.room.sessionId ? true : undefined),
      'a live bid alongside the settled purchase',
    );
    const playerId = host.room.sessionId;
    const token = host.room.reconnectionToken;
    const mission = self(host).mission;
    host.room.reconnection.enabled = false;
    host.room.connection.close();
    await waitFor(
      () =>
        snapshot(second).players.find((player) => player.id === playerId)?.connected === false
          ? true
          : undefined,
      'disconnected player remains in active game',
    );

    const restored = await observe(t, await new Client(endpoint).reconnect(token));
    assert.equal(restored.room.sessionId, playerId);
    assert.equal(restored.room.roomId, second.room.roomId);
    assert.deepEqual(self(restored).mission, mission);
    assert.equal(snapshot(restored).players.filter((player) => player.id === playerId).length, 1);
    const player = snapshot(restored).players.find((candidate) => candidate.id === playerId);
    assert.ok(player?.connected);
    assert.equal(player.coins, 85);
    assert.deepEqual(player.items, purchased.items);
    assert.equal(snapshot(restored).highestBidderId, playerId);
    assert.equal(snapshot(restored).highestBid, 5);
    await expectError(restored, 'bid', { amount: 10 }, 'ALREADY_LEADING');
    assertPrivateMissions([...peers, restored]);
  });

  test('another room receives none of the first room players, bids or private missions', async (t) => {
    const peers = await makeParty(t);
    const host = peers[0]!;
    const other = await observe(
      t,
      await new Client(endpoint).create('auction', { name: '다른방방장' }),
    );
    assert.notEqual(other.room.roomId, host.room.roomId);
    await readyAndStart(peers);
    host.room.send('bid', { amount: 35 });
    await waitFor(
      () => (snapshot(host).highestBid === 35 ? true : undefined),
      'bid in the first room',
    );
    const isolated = await sync(other);
    assert.equal(isolated.roomId, other.room.roomId);
    assert.equal(isolated.phase, 'lobby');
    assert.equal(isolated.players.length, 1);
    assert.equal(isolated.hostId, other.room.sessionId);
    assert.equal(isolated.highestBid, 0);
    assert.deepEqual(isolated.bidHistory, []);
    assert.equal(self(other).mission, null);
    for (const state of other.snapshots) {
      assert.ok(
        state.players.every((player) => !peers.some((peer) => peer.room.sessionId === player.id)),
      );
    }
    assertPrivateMissions([...peers, other]);
  });

  test('practice creates ready bots, blocks outsiders and finishes a complete game', async (t) => {
    const human = await observe(
      t,
      await new Client(endpoint).create('auction', { name: '연습생', practice: true }),
    );
    const lobby = snapshot(human);
    assert.equal(lobby.practice, true);
    assert.equal(lobby.players.filter((player) => !player.isBot).length, 1);
    assert.ok(lobby.players.filter((player) => player.isBot).length >= GAME.minPlayers - 1);
    assert.ok(lobby.players.filter((player) => player.isBot).every((player) => player.ready));
    await assert.rejects(new Client(endpoint).joinById(human.room.roomId, { name: '끼어든사람' }));
    await readyAndStart([human]);
    await waitFor(
      () => (snapshot(human).phase === 'finished' ? true : undefined),
      'five bot practice rounds',
    );
    const finished = snapshot(human);
    assert.equal(finished.roundResults.length, GAME.rounds);
    assert.equal(finished.results.length, lobby.players.length);
    const botIds = new Set(
      lobby.players.filter((player) => player.isBot).map((player) => player.id),
    );
    assert.ok(
      finished.roundResults.some((round) => round.winnerId !== null && botIds.has(round.winnerId)),
      'bots actively bid and win items',
    );
    assert.ok(finished.players.every((player) => player.coins >= 0));
    assertPrivateMissions([human]);
    human.room.send('restart');
    await waitFor(
      () => (snapshot(human).phase === 'lobby' && self(human).mission === null ? true : undefined),
      'practice reset',
    );
    assert.ok(
      snapshot(human)
        .players.filter((player) => player.isBot)
        .every((player) => player.ready),
    );
    assert.equal(snapshot(human).players.find((player) => !player.isBot)?.ready, false);
  });
});
