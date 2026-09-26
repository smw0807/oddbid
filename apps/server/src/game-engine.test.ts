import assert from 'node:assert/strict';
import test from 'node:test';
import { GAME, ITEMS, missionCompleted } from '@oddbid/shared';
import { GameEngine, GameRuleError, validateName } from './game-engine.js';

function fixture(practice = false) {
  let now = 10_000;
  const engine = new GameEngine({
    roomId: 'ABC123',
    practice,
    now: () => now,
    random: () => 0.25,
    roundMs: 1000,
    revealMs: 100,
  });
  engine.addPlayer('p1', '오리');
  engine.addPlayer('p2', '바나나', practice);
  engine.addPlayer('p3', '양말', practice);
  for (const player of engine.players) engine.setReady(player.id, true);
  return {
    engine,
    moveTo: (time: number) => {
      now = time;
    },
    advance: () => {
      now = engine.endsAt;
      engine.advance();
    },
  };
}

function fails(code: string, action: () => void) {
  assert.throws(action, (error: unknown) => error instanceof GameRuleError && error.code === code);
}

test('only ready groups of 3–6 can be started by their host', () => {
  const engine = new GameEngine({ roomId: 'ABC123' });
  engine.addPlayer('p1', '오리');
  engine.addPlayer('p2', '바나나');
  fails('HOST_ONLY', () => engine.start('p2'));
  fails('NOT_ENOUGH_PLAYERS', () => engine.start('p1'));
  engine.addPlayer('p3', '양말');
  fails('NOT_READY', () => engine.start('p1'));
  fails('INVALID_READY', () => engine.setReady('p1', 'true'));
  for (const player of engine.players) engine.setReady(player.id, true);
  engine.start('p1');
  assert.equal(engine.phase, 'auction');
  fails('GAME_STARTED', () => engine.addPlayer('p4', '스노볼'));
  fails('NOT_LOBBY', () => engine.setReady('p1', false));
});

test('missions are unique and private until the final result', () => {
  const { engine } = fixture();
  assert.equal(engine.self('p1').mission, null);
  engine.start('p1');
  const missions = engine.players.map((player) => engine.self(player.id).mission!);
  assert.equal(new Set(missions.map((mission) => mission.id)).size, 3);
  assert.equal(engine.snapshot().results.length, 0);
  for (const mission of missions)
    assert.equal(JSON.stringify(engine.snapshot()).includes(mission.id), false);
  const self = engine.self('p1');
  self.mission!.title = 'tampered';
  assert.notEqual(engine.self('p1').mission!.title, 'tampered');
});

test('bids reject malformed amounts, overdrafts, underbids, self-raises and the exact deadline', () => {
  const { engine, moveTo } = fixture();
  engine.start('p1');
  for (const amount of [
    '5',
    undefined,
    null,
    true,
    {},
    [],
    Number.NaN,
    Infinity,
    -Infinity,
    -5,
    0,
    2.5,
    6,
    Number.MAX_SAFE_INTEGER + 1,
  ]) {
    fails('INVALID_BID', () => engine.bid('p1', amount));
  }
  fails('NOT_ENOUGH_COINS', () => engine.bid('p1', 105));
  engine.bid('p1', 10);
  fails('ALREADY_LEADING', () => engine.bid('p1', 15));
  fails('BID_TOO_LOW', () => engine.bid('p2', 10));
  engine.bid('p2', 15);
  assert.equal(engine.players.find((player) => player.id === 'p2')!.coins, 100);
  moveTo(engine.endsAt);
  fails('BIDDING_CLOSED', () => engine.bid('p3', 20));
  assert.equal(engine.highestBid, 15);
});

test('round settlement charges only the winning player exactly once', () => {
  const { engine, advance } = fixture();
  engine.start('p1');
  const itemId = engine.currentItem!.id;
  engine.bid('p1', 10);
  engine.bid('p2', 35);
  advance();
  assert.equal(engine.phase, 'reveal');
  assert.equal(engine.players[0]!.coins, 100);
  assert.equal(engine.players[1]!.coins, 65);
  assert.deepEqual(engine.players[1]!.items, [{ itemId, price: 35 }]);
  assert.equal(engine.advance(), false);
  assert.equal(engine.players[1]!.coins, 65);
  fails('BIDDING_CLOSED', () => engine.bid('p3', 40));
  advance();
  assert.equal(engine.round, 2);
  assert.equal(engine.highestBid, 0);
  assert.equal(engine.highestBidderId, null);
  assert.deepEqual(engine.bidHistory, []);
});

test('five distinct lots finish with transparent scoring and tie ranks', () => {
  const { engine, advance } = fixture();
  engine.start('p1');
  engine.bid('p1', 25);
  while (engine.phase !== 'finished') advance();
  assert.equal(engine.roundResults.length, GAME.rounds);
  assert.deepEqual(
    new Set(engine.roundResults.map((result) => result.itemId)),
    new Set(ITEMS.map((item) => item.id)),
  );
  assert.equal(engine.roundResults.filter((result) => result.winnerId === null).length, 4);
  const results = engine.snapshot().results;
  assert.equal(results.length, 3);
  for (const result of results) {
    const player = engine.players.find((candidate) => candidate.id === result.playerId)!;
    assert.equal(result.missionComplete, missionCompleted(result.mission, player));
    assert.equal(result.total, result.coins + result.itemScore + result.missionScore);
  }
  const idlePlayers = results.filter((result) => result.playerId !== 'p1');
  assert.equal(idlePlayers[0]!.rank, idlePlayers[1]!.rank);
});

test('restart resets coins, readiness, private missions, round and result history', () => {
  const { engine, advance } = fixture();
  engine.start('p1');
  fails('GAME_NOT_FINISHED', () => engine.restart('p1'));
  engine.bid('p1', 20);
  while (engine.phase !== 'finished') advance();
  fails('HOST_ONLY', () => engine.restart('p2'));
  engine.removePlayer('p3');
  engine.restart('p1');
  assert.equal(engine.phase, 'lobby');
  assert.equal(engine.players.length, 2);
  assert.equal(engine.round, 0);
  assert.equal(engine.currentItem, null);
  assert.equal(engine.endsAt, 0);
  assert.equal(engine.self('p1').mission, null);
  assert.deepEqual(engine.results, []);
  assert.deepEqual(engine.roundResults, []);
  assert.deepEqual(engine.bidHistory, []);
  for (const player of engine.players) {
    assert.equal(player.coins, GAME.startingCoins);
    assert.equal(player.ready, false);
    assert.deepEqual(player.items, []);
  }
});

test('restart keeps reconnecting seats and clears their previous mission', () => {
  const { engine, advance } = fixture();
  engine.start('p1');
  engine.setConnected('p3', false);
  while (engine.phase !== 'finished') advance();
  engine.restart('p1');
  assert.equal(engine.players.length, 3);
  assert.equal(engine.self('p3').mission, null);
  engine.setConnected('p3', true);
  assert.equal(engine.players[2]!.connected, true);
  assert.equal(engine.players[2]!.ready, false);
});

test('disconnection preserves an active winner and mission, then transfers an expired host', () => {
  const { engine, advance } = fixture();
  engine.start('p1');
  const mission = engine.self('p1').mission;
  engine.bid('p1', 50);
  engine.setConnected('p1', false);
  fails('PLAYER_AWAY', () => engine.bid('p1', 55));
  assert.equal(engine.hostId, 'p1');
  advance();
  assert.equal(engine.players[0]!.coins, 50);
  engine.setConnected('p1', true);
  assert.deepEqual(engine.self('p1').mission, mission);
  engine.removePlayer('p1');
  assert.equal(engine.hostId, 'p2');
  assert.equal(engine.players.length, 3);
});

test('lobby departure removes a player and passes host privileges', () => {
  const { engine } = fixture();
  engine.removePlayer('p1');
  assert.equal(engine.players.length, 2);
  assert.equal(engine.hostId, 'p2');
  fails('PLAYER_NOT_FOUND', () => engine.self('p1'));
});

test('public snapshots cannot mutate the engine or its inventory', () => {
  const { engine, advance } = fixture();
  engine.start('p1');
  engine.bid('p1', 5);
  advance();
  const snapshot = engine.snapshot();
  snapshot.players[0]!.coins = 999;
  snapshot.players[0]!.items[0]!.price = 0;
  snapshot.currentItem!.value = 999;
  snapshot.roundResults[0]!.price = 0;
  assert.equal(engine.players[0]!.coins, 95);
  assert.equal(engine.players[0]!.items[0]!.price, 5);
  assert.notEqual(engine.currentItem!.value, 999);
  assert.equal(engine.roundResults[0]!.price, 5);
});

test('practice bots stay marked and strangers cannot enter a practice room', () => {
  const { engine } = fixture(true);
  assert.equal(engine.snapshot().practice, true);
  assert.equal(engine.players.filter((player) => player.isBot).length, 2);
  fails('PRACTICE_PRIVATE', () => engine.addPlayer('p4', '외부인'));
});

test('names are normalized, bounded, duplicate checked, and reject invisible characters', () => {
  assert.equal(validateName('  오리   왕  '), '오리 왕');
  assert.equal(validateName('오리봇'.normalize('NFD')), '오리봇');
  for (const input of ['', ' '.repeat(3), 'x'.repeat(13), null, {}, '오리\u200b', '오리\u0000']) {
    fails('INVALID_NAME', () => validateName(input));
  }
  const engine = new GameEngine({ roomId: 'ABC123' });
  engine.addPlayer('p1', 'DUCK');
  fails('DUPLICATE_NAME', () => engine.addPlayer('p2', 'duck'));
  fails('DUPLICATE_NAME', () => engine.addPlayer('p2', 'ＤＵＣＫ'));
});
