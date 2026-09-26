import { randomUUID } from 'node:crypto';
import {
  GAME,
  ITEMS,
  MISSIONS,
  getItem,
  missionCompleted,
  type AuctionItem,
  type BidEvent,
  type GameSnapshot,
  type Mission,
  type Phase,
  type PlayerResult,
  type PublicPlayer,
  type RoundResult,
  type SelfState,
} from '@oddbid/shared';

export class GameRuleError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'GameRuleError';
  }
}

export interface EngineOptions {
  roomId: string;
  practice?: boolean;
  now?: () => number;
  random?: () => number;
  roundMs?: number;
  revealMs?: number;
}

/** All authoritative game decisions live here. Missions never enter public player records. */
export class GameEngine {
  readonly roomId: string;
  readonly practice: boolean;
  readonly players: PublicPlayer[] = [];
  phase: Phase = 'lobby';
  hostId = '';
  round = 0;
  endsAt = 0;
  highestBid = 0;
  highestBidderId: string | null = null;
  currentItem: AuctionItem | null = null;
  auctionId: string | null = null;
  readonly roundResults: RoundResult[] = [];
  readonly bidHistory: BidEvent[] = [];
  results: PlayerResult[] = [];
  private readonly missions = new Map<string, Mission>();
  private readonly departedPlayers = new Set<string>();
  private lots: AuctionItem[] = [];
  private bidSequence = 0;
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly roundMs: number;
  private readonly revealMs: number;

  constructor(options: EngineOptions) {
    this.roomId = options.roomId;
    this.practice = options.practice ?? false;
    this.now = options.now ?? Date.now;
    this.random = options.random ?? Math.random;
    this.roundMs = options.roundMs ?? GAME.roundMs;
    this.revealMs = options.revealMs ?? GAME.revealMs;
    if (this.roundMs <= 0 || this.revealMs <= 0)
      throw new Error('Round durations must be positive.');
  }

  addPlayer(id: string, rawName: unknown, isBot = false): PublicPlayer {
    if (this.phase !== 'lobby')
      throw new GameRuleError('GAME_STARTED', '이미 경매가 진행 중이에요.');
    if (this.players.length >= GAME.maxPlayers)
      throw new GameRuleError('ROOM_FULL', '방이 가득 찼어요.');
    if (this.players.some((player) => player.id === id))
      throw new GameRuleError('DUPLICATE_PLAYER', '이미 입장한 플레이어예요.');
    if (this.practice && this.players.some((player) => !player.isBot) && !isBot) {
      throw new GameRuleError('PRACTICE_PRIVATE', '연습방에는 다른 사람이 입장할 수 없어요.');
    }
    const name = validateName(rawName);
    if (
      this.players.some(
        (player) =>
          player.name.normalize('NFKC').toLocaleLowerCase() ===
          name.normalize('NFKC').toLocaleLowerCase(),
      )
    ) {
      throw new GameRuleError('DUPLICATE_NAME', '같은 닉네임이 있어요. 다른 이름을 입력해 주세요.');
    }
    const player: PublicPlayer = {
      id,
      name,
      avatar: this.players.length % 6,
      coins: GAME.startingCoins,
      ready: isBot,
      connected: true,
      isBot,
      items: [],
    };
    this.players.push(player);
    if (!this.hostId && !isBot) this.hostId = id;
    return player;
  }

  removePlayer(id: string): void {
    const index = this.players.findIndex((player) => player.id === id);
    if (index < 0) return;
    if (this.phase === 'lobby') {
      this.players.splice(index, 1);
      this.missions.delete(id);
      this.departedPlayers.delete(id);
    } else {
      this.players[index]!.connected = false;
      this.departedPlayers.add(id);
    }
    if (this.hostId === id)
      this.hostId =
        this.players.find((player) => player.id !== id && !player.isBot && player.connected)?.id ??
        '';
  }

  setConnected(id: string, connected: boolean): void {
    const player = this.player(id);
    player.connected = connected;
    if (!connected && this.phase === 'lobby') player.ready = false;
    if (connected && !this.hostId && !player.isBot) this.hostId = id;
  }

  setReady(id: string, ready: unknown): void {
    if (this.phase !== 'lobby')
      throw new GameRuleError('NOT_LOBBY', '대기실에서만 준비할 수 있어요.');
    if (typeof ready !== 'boolean')
      throw new GameRuleError('INVALID_READY', '준비 상태가 올바르지 않아요.');
    this.player(id).ready = ready;
  }

  start(id: string): void {
    this.requireHost(id);
    if (this.phase !== 'lobby')
      throw new GameRuleError('ALREADY_STARTED', '이미 경매가 진행 중이에요.');
    if (this.players.length < GAME.minPlayers)
      throw new GameRuleError('NOT_ENOUGH_PLAYERS', '최소 3명이 모여야 시작할 수 있어요.');
    if (this.players.some((player) => !player.ready || !player.connected))
      throw new GameRuleError('NOT_READY', '모든 플레이어가 준비를 눌러야 해요.');
    const shuffledMissions = shuffle(MISSIONS, this.random);
    this.players.forEach((player, index) => {
      player.coins = GAME.startingCoins;
      player.items = [];
      this.missions.set(player.id, { ...shuffledMissions[index]! });
    });
    this.lots = shuffle(ITEMS, this.random).slice(0, GAME.rounds);
    this.roundResults.length = 0;
    this.results = [];
    this.round = 0;
    this.nextRound(this.now());
  }

  bid(id: string, auctionId: unknown, amount: unknown): void {
    if (this.phase !== 'auction' || this.now() >= this.endsAt)
      throw new GameRuleError('BIDDING_CLOSED', '이번 경매의 입찰이 마감됐어요.');
    if (typeof auctionId !== 'string' || auctionId.length === 0)
      throw new GameRuleError(
        'INVALID_AUCTION_ID',
        '경매 정보가 올바르지 않아요. 새로고침해 주세요.',
      );
    if (auctionId !== this.auctionId)
      throw new GameRuleError(
        'STALE_AUCTION',
        '입찰한 경매가 바뀌었어요. 현재 물건과 입찰가를 다시 확인해 주세요.',
      );
    const player = this.player(id);
    if (!player.connected) throw new GameRuleError('PLAYER_AWAY', '다시 연결한 후 입찰해 주세요.');
    if (
      typeof amount !== 'number' ||
      !Number.isFinite(amount) ||
      !Number.isSafeInteger(amount) ||
      amount < GAME.bidStep ||
      amount % GAME.bidStep !== 0
    ) {
      throw new GameRuleError('INVALID_BID', '입찰 금액은 5코인 단위의 양수여야 해요.');
    }
    if (this.highestBidderId === id)
      throw new GameRuleError('ALREADY_LEADING', '이미 최고 입찰자예요.');
    if (amount < this.highestBid + GAME.bidStep)
      throw new GameRuleError('BID_TOO_LOW', '현재 금액보다 5코인 이상 높게 입찰해 주세요.');
    if (amount > player.coins)
      throw new GameRuleError('NOT_ENOUGH_COINS', '가지고 있는 코인보다 많이 입찰할 수 없어요.');
    this.highestBid = amount;
    this.highestBidderId = id;
    this.bidHistory.unshift({
      id: ++this.bidSequence,
      playerId: id,
      playerName: player.name,
      amount,
      at: this.now(),
    });
    this.bidHistory.splice(20);
  }

  /** Advance at most one phase per call, so reveal screens always get their full duration. */
  advance(): boolean {
    const now = this.now();
    if ((this.phase !== 'auction' && this.phase !== 'reveal') || now < this.endsAt) return false;
    if (this.phase === 'auction') {
      const winner = this.players.find((player) => player.id === this.highestBidderId);
      if (winner && this.currentItem) {
        winner.coins -= this.highestBid;
        winner.items.push({ itemId: this.currentItem.id, price: this.highestBid });
      }
      this.roundResults.push({
        round: this.round,
        itemId: this.currentItem!.id,
        winnerId: winner?.id ?? null,
        winnerName: winner?.name ?? null,
        price: winner ? this.highestBid : 0,
      });
      this.phase = 'reveal';
      this.endsAt = now + this.revealMs;
    } else if (this.round < GAME.rounds) this.nextRound(now);
    else this.finish();
    return true;
  }

  restart(id: string): void {
    this.requireHost(id);
    if (this.phase !== 'finished')
      throw new GameRuleError('GAME_NOT_FINISHED', '결과를 확인한 뒤 다시 시작할 수 있어요.');
    this.phase = 'lobby';
    // Keep seats that are still inside their reconnection grace period.
    this.players.splice(
      0,
      this.players.length,
      ...this.players.filter((player) => !this.departedPlayers.has(player.id)),
    );
    this.departedPlayers.clear();
    for (const player of this.players) {
      player.coins = GAME.startingCoins;
      player.ready = player.isBot;
      player.items = [];
    }
    this.round = 0;
    this.endsAt = 0;
    this.currentItem = null;
    this.auctionId = null;
    this.highestBid = 0;
    this.highestBidderId = null;
    this.missions.clear();
    this.lots = [];
    this.results = [];
    this.roundResults.length = 0;
    this.bidHistory.length = 0;
  }

  self(id: string): SelfState {
    this.player(id);
    const mission = this.missions.get(id);
    return { playerId: id, mission: mission ? { ...mission } : null };
  }

  snapshot(): GameSnapshot {
    return {
      roomId: this.roomId,
      hostId: this.hostId,
      practice: this.practice,
      phase: this.phase,
      players: this.players.map((player) => ({
        ...player,
        items: player.items.map((item) => ({ ...item })),
      })),
      round: this.round,
      totalRounds: GAME.rounds,
      currentItem: this.currentItem ? { ...this.currentItem } : null,
      auctionId: this.auctionId,
      highestBid: this.highestBid,
      highestBidderId: this.highestBidderId,
      endsAt: this.endsAt,
      serverNow: this.now(),
      bidHistory: this.bidHistory.map((bid) => ({ ...bid })),
      roundResults: this.roundResults.map((result) => ({ ...result })),
      results:
        this.phase === 'finished'
          ? this.results.map((result) => ({ ...result, mission: { ...result.mission } }))
          : [],
    };
  }

  private player(id: string): PublicPlayer {
    const player = this.players.find((candidate) => candidate.id === id);
    if (!player) throw new GameRuleError('PLAYER_NOT_FOUND', '플레이어를 찾을 수 없어요.');
    return player;
  }

  private requireHost(id: string): void {
    if (id !== this.hostId) throw new GameRuleError('HOST_ONLY', '방장만 할 수 있어요.');
    this.player(id);
  }

  private nextRound(now: number): void {
    this.round += 1;
    this.currentItem = this.lots[this.round - 1]!;
    this.auctionId = randomUUID();
    this.phase = 'auction';
    this.endsAt = now + this.roundMs;
    this.highestBid = 0;
    this.highestBidderId = null;
    this.bidHistory.length = 0;
  }

  private finish(): void {
    this.phase = 'finished';
    this.auctionId = null;
    this.endsAt = 0;
    this.results = this.players
      .map((player) => {
        const mission = this.missions.get(player.id)!;
        const complete = missionCompleted(mission, player);
        const itemScore = player.items.reduce((sum, item) => sum + getItem(item.itemId).value, 0);
        const missionScore = complete ? mission.bonus : 0;
        return {
          playerId: player.id,
          rank: 0,
          name: player.name,
          coins: player.coins,
          itemScore,
          mission: { ...mission },
          missionComplete: complete,
          missionScore,
          total: player.coins + itemScore + missionScore,
        };
      })
      .sort((left, right) => right.total - left.total || right.coins - left.coins);
    this.results.forEach((result, index) => {
      result.rank =
        index > 0 && result.total === this.results[index - 1]!.total
          ? this.results[index - 1]!.rank
          : index + 1;
    });
  }
}

export function validateName(rawName: unknown): string {
  if (typeof rawName !== 'string')
    throw new GameRuleError('INVALID_NAME', '닉네임을 입력해 주세요.');
  const name = rawName.normalize('NFC').trim().replace(/\s+/gu, ' ');
  if (!name || Array.from(name).length > 12 || /[\p{Cc}\p{Cf}]/u.test(name))
    throw new GameRuleError('INVALID_NAME', '닉네임은 보이는 글자 1~12자로 입력해 주세요.');
  return name;
}

function shuffle<T>(values: readonly T[], random: () => number): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [result[index], result[other]] = [result[other]!, result[index]!];
  }
  return result;
}
