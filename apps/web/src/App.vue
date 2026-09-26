<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { GAME, REACTIONS, getItem } from '@oddbid/shared';
import ItemArt from './components/ItemArt.vue';
import PlayerAvatar from './components/PlayerAvatar.vue';
import { useGame } from './composables/useGame';

const {
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
} = useGame();
const nickname = ref(savedName);
const inviteCode = ref(new URLSearchParams(location.search).get('room')?.toUpperCase() || '');
const rules = ref<HTMLDialogElement | null>(null);
const missionVisible = ref(false);
const copied = ref(false);
const copyFallback = ref('');
const selectedBid = ref<number>(GAME.bidStep);
const bidPending = ref(false);
const now = ref(Date.now());
let clock: ReturnType<typeof setInterval>;
let copyTimer: ReturnType<typeof setTimeout>;
let bidTimer: ReturnType<typeof setTimeout>;

const remaining = computed(() =>
  Math.max(0, Math.ceil(((snapshot.value?.endsAt || 0) - now.value - serverOffset.value) / 1000)),
);
const progress = computed(() =>
  Math.max(0, Math.min(100, (remaining.value / (GAME.roundMs / 1000)) * 100)),
);
const minBid = computed(() => (snapshot.value?.highestBid || 0) + GAME.bidStep);
const leader = computed(() =>
  snapshot.value?.players.find((player) => player.id === snapshot.value?.highestBidderId),
);
const leading = computed(() => !!me.value && leader.value?.id === me.value.id);
const canStart = computed(
  () =>
    !!snapshot.value &&
    snapshot.value.players.length >= GAME.minPlayers &&
    snapshot.value.players.every((player) => player.ready && player.connected),
);
const roundResult = computed(() =>
  snapshot.value?.roundResults.find((result) => result.round === snapshot.value?.round),
);
const canBid = computed(
  () =>
    connected.value &&
    snapshot.value?.phase === 'auction' &&
    remaining.value > 0 &&
    !leading.value &&
    !bidPending.value &&
    !!me.value &&
    selectedBid.value >= minBid.value &&
    selectedBid.value <= me.value.coins,
);
const ownResult = computed(() =>
  snapshot.value?.results.find((result) => result.playerId === self.value?.playerId),
);
const roomLabel = computed(() => (snapshot.value?.practice ? '연습 경매장' : '우리만의 경매장'));

// Keep the display clock fresh when a new deadline arrives between interval ticks.
watch(snapshot, () => {
  now.value = Date.now();
});
watch(minBid, (value) => {
  selectedBid.value = value;
});
watch(
  () => snapshot.value?.round,
  () => {
    selectedBid.value = minBid.value;
  },
);
watch(
  () => snapshot.value?.phase,
  (phase, previous) => {
    if (phase === 'lobby' || !previous || (previous === 'lobby' && phase === 'auction'))
      missionVisible.value = false;
    if (phase === 'lobby') selectedBid.value = GAME.bidStep;
  },
);

onMounted(() => {
  clock = setInterval(() => {
    now.value = Date.now();
  }, 200);
  void reconnect();
});
onUnmounted(() => {
  clearInterval(clock);
  clearTimeout(copyTimer);
  clearTimeout(bidTimer);
});

function join(): void {
  const code = inviteCode.value.trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code)) {
    error.value = '초대 코드 6자리를 입력해 주세요.';
    return;
  }
  void enter(nickname.value, { code });
}

async function shareRoom(): Promise<void> {
  const url = new URL(location.href);
  url.searchParams.set('room', snapshot.value?.roomId || '');
  try {
    await navigator.clipboard.writeText(url.toString());
    copied.value = true;
    clearTimeout(copyTimer);
    copyTimer = setTimeout(() => {
      copied.value = false;
    }, 2500);
  } catch {
    copyFallback.value = url.toString();
  }
}

function placeBid(): void {
  if (!canBid.value) return;
  bidPending.value = true;
  send('bid', { amount: selectedBid.value });
  bidTimer = setTimeout(() => {
    bidPending.value = false;
  }, 400);
}

function closeFromBackdrop(event: MouseEvent): void {
  if (event.target === rules.value) rules.value?.close();
}

function quit(): void {
  copyFallback.value = '';
  missionVisible.value = false;
  void leave();
}

function goHome(): void {
  if (snapshot.value) quit();
  else window.scrollTo({ top: 0, behavior: 'smooth' });
}

function roundName(round: number): string {
  const state = snapshot.value;
  if (!state) return '미공개 물건';
  if (round === state.round) return state.currentItem?.name || '미공개 물건';
  const result = state.roundResults.find((item) => item.round === round);
  return result ? getItem(result.itemId).name : '미공개 물건';
}
</script>

<template>
  <div class="site-shell">
    <header class="site-header">
      <a class="wordmark" href="/" aria-label="OddBid 홈" @click.prevent="goHome">
        <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
          <path
            d="m9 9 5-5 13 13-5 5L9 9Zm8 9L6 29M4 27l4 4M20 28h10"
            stroke="currentColor"
            stroke-width="3"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
        Odd<span>Bid</span>
      </a>
      <div class="header-right">
        <span v-if="snapshot" class="room-badge"
          ><i :class="{ disconnected: !connected }"></i>{{ snapshot.roomId }}</span
        >
        <span v-else class="header-tagline">입찰은 신중하게. 속마음은 비밀로.</span>
        <button class="text-button rules-button" @click="rules?.showModal()">
          <span class="question-mark">?</span>게임 방법
        </button>
        <button v-if="snapshot" class="text-button exit-button" @click="quit">
          나가기 <span aria-hidden="true">↗</span>
        </button>
      </div>
    </header>

    <div v-if="error" class="error-banner" role="alert">
      <span><strong>잠깐!</strong> {{ error }}</span>
      <button aria-label="오류 메시지 닫기" @click="error = ''">×</button>
    </div>
    <div v-if="snapshot && !connected" class="reconnect-banner">
      <span>{{
        recovering ? '연결이 끊어져 자동으로 다시 연결하고 있어요.' : '경매장과 다시 연결해 주세요.'
      }}</span
      ><button class="button small" :disabled="busy || recovering" @click="reconnect">
        {{ busy || recovering ? '연결 중…' : '다시 연결' }}
      </button>
    </div>
    <div v-if="busy && !snapshot" class="connection-status" role="status">
      <span class="connecting-dot" aria-hidden="true"></span>경매장에 연결하고 있어요. 잠시만 기다려
      주세요.
    </div>

    <main v-if="!snapshot" class="landing">
      <section class="hero">
        <div class="hero-copy">
          <div class="eyebrow">비공개 경매 · 누구나 입장 가능</div>
          <h1>
            <span class="hero-title-line">쓸모는 없고.</span>
            <span class="hero-title-line">눈치는 필요하고.</span>
          </h1>
          <p class="hero-description">
            고무오리에 전 재산을 건 친구.<br />그럴 만한 비밀이 있습니다.
          </p>
          <div class="game-facts">
            <span>3–6명</span><span>100코인</span><span>5번의 경매</span>
          </div>
          <div class="entry-panel">
            <label for="nickname">오늘의 경매사 이름 <span>최대 12자</span></label>
            <input
              id="nickname"
              v-model="nickname"
              class="nickname-input"
              maxlength="12"
              placeholder="친구들이 알아볼 이름을 입력해요"
              autocomplete="nickname"
              :disabled="busy"
              @keydown.enter.prevent="enter(nickname)"
            />
            <div class="entry-actions">
              <button
                class="button primary create-button"
                :disabled="busy"
                @click="enter(nickname)"
              >
                {{ busy ? '경매장에 연결하는 중…' : '새 경매장 열기' }}
                <span v-if="!busy" aria-hidden="true">↗</span>
              </button>
              <button
                class="button practice-button"
                :disabled="busy"
                @click="enter(nickname, { practice: true })"
              >
                혼자 연습 <span aria-hidden="true">→</span>
              </button>
            </div>
            <form class="join-form" @submit.prevent="join">
              <label for="invite-code">초대받았나요?</label>
              <input
                id="invite-code"
                v-model="inviteCode"
                aria-label="초대 코드 6자리"
                maxlength="6"
                placeholder="초대 코드 6자리"
                autocapitalize="characters"
                autocomplete="off"
                spellcheck="false"
                :disabled="busy"
              />
              <button type="submit" :disabled="busy">입장 <span aria-hidden="true">→</span></button>
            </form>
          </div>
        </div>

        <div class="hero-visual">
          <div class="hero-auction-card">
            <div class="card-topline">
              <span>출품번호 001</span><span class="small-pill">수집품</span>
            </div>
            <div class="hero-art-wrap">
              <span class="lot-index" aria-hidden="true">001</span>
              <ItemArt item="duck" />
              <span class="lot-stamp">감정 불가</span>
            </div>
            <div class="hero-item-info">
              <span class="category-label">출품 상태 · 사용감 조금</span>
              <h2>수상한 고무오리</h2>
              <p>물에 뜹니다. 비밀도 좀 있습니다.</p>
            </div>
            <div class="example-bid">
              <div>
                <span>현재 최고 입찰가</span><strong>65 <small>코인</small></strong>
              </div>
              <span class="bidder-example"><PlayerAvatar :index="2" small /> 오리광인</span>
            </div>
            <p class="catalog-mission">
              <span>누군가의 비밀 미션</span><strong>무슨 일이 있어도 오리를 가져라.</strong>
            </p>
          </div>
          <div class="catalog-footnote">
            <span>예시 도록 · 실제 경매는 5코인부터</span>
            <span>가치는 입찰자가 정합니다.</span>
          </div>
        </div>
      </section>

      <section class="how-it-works" aria-label="OddBid가 재미있는 이유">
        <div class="section-caption"><span>참가 안내</span><span>진행 순서 / 약 3분</span></div>
        <div class="feature-grid">
          <article>
            <span class="feature-number">01</span>
            <h3>입장.</h3>
            <p>링크 하나로 친구를 초대하세요.<br />회원가입 없이, 혼자라면 봇 2명과 연습.</p>
          </article>
          <article>
            <span class="feature-number">02</span>
            <h3>입찰.</h3>
            <p>
              지갑에는 100코인, 속으로는 비밀 미션.<br />각 물건에 25초. 사고 싶다면 손을 드세요.
            </p>
          </article>
          <article>
            <span class="feature-number">03</span>
            <h3>공개.</h3>
            <p>
              5번의 경매가 끝나면 미션을 공개합니다.<br />남은 코인, 물건 감정가, 미션 점수로 결산.
            </p>
          </article>
        </div>
      </section>
    </main>

    <main v-else-if="snapshot.phase === 'lobby'" class="lobby game-main">
      <div class="page-heading">
        <div class="eyebrow">입찰자 명단</div>
        <h1>입찰자를 기다립니다.</h1>
        <p>
          {{
            snapshot.practice
              ? '봇 친구들은 준비 끝. 준비 완료 후 첫 경매를 열어보세요.'
              : '친구를 초대하고, 모두 준비되면 경매를 시작하세요.'
          }}
        </p>
      </div>
      <div class="lobby-layout">
        <section class="guest-panel paper-panel">
          <div class="panel-heading">
            <h2>{{ roomLabel }}</h2>
            <span>{{ snapshot.players.length }} / {{ GAME.maxPlayers }}명</span>
          </div>
          <div class="guest-list">
            <div v-for="player in snapshot.players" :key="player.id" class="guest-row">
              <PlayerAvatar :index="player.avatar" />
              <div class="guest-name">
                <strong
                  >{{ player.name }} <small v-if="player.id === self?.playerId">나</small></strong
                ><span>{{
                  player.id === snapshot.hostId
                    ? '경매장 호스트'
                    : player.isBot
                      ? '연습 상대 · BOT'
                      : '오늘의 입찰자'
                }}</span>
              </div>
              <span class="ready-label" :class="{ ready: player.ready && player.connected }">{{
                !player.connected ? '연결 끊김' : player.ready ? '✓ 준비 완료' : '준비 중'
              }}</span>
            </div>
            <div
              v-for="slot in GAME.maxPlayers - snapshot.players.length"
              :key="`empty-${slot}`"
              class="guest-row empty-guest"
            >
              <span class="empty-avatar">+</span><span>입장 대기석</span>
            </div>
          </div>
          <div class="lobby-controls">
            <button
              class="button"
              :class="me?.ready ? 'ready-cancel' : 'primary'"
              :disabled="!connected || !me"
              @click="send('ready', { ready: !me?.ready })"
            >
              {{ me?.ready ? '✓ 준비 완료 · 취소하기' : '준비 완료' }}</button
            ><button
              v-if="isHost"
              class="button yellow"
              :disabled="!connected || !canStart"
              @click="send('start')"
            >
              경매 시작 <span aria-hidden="true">→</span>
            </button>
          </div>
          <p class="lobby-hint">
            {{
              snapshot.players.length < GAME.minPlayers
                ? `최소 ${GAME.minPlayers}명이 필요해요. 친구를 더 초대해 주세요.`
                : !canStart
                  ? '모든 참가자가 준비를 마치면 시작할 수 있어요.'
                  : isHost
                    ? '모두 준비됐어요. 이제 첫 번째 물건을 공개하세요!'
                    : '모두 준비됐어요. 호스트가 경매를 시작하면 바로 입장해요.'
            }}
          </p>
        </section>
        <aside class="invitation-ticket">
          <div class="eyebrow">
            {{ snapshot.practice ? '연습 경매 안내' : '경매장 초대장' }}
          </div>
          <h2>{{ snapshot.practice ? '입찰 전, 한 번 연습.' : '함께 입찰할 사람에게.' }}</h2>
          <ItemArt item="duck" compact /><template v-if="!snapshot.practice"
            ><div class="ticket-code-label">우리 경매장 초대 코드</div>
            <strong class="ticket-code">{{ snapshot.roomId }}</strong
            ><button class="button primary" @click="shareRoom">
              {{ copied ? '✓ 초대 링크를 복사했어요' : '초대 링크 복사'
              }}<span v-if="!copied" aria-hidden="true">↗</span></button
            ><label v-if="copyFallback" class="copy-fallback"
              >아래 링크를 복사해 주세요<input
                :value="copyFallback"
                readonly
                @focus="($event.target as HTMLInputElement).select()" /></label
          ></template>
          <div v-else class="practice-info">
            <strong>나 + 봇 친구 2명</strong>
            <p>연습 방에서는 봇과 함께해요.<br />친구들과 하려면 새 경매장을 열어주세요.</p>
          </div>
          <p>참가비 없음 · 시작 자금 100코인<br />5번의 경매 종료 후 최종 결산</p>
        </aside>
      </div>
    </main>

    <main
      v-else-if="snapshot.phase === 'auction' || snapshot.phase === 'reveal'"
      class="auction-page game-main"
    >
      <div class="auction-heading">
        <div>
          <div class="eyebrow">
            {{ snapshot.practice ? '연습 경매 진행 중' : '경매 진행 중' }}
          </div>
          <h1>{{ snapshot.phase === 'reveal' ? '이번 출품, 마감.' : '지금 출품된 물건.' }}</h1>
        </div>
        <div class="round-counter">
          <span>ROUND</span
          ><strong
            >{{ String(snapshot.round).padStart(2, '0') }}
            <small>/ {{ String(snapshot.totalRounds).padStart(2, '0') }}</small></strong
          >
        </div>
      </div>
      <div class="round-track" aria-label="경매 진행 상황">
        <div
          v-for="round in GAME.rounds"
          :key="round"
          :class="{ current: round === snapshot.round, completed: round < snapshot.round }"
        >
          <span>{{ round < snapshot.round ? '✓' : String(round).padStart(2, '0') }}</span
          ><span>{{ roundName(round) }}</span>
        </div>
      </div>
      <div class="auction-layout">
        <section v-if="snapshot.currentItem" class="live-item-card paper-panel">
          <div class="card-topline">
            <span>LOT NO. {{ String(snapshot.round).padStart(3, '0') }}</span
            ><span class="small-pill">{{ snapshot.currentItem.category }}</span>
          </div>
          <div class="live-art-wrap">
            <div class="live-art-circle"></div>
            <ItemArt :item="snapshot.currentItem.id" /><span class="value-ticket"
              >감정가<strong>{{ snapshot.currentItem.value }}<small>점</small></strong></span
            >
          </div>
          <div class="live-item-info">
            <h2>{{ snapshot.currentItem.name }}</h2>
            <p>{{ snapshot.currentItem.subtitle }}</p>
          </div>
          <div
            class="auction-timer"
            :class="{
              urgent: remaining <= 7 && snapshot.phase === 'auction',
              revealing: snapshot.phase === 'reveal',
            }"
          >
            <div>
              <span>{{ snapshot.phase === 'reveal' ? '다음 장면까지' : '이번 물건 마감까지' }}</span
              ><strong>{{ remaining }}<small>초</small></strong>
            </div>
            <div class="timer-track">
              <div
                :style="{
                  width: `${snapshot.phase === 'reveal' ? (remaining / (GAME.revealMs / 1000)) * 100 : progress}%`,
                }"
              ></div>
            </div>
          </div>
        </section>

        <aside class="bidding-column">
          <section v-if="snapshot.phase === 'auction'" class="bid-panel paper-panel">
            <div class="panel-heading">
              <h2>현재 최고 입찰가</h2>
              <span class="live-label"><i></i> LIVE</span>
            </div>
            <div class="highest-bid" aria-live="polite">
              <strong>{{ snapshot.highestBid }}</strong
              ><span>코인</span>
            </div>
            <div class="current-bidder">
              <template v-if="leader"
                ><PlayerAvatar :index="leader.avatar" small /><strong>{{ leader.name }}</strong
                ><span>{{ leading ? '내가 최고 입찰자예요!' : '님이 선두예요' }}</span></template
              ><span v-else>아직 조용하네요. 첫 입찰을 해볼까요?</span>
            </div>
            <div class="bid-control">
              <span>나의 입찰 금액</span>
              <div class="bid-stepper">
                <button
                  aria-label="입찰 금액 5코인 줄이기"
                  :disabled="selectedBid <= minBid || leading || !connected"
                  @click="selectedBid -= GAME.bidStep"
                >
                  −</button
                ><output aria-live="polite">{{ selectedBid }}<small>코인</small></output
                ><button
                  aria-label="입찰 금액 5코인 늘리기"
                  :disabled="selectedBid + GAME.bidStep > (me?.coins || 0) || leading || !connected"
                  @click="selectedBid += GAME.bidStep"
                >
                  +
                </button>
              </div>
            </div>
            <button class="button primary bid-submit" :disabled="!canBid" @click="placeBid">
              {{
                leading
                  ? '지금은 내가 최고 입찰자!'
                  : selectedBid > (me?.coins || 0)
                    ? '코인이 부족해요'
                    : remaining === 0
                      ? '낙찰 결과를 기다리는 중…'
                      : bidPending
                        ? '입찰 중…'
                        : `${selectedBid}코인 입찰하기`
              }}<span v-if="canBid" aria-hidden="true">↗</span>
            </button>
            <p class="bid-help">5코인 단위로 입찰해요. 낙찰될 때만 코인을 지불해요.</p>
          </section>
          <section v-else class="reveal-panel paper-panel" aria-live="polite">
            <span class="reveal-symbol" aria-hidden="true">{{
              roundResult?.winnerId ? 'SOLD' : 'UNSOLD'
            }}</span>
            <div class="eyebrow">
              {{ roundResult?.winnerId ? '낙찰 확정' : '유찰 확정' }}
            </div>
            <h2>
              {{
                roundResult?.winnerName
                  ? `${roundResult.winnerName} 님 낙찰.`
                  : '이번 물건은 유찰됐어요.'
              }}
            </h2>
            <p v-if="roundResult?.winnerId">
              <strong>{{ roundResult.price }}코인</strong>에 낙찰됐어요.<br />과연 비밀 미션과
              관련이 있을까요?
            </p>
            <p v-else>아무도 입찰하지 않았어요.<br />다음 기회에 다시 만나요.</p>
            <span class="reveal-next"
              >{{
                snapshot.round === snapshot.totalRounds
                  ? '곧 모든 비밀이 공개됩니다'
                  : '곧 다음 물건이 등장합니다'
              }}
              <span aria-hidden="true">→</span></span
            >
          </section>
          <section class="wallet-panel">
            <div>
              <span>내 지갑</span><strong>{{ me?.coins ?? 0 }}<small>코인</small></strong>
            </div>
            <div>
              <span>내가 낙찰받은 물건</span
              ><strong>{{ me?.items.length ?? 0 }}<small>개</small></strong>
            </div>
          </section>
          <section class="mission-panel" :class="{ open: missionVisible }">
            <button
              :aria-expanded="missionVisible"
              aria-controls="secret-mission"
              @click="missionVisible = !missionVisible"
            >
              <span>나만의 비밀 미션</span
              ><span>{{ missionVisible ? '숨기기 −' : '살짝 보기 +' }}</span>
            </button>
            <div v-if="missionVisible" id="secret-mission" class="mission-content">
              <template v-if="self?.mission"
                ><h3>{{ self.mission.title }}</h3>
                <p>{{ self.mission.description }}</p>
                <strong>성공하면 +{{ self.mission.bonus }}점</strong></template
              >
              <p v-else>비밀 미션을 받아오는 중이에요.</p>
              <small>본인만 열람 가능 · 화면 공유에 주의하세요.</small>
            </div>
          </section>
        </aside>
      </div>
      <section class="table-section">
        <div class="panel-heading">
          <h2>입찰자 현황 <span>공개 자금 및 낙찰 수량</span></h2>
          <div class="reaction-controls">
            <button
              v-for="emoji in REACTIONS"
              :key="emoji"
              :aria-label="`${emoji} 반응 보내기`"
              :disabled="!connected"
              @click="send('reaction', { emoji })"
            >
              {{ emoji }}
            </button>
          </div>
        </div>
        <div class="player-strip">
          <div
            v-for="player in snapshot.players"
            :key="player.id"
            class="table-player"
            :class="{
              leader: player.id === snapshot.highestBidderId,
              'is-me': player.id === self?.playerId,
            }"
          >
            <div class="table-avatar">
              <PlayerAvatar :index="player.avatar" /><span
                v-if="reactions[player.id]"
                class="floating-reaction"
                role="status"
                >{{ reactions[player.id] }}</span
              >
            </div>
            <div>
              <strong
                >{{ player.name }} <small v-if="player.id === self?.playerId">나</small></strong
              ><span>{{
                !player.connected
                  ? '연결 끊김'
                  : `${player.coins}코인 · ${player.items.length}개 낙찰`
              }}</span>
            </div>
            <span
              v-if="player.id === snapshot.highestBidderId"
              class="leading-dot"
              aria-label="현재 최고 입찰자"
            ></span>
          </div>
        </div>
      </section>
      <section class="history-panel">
        <div class="panel-heading">
          <h2>이번 라운드 입찰 기록</h2>
          <span>{{ snapshot.bidHistory.length }} BIDS</span>
        </div>
        <div v-if="!snapshot.bidHistory.length" class="empty-history">
          아직 입찰이 없어요. 누가 먼저 손을 들까요?
        </div>
        <ol v-else>
          <li v-for="bid in snapshot.bidHistory.slice(0, 8)" :key="bid.id">
            <span><span class="history-arrow" aria-hidden="true">↗</span>{{ bid.playerName }}</span
            ><strong>{{ bid.amount }}<small>코인</small></strong>
          </li>
        </ol>
      </section>
    </main>

    <main v-else class="results-page game-main">
      <div class="page-heading">
        <div class="eyebrow">경매 종료 · 최종 결산</div>
        <h1>속마음까지, 공개.</h1>
        <p>모든 입찰이 끝났습니다. 비밀 미션과 최종 점수를 확인하세요.</p>
      </div>
      <div v-if="ownResult" class="my-result-ticket">
        <span>오늘 나의 성적</span
        ><strong
          >{{ ownResult.rank }}위 <small>/ {{ snapshot.results.length }}명</small></strong
        ><span
          >{{ ownResult.total }}점 ·
          {{ ownResult.missionComplete ? '비밀 미션 성공!' : '아쉽게도 비밀 미션 실패' }}</span
        >
      </div>
      <section class="scoreboard paper-panel" aria-label="최종 순위">
        <div class="panel-heading">
          <h2>최종 입찰 순위</h2>
          <span>FINAL RESULTS</span>
        </div>
        <article
          v-for="result in snapshot.results"
          :key="result.playerId"
          class="result-row"
          :class="{ winner: result.rank === 1, 'my-result': result.playerId === self?.playerId }"
        >
          <div class="result-identity">
            <strong class="result-rank">{{ String(result.rank).padStart(2, '0') }}</strong
            ><PlayerAvatar
              :index="snapshot.players.find((player) => player.id === result.playerId)?.avatar || 0"
            />
            <div>
              <h3>{{ result.name }} <small v-if="result.playerId === self?.playerId">나</small></h3>
              <span>{{ result.rank === 1 ? '최고 득점 입찰자' : '결산 완료' }}</span>
            </div>
            <strong class="result-total">{{ result.total }}<small>점</small></strong>
          </div>
          <div class="score-equation">
            <span
              >남은 코인 <b>{{ result.coins }}</b></span
            ><i>+</i
            ><span
              >물건 감정가 <b>{{ result.itemScore }}</b></span
            ><i>+</i
            ><span
              >미션 보너스 <b>{{ result.missionScore }}</b></span
            ><i>=</i><strong>{{ result.total }}점</strong>
          </div>
          <div class="revealed-mission">
            <span :class="{ success: result.missionComplete }">{{
              result.missionComplete ? '✓ 미션 성공' : '미션 실패'
            }}</span>
            <p>
              <strong>{{ result.mission.title }}</strong
              >{{ result.mission.description }}
            </p>
          </div>
          <div class="won-items">
            <template
              v-for="won in snapshot.players.find((player) => player.id === result.playerId)
                ?.items || []"
              :key="won.itemId"
              ><span
                >{{ getItem(won.itemId).name }} <small>{{ won.price }}코인</small></span
              ></template
            ><span
              v-if="!snapshot.players.find((player) => player.id === result.playerId)?.items.length"
              class="no-items"
              >낙찰받은 물건이 없어요.</span
            >
          </div>
        </article>
      </section>
      <div class="results-actions">
        <button
          v-if="isHost"
          class="button primary"
          :disabled="!connected"
          @click="send('restart')"
        >
          한 판 더, 이번엔 안 속아 <span aria-hidden="true">↗</span>
        </button>
        <p v-else>호스트가 다시 시작하면 대기실로 함께 이동해요.</p>
        <button class="button" @click="quit">경매장 나가기</button>
      </div>
    </main>

    <footer class="site-footer">
      <span class="footer-wordmark">OddBid</span>
      <span>비밀 미션이 있는 경매 게임.</span>
      <span>PRIVATE AUCTION / OPEN TO EVERYONE</span>
    </footer>

    <dialog
      ref="rules"
      class="rules-dialog"
      aria-labelledby="rules-title"
      @click="closeFromBackdrop"
    >
      <div class="rules-content">
        <button class="dialog-close" aria-label="게임 방법 닫기" autofocus @click="rules?.close()">
          ×
        </button>
        <div class="eyebrow">참가 규정</div>
        <h2 id="rules-title">눈치만 챙겨오세요.</h2>
        <p class="rules-intro">3~6명이 함께하는, 약 3분짜리 수상한 경매.</p>
        <ol class="rules-list">
          <li>
            <span>01</span>
            <div>
              <h3>같은 지갑, 다른 속마음</h3>
              <p>
                모두 100코인으로 시작해요. 게임이 시작되면 나만 볼 수 있는 비밀 미션을 확인하세요.
              </p>
            </div>
          </li>
          <li>
            <span>02</span>
            <div>
              <h3>5번의 경매, 한 번의 선택</h3>
              <p>
                물건마다 25초, 5코인 단위로 입찰해요. 마감 순간 최고 입찰자가 물건을 가져가고 코인을
                지불해요. 입찰은 취소할 수 없어요.
              </p>
            </div>
          </li>
          <li>
            <span>03</span>
            <div>
              <h3>비밀 미션을 들키지 마세요</h3>
              <p>
                물건을 모으거나 코인을 아끼는 등 각자 다른 목표가 있어요. 성공하면 미션에 적힌
                보너스 점수를 받아요.
              </p>
            </div>
          </li>
          <li>
            <span>04</span>
            <div>
              <h3>마지막에 가장 높은 점수가 승리</h3>
              <p>
                남은 코인 + 낙찰받은 물건의 감정가 + 미션 보너스를 더해요. 점수가 같으면 공동
                순위예요.
              </p>
            </div>
          </li>
        </ol>
        <div class="rules-example">
          <strong>예를 들면</strong>
          <p>남은 40코인 + 물건 감정가 60점 + 미션 50점<br /><b>= 최종 150점!</b></p>
        </div>
        <p class="practice-note">
          혼자 연습하면 봇 2명이 함께해요. 실제 돈이 오가지 않는 파티 게임이에요.
        </p>
        <button class="button primary" @click="rules?.close()">
          좋아, 감 잡았어 <span aria-hidden="true">→</span>
        </button>
      </div>
    </dialog>
  </div>
</template>
