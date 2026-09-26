export const GAME = {
  minPlayers: 3,
  maxPlayers: 6,
  startingCoins: 100,
  bidStep: 5,
  rounds: 5,
  roundMs: 25000,
  revealMs: 4000,
} as const;
export type Phase = 'lobby' | 'auction' | 'reveal' | 'finished';
export type ItemId = 'duck' | 'keyboard' | 'banana' | 'sock' | 'globe';
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
/** Client -> server: sync, ready {ready:boolean}, start, bid {amount:number}, restart, reaction {emoji:string}.
 * Server -> client: snapshot GameSnapshot, self SelfState, error GameError, reaction ReactionEvent.
 * Clients create('auction',{name,practice}) / joinById(code,{name}), then send('sync') after registering handlers.
 * A private mission must NEVER be included in snapshots before phase=finished.
 */
