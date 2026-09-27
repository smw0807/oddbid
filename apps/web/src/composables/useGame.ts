import { computed, ref, shallowRef } from 'vue';
import { Client, ErrorCode, type Room } from '@colyseus/sdk';
import {
  GAME,
  type GameSnapshot,
  type SelfState,
  type GameError,
  type ReactionEvent,
} from '@oddbid/shared';

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
  let operation = 0;
  let recoveryEndsAt = 0;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let connectionTimer: ReturnType<typeof setTimeout> | undefined;
  const me = computed(() =>
    snapshot.value?.players.find((player) => player.id === self.value?.playerId),
  );
  const isHost = computed(() => !!self.value && snapshot.value?.hostId === self.value.playerId);

  function clearReactions(): void {
    reactions.value = {};
    for (const timer of reactionTimers.values()) clearTimeout(timer);
    reactionTimers.clear();
  }

  function clearConnectionTimers(): void {
    clearTimeout(retryTimer);
    clearTimeout(connectionTimer);
  }

  function resetSession(message = ''): void {
    operation += 1;
    recoveryEndsAt = 0;
    clearConnectionTimers();
    room.value = null;
    snapshot.value = null;
    self.value = null;
    busy.value = false;
    connected.value = false;
    recovering.value = false;
    serverOffset.value = 0;
    clearReactions();
    writeStorage(SESSION_KEY, '');
    const url = new URL(window.location.href);
    url.searchParams.delete('room');
    window.history.replaceState({}, '', url);
    error.value = message;
  }

  function closeRoom(previous: Room): void {
    previous.reconnection.enabled = false;
    if (previous.connection.isOpen) {
      void previous.leave().catch(() => previous.connection.close());
    } else previous.connection.close();
  }

  function setConnectionDeadline(
    currentOperation: number,
    message: string,
    delayMs = GAME.reconnectionSeconds * 1000,
  ): void {
    clearTimeout(connectionTimer);
    connectionTimer = setTimeout(
      () => {
        if (operation !== currentOperation) return;
        const previous = room.value;
        resetSession(message);
        if (previous) closeRoom(previous);
      },
      Math.max(0, delayMs),
    );
  }

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
    // SDK 0.18.4 retry timers cannot be cancelled. Own retries so leaving is final.
    next.reconnection.enabled = false;
    room.value = next;
    connected.value = false;
    self.value = null;
    error.value = '';
    clearReactions();
    writeStorage(SESSION_KEY, next.reconnectionToken);
    let receivedSnapshot = false;
    let receivedSelf = false;
    function finishSync(): void {
      if (!receivedSnapshot || !receivedSelf) return;
      clearConnectionTimers();
      recoveryEndsAt = 0;
      connected.value = true;
      recovering.value = false;
      busy.value = false;
    }
    next.onMessage<GameSnapshot>('snapshot', (state) => {
      if (room.value !== next) return;
      if (state.phase === 'lobby' && snapshot.value?.phase !== 'lobby') {
        error.value = '';
        clearReactions();
      }
      snapshot.value = state;
      serverOffset.value = state.serverNow - Date.now();
      receivedSnapshot = true;
      finishSync();
    });
    next.onMessage<SelfState>('self', (state) => {
      if (room.value !== next) return;
      self.value = state;
      receivedSelf = true;
      finishSync();
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
      if (room.value === next && !recovering.value)
        error.value = message || '연결에 문제가 생겼어요. 다시 연결해 주세요.';
    });
    next.onDrop(() => {
      if (room.value !== next) return;
      beginRecovery(next.reconnectionToken);
    });
    next.onLeave(() => {
      if (room.value !== next) return;
      resetSession('서버와의 연결이 종료됐어요. 새로 입장해 주세요.');
    });
    next.send('sync');
    const url = new URL(window.location.href);
    url.searchParams.set('room', next.roomId);
    window.history.replaceState({}, '', url);
  }

  function beginRecovery(token: string): void {
    const currentOperation = ++operation;
    clearConnectionTimers();
    if (!recovering.value) recoveryEndsAt = Date.now() + GAME.reconnectionSeconds * 1000;
    // Detach before the disabled SDK retry path emits onLeave for the old Room.
    room.value = null;
    connected.value = false;
    recovering.value = true;
    busy.value = !snapshot.value;
    error.value = '';
    clearReactions();
    const message = '이전 방에 다시 연결할 수 없어요. 새로 입장해 주세요.';
    setConnectionDeadline(currentOperation, message, recoveryEndsAt - Date.now());

    async function attempt(): Promise<void> {
      if (operation !== currentOperation) return;
      try {
        const next = await client.reconnect(token);
        next.reconnection.enabled = false;
        if (operation !== currentOperation) {
          closeRoom(next);
          return;
        }
        // Client.reconnect resolves after the new reconnection token is assigned.
        attach(next);
      } catch (cause) {
        if (operation !== currentOperation) return;
        const code =
          typeof cause === 'object' && cause !== null && 'code' in cause ? cause.code : undefined;
        if (
          code === ErrorCode.MATCHMAKE_INVALID_ROOM_ID ||
          code === ErrorCode.MATCHMAKE_EXPIRED ||
          (cause instanceof Error && /invalid reconnection token/i.test(cause.message))
        ) {
          resetSession(message);
          return;
        }
        retryTimer = setTimeout(() => void attempt(), 1000);
      }
    }
    // Give the server time to record the dropped connection before reserving its seat.
    retryTimer = setTimeout(() => void attempt(), 250);
  }

  async function enter(
    name: string,
    options: { code?: string; practice?: boolean } = {},
  ): Promise<void> {
    if (busy.value || recovering.value || room.value || snapshot.value) return;
    const cleanName = name.trim();
    if (!cleanName || cleanName.length > 12) {
      error.value = '닉네임을 1~12자로 입력해 주세요.';
      return;
    }
    busy.value = true;
    error.value = '';
    const currentOperation = ++operation;
    setConnectionDeadline(currentOperation, '연결 시간이 초과됐어요. 다시 입장해 주세요.');
    try {
      const next = options.code
        ? await client.joinById(options.code.trim().toUpperCase(), { name: cleanName })
        : await client.create('auction', { name: cleanName, practice: !!options.practice });
      next.reconnection.enabled = false;
      if (operation !== currentOperation) {
        closeRoom(next);
        return;
      }
      writeStorage(NAME_KEY, cleanName);
      attach(next);
    } catch (cause) {
      if (operation !== currentOperation) return;
      resetSession();
      fail(cause);
    }
  }

  function reconnect(): void {
    const token = readStorage(SESSION_KEY);
    if (!token || busy.value || recovering.value || room.value) return;
    const invitedRoom = new URLSearchParams(location.search).get('room')?.toUpperCase();
    if (invitedRoom && token.split(':')[0] !== invitedRoom) return;
    beginRecovery(token);
  }

  function leave(): void {
    const previous = room.value;
    resetSession();
    if (previous) closeRoom(previous);
  }

  function send(
    type: 'sync' | 'ready' | 'start' | 'bid' | 'restart' | 'reaction',
    payload?: object,
  ): void {
    if (busy.value || recovering.value || !room.value?.connection.isOpen || !connected.value) {
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
