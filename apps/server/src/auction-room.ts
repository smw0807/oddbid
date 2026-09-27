import { randomInt } from 'node:crypto';
import { Room, ServerError, type Client } from '@colyseus/core';
import { GAME, REACTIONS, type GameError } from '@oddbid/shared';
import { GameEngine, GameRuleError, validateName } from './game-engine.js';

export interface RoomTiming {
  roundMs?: number;
  revealMs?: number;
  reconnectionSeconds?: number;
}
const activeRoomCodes = new Set<string>();
const codeAlphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export class AuctionRoom extends Room<{ state: object }> {
  private engine!: GameEngine;
  protected timing: RoomTiming = {};
  private readonly reactionTimes = new Map<string, number>();
  private readonly botTimes = new Map<string, number>();

  async onCreate(options: unknown): Promise<void> {
    try {
      validateName(field(options, 'name'));
    } catch (error: unknown) {
      if (error instanceof GameRuleError) throw new ServerError(400, error.message);
      throw error;
    }
    const practice = field(options, 'practice');
    if (practice !== undefined && typeof practice !== 'boolean')
      throw new ServerError(400, '연습방 설정이 올바르지 않아요.');
    this.roomId = generateRoomCode();
    this.maxClients = practice ? 1 : GAME.maxPlayers;
    this.maxMessagesPerSecond = 40;
    this.patchRate = null;
    this.autoDispose = true;
    this.engine = new GameEngine({
      roomId: this.roomId,
      practice: practice === true,
      ...this.timing,
    });
    await this.setPrivate(true);

    this.onMessage<unknown>('sync', (client) => this.handle(client, () => this.sendSync(client)));
    this.onMessage<unknown>('ready', (client, message) =>
      this.handle(client, () => {
        this.engine.setReady(client.sessionId, field(message, 'ready'));
        this.publish();
      }),
    );
    this.onMessage<unknown>('start', (client) =>
      this.handle(client, async () => {
        this.engine.start(client.sessionId);
        await this.lock();
        this.scheduleBots();
        this.publish(true);
      }),
    );
    this.onMessage<unknown>('bid', (client, message) =>
      this.handle(client, () => {
        this.engine.bid(client.sessionId, field(message, 'auctionId'), field(message, 'amount'));
        this.publish();
      }),
    );
    this.onMessage<unknown>('restart', (client) =>
      this.handle(client, async () => {
        this.engine.restart(client.sessionId);
        this.botTimes.clear();
        this.reactionTimes.clear();
        if (!this.engine.practice) await this.unlock();
        this.publish(true);
      }),
    );
    this.onMessage<unknown>('reaction', (client, message) =>
      this.handle(client, () => {
        const emoji = field(message, 'emoji');
        if (typeof emoji !== 'string' || !REACTIONS.some((reaction) => reaction === emoji))
          throw new GameRuleError('INVALID_REACTION', '지원하지 않는 리액션이에요.');
        const now = Date.now();
        if (now - (this.reactionTimes.get(client.sessionId) ?? 0) < 800)
          throw new GameRuleError('REACTION_COOLDOWN', '리액션은 잠시 쉬었다 보내 주세요.');
        this.reactionTimes.set(client.sessionId, now);
        this.broadcast('reaction', { playerId: client.sessionId, emoji });
      }),
    );
    this.onMessage<unknown>('*', (client) =>
      this.sendError(client, { code: 'UNKNOWN_MESSAGE', message: '지원하지 않는 요청이에요.' }),
    );

    this.clock.setInterval(() => {
      if (this.engine.advance()) {
        this.scheduleBots();
        this.publish();
      }
      this.tickBots();
    }, 50);
  }

  onJoin(client: Client, options: unknown): void {
    try {
      this.engine.addPlayer(client.sessionId, field(options, 'name'));
      if (this.engine.practice && this.engine.players.length === 1) {
        for (const [index, baseName] of ['오리봇', '바나나봇'].entries()) {
          const name = this.engine.players.some(
            (player) => player.name.normalize('NFKC') === baseName,
          )
            ? `${baseName} 2`
            : baseName;
          this.engine.addPlayer(`bot-${index + 1}`, name, true);
        }
      }
      // The joining client requests sync only after its message handlers are registered.
      this.broadcast('snapshot', this.engine.snapshot(), { except: client });
    } catch (error: unknown) {
      if (error instanceof GameRuleError) throw new ServerError(400, error.message);
      throw error;
    }
  }

  onDrop(client: Client): void {
    if (!this.engine.players.some((player) => player.id === client.sessionId)) return;
    this.engine.setConnected(client.sessionId, false);
    this.publish();
    // Colyseus calls onLeave after the grace period expires, and onReconnect after success.
    void this.allowReconnection(
      client,
      this.timing.reconnectionSeconds ?? GAME.reconnectionSeconds,
    ).catch(() => {});
  }

  onReconnect(client: Client): void {
    this.engine.setConnected(client.sessionId, true);
    this.broadcast('snapshot', this.engine.snapshot(), { except: client });
  }

  onLeave(client: Client): void {
    this.engine?.removePlayer(client.sessionId);
    this.reactionTimes.delete(client.sessionId);
    if (this.engine) this.publish();
  }

  onDispose(): void {
    activeRoomCodes.delete(this.roomId);
    this.botTimes.clear();
    this.reactionTimes.clear();
    this.clock.clear();
  }

  private async handle(client: Client, action: () => void | Promise<void>): Promise<void> {
    try {
      await action();
    } catch (error: unknown) {
      if (error instanceof GameRuleError)
        this.sendError(client, { code: error.code, message: error.message });
      else {
        console.error('Auction message failed:', error);
        this.sendError(client, {
          code: 'INTERNAL_ERROR',
          message: '요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.',
        });
      }
    }
  }

  private sendError(client: Client, error: GameError): void {
    client.send('error', error);
  }

  private sendSync(client: Client): void {
    client.send('snapshot', this.engine.snapshot());
    client.send('self', this.engine.self(client.sessionId));
  }

  private publish(includeSelf = false): void {
    this.broadcast('snapshot', this.engine.snapshot());
    if (includeSelf)
      for (const client of this.clients) client.send('self', this.engine.self(client.sessionId));
  }

  private scheduleBots(): void {
    this.botTimes.clear();
    if (this.engine.phase !== 'auction') return;
    for (const bot of this.engine.players.filter((player) => player.isBot)) {
      this.botTimes.set(bot.id, Date.now() + this.botDelay());
    }
  }

  private botDelay(): number {
    const roundMs = this.timing.roundMs ?? GAME.roundMs;
    return Math.max(50, Math.round(((900 + Math.random() * 1900) * roundMs) / GAME.roundMs));
  }

  private tickBots(): void {
    if (
      this.engine.phase !== 'auction' ||
      !this.engine.currentItem ||
      !this.engine.players.some((player) => !player.isBot && player.connected)
    )
      return;
    const now = Date.now();
    let changed = false;
    for (const bot of this.engine.players.filter((player) => player.isBot)) {
      if (now < (this.botTimes.get(bot.id) ?? Infinity)) continue;
      this.botTimes.set(bot.id, now + this.botDelay());
      if (this.engine.highestBidderId === bot.id) continue;
      const mission = this.engine.self(bot.id).mission;
      let budget = this.engine.currentItem.value * 0.7;
      if (mission?.targetItem === this.engine.currentItem.id) budget += 40;
      if (mission?.id === 'collector' && bot.items.length < 2) budget += 15;
      if (mission?.id === 'thrifty') budget = Math.min(budget, bot.coins - 60);
      const nextBid = this.engine.highestBid + GAME.bidStep;
      if (nextBid > Math.min(budget, bot.coins) || Math.random() < 0.2) continue;
      try {
        this.engine.bid(bot.id, this.engine.auctionId, nextBid);
        changed = true;
      } catch (error: unknown) {
        if (!(error instanceof GameRuleError)) throw error;
      }
    }
    if (changed) this.publish();
  }
}

/** Timing comes from trusted factory configuration, never from room create/join payloads. */
export function configuredAuctionRoom(timing: RoomTiming): typeof AuctionRoom {
  return class extends AuctionRoom {
    protected override timing: RoomTiming = { ...timing };
  };
}

function field(message: unknown, key: string): unknown {
  return typeof message === 'object' && message !== null && !Array.isArray(message)
    ? (message as Record<string, unknown>)[key]
    : undefined;
}

function generateRoomCode(): string {
  let roomCode: string;
  do {
    roomCode = Array.from({ length: 6 }, () => codeAlphabet[randomInt(codeAlphabet.length)]).join(
      '',
    );
  } while (activeRoomCodes.has(roomCode));
  activeRoomCodes.add(roomCode);
  return roomCode;
}
