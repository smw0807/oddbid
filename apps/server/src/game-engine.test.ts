import assert from 'node:assert/strict';
import test from 'node:test';
import { GAME, ITEMS, MISSIONS, getItem, missionCompleted } from '@oddbid/shared';
import { GameEngine, GameRuleError, validateName } from './game-engine.js';

function fixture(practice = false, random: () => number = () => 0.25) {
  let now = 10_000;
  const engine = new GameEngine({
    roomId: 'ABC123',
    practice,
    now: () => now,
    random,
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

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

test('the catalog has 30 unique items and a collection mission for every item', () => {
  const itemIds = ITEMS.map((item) => item.id);
  assert.equal(ITEMS.length, 30);
  assert.equal(new Set(itemIds).size, 30);
  assert.ok(
    ITEMS.every((item) => item.name.trim() && Number.isSafeInteger(item.value) && item.value > 0),
  );
  const collectionMissions = MISSIONS.filter((mission) => mission.targetItem);
  assert.equal(collectionMissions.length, 30);
  assert.deepEqual(
    new Set(collectionMissions.map((mission) => mission.targetItem)),
    new Set(itemIds),
  );
  assert.equal(MISSIONS.length, 32);
  assert.equal(new Set(MISSIONS.map((mission) => mission.id)).size, MISSIONS.length);
});

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
  const { engine, advance } = fixture();
  for (let index = 4; index <= GAME.maxPlayers; index += 1) {
    engine.addPlayer(`p${index}`, `참가자${index}`);
    engine.setReady(`p${index}`, true);
  }
  assert.equal(engine.self('p1').mission, null);
  engine.start('p1');
  const missions = engine.players.map((player) => engine.self(player.id).mission!);
  assert.equal(new Set(missions.map((mission) => mission.id)).size, GAME.maxPlayers);
  assert.equal(engine.snapshot().results.length, 0);
  for (const mission of missions)
    assert.equal(JSON.stringify(engine.snapshot()).includes(mission.id), false);
  const self = engine.self('p1');
  self.mission!.title = 'tampered';
  assert.notEqual(engine.self('p1').mission!.title, 'tampered');
  while (engine.phase !== 'finished') {
    const snapshot = engine.snapshot();
    assert.deepEqual(snapshot.results, []);
    for (const mission of missions)
      assert.equal(JSON.stringify(snapshot).includes(mission.id), false);
    advance();
  }
  assert.deepEqual(
    new Set(engine.snapshot().results.map((result) => result.mission.id)),
    new Set(missions.map((mission) => mission.id)),
  );
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
    fails('INVALID_BID', () => engine.bid('p1', engine.auctionId, amount));
  }
  fails('NOT_ENOUGH_COINS', () => engine.bid('p1', engine.auctionId, 105));
  engine.bid('p1', engine.auctionId, 10);
  fails('ALREADY_LEADING', () => engine.bid('p1', engine.auctionId, 15));
  fails('BID_TOO_LOW', () => engine.bid('p2', engine.auctionId, 10));
  engine.bid('p2', engine.auctionId, 15);
  assert.equal(engine.players.find((player) => player.id === 'p2')!.coins, 100);
  moveTo(engine.endsAt);
  fails('BIDDING_CLOSED', () => engine.bid('p3', engine.auctionId, 20));
  assert.equal(engine.highestBid, 15);
});

test('missing, malformed and unknown auction IDs reject bids without changing state', () => {
  const { engine } = fixture();
  engine.start('p1');
  engine.bid('p1', engine.auctionId, 10);
  const before = engine.snapshot();

  for (const auctionId of [undefined, null, 0, 1, true, {}, [], '']) {
    fails('INVALID_AUCTION_ID', () => engine.bid('p2', auctionId, 15));
    assert.deepEqual(engine.snapshot(), before);
  }
  for (const auctionId of ['unknown-auction', ' ']) {
    fails('STALE_AUCTION', () => engine.bid('p2', auctionId, 15));
    assert.deepEqual(engine.snapshot(), before);
  }

  engine.bid('p2', engine.auctionId, 15);
  assert.equal(engine.highestBid, 15);
  assert.equal(engine.highestBidderId, 'p2');
  assert.equal(engine.bidHistory.length, 2);
});

test('a previous round bid cannot affect the next auction while fresh bids still settle', () => {
  const { engine, advance } = fixture();
  engine.start('p1');
  const previousAuctionId = engine.snapshot().auctionId;
  assert.ok(previousAuctionId);
  engine.bid('p1', previousAuctionId, 10);
  advance();
  assert.equal(engine.phase, 'reveal');
  assert.equal(engine.snapshot().auctionId, previousAuctionId);
  advance();

  const before = engine.snapshot();
  assert.equal(before.round, 2);
  assert.ok(before.auctionId);
  assert.notEqual(before.auctionId, previousAuctionId);
  fails('STALE_AUCTION', () => engine.bid('p2', previousAuctionId, 15));
  assert.deepEqual(engine.snapshot(), before);

  engine.bid('p2', before.auctionId, 15);
  advance();
  assert.equal(engine.roundResults[1]!.winnerId, 'p2');
  assert.equal(engine.roundResults[1]!.price, 15);
  assert.equal(engine.players[0]!.coins, 90);
  assert.equal(engine.players[1]!.coins, 85);
});

test('auction IDs stay unique across games and old game bids leave the restarted game unchanged', () => {
  const { engine, advance } = fixture();
  const auctionIds = new Set<string>();
  assert.equal(engine.auctionId, null);
  assert.equal(engine.snapshot().auctionId, null);
  engine.start('p1');
  for (let round = 1; round <= GAME.rounds; round += 1) {
    assert.equal(engine.phase, 'auction');
    assert.equal(engine.round, round);
    const auctionId = engine.snapshot().auctionId;
    assert.ok(auctionId);
    assert.equal(auctionIds.has(auctionId), false);
    auctionIds.add(auctionId);
    advance();
    assert.equal(engine.phase, 'reveal');
    assert.equal(engine.snapshot().auctionId, auctionId);
    advance();
  }
  assert.equal(auctionIds.size, GAME.rounds);
  assert.equal(engine.phase, 'finished');
  assert.equal(engine.auctionId, null);
  assert.equal(engine.snapshot().auctionId, null);

  engine.restart('p1');
  assert.equal(engine.auctionId, null);
  assert.equal(engine.snapshot().auctionId, null);
  for (const player of engine.players) engine.setReady(player.id, true);
  engine.start('p1');
  const before = engine.snapshot();
  for (const previousAuctionId of auctionIds) {
    fails('STALE_AUCTION', () => engine.bid('p1', previousAuctionId, 5));
    assert.deepEqual(engine.snapshot(), before);
  }

  for (let round = 1; round <= GAME.rounds; round += 1) {
    assert.equal(engine.phase, 'auction');
    assert.equal(engine.round, round);
    const auctionId = engine.snapshot().auctionId;
    assert.ok(auctionId);
    assert.equal(auctionIds.has(auctionId), false);
    auctionIds.add(auctionId);
    engine.bid('p1', auctionId, 5);
    advance();
    assert.equal(engine.snapshot().auctionId, auctionId);
    advance();
  }
  assert.equal(auctionIds.size, GAME.rounds * 2);
  assert.equal(engine.phase, 'finished');
  assert.equal(engine.snapshot().auctionId, null);
  assert.equal(engine.players[0]!.coins, GAME.startingCoins - GAME.rounds * 5);
  assert.equal(engine.players[0]!.items.length, GAME.rounds);
});

test('round settlement charges only the winning player exactly once', () => {
  const { engine, advance } = fixture();
  engine.start('p1');
  const itemId = engine.currentItem!.id;
  engine.bid('p1', engine.auctionId, 10);
  engine.bid('p2', engine.auctionId, 35);
  advance();
  assert.equal(engine.phase, 'reveal');
  assert.equal(engine.players[0]!.coins, 100);
  assert.equal(engine.players[1]!.coins, 65);
  assert.deepEqual(engine.players[1]!.items, [{ itemId, price: 35 }]);
  assert.equal(engine.advance(), false);
  assert.equal(engine.players[1]!.coins, 65);
  fails('BIDDING_CLOSED', () => engine.bid('p3', engine.auctionId, 40));
  advance();
  assert.equal(engine.round, 2);
  assert.equal(engine.highestBid, 0);
  assert.equal(engine.highestBidderId, null);
  assert.deepEqual(engine.bidHistory, []);
});

test('five distinct lots from the 30-item catalog finish with transparent scoring and tie ranks', () => {
  const { engine, advance } = fixture();
  engine.start('p1');
  engine.bid('p1', engine.auctionId, 25);
  while (engine.phase !== 'finished') advance();
  assert.equal(engine.roundResults.length, GAME.rounds);
  const offeredIds = new Set(engine.roundResults.map((result) => result.itemId));
  assert.equal(offeredIds.size, GAME.rounds);
  assert.ok(engine.roundResults.every((result) => ITEMS.some((item) => item.id === result.itemId)));
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

test('different random seeds offer different five-item selections without changing the catalog', () => {
  const catalogBefore = ITEMS.map((item) => item.id);
  const selections = [1, 2, 3].map((seed) => {
    const { engine, advance } = fixture(false, seededRandom(seed));
    engine.start('p1');
    while (engine.phase !== 'finished') advance();
    const selection = engine.roundResults.map((result) => result.itemId);
    assert.equal(selection.length, GAME.rounds);
    assert.equal(new Set(selection).size, GAME.rounds);
    return [...selection].sort();
  });
  assert.notDeepEqual(selections[0], selections[1]);
  assert.notDeepEqual(selections[1], selections[2]);
  assert.deepEqual(
    ITEMS.map((item) => item.id),
    catalogBefore,
  );
});

test('a collection mission awards its bonus only to the owner who wins the target', () => {
  // A near-one random source preserves catalog order, so the first target is offered.
  for (const winsTarget of [true, false]) {
    const { engine, advance } = fixture(false, () => 0.999999);
    engine.start('p1');
    const mission = engine.self('p1').mission!;
    assert.ok(mission.targetItem);
    assert.equal(engine.currentItem!.id, mission.targetItem);
    engine.bid('p1', engine.auctionId, 5);
    if (!winsTarget) engine.bid('p2', engine.auctionId, 10);
    while (engine.phase !== 'finished') advance();
    const result = engine.results.find((entry) => entry.playerId === 'p1')!;
    assert.equal(result.missionComplete, winsTarget);
    assert.equal(result.missionScore, winsTarget ? mission.bonus : 0);
    assert.equal(
      result.total,
      winsTarget
        ? GAME.startingCoins - 5 + getItem(mission.targetItem).value + mission.bonus
        : GAME.startingCoins,
    );
    assert.equal(engine.roundResults[0]!.winnerId, winsTarget ? 'p1' : 'p2');
  }
});

test('a collection target may be absent and never earns a bonus for buying unrelated items', () => {
  let absentTargetsChecked = 0;
  for (let seed = 1; seed <= 20; seed += 1) {
    const { engine, advance } = fixture(false, seededRandom(seed));
    engine.start('p1');
    const mission = engine.self('p1').mission!;
    while (engine.phase !== 'finished') {
      if (engine.phase === 'auction') engine.bid('p1', engine.auctionId, 5);
      advance();
    }
    if (
      !mission.targetItem ||
      engine.roundResults.some((result) => result.itemId === mission.targetItem)
    )
      continue;
    absentTargetsChecked += 1;
    const player = engine.players.find((entry) => entry.id === 'p1')!;
    const result = engine.results.find((entry) => entry.playerId === 'p1')!;
    assert.equal(player.items.length, GAME.rounds);
    assert.equal(player.coins, GAME.startingCoins - GAME.rounds * 5);
    assert.equal(result.mission.id, mission.id);
    assert.equal(result.missionComplete, false);
    assert.equal(result.missionScore, 0);
    assert.equal(
      result.total,
      player.coins + player.items.reduce((sum, item) => sum + getItem(item.itemId).value, 0),
    );
  }
  assert.ok(
    absentTargetsChecked > 0,
    'some assigned collection targets must remain outside the five lots',
  );
});

test('restart resets coins, readiness, private missions, round and result history', () => {
  const { engine, advance } = fixture();
  engine.start('p1');
  fails('GAME_NOT_FINISHED', () => engine.restart('p1'));
  engine.bid('p1', engine.auctionId, 20);
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
  engine.bid('p1', engine.auctionId, 50);
  engine.setConnected('p1', false);
  fails('PLAYER_AWAY', () => engine.bid('p1', engine.auctionId, 55));
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
  engine.bid('p1', engine.auctionId, 5);
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
