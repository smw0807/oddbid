import { computed, ref, shallowRef } from 'vue';
import { Client, type Room } from '@colyseus/sdk';
import type { GameSnapshot, SelfState, GameError, ReactionEvent } from '@oddbid/shared';

const SESSION_KEY = 'oddbid-session';
const NAME_KEY = 'oddbid-name';

function endpoint(): string {
  return import.meta.env.VITE_SERVER_URL || window.location.origin.replace(/^http/, 'ws');
}

function readStorage(key: string): string {
  try {
    return sessionStorage.getItem(key) || '';
  } catch {
    return '';
  }
}

function writeStorage(key: string, value: string): void {
  try {
    if (value) sessionStorage.setItem(key, value);
    else sessionStorage.removeItem(key);
  } catch {
    /* Play still works without storage. */
  }
}

export function useGame() {
  const client = new Client(endpoint());
  const room = shallowRef<Room | null>(null);
  const snapshot = ref<GameSnapshot | null>(null);
  const self = ref<SelfState | null>(null);
  const busy = ref(false);
  const connected = ref(false);
  const recovering = ref(false);
  const error = ref('');
  const serverOffset = ref(0);
  const savedName = readStorage(NAME_KEY);
  const reactions = ref<Record<string, string>>({});
  const reactionTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const me = computed(() =>
    snapshot.value?.players.find((player) => player.id === self.value?.playerId),
  );
  const isHost = computed(() => !!self.value && snapshot.value?.hostId === self.value.playerId);

  function fail(cause: unknown): void {
    const message = cause instanceof Error ? cause.message : '연결 중 문제가 생겼어요.';
    if (/room.*(not found|does not exist)|invalid room|4212/i.test(message))
      error.value = '방을 찾을 수 없어요. 초대 코드를 다시 확인해 주세요.';
    else if (/full|maximum|locked/i.test(message))
      error.value = '인원이 가득 찼거나 이미 게임이 시작된 방이에요.';
    else if (/network|fetch|websocket|ECONN|timeout/i.test(message))
      error.value = '서버에 연결하지 못했어요. 연결 상태를 확인하고 다시 시도해 주세요.';
    else error.value = message;
  }

  function attach(next: Room): void {
    room.value = next;
    connected.value = true;
    recovering.value = false;
    error.value = '';
    writeStorage(SESSION_KEY, next.reconnectionToken);
    next.onMessage<GameSnapshot>('snapshot', (state) => {
      if (room.value !== next) return;
      snapshot.value = state;
      serverOffset.value = state.serverNow - Date.now();
    });
    next.onMessage<SelfState>('self', (state) => {
      if (room.value === next) self.value = state;
    });
    next.onMessage<GameError>('error', (event) => {
      if (room.value === next) error.value = event.message;
    });
    next.onMessage<ReactionEvent>('reaction', (event) => {
      if (room.value !== next) return;
      reactions.value = { ...reactions.value, [event.playerId]: event.emoji };
      clearTimeout(reactionTimers.get(event.playerId));
      reactionTimers.set(
        event.playerId,
        setTimeout(() => {
          const nextReactions = { ...reactions.value };
          delete nextReactions[event.playerId];
          reactions.value = nextReactions;
        }, 2600),
      );
    });
    next.onError((_code: number, message?: string) => {
      if (room.value === next)
        error.value = message || '연결에 문제가 생겼어요. 다시 연결해 주세요.';
    });
    next.onDrop(() => {
      if (room.value !== next) return;
      connected.value = false;
      recovering.value = true;
      error.value = '';
    });
    next.onReconnect(() => {
      if (room.value !== next) return;
      connected.value = true;
      recovering.value = false;
      error.value = '';
      writeStorage(SESSION_KEY, next.reconnectionToken);
      next.send('sync');
    });
    next.onLeave(() => {
      if (room.value !== next) return;
      connected.value = false;
      recovering.value = false;
      room.value = null;
      error.value = '연결이 끊어졌어요. 잠시 안에 다시 연결하면 게임에 돌아올 수 있어요.';
    });
    next.send('sync');
    const url = new URL(window.location.href);
    url.searchParams.set('room', next.roomId);
    window.history.replaceState({}, '', url);
  }

  async function enter(
    name: string,
    options: { code?: string; practice?: boolean } = {},
  ): Promise<void> {
    if (busy.value) return;
    const cleanName = name.trim();
    if (!cleanName || cleanName.length > 12) {
      error.value = '닉네임을 1~12자로 입력해 주세요.';
      return;
    }
    busy.value = true;
    error.value = '';
    try {
      const next = options.code
        ? await client.joinById(options.code.trim().toUpperCase(), { name: cleanName })
        : await client.create('auction', { name: cleanName, practice: !!options.practice });
      writeStorage(NAME_KEY, cleanName);
      attach(next);
    } catch (cause) {
      fail(cause);
    } finally {
      busy.value = false;
    }
  }

  async function reconnect(): Promise<void> {
    const token = readStorage(SESSION_KEY);
    if (!token || busy.value || recovering.value) return;
    const invitedRoom = new URLSearchParams(location.search).get('room')?.toUpperCase();
    if (invitedRoom && token.split(':')[0] !== invitedRoom) return;
    busy.value = true;
    error.value = '';
    try {
      attach(await client.reconnect(token));
    } catch {
      writeStorage(SESSION_KEY, '');
      snapshot.value = null;
      self.value = null;
      connected.value = false;
      error.value = '이전 방에 다시 연결할 수 없어요. 새로 입장해 주세요.';
    } finally {
      busy.value = false;
    }
  }

  async function leave(): Promise<void> {
    const previous = room.value;
    room.value = null;
    snapshot.value = null;
    self.value = null;
    connected.value = false;
    recovering.value = false;
    error.value = '';
    reactions.value = {};
    for (const timer of reactionTimers.values()) clearTimeout(timer);
    reactionTimers.clear();
    writeStorage(SESSION_KEY, '');
    const url = new URL(window.location.href);
    url.searchParams.delete('room');
    window.history.replaceState({}, '', url);
    if (previous) await previous.leave().catch(() => undefined);
  }

  function send(
    type: 'sync' | 'ready' | 'start' | 'bid' | 'restart' | 'reaction',
    payload?: object,
  ): void {
    if (!room.value || !connected.value) {
      error.value = '서버와 연결된 뒤 다시 시도해 주세요.';
      return;
    }
    error.value = '';
    room.value.send(type, payload);
  }

  return {
    snapshot,
    self,
    me,
    isHost,
    busy,
    connected,
    recovering,
    error,
    savedName,
    serverOffset,
    reactions,
    enter,
    reconnect,
    leave,
    send,
  };
}
