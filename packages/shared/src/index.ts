export const GAME = {
  minPlayers: 3,
  maxPlayers: 6,
  startingCoins: 100,
  bidStep: 5,
  rounds: 5,
  roundMs: 25000,
  revealMs: 4000,
  reconnectionSeconds: 30,
} as const;
export type Phase = 'lobby' | 'auction' | 'reveal' | 'finished';
export type ItemId =
  | 'duck'
  | 'keyboard'
  | 'banana'
  | 'sock'
  | 'globe'
  | 'teapot'
  | 'toaster'
  | 'umbrella'
  | 'cactus'
  | 'cassette'
  | 'camera'
  | 'compass'
  | 'hourglass'
  | 'mug'
  | 'lamp'
  | 'slippers'
  | 'crown'
  | 'magnet'
  | 'ticket'
  | 'rocket'
  | 'phone'
  | 'clock'
  | 'pencil'
  | 'notebook'
  | 'key'
  | 'suitcase'
  | 'telescope'
  | 'headphones'
  | 'mirror'
  | 'bell';
export interface AuctionItem {
  id: ItemId;
  name: string;
  subtitle: string;
  category: string;
  value: number;
  color: string;
}
export const ITEMS: readonly AuctionItem[] = [
  {
    id: 'duck',
    name: '수상한 고무오리',
    subtitle: '물에 뜹니다. 비밀도 좀 있습니다.',
    category: '수집품',
    value: 25,
    color: '#f3cf48',
  },
  {
    id: 'keyboard',
    name: '퇴근 버튼 키보드',
    subtitle: 'ESC를 누르면 마음만 퇴근합니다.',
    category: '전자제품',
    value: 35,
    color: '#b7a3df',
  },
  {
    id: 'banana',
    name: '24K 황금 바나나',
    subtitle: '먹지 마세요. 치과비가 더 나옵니다.',
    category: '수집품',
    value: 40,
    color: '#e8bc43',
  },
  {
    id: 'sock',
    name: '행운의 한쪽 양말',
    subtitle: '짝은 없지만 가능성은 무한합니다.',
    category: '생활용품',
    value: 20,
    color: '#ef9c91',
  },
  {
    id: 'globe',
    name: '여름 한정 스노볼',
    subtitle: '흔들면 누군가의 휴가가 시작됩니다.',
    category: '생활용품',
    value: 30,
    color: '#8ec6bb',
  },
  {
    id: 'teapot',
    name: '속마음 끓이는 주전자',
    subtitle: '물이 끓으면 하고 싶던 말도 나옵니다.',
    category: '생활용품',
    value: 30,
    color: '#e89a7c',
  },
  {
    id: 'toaster',
    name: '월요일 굽는 토스터',
    subtitle: '바삭하게 구우면 조금 견딜 만해집니다.',
    category: '전자제품',
    value: 35,
    color: '#c4c9b0',
  },
  {
    id: 'umbrella',
    name: '맑은 날 전용 우산',
    subtitle: '비 오는 날은 본인도 쉬고 싶대요.',
    category: '생활용품',
    value: 20,
    color: '#91b8b0',
  },
  {
    id: 'cactus',
    name: '칭찬 먹는 선인장',
    subtitle: '물은 한 달에 한 번, 칭찬은 매일 주세요.',
    category: '수집품',
    value: 25,
    color: '#aeb991',
  },
  {
    id: 'cassette',
    name: '미래의 흑역사 테이프',
    subtitle: '아직 안 한 말인데 벌써 부끄럽습니다.',
    category: '수집품',
    value: 35,
    color: '#c4aec3',
  },
  {
    id: 'camera',
    name: '눈 감는 순간 카메라',
    subtitle: '단체 사진에서 한 명은 꼭 걸립니다.',
    category: '전자제품',
    value: 40,
    color: '#a6b6c2',
  },
  {
    id: 'compass',
    name: '맛집 찾는 나침반',
    subtitle: '북쪽보다 점심 메뉴가 중요하니까요.',
    category: '수집품',
    value: 30,
    color: '#d4ba88',
  },
  {
    id: 'hourglass',
    name: '딱 5분만 모래시계',
    subtitle: '한 번 뒤집으면 지각할 이유가 생깁니다.',
    category: '생활용품',
    value: 25,
    color: '#d3bfa0',
  },
  {
    id: 'mug',
    name: '한숨 담는 머그컵',
    subtitle: '오늘도 가득 찼네요. 리필은 무료입니다.',
    category: '생활용품',
    value: 20,
    color: '#ceaba0',
  },
  {
    id: 'lamp',
    name: '영감이 늦는 스탠드',
    subtitle: '불은 켜졌는데 아이디어는 배송 중입니다.',
    category: '전자제품',
    value: 30,
    color: '#c6c4a3',
  },
  {
    id: 'slippers',
    name: '소리 없는 출근 슬리퍼',
    subtitle: '들어온 것도, 나간 것도 아무도 모릅니다.',
    category: '생활용품',
    value: 20,
    color: '#bbaec7',
  },
  {
    id: 'crown',
    name: '하루짜리 왕관',
    subtitle: '권한은 없고 기분만 꽤 좋습니다.',
    category: '수집품',
    value: 40,
    color: '#d6be80',
  },
  {
    id: 'magnet',
    name: '잔돈 끌어오는 자석',
    subtitle: '큰돈은 아직 낯을 가립니다.',
    category: '수집품',
    value: 25,
    color: '#d39586',
  },
  {
    id: 'ticket',
    name: '목적지 없는 기차표',
    subtitle: '일단 떠나고 나서 생각해도 됩니다.',
    category: '수집품',
    value: 30,
    color: '#d2bf9e',
  },
  {
    id: 'rocket',
    name: '책상 탈출 로켓',
    subtitle: '발사는 안 됩니다. 상상은 가능합니다.',
    category: '수집품',
    value: 40,
    color: '#c8a098',
  },
  {
    id: 'phone',
    name: '과거로 거는 전화기',
    subtitle: '그때 사지 말걸. 그때 살걸. 통화 중입니다.',
    category: '전자제품',
    value: 35,
    color: '#a9b69f',
  },
  {
    id: 'clock',
    name: '눈치 보는 알람시계',
    subtitle: '너무 잘 자길래 차마 못 깨웠답니다.',
    category: '생활용품',
    value: 25,
    color: '#aabec5',
  },
  {
    id: 'pencil',
    name: '정답 빼고 쓰는 연필',
    subtitle: '창의력 점수는 높게 쳐주세요.',
    category: '생활용품',
    value: 20,
    color: '#d6c080',
  },
  {
    id: 'notebook',
    name: '작심삼일 무한 공책',
    subtitle: '첫 페이지에만 열정이 가득합니다.',
    category: '생활용품',
    value: 25,
    color: '#b2bea1',
  },
  {
    id: 'key',
    name: '어딘가의 비밀 열쇠',
    subtitle: '문은 별도 구매입니다. 위치는 모릅니다.',
    category: '수집품',
    value: 35,
    color: '#cdb685',
  },
  {
    id: 'suitcase',
    name: '휴가 먼저 간 여행가방',
    subtitle: '주인보다 공항을 더 자주 갑니다.',
    category: '생활용품',
    value: 35,
    color: '#c0a2a2',
  },
  {
    id: 'telescope',
    name: '내일만 보는 망원경',
    subtitle: '내일도 할 일이 많다는 건 잘 보입니다.',
    category: '수집품',
    value: 40,
    color: '#b6afc5',
  },
  {
    id: 'headphones',
    name: '잔소리 거르는 헤드폰',
    subtitle: '좋은 말만 들려서 배터리가 오래갑니다.',
    category: '전자제품',
    value: 35,
    color: '#a3b8b2',
  },
  {
    id: 'mirror',
    name: '월급날의 손거울',
    subtitle: '그날만큼은 제법 괜찮아 보입니다.',
    category: '생활용품',
    value: 30,
    color: '#c5adb6',
  },
  {
    id: 'bell',
    name: '간식 시간 알림 종',
    subtitle: '울리면 모두가 갑자기 부지런해집니다.',
    category: '수집품',
    value: 25,
    color: '#d5bb8c',
  },
];
export interface Mission {
  id: string;
  title: string;
  description: string;
  bonus: number;
  targetItem?: ItemId;
}
export const MISSIONS: readonly Mission[] = [
  ...ITEMS.map((item) => ({
    id: `collect-${item.id}`,
    title: `${item.name} 수집가`,
    description: `${item.name}을(를) 낙찰받으세요.`,
    bonus: 60,
    targetItem: item.id,
  })),
  {
    id: 'collector',
    title: '욕심 많은 수집가',
    description: '물건을 2개 이상 낙찰받으세요.',
    bonus: 50,
  },
  {
    id: 'thrifty',
    title: '알뜰한 큰손',
    description: '물건을 1개 이상 사고 코인 60개 이상을 남기세요.',
    bonus: 45,
  },
];
export interface WonItem {
  itemId: ItemId;
  price: number;
}
export interface PublicPlayer {
  id: string;
  name: string;
  avatar: number;
  coins: number;
  ready: boolean;
  connected: boolean;
  isBot: boolean;
  items: WonItem[];
}
export interface BidEvent {
  id: number;
  playerId: string;
  playerName: string;
  amount: number;
  at: number;
}
export interface BidRequest {
  auctionId: string;
  amount: number;
}
export interface RoundResult {
  round: number;
  itemId: ItemId;
  winnerId: string | null;
  winnerName: string | null;
  price: number;
}
export interface PlayerResult {
  playerId: string;
  rank: number;
  name: string;
  coins: number;
  itemScore: number;
  mission: Mission;
  missionComplete: boolean;
  missionScore: number;
  total: number;
}
export interface GameSnapshot {
  roomId: string;
  hostId: string;
  phase: Phase;
  practice: boolean;
  players: PublicPlayer[];
  round: number;
  totalRounds: number;
  currentItem: AuctionItem | null;
  /** Server-issued ID for this auction and its reveal; null in the lobby and final results. */
  auctionId: string | null;
  highestBid: number;
  highestBidderId: string | null;
  endsAt: number;
  serverNow: number;
  bidHistory: BidEvent[];
  roundResults: RoundResult[];
  results: PlayerResult[];
}
export interface SelfState {
  playerId: string;
  mission: Mission | null;
}
export interface GameError {
  code: string;
  message: string;
}
export interface ReactionEvent {
  playerId: string;
  emoji: string;
}
export const REACTIONS = ['👀', '🔥', '😂', '💸'] as const;
export function getItem(id: ItemId): AuctionItem {
  return ITEMS.find((item) => item.id === id)!;
}
export function missionCompleted(
  mission: Mission,
  player: Pick<PublicPlayer, 'items' | 'coins'>,
): boolean {
  if (mission.targetItem) return player.items.some((item) => item.itemId === mission.targetItem);
  if (mission.id === 'collector') return player.items.length >= 2;
  if (mission.id === 'thrifty') return player.items.length >= 1 && player.coins >= 60;
  return false;
}
/** Client -> server: sync, ready {ready:boolean}, start, bid BidRequest, restart, reaction {emoji:string}.
 * Server -> client: snapshot GameSnapshot, self SelfState, error GameError, reaction ReactionEvent.
 * Bids must use the displayed auctionId; clients and server must be updated together.
 * Clients create('auction',{name,practice}) / joinById(code,{name}), then send('sync') after registering handlers.
 * A private mission must NEVER be included in snapshots before phase=finished.
 */
