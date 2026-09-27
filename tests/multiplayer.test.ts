import assert from 'node:assert/strict';
import { after, before, describe, test, type TestContext } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { matchMaker } from '@colyseus/core';
import { Client, type Room } from '@colyseus/sdk';
import {
  GAME,
  ITEMS,
  MISSIONS,
  REACTIONS,
  type GameError,
  type GameSnapshot,
  type ReactionEvent,
  type SelfState,
} from '@oddbid/shared';
import { createGameServer } from '../apps/server/src/app.js';

interface Peer {
  room: Room<unknown>;
  snapshots: GameSnapshot[];
  selfStates: SelfState[];
  errors: GameError[];
  reactions: ReactionEvent[];
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

function bidPayload(peer: Peer, amount: unknown): { auctionId: string; amount: unknown } {
  const auctionId = snapshot(peer).auctionId;
  assert.equal(typeof auctionId, 'string');
  assert.ok(auctionId);
  return { auctionId, amount };
}

function biddingState(state: GameSnapshot) {
  return {
    highestBid: state.highestBid,
    highestBidderId: state.highestBidderId,
    bidHistory: state.bidHistory,
    players: state.players.map(({ id, coins, items }) => ({ id, coins, items })),
  };
}

async function observe(t: TestContext, room: Room<unknown>): Promise<Peer> {
  const peer: Peer = { room, snapshots: [], selfStates: [], errors: [], reactions: [] };
  room.onMessage('snapshot', (value: GameSnapshot) => peer.snapshots.push(value));
  room.onMessage('self', (value: SelfState) => peer.selfStates.push(value));
  room.onMessage('error', (value: GameError) => peer.errors.push(value));
  room.onMessage('reaction', (value: ReactionEvent) => peer.reactions.push(value));
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

async function sync(peer: Peer, payload?: unknown): Promise<GameSnapshot> {
  const received = peer.snapshots.length;
  peer.room.send('sync', payload);
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
): Promise<GameError> {
  const received = peer.errors.length;
  peer.room.send(type, payload);
  const error = await waitFor(() => peer.errors[received], `${type} rejection ${code}`);
  assert.equal(error.code, code);
  assert.ok(error.message.length > 0);
  return error;
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
    game = createGameServer({
      host: '127.0.0.1',
      port: 0,
      roundMs: 800,
      revealMs: 80,
      reconnectionSeconds: 2,
    });
    endpoint = `ws://127.0.0.1:${await game.listen()}`;
  });

  after(async () => {
    await game?.shutdown();
  });

  async function makeParty(t: TestContext, options: Record<string, unknown> = {}): Promise<Peer[]> {
    const host = await observe(
      t,
      await new Client(endpoint).create('auction', { name: '오리방장', ...options }),
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
    assert.equal(snapshot(host).auctionId, null);
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

  test('invalid and stale bids leave the auction unchanged across rounds and games', async (t) => {
    const peers = await makeParty(t);
    const [host, second, third] = peers as [Peer, Peer, Peer];
    await readyAndStart(peers);
    const firstAuctionId = bidPayload(host, 5).auctionId;
    assert.ok(peers.every((peer) => snapshot(peer).auctionId === firstAuctionId));

    const beforeInvalidIds = biddingState(snapshot(host));
    await expectError(host, 'bid', { amount: 5 }, 'INVALID_AUCTION_ID');
    for (const auctionId of ['', null, 1, true, {}, []]) {
      await expectError(host, 'bid', { auctionId, amount: 5 }, 'INVALID_AUCTION_ID');
    }
    assert.deepEqual(biddingState(await sync(host)), beforeInvalidIds);

    for (const amount of [0, -5, 3, 5.5, '10', null]) {
      await expectError(host, 'bid', bidPayload(host, amount), 'INVALID_BID');
    }
    await expectError(host, 'bid', bidPayload(host, 105), 'NOT_ENOUGH_COINS');
    assert.equal((await sync(host)).highestBid, 0);
    host.room.send('bid', bidPayload(host, 20));
    await waitFor(
      () => (snapshot(host).highestBid === 20 ? true : undefined),
      'first accepted bid',
    );
    await expectError(host, 'bid', bidPayload(host, 25), 'ALREADY_LEADING');
    await expectError(second, 'bid', bidPayload(second, 20), 'BID_TOO_LOW');
    await expectError(second, 'bid', bidPayload(second, 105), 'NOT_ENOUGH_COINS');
    const unchanged = await sync(host);
    assert.equal(unchanged.highestBid, 20);
    assert.equal(unchanged.highestBidderId, host.room.sessionId);
    assert.equal(unchanged.bidHistory.length, 1);
    assert.ok(
      unchanged.players.every((player) => player.coins === GAME.startingCoins),
      'coins are charged at settlement, not at bid time',
    );

    second.room.send('bid', bidPayload(second, 25));
    await waitFor(
      () => (snapshot(host).highestBidderId === second.room.sessionId ? true : undefined),
      'a competing player outbids the leader',
    );
    await waitFor(
      () => (snapshot(host).phase === 'reveal' ? true : undefined),
      'first round reveal',
    );
    assert.equal(snapshot(host).roundResults[0]?.winnerId, second.room.sessionId);
    assert.equal(snapshot(host).auctionId, firstAuctionId);
    assert.equal(
      snapshot(host).players.find((player) => player.id === second.room.sessionId)?.coins,
      75,
    );
    await expectError(third, 'bid', bidPayload(third, 30), 'BIDDING_CLOSED');

    const auctionIds = new Set([firstAuctionId]);
    for (let round = 2; round <= GAME.rounds; round += 1) {
      await waitFor(
        () =>
          snapshot(host).phase === 'auction' && snapshot(host).round === round ? true : undefined,
        `auction round ${round}`,
      );
      assert.equal(snapshot(host).highestBid, 0);
      assert.equal(snapshot(host).highestBidderId, null);
      const currentAuctionId = bidPayload(host, 5).auctionId;
      assert.ok(!auctionIds.has(currentAuctionId), 'every round receives a new auction ID');
      auctionIds.add(currentAuctionId);
      host.room.send('bid', bidPayload(host, 5));
      await waitFor(
        () => (snapshot(host).highestBidderId === host.room.sessionId ? true : undefined),
        `accepted bid in round ${round}`,
      );
      if (round === 2) {
        const beforeStaleBid = biddingState(snapshot(host));
        const error = await expectError(
          second,
          'bid',
          { auctionId: firstAuctionId, amount: 30 },
          'STALE_AUCTION',
        );
        assert.match(error.message, /현재.*물건.*입찰가.*확인/u);
        assert.deepEqual(biddingState(await sync(host)), beforeStaleBid);
        assert.equal(snapshot(host).auctionId, currentAuctionId);
      }
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
    assert.equal(finished.auctionId, null);
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
      assert.equal(lobby.auctionId, null);
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

    await readyAndStart([...peers, newcomer]);
    const restartedAuctionId = bidPayload(host, 5).auctionId;
    assert.ok(!auctionIds.has(restartedAuctionId), 'a rematch does not reuse any auction ID');
    const beforePreviousGameBid = biddingState(snapshot(host));
    await expectError(host, 'bid', { auctionId: firstAuctionId, amount: 20 }, 'STALE_AUCTION');
    assert.deepEqual(biddingState(await sync(host)), beforePreviousGameBid);
    assert.equal(snapshot(host).auctionId, restartedAuctionId);
    host.room.send('bid', bidPayload(host, 20));
    await waitFor(
      () => (snapshot(host).highestBid === 20 ? true : undefined),
      'a current auction ID is accepted after rejecting a previous game bid',
    );
    assert.equal(snapshot(host).highestBidderId, host.room.sessionId);
    assert.equal(snapshot(host).bidHistory.length, 1);
    assert.ok(snapshot(host).players.every((player) => player.coins === GAME.startingCoins));
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

  test('a dropped lobby host can return during grace, then expiry rejects its token and transfers ownership', async (t) => {
    const peers = await makeParty(t, { reconnectionSeconds: 0 });
    const [host, second, third] = peers as [Peer, Peer, Peer];
    host.room.send('ready', { ready: true });
    await waitFor(
      () =>
        snapshot(second).players.find((player) => player.id === host.room.sessionId)?.ready
          ? true
          : undefined,
      'host ready before connection loss',
    );
    const token = host.room.reconnectionToken;
    host.room.reconnection.enabled = false;
    host.room.connection.close();
    await waitFor(
      () =>
        snapshot(second).players.find((player) => player.id === host.room.sessionId)?.connected ===
        false
          ? true
          : undefined,
      'host retained during the server-controlled grace period',
    );
    assert.equal(snapshot(second).hostId, host.room.sessionId);
    assert.equal(
      snapshot(second).players.find((player) => player.id === host.room.sessionId)?.ready,
      false,
    );
    const restored = await observe(t, await new Client(endpoint).reconnect(token));
    assert.equal(restored.room.sessionId, host.room.sessionId);
    assert.equal(snapshot(restored).hostId, host.room.sessionId);
    assert.equal(snapshot(restored).players.length, 3);

    const expiredToken = restored.room.reconnectionToken;
    restored.room.reconnection.enabled = false;
    restored.room.connection.close();
    await waitFor(
      () =>
        snapshot(second).players.length === 2 && snapshot(second).hostId === second.room.sessionId
          ? true
          : undefined,
      'expired host seat removed and ownership transferred',
    );
    await assert.rejects(new Client(endpoint).reconnect(expiredToken));
    const replacement = await observe(
      t,
      await new Client(endpoint).joinById(second.room.roomId, { name: '새방문자' }),
    );
    await readyAndStart([second, third, replacement]);
    assertPrivateMissions([...peers, restored, replacement]);
  });

  test('all players leaving releases active rooms after consent or reconnection expiry', async (t) => {
    for (const abrupt of [false, true]) {
      const peers = await makeParty(t);
      await readyAndStart(peers);
      const roomId = peers[0]!.room.roomId;
      const tokens = peers.map((peer) => peer.room.reconnectionToken);
      for (const peer of peers) {
        peer.room.reconnection.enabled = false;
        if (abrupt) peer.room.connection.close();
        else await peer.room.leave();
      }
      await waitFor(
        () => (matchMaker.getLocalRoomById(roomId) === undefined ? true : undefined),
        abrupt
          ? 'empty active room disposed after every grace period expires'
          : 'empty active room disposed after explicit leaves',
      );
      await assert.rejects(new Client(endpoint).reconnect(tokens[0]!));
      await assert.rejects(new Client(endpoint).joinById(roomId, { name: '늦은손님' }));
    }
  });

  test('a host leaving just before final settlement keeps its purchase and transfers restart ownership', async (t) => {
    const peers = await makeParty(t);
    const [host, second, third] = peers as [Peer, Peer, Peer];
    await readyAndStart(peers);
    await waitFor(
      () =>
        snapshot(host).phase === 'auction' && snapshot(host).round === GAME.rounds
          ? true
          : undefined,
      'the final auction',
    );
    host.room.send('bid', bidPayload(host, 25));
    await waitFor(
      () => (snapshot(second).highestBidderId === host.room.sessionId ? true : undefined),
      'the final bid accepted before its owner leaves',
    );
    const token = host.room.reconnectionToken;
    await host.room.leave();
    await waitFor(
      () => (snapshot(second).hostId === second.room.sessionId ? true : undefined),
      'restart authority transferred immediately after explicit leave',
    );
    await assert.rejects(new Client(endpoint).reconnect(token));
    await waitFor(
      () => (snapshot(second).phase === 'finished' ? true : undefined),
      'the final settlement after host departure',
    );
    const finished = snapshot(second);
    const departed = finished.players.find((player) => player.id === host.room.sessionId);
    assert.ok(departed);
    assert.equal(departed.connected, false);
    assert.equal(departed.coins, 75);
    assert.equal(departed.items.length, 1);
    assert.equal(departed.items[0]?.price, 25);
    assert.equal(finished.roundResults.at(-1)?.winnerId, host.room.sessionId);
    assert.equal(
      finished.results.find((result) => result.playerId === host.room.sessionId)?.coins,
      75,
    );
    second.room.send('restart');
    await waitFor(
      () =>
        snapshot(second).phase === 'lobby' && self(second).mission === null ? true : undefined,
      'the new host restarts without the departed seat',
    );
    assert.deepEqual(
      snapshot(second).players.map((player) => player.id),
      [second.room.sessionId, third.room.sessionId],
    );
    assertPrivateMissions(peers);
  });

  test('malformed and repeated messages preserve game state and keep sync missions private', async (t) => {
    const peers = await makeParty(t);
    const [host, second, third] = peers as [Peer, Peer, Peer];
    const malformed = [null, true, 7, 'unexpected', [], {}];
    const beforeReady = snapshot(host).players;
    for (const payload of malformed) await expectError(host, 'ready', payload, 'INVALID_READY');
    assert.deepEqual((await sync(host)).players, beforeReady);
    for (let repeat = 0; repeat < 3; repeat += 1) host.room.send('ready', { ready: true });
    await sync(host);
    assert.ok(snapshot(host).players.find((player) => player.id === host.room.sessionId)?.ready);
    assert.equal(snapshot(host).players.length, 3);
    await readyAndStart(peers);

    const mission = self(host).mission;
    const beforeSync = biddingState(snapshot(host));
    for (const payload of [...malformed, { playerId: second.room.sessionId }]) {
      const received = host.selfStates.length;
      assert.deepEqual(biddingState(await sync(host, payload)), beforeSync);
      await waitFor(
        () => (host.selfStates.length > received ? true : undefined),
        'the requested private sync',
      );
      assert.equal(self(host).playerId, host.room.sessionId);
      assert.deepEqual(self(host).mission, mission);
    }

    for (const payload of malformed)
      await expectError(second, 'bid', payload, 'INVALID_AUCTION_ID');
    for (const amount of [NaN, Infinity, {}, [], true]) {
      await expectError(second, 'bid', bidPayload(second, amount), 'INVALID_BID');
    }
    assert.deepEqual(biddingState(await sync(host)), beforeSync);
    host.room.send('bid', bidPayload(host, 20));
    await waitFor(
      () => (snapshot(host).highestBid === 20 ? true : undefined),
      'a normal bid after malformed messages',
    );
    const accepted = biddingState(snapshot(host));
    for (let repeat = 0; repeat < 3; repeat += 1) {
      await expectError(host, 'bid', bidPayload(host, 20), 'ALREADY_LEADING');
    }
    assert.deepEqual(biddingState(await sync(host)), accepted);

    for (const payload of [...malformed, { emoji: 'unsupported' }]) {
      await expectError(third, 'reaction', payload, 'INVALID_REACTION');
    }
    third.room.send('reaction', { emoji: REACTIONS[0], playerId: host.room.sessionId });
    await waitFor(() => (host.reactions.length === 1 ? true : undefined), 'one accepted reaction');
    assert.deepEqual(host.reactions[0], { playerId: third.room.sessionId, emoji: REACTIONS[0] });
    for (let repeat = 0; repeat < 3; repeat += 1) {
      await expectError(third, 'reaction', { emoji: REACTIONS[0] }, 'REACTION_COOLDOWN');
    }
    assert.equal(host.reactions.length, 1);
    assert.deepEqual(biddingState(await sync(host)), accepted);
    assertPrivateMissions(peers);
  });

  test('reconnecting with the SDK token restores the same player, mission and auction balance', async (t) => {
    const peers = await makeParty(t);
    const [host, second] = peers as [Peer, Peer, Peer];
    await readyAndStart(peers);
    host.room.send('bid', bidPayload(host, 15));
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
    host.room.send('bid', bidPayload(host, 5));
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
    await waitFor(
      () => (snapshot(second).roundResults.length === 2 ? true : undefined),
      'the accepted bid settles while its owner is disconnected',
    );

    const restored = await observe(t, await new Client(endpoint).reconnect(token));
    assert.equal(restored.room.sessionId, playerId);
    assert.equal(restored.room.roomId, second.room.roomId);
    assert.deepEqual(self(restored).mission, mission);
    assert.equal(snapshot(restored).players.filter((player) => player.id === playerId).length, 1);
    const player = snapshot(restored).players.find((candidate) => candidate.id === playerId);
    assert.ok(player?.connected);
    assert.equal(player.coins, 80);
    assert.equal(player.items.length, 2);
    assert.deepEqual(player.items[0], purchased.items[0]);
    assert.equal(player.items[1]?.price, 5);
    assert.equal(snapshot(restored).roundResults[1]?.winnerId, playerId);
    assert.equal(snapshot(restored).roundResults[1]?.price, 5);
    const synchronized = await sync(restored);
    assert.deepEqual(
      synchronized.players.find((candidate) => candidate.id === playerId),
      (await sync(second)).players.find((candidate) => candidate.id === playerId),
      'reconnection and repeated sync do not charge or award the purchase again',
    );
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
    host.room.send('bid', bidPayload(host, 35));
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
