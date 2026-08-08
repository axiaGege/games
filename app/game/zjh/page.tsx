"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";

const SUITS = ["♠", "♥", "♣", "♦"];
const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];

const formatBet = (amount: number | string) => {
  if (amount === 0.5 || amount === "0.5") return "半杯";
  if (amount === 1  || amount === "1")  return "1杯";
  if (amount === 2  || amount === "2")  return "2杯";
  if (amount === 3  || amount === "3")  return "3杯";
  return String(amount) + "杯";
};

class SeededRandom {
  private seed: number;
  constructor(seed: number) { this.seed = seed; }
  next(): number {
    this.seed = (this.seed * 9301 + 49297) % 233280;
    return this.seed / 233280;
  }
}

const createDeckWithSeed = (seed: number) => {
  const deck: any[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank, id: `${rank}${suit}` });
    }
  }
  const rand = new SeededRandom(seed);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rand.next() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
};

const getRankValue = (rank: string): number => {
  const order = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
  return order.indexOf(rank);
};

const isTrips = (cards: any[]): boolean => {
  if (cards.length !== 3) return false;
  return cards[0].rank === cards[1].rank && cards[1].rank === cards[2].rank;
};

const isStraightFlush = (cards: any[]): boolean => {
  if (cards.length !== 3) return false;
  return isFlush(cards) && isStraight(cards);
};

const isFlush = (cards: any[]): boolean => {
  if (cards.length !== 3) return false;
  return cards[0].suit === cards[1].suit && cards[1].suit === cards[2].suit;
};

const isStraight = (cards: any[]): boolean => {
  if (cards.length !== 3) return false;
  const values = cards.map(c => getRankValue(c.rank)).sort((a, b) => a - b);
  if (values[0] === 0 && values[1] === 1 && values[2] === 12) return true;
  return values[2] - values[1] === 1 && values[1] - values[0] === 1;
};

const isPair = (cards: any[]): boolean => {
  if (cards.length !== 3) return false;
  return cards[0].rank === cards[1].rank ||
         cards[1].rank === cards[2].rank ||
         cards[0].rank === cards[2].rank;
};

const getHandRank = (cards: any[]): { rank: number; score: number[] } => {
  if (!cards || cards.length !== 3) {
    return { rank: 0, score: [0, 0, 0] };
  }

  const sorted = [...cards].sort((a, b) => getRankValue(b.rank) - getRankValue(a.rank));
  const values = sorted.map(c => getRankValue(c.rank));
  const isTripsResult = isTrips(sorted);
  const isStraightFlushResult = isStraightFlush(sorted);
  const isFlushResult = isFlush(sorted);
  const isStraightResult = isStraight(sorted);
  const isPairResult = isPair(sorted);

  if (isTripsResult) {
    return { rank: 5, score: [values[0], 0, 0] };
  }
  if (isStraightFlushResult) {
    if (values[0] === 12 && values[1] === 1 && values[2] === 0) {
      return { rank: 4, score: [2, 0, 0] };
    }
    return { rank: 4, score: [values[0], 0, 0] };
  }
  if (isFlushResult) {
    return { rank: 3, score: values };
  }
  if (isStraightResult) {
    if (values[0] === 12 && values[1] === 1 && values[2] === 0) {
      return { rank: 2, score: [2, 0, 0] };
    }
    return { rank: 2, score: [values[0], 0, 0] };
  }
  if (isPairResult) {
    let pairRank = 0;
    let kicker = 0;
    if (sorted[0].rank === sorted[1].rank) {
      pairRank = getRankValue(sorted[0].rank);
      kicker = getRankValue(sorted[2].rank);
    } else if (sorted[1].rank === sorted[2].rank) {
      pairRank = getRankValue(sorted[1].rank);
      kicker = getRankValue(sorted[0].rank);
    } else if (sorted[0].rank === sorted[2].rank) {
      pairRank = getRankValue(sorted[0].rank);
      kicker = getRankValue(sorted[1].rank);
    }
    return { rank: 1, score: [pairRank, kicker, 0] };
  }
  return { rank: 0, score: values };
};

const compareHandsZhaJinHua = (hand1: any[], hand2: any[]): number => {
  const r1 = getHandRank(hand1);
  const r2 = getHandRank(hand2);

  if (r1.rank !== r2.rank) {
    return r1.rank > r2.rank ? 1 : -1;
  }

  for (let i = 0; i < r1.score.length; i++) {
    if (r1.score[i] !== r2.score[i]) {
      return r1.score[i] > r2.score[i] ? 1 : -1;
    }
  }
  return 0;
};

// 修复4：A23顺子识别
const getBestThreeCards = (communityCard: any, handCard: any): any[] => {
  if (!communityCard || !handCard) return [];

  const allRanks = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
  const allSuits = ["♠", "♥", "♣", "♦"];

  if (communityCard.rank === handCard.rank) {
    const usedSuits = new Set([communityCard.suit, handCard.suit]);
    const suit = allSuits.find(s => !usedSuits.has(s)) || allSuits[0];
    return [communityCard, handCard, { suit, rank: communityCard.rank, isImaginary: true }];
  }

  const getValue = (rank: string) => allRanks.indexOf(rank);
  const cVal = getValue(communityCard.rank);
  const hVal = getValue(handCard.rank);
  const isSameSuit = communityCard.suit === handCard.suit;

  const getAwareValues = (v1: number, v2: number): [number, number][] => {
    const results: [number, number][] = [[v1, v2]];
    if (v1 === 12) results.push([0, v2]);
    if (v2 === 12) results.push([v1, 0]);
    if (v1 === 12 && v2 === 12) results.push([0, 0]);
    return results;
  };

  // 修复4：A23顺子识别
  const tryStraight = (v1: number, v2: number): string | null => {
    let a = Math.min(v1, v2);
    let b = Math.max(v1, v2);

    // A + 2 → 补 3，形成 A23
    if ((v1 === 12 && v2 === 0) || (v1 === 0 && v2 === 12)) return "3";
    // A + 3 → 补 2，形成 A23
    if ((v1 === 12 && v2 === 1) || (v1 === 1 && v2 === 12)) return "2";

    if (b - a === 1) {
      if (b < 12) return allRanks[b + 1];
      else return allRanks[a - 1];
    }
    if (b - a === 2) {
      return allRanks[a + 1];
    }
    if (a === 11 && b === 12) return "Q";
    return null;
  };

  const candidates: string[] = [];
  const valuePairs = getAwareValues(cVal, hVal);
  for (const [v1, v2] of valuePairs) {
    const third = tryStraight(v1, v2);
    if (third && third !== communityCard.rank && third !== handCard.rank) {
      candidates.push(third);
    }
  }
  // 修复3：同时考虑“凑对子”候选（想象第三张 = 公牌 或 手牌），避免 4+A 误判为单张
  if (communityCard.rank !== handCard.rank) {
    candidates.push(communityCard.rank); // 凑对公牌
    candidates.push(handCard.rank);      // 凑对手牌（如 A → 对A）
  }
  // 同花候选：用最大可用牌
  if (isSameSuit) {
    const used = new Set([communityCard.rank, handCard.rank]);
    const avail = allRanks.filter(r => !used.has(r));
    const best = avail[avail.length - 1];
    if (best) candidates.push(best);
  }

  const uniqueCandidates = [...new Set(candidates)];

  if (uniqueCandidates.length > 0) {
    let bestRank = uniqueCandidates[0];
    let bestScore = -1;
    for (const rank of uniqueCandidates) {
      // 修复3-2：为每个候选选花色。凑对子候选必须避开已有同 rank 牌的花色，避免变成非法重复牌并被误判为同花
      let suit: string;
      const existingSameRank = communityCard.rank === rank ? communityCard : (handCard.rank === rank ? handCard : null);
      if (existingSameRank) {
        suit = allSuits.find(s => s !== existingSameRank.suit) || allSuits[0];
      } else if (isSameSuit) {
        suit = communityCard.suit;
      } else {
        suit = allSuits.find(s => s !== communityCard.suit && s !== handCard.suit) || allSuits[0];
      }
      const testCards = [communityCard, handCard, { suit, rank, isImaginary: true }];
      const handRank = getHandRank(testCards);
      const score = handRank.rank * 100 + (handRank.score[0] || 0);
      if (score > bestScore) {
        bestScore = score;
        bestRank = rank;
      }
    }
    const existingSameRank = communityCard.rank === bestRank ? communityCard : (handCard.rank === bestRank ? handCard : null);
    const suit = existingSameRank
      ? (allSuits.find(s => s !== existingSameRank.suit) || allSuits[0])
      : (isSameSuit ? communityCard.suit : (allSuits.find(s => s !== communityCard.suit && s !== handCard.suit) || allSuits[0]));
    return [communityCard, handCard, { suit, rank: bestRank, isImaginary: true }];
  }

  if (isSameSuit) {
    const usedRanks = new Set([communityCard.rank, handCard.rank]);
    const avail = allRanks.filter(r => !usedRanks.has(r));
    const bestRank = avail[avail.length - 1] || "A";
    return [communityCard, handCard, { suit: communityCard.suit, rank: bestRank, isImaginary: true }];
  }

  const pairRank = cVal > hVal ? communityCard.rank : handCard.rank;
  const pairSuit = allSuits.find(s => s !== communityCard.suit && s !== handCard.suit) || allSuits[0];
  return [communityCard, handCard, { suit: pairSuit, rank: pairRank, isImaginary: true }];
};

const parsePlayers = (raw: any): any[] => {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    if (typeof parsed === 'object') {
      const arr = Object.values(parsed);
      if (arr.length > 0 && (arr[0] as any)?.name) return arr;
    }
  } catch {
    // 修复5：原正则兜底会生成一批 cards:[] 的空牌占位玩家，一旦被接收端拿去覆盖全场，
    // 会把其他玩家的手牌清成空白（"没开的玩家手牌变一样/消失"的真凶）。
    // 这里改为解析失败直接返回空数组，交给调用端"空则保持原状"逻辑处理，宁可不更新也不清牌。
    console.warn('⚠️ parsePlayers 解析失败，返回空数组以保持原状，raw:', raw);
    return [];
  }
  return [];
};

const getHandName = (cards: any[]): string => {
  if (!cards || cards.length !== 3) return '无牌';
  const r = getHandRank(cards);
  const names = ['单张', '对子', '顺子', '金花', '同花顺', '豹子'];
  return names[r.rank] || '未知';
};

const PokerCard = ({ card, hidden, size = 'medium', small, onClick }: { card?: any; hidden?: boolean; size?: 'small' | 'medium' | 'large'; small?: boolean; onClick?: () => void }) => {
  const actualSize = small ? 'small' : size;
  const sizeMap = {
    small: { width: 32, height: 46, fontSize: 12, symbolSize: 19, padding: 3 },
    medium: { width: 28, height: 40, fontSize: 11, symbolSize: 18, padding: 3 },
    large: { width: 36, height: 50, fontSize: 14, symbolSize: 24, padding: 4 },
  };
  const s = sizeMap[actualSize] || sizeMap.medium;

  const backFace = (
    <div style={{
      position: 'absolute',
      inset: 0,
      backfaceVisibility: 'hidden',
      WebkitBackfaceVisibility: 'hidden',
      transform: 'rotateY(180deg)',
      width: s.width,
      height: s.height,
      borderRadius: 4,
      background: 'linear-gradient(135deg, #1a237e 0%, #0d1442 100%)',
      border: '1.5px solid rgba(255,255,255,0.15)',
      boxShadow: '0 2px 8px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <div style={{
        position: 'absolute',
        inset: 0,
        background: 'repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(255,255,255,0.05) 4px, rgba(255,255,255,0.05) 8px)',
      }} />
      <span style={{ fontSize: s.symbolSize, opacity: 0.3, color: '#fff' }}>🃏</span>
    </div>
  );

  const isRed = card && (card.suit === '♥' || card.suit === '♦');
  const color = isRed ? '#ff1744' : '#1a1a1a';
  const rankDisplay = card ? (card.rank === '10' ? '10' : card.rank) : '';
  const isImaginary = card && card.isImaginary;
  const isSpade = card && card.suit === '♠';
  const isClub = card && card.suit === '♣';

  // 小尺寸牌复用下方统一正面（frontFace），不再单独分支

  const frontFace = (
    <div style={{
      width: s.width,
      height: s.height,
      borderRadius: 4,
      background: isImaginary ? '#fbf3c4' : '#ffffff',
      border: isImaginary ? '2px dashed #ffd700' : '1.5px solid rgba(0,0,0,0.12)',
      boxShadow: '0 2px 8px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.8)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'absolute',
      inset: 0,
    }}>
      {isImaginary && (
        <div style={{
          position: 'absolute',
          top: actualSize === 'small' ? -2 : -4,
          right: actualSize === 'small' ? -2 : -4,
          fontSize: actualSize === 'small' ? 7 : 10,
          color: '#ffd700',
          fontWeight: 'bold',
          textShadow: '0 0 4px rgba(255,215,0,0.4)',
        }}>★</div>
      )}
        <>
          {/* 红桃/方块/黑桃/梅花：角标推到边缘 + 中间花色；想象牌同样展示（金框保留） */}
          <div style={{
            position: 'absolute',
            top: (isRed || isSpade || isClub) ? 1 : s.padding,
            left: (isRed || isSpade || isClub) ? 1 : s.padding,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            lineHeight: 1,
            fontSize: s.fontSize * 0.85,
            fontWeight: 700,
            color: color,
          }}>
            <span>{rankDisplay}</span>
            <span style={{ fontSize: s.fontSize * 0.6 }}>{card.suit}</span>
          </div>
          <div style={{
            position: 'absolute',
            bottom: (isRed || isSpade || isClub) ? 1 : s.padding,
            right: (isRed || isSpade || isClub) ? 1 : s.padding,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            lineHeight: 1,
            fontSize: s.fontSize * 0.85,
            fontWeight: 700,
            color: color,
            transform: 'rotate(180deg)',
          }}>
            <span>{card.suit}</span>
            <span style={{ fontSize: s.fontSize * 0.6 }}>{rankDisplay}</span>
          </div>
          {/* 红桃/方块/黑桃：中间一个实心大花色；梅花：中间上下两朵小花（想象牌同样展示，金框保留） */}
          {(isRed || isSpade) && (
            <span style={{
              fontSize: actualSize === 'small' ? s.symbolSize * 0.55 : s.symbolSize * 0.75,
              color: color,
              lineHeight: 1,
              opacity: 0.92,
            }}>
              {card.suit}
            </span>
          )}
          {isClub && (
            <>
              <span style={{
                position: 'absolute',
                top: '32%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                fontSize: actualSize === 'small' ? s.symbolSize * 0.3 : s.symbolSize * 0.42,
                color: color,
                lineHeight: 1,
              }}>♣</span>
              <span style={{
                position: 'absolute',
                top: '68%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                fontSize: actualSize === 'small' ? s.symbolSize * 0.3 : s.symbolSize * 0.42,
                color: color,
                lineHeight: 1,
              }}>♣</span>
            </>
          )}
        </>
    </div>
  );

  return (
    <div style={{ width: s.width, height: s.height, perspective: 600, flexShrink: 0, cursor: onClick ? 'pointer' : 'default' }} onClick={onClick}>
      <div style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        transformStyle: 'preserve-3d',
        transition: 'transform 0.4s',
        transform: hidden ? 'rotateY(180deg)' : 'rotateY(0)',
      }}>
        {frontFace}
        {backFace}
      </div>
    </div>
  );
};

export default function ZhaJinHuaPage() {
  const [playerName, setPlayerName] = useState("");
  const [roomPassword, setRoomPassword] = useState("");
  const [joined, setJoined] = useState(false);
  const [roomId, setRoomId] = useState("");
  // 🔧 修复"invalid input syntax for type uuid: \"\"": setRoomId 是异步的（下一次渲染才生效），
  // 而 joinRoom 里 setRoomId(roomData.id) 之后立刻调用 broadcastAndSyncDB，此时闭包里的 roomId 仍是旧值（首次进房为空串），
  // 导致 .eq("id", "") 被数据库拒绝（22P02）。用 ref 做"即时生效的房间号"，赋值当场可读。
  const roomIdRef = useRef<string>("");

  const [players, setPlayers] = useState<any[]>([]);
  const [phase, setPhase] = useState<"waiting" | "dealing" | "betting" | "reveal" | "settlement" | "wheel">("waiting");
  const [dealerId, setDealerId] = useState<string | null>(null);
  // 🔥 原庄家退返标记：庄家离开时记下其名字，待结算阶段开新局前、若其已回房则把庄家身份还给他（仅走广播，不改数据库）
  const [pendingReturnDealer, setPendingReturnDealer] = useState<string | null>(null);
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [result, setResult] = useState<string>("");
  const [resultDetails, setResultDetails] = useState<any[]>([]);
  const resultDetailsRef = useRef<any[]>([]);
  // 🔧 2026-08-02：本轮统计（从抽庄到牌堆用完这一整轮，每个玩家累计喝多少杯）。跨把不清空，转盘抽庄后清零。
  const [roundDrinkTotals, setRoundDrinkTotals] = useState<Record<string, number>>({});
  const roundDrinkTotalsRef = useRef<Record<string, number>>({});
  const [seed, setSeed] = useState<number | null>(null);
  const [localDeck, setLocalDeck] = useState<any[]>([]);
  const localDeckRef = useRef<any[]>([]);
  // 🔧 D1修复：记录当前 localDeck 对应的种子与广播版本，避免"牌堆非空就不重建"导致第二副牌仍用旧牌（跨副牌错乱）
  const deckSeedRef = useRef<number | null>(null);
  const deckVersionRef = useRef<number>(0);
  const [deckOffset, setDeckOffset] = useState(0);
  const [communityCard, setCommunityCard] = useState<any>(null);
  const [myCards, setMyCards] = useState<any[]>([]);
  const [myBestHand, setMyBestHand] = useState<any[]>([]);
  const [showMyHand, setShowMyHand] = useState(false);
  const [version, setVersion] = useState<number>(0);
  const versionRef = useRef<number>(0);
  const [bettingComplete, setBettingComplete] = useState(false);
  const [revealTargets, setRevealTargets] = useState<string[]>([]);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startBettingTimeoutRef = useRef<any>(null);
  const [errorMsg, setErrorMsg] = useState("");
  // 🔧 小修复：提示文字设了之后 4 秒自动消失，避免"当前不是压酒阶段"等红字一直钉在屏幕上
  useEffect(() => {
    if (!errorMsg) return;
    const t = setTimeout(() => setErrorMsg(""), 4000);
    return () => clearTimeout(t);
  }, [errorMsg]);
  const [disconnected, setDisconnected] = useState(false);
  const [isDealer, setIsDealer] = useState(false);
  const [readyPlayers, setReadyPlayers] = useState<string[]>([]);
  const [wheelVisible, setWheelVisible] = useState(false);
  const [wheelRotation, setWheelRotation] = useState(0);
  const [wheelSelected, setWheelSelected] = useState<string | null>(null);
  const [wheelSpinning, setWheelSpinning] = useState(false);
  const [wheelSegments, setWheelSegments] = useState<string[]>([]);
  const channelRef = useRef<any>(null);
  const playersRef = useRef<any[]>([]);
  const phaseRef = useRef<string>(phase);
  const bettingCompleteRef = useRef<boolean>(bettingComplete);
  const [remainingCards, setRemainingCards] = useState(52);
  const [myBet, setMyBet] = useState(0);
  const [compareData, setCompareData] = useState<{
    dealerHand: any[];
    targetHand: any[];
    dealerHandName: string;
    targetHandName: string;
    playerName: string;
    result: string | null;
    penalty: number;
    who: string;
    showResult: boolean;
  } | null>(null);
  const [pendingReveal, setPendingReveal] = useState<{
    targetName: string;
    targetBet: number;
  } | null>(null);

  const [allCompareData, setAllCompareData] = useState<any[]>([]);

  // 修复5：全局庄家牌状态
  const [globalDealerHand, setGlobalDealerHand] = useState<any[]>([]);
  const [globalDealerHandName, setGlobalDealerHandName] = useState('');

  const [confirmDialog, setConfirmDialog] = useState<{
    message: string;
    onConfirm: () => void;
  } | null>(null);
  const isSettlingRef = useRef(false);
  const bettingTimeoutFiredRef = useRef(false);

  const betRef = useRef(0.5);

  // ===== 新增：转盘同步 refs =====
  const wheelSpinningRef = useRef(wheelSpinning);
  const wheelRotationRef = useRef(wheelRotation);
  // 同步状态到 ref
  useEffect(() => {
    wheelSpinningRef.current = wheelSpinning;
  }, [wheelSpinning]);
  useEffect(() => {
    wheelRotationRef.current = wheelRotation;
  }, [wheelRotation]);
  // ===============================

  useEffect(() => {
    playersRef.current = players;
  }, [players]);

  useEffect(() => {
    localDeckRef.current = localDeck;
  }, [localDeck]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (joined) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [joined]);

  const broadcastAndSyncDB = async (state: any) => {
    // 🔧 房间号一律走"即时便签"(ref) 优先：setRoomId 要等下一次渲染才生效，
    // joinRoom 里 setRoomId 后立刻调用本函数时，闭包里的 roomId 还是旧值（首次进房是空串）→ 写库 22P02。
    const rid = roomIdRef.current || roomId;
    // 按副本修法：用时间戳替代自增计数器，避免两客户端版本号碰撞导致广播被静默丢弃
    const newVersion = Date.now();
    versionRef.current = newVersion;
    setVersion(newVersion);
    // 自动从 ref 获取当前转盘状态
    const payload = {
      ...state,
      version: newVersion,
      bettingComplete: state.bettingComplete !== undefined ? state.bettingComplete : false,
      revealTargets: state.revealTargets || [],
      allCompareData: state.allCompareData || [],
      globalDealerHand: state.globalDealerHand || [],
      globalDealerHandName: state.globalDealerHandName || '',
      // 关键：加入转盘状态
      wheelSpinning: wheelSpinningRef.current,
      wheelRotation: wheelRotationRef.current,
    };
    try {
      const channel = channelRef.current || supabase.channel(`zhajinhua:${rid}`, { config: { broadcast: { ack: true } } });
      await channel.send({
        type: 'broadcast',
        event: 'gameState',
        payload,
      });
      console.log('📤 广播成功');
    } catch (error) {
      console.error('❌ 广播失败:', error);
      setDisconnected(true);
      setErrorMsg('⚠️ 连接断开,请检查网络后重试');
      return;
    }

    // 🔧 防御：房间号为空时直接跳过写库，避免 .eq("id","") 触发 22P02（invalid uuid）红字刷屏
    if (!rid) {
      console.warn('⚠️ 房间号为空，跳过本次数据库同步（广播已发出）');
      return;
    }

    try {
      // 🔧 修复 1/12：写库前以 DB 权威名单做并集,绝不因本地过期名单把别人顶掉
      // （本地名单缺的人从 DB 补回,其他字段以本地 state.players 为准）。根治"一直 1/12"。
      let writePlayers = state.players;
      try {
        const { data: dbRoom } = await supabase.from("rooms").select("players").eq("id", rid).single();
        if (dbRoom?.players) {
          // 🔧 修复：DB players 列可能是 JSON 字符串，必须 parsePlayers 解析后才能 .filter（否则并集保护静默失效）
          const dbParsed = parsePlayers(dbRoom.players);
          const localNames = new Set((state.players || []).map((p: any) => p.name));
          const missing = dbParsed.filter((p: any) => !localNames.has(p.name));
          if (missing.length > 0) writePlayers = [...(state.players || []), ...missing];
        }
      } catch (_) { /* 读库失败则不并集,沿用本地名单 */ }
      const { error: syncErr } = await supabase.from("rooms").update({
        players: writePlayers,
        phase: state.phase,
        dealerid: state.dealerId,
        gameover: state.gameOver,
        currentplayerindex: state.currentPlayerIndex || 0,
        result: state.result || "",
        resultdetails: state.resultDetails || [],
        readyplayers: state.readyPlayers || [],
        settlementstep: state.settlementStep || 0,
        seed: state.seed,
        // 修复2：仅在确实携带 deckOffset 时才写库，避免 undefined/0 把库里已有进度清零
        ...(state.deckOffset !== undefined && state.deckOffset !== null
            ? { deckoffset: state.deckOffset }
            : {}),
        wheelvisible: state.wheelVisible || false,
        wheelselected: state.wheelSelected || null,
        wheelsegments: state.wheelSegments || [],
        communitycard: state.communityCard || null,
        bettingcomplete: state.bettingComplete !== undefined ? state.bettingComplete : false,
        revealtargets: state.revealTargets || [],
        // 🔴 2026-08-02 根治：rooms 表【没有 version 列】，写它会让整条 update 被 PGRST204 整体拒绝
        //（players/phase/dealerid 全部一起写不进去）→ 长期 1/12、三人都当庄、轮询把人拉回准备的总根源。
        // version 仅作为广播消息的新旧标记（payload 里保留），绝不写库。对齐 067 的做法。
      }).eq("id", rid);
      // 🔴 关键：Supabase 写库失败不会抛异常，只在返回值里带 error。
      // 原代码没接返回值 → 写失败也照打"同步成功"，catch 永远不触发，问题被彻底掩盖。
      if (syncErr) {
        console.error(
          '🔴🔴🔴 数据库写入失败！把这段红字发给我：',
          '\n  message =', (syncErr as any).message,
          '\n  code    =', (syncErr as any).code,
          '\n  details =', (syncErr as any).details,
          '\n  hint    =', (syncErr as any).hint,
          '\n  raw     =', syncErr
        );
      } else {
        console.log('💾 数据库同步成功 phase=', state.phase);
      }
      setDisconnected(false);
    } catch (error) {
      console.error('⚠️ 数据库同步抛异常(不影响游戏实时同步):', error);
    }
  };

  // 🔥 修复8：在线状态(presence)——检测并清理掉线/关页的幽灵玩家
  const doLeaveRoomRef = useRef<any>(null);
  const seenOnlineRef = useRef<Set<string>>(new Set());
  const ghostTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  // 🔥 修复7：卡死自愈——心跳时间戳。
  // presence 只能证明"socket 还连着"，证明不了"这个客户端的 JS 还在跑"。
  // 手机锁屏/标签页被系统冻结时，socket 可能还挂着，但它的超时定时器不再触发，
  // 若此时正好轮到它下注/它是庄家，整局会永久卡住(旧 Bug2)。
  // 做法：每 10s 上报一次 ts；只有"当前正卡着全场的那个人"心跳过期才判定冻结，
  // 其他人短暂切后台一律不动，避免误踢。
  const HEARTBEAT_MS = 10000;
  const STALE_MS = 45000;
  const getMetaTs = (metas: any): number => {
    if (!Array.isArray(metas) || metas.length === 0) return 0;
    return Math.max(...metas.map((m: any) => Number(m?.ts) || 0));
  };
  // 当前"卡着全场"的人：压酒阶段=还没压酒的那位，开牌阶段=庄家；其余阶段无人阻塞
  const getBlockingPlayer = (): string | null => {
    const ph = phaseRef.current;
    const roster = playersRef.current || [];
    const dealerName = roster.find((p: any) => p.isDealer)?.name || null;
    if (ph === 'betting') {
      if (bettingCompleteRef.current) return null;
      const firstIdx = roster.findIndex((p: any) => p.status === 'playing' && p.name !== dealerName);
      if (firstIdx < 0) return null;
      for (let s = 0; s < roster.length; s++) {
        const cand = roster[(firstIdx + s) % roster.length];
        if (cand && cand.status === 'playing' && cand.name !== dealerName && (cand.bet || 0) === 0) {
          return cand.name;
        }
      }
      return null;
    }
    if (ph === 'reveal') return dealerName;
    return null;
  };
  const handlePresenceSync = () => {
    const ch = channelRef.current;
    if (!ch) return;
    const state = ch.presenceState() || {};
    const onlineNames = new Set(Object.keys(state));
    // 记录曾确认在线的人，建立基线，避免首帧(别人presence尚未同步)误删
    onlineNames.forEach((n) => seenOnlineRef.current.add(n));
    // 心跳过期(客户端冻结)的人；ts 为 0 表示对方版本没带心跳，一律不判冻结
    const now = Date.now();
    const frozenNames = new Set<string>();
    Object.keys(state).forEach((name) => {
      const ts = getMetaTs((state as any)[name]);
      if (ts > 0 && now - ts > STALE_MS) frozenNames.add(name);
    });
    const blocking = getBlockingPlayer();
    // 重新上线(且心跳正常)的人：取消其待删定时器
    Object.keys(ghostTimersRef.current).forEach((name) => {
      if (onlineNames.has(name) && !frozenNames.has(name)) {
        clearTimeout(ghostTimersRef.current[name]);
        delete ghostTimersRef.current[name];
      }
    });
    // 候选幽灵 = 非本人 且 (① 已不在 presence 里 ② 或 心跳冻结且正卡着全场)
    const candidates = playersRef.current.filter((p) => {
      if (p.name === playerName) return false;
      if (!onlineNames.has(p.name)) return true;
      return frozenNames.has(p.name) && p.name === blocking;
    });
    for (const p of candidates) {
      if (!seenOnlineRef.current.has(p.name)) continue; // 从未确认在线过，不动
      if (ghostTimersRef.current[p.name]) continue; // 已排定删除
      const reason: 'offline' | 'frozen' = onlineNames.has(p.name) ? 'frozen' : 'offline';
      ghostTimersRef.current[p.name] = setTimeout(() => {
        const cur = channelRef.current?.presenceState() || {};
        const nowOnline = new Set(Object.keys(cur));
        delete ghostTimersRef.current[p.name];
        if (reason === 'offline') {
          if (nowOnline.has(p.name)) return; // 已回来，放弃
        } else {
          // 冻结判定要更谨慎：必须"仍然心跳过期"且"仍然是卡着全场的人"才踢
          const ts = getMetaTs((cur as any)[p.name]);
          if (!(ts > 0 && Date.now() - ts > STALE_MS)) return;
          if (getBlockingPlayer() !== p.name) return;
        }
        // 仅"名单里第一个在线的人"(房主)执行删除，避免多端并发重复删；被判定者不参与房主评选
        const onlineRoster = playersRef.current.filter((x) => nowOnline.has(x.name) && x.name !== p.name);
        const hostName = onlineRoster.length ? onlineRoster[0].name : null;
        if (hostName === playerName) {
          console.log(reason === 'frozen' ? '🧊 清理卡死玩家(心跳超时):' : '👻 清理掉线幽灵玩家:', p.name);
          if (doLeaveRoomRef.current) doLeaveRoomRef.current(p.name);
        }
      }, 10000);
    }
  };

  const getMyPlayer = () => players.find(p => p.name === playerName);
  const activePlayers = players.filter(p => p.status === 'playing');
  const allReady = activePlayers.length >= 2 && activePlayers.every(p => readyPlayers.includes(p.name));
  const currentPlayer = players[currentPlayerIndex] || null;

  useEffect(() => {
    if (!roomId) return;
    console.log('🔄 订阅房间:', roomId);
    const channel = supabase
      .channel(`zhajinhua:${roomId}`, { config: { broadcast: { ack: true }, presence: { key: playerName } } })
      .on('broadcast', { event: 'gameState' }, (payload) => {
        const state = payload.payload;
        // 🔧 修复：结构性同步广播（加入/离开房间）不受版本号丢弃限制，必须无条件处理，
        // 否则重进玩家发出的广播永远被当成旧消息丢弃，导致人数/准备/牌堆全不同步
        // 按副本修法：版本比较改为 < 才丢弃（允许相等，避免同基数碰撞互丢广播）
        if (state.version && state.version < versionRef.current && !state.structuralSync) {
          console.log('⏭️ 忽略旧版本广播:', state.version, '当前:', versionRef.current);
          return;
        }
        if (state.version && !state.structuralSync) {
          versionRef.current = state.version;
          setVersion(state.version);
        }
        // 🔧 2026-08-02：接收端同步本轮统计（庄家累加后随广播下发，其他玩家直接采用）
        if (state.roundDrinkTotals && Object.keys(state.roundDrinkTotals).length > 0) {
          roundDrinkTotalsRef.current = state.roundDrinkTotals;
          setRoundDrinkTotals(state.roundDrinkTotals);
        }
        const parsedPlayers = parsePlayers(state.players);
        // 🔧 任何广播都让内部名单(playersRef)立刻跟上最新，避免发起方(finishReveal/dealCards)
        // 用滞后快照算错下注顺序/归还判定。
        // 典型场景：原庄家返回时新庄家端名单靠 400ms 异步补齐且只更 state 不更 ref，
        // 导致点"开始新对局"时 ref 里无原庄家→归还失效、firstIdx 错位、压酒按钮不出。
        if (parsedPlayers.length > 0) {
          playersRef.current = parsedPlayers;
        }

        if (state.phase === "betting" || state.phase === "dealing" || state.phase === "waiting") {
          isSettlingRef.current = false;
        }

        setPlayers(prev => {
          // 修复5：广播里带了 players 但解析失败(返回空数组)时，保持本地原状，绝不用空数组清空全场手牌
          if (parsedPlayers.length === 0 && state.players && prev.length > 0) return prev;
          if (isSettlingRef.current && state.phase !== "settlement" && state.phase !== "wheel" && !state.structuralSync) return prev;
          const localMe = prev.find(p => p.name === playerName);
          const remoteMe = parsedPlayers.find(p => p.name === playerName);
          // 🔥 修复（2026-08-02）：正常游戏广播中 players 里的 cards 是庄家算好的权威牌，
          // 必须无条件下用远程牌覆盖本地，否则"显示用的牌(myCards)"与"计算/对比用的牌(playersRef)"
          // 会分叉——典型症状：自己私牌显示正确，但开牌对比/庄家牌却用的是上一把的旧牌。
          // 旧 hasLocalCards 分支在下注广播(bet>0)时把本地旧牌写回，正是乱源，已删除。
          // 仅两种例外保留本地：①结构性同步(加入/离开)不冲掉正在玩的人的牌；②远程名单不含自己(旧名单)时并集防 1/12。
          if (state.structuralSync) {
            const localNames = new Set(prev.map((p: any) => p.name));
            const merged = [...prev];
            parsedPlayers.forEach((p: any) => { if (!localNames.has(p.name)) merged.push(p); });
            return merged;
          }
          // 🔧 修复 1/12：收到别人旧名单(不含自己)时,不把自己覆盖掉,改为并集收敛
          // （保留本地所有人,只补远程名单里本地没有的新人）。否则自己被从屏幕删掉→显示 1/12。
          if (localMe && !remoteMe) {
            const localNames = new Set(prev.map((p: any) => p.name));
            const merged = [...prev];
            parsedPlayers.forEach((p: any) => { if (!localNames.has(p.name)) merged.push(p); });
            return merged;
          }
          // 正常游戏广播：远程 players(含权威 cards)直接采用，杜绝本地旧牌污染
          return parsedPlayers;
        });

        // 🔧 结构性同步（加入/离开房间）只更新玩家名单，绝不覆盖任何游戏状态
        // （牌堆/阶段/准备名单/seed 等）。否则重进者用他从数据库读到的快照把正在玩的人全重置，
        // 表现为：牌堆跳回52、对局没了、其他人被跳成已准备。
        // 🔥 例外：庄家离开（leaveSync）时，必须落地"转移后的新庄家 + 保留的阶段/牌堆"，
        // 否则算好的转移传不出去（其他人永远看不到新庄家、牌堆被刷）。
        // leaveSync 仅由 doLeaveRoom 在"庄家离开"时置 true，加入/重进/非庄家离开均不置，故不回归。
        if (state.structuralSync) {
          // 🔥 彻底兜底：以数据库权威名单收敛人数——收到进/出消息后主动拉库核对，
          // 即使实时广播漏了一条，人数也必然一致（只增删人，不碰牌/下注/身份）
          scheduleReconcile();
          // 非 leaveSync（加入/重进/非庄家离开）→ 只收敛名单，不覆盖游戏状态
          if (!state.leaveSync) return;
          // leaveSync（庄家离开）→ 继续向下落地完整状态（新庄家/阶段/牌堆）
        }

        const prevPhase = phaseRef.current;
        const newPhase = state.phase || "waiting";
        // 🔧 2026-08-07 根治：对局进行中收到迟到的旧"等待"消息 → 被无条件拉回准备/牌堆刷新。
        // 完整顺序含 waiting，用于正确判定"前进/倒退"。真重置(resetGame/庄家离开)带 forcePhase 照常生效。
        const phaseOrder = ["waiting", "dealing", "betting", "reveal", "settlement", "wheel"];
        const prevIdx = phaseOrder.indexOf(prevPhase);
        const newIdx = phaseOrder.indexOf(newPhase);

        let effectivePhase;
        if (state.forcePhase) {
          effectivePhase = newPhase;
        } else if (newPhase === "betting" && prevPhase === "reveal") {
          // 特例：开牌结算后重发牌回到压酒（合法倒退），仍接受
          effectivePhase = newPhase;
        } else if (prevIdx >= 0 && newIdx >= 0 && newIdx >= prevIdx) {
          // 正常前进或同阶段：接受（含 waiting→betting 推进，修复新玩家卡"半准备"）
          effectivePhase = newPhase;
        } else {
          // 倒退（如进行中收到迟到的旧"等待"）→ 忽略，保持当前阶段，避免连锁重置全场
          effectivePhase = prevPhase;
        }

        setPhase(effectivePhase);
        phaseRef.current = effectivePhase;
        // 修复9：收起"查看手牌"。发牌广播带 resetView 标记，接收端收到即重置，覆盖所有发新牌路径（整局dealCards / 开牌后重发finishReveal），不再依赖 phase 推断
        if (state.resetView) {
          setShowMyHand(false);
        }
        setGameOver(state.gameOver || false);
        setDealerId(state.dealerId || null);
        // 🔥 同步原庄家退返标记（仅庄家离开广播/开新局广播会携带，其余不携带则不改动，避免误清空）
        if (state.pendingReturnDealer !== undefined) setPendingReturnDealer(state.pendingReturnDealer);
        setCurrentPlayerIndex(state.currentPlayerIndex || 0);
        // 🔧 修复C1：压酒阶段轮转（正常轮转 / 有人离开·加入 / 重进）后，若"当前该下注的人"变成了我且我还没下注，
        // 给本端补一次 30s 自动压酒倒计时。否则下一位玩家永远拿不到超时，挂机即永久卡死。
        // 用 startBettingTimeoutRef 取最新函数 + 显式传下标，避免广播回调闭包过期 / setState 异步导致定位错位。
        if (state.phase === "betting" && !bettingCompleteRef.current && !timeoutRef.current) {
          const cpNow = parsedPlayers[state.currentPlayerIndex || 0];
          if (cpNow && cpNow.name === playerName && !(cpNow.bet > 0)) {
            startBettingTimeoutRef.current?.(state.currentPlayerIndex || 0);
          }
        }
        setResult(state.result || "");
        setResultDetails(state.resultDetails || []);
        resultDetailsRef.current = state.resultDetails || [];
        setReadyPlayers(state.readyPlayers || []);
        // 修复8：接收端牌堆保护——只在广播显式携带时才更新，避免漏带字段把本地进度误清零（与修复2写库保护对称）
        if (state.seed !== undefined) setSeed(state.seed);
        if (state.deckOffset !== undefined) { setDeckOffset(state.deckOffset); deckOffsetRef.current = state.deckOffset; }
        setWheelVisible(state.wheelVisible || false);
        setWheelSelected(state.wheelSelected || null);
        setWheelSegments(state.wheelSegments || []);
        // 新增：接收转盘旋转状态
        if (state.wheelSpinning !== undefined) setWheelSpinning(state.wheelSpinning);
        if (state.wheelRotation !== undefined) setWheelRotation(state.wheelRotation);
        // 🔧 修复：公牌只在广播显式携带时才更新——避免后续不带公牌的下注广播把已设好的公牌清成 null（导致"想象牌 无牌"）
        if (state.communityCard !== undefined) setCommunityCard(state.communityCard);
        if (state.revealTargets) setRevealTargets(state.revealTargets);
        if (state.allCompareData) setAllCompareData(state.allCompareData);

        // 修复5：接收全局庄家牌
        if (state.globalDealerHand) setGlobalDealerHand(state.globalDealerHand);
        if (state.globalDealerHandName) setGlobalDealerHandName(state.globalDealerHandName);

        // 🔥 leaveSync 等结构性广播可能不携带 compareData，此时保留现有对比数据，绝不清空
        // （否则开牌对比面板会误把庄家手牌显示成"无牌"）
        if (state.compareData !== undefined) {
          setCompareData(state.compareData);
          if (state.compareData && state.compareData.showResult) {
            setPendingReveal({
              targetName: state.compareData.playerName,
              targetBet: state.compareData.penalty || 0.5,
            });
          } else {
            setPendingReveal(null);
          }
        }

        // 🔧 D1修复：种子变了就重建本地牌堆（不再依赖 length===0）。
        // 否则第二副牌时各客户端牌堆仍停在上一副，开牌/换公牌会用错牌、污染全桌。
        // 配 version 护栏：旧版本广播(种子过期)不降级重建。
        if (state.seed === null) {
          setLocalDeck([]);
          localDeckRef.current = [];
          setDeckOffset(0);
          deckSeedRef.current = null;
          deckVersionRef.current = 0;
        } else if (
          state.seed &&
          state.seed !== deckSeedRef.current &&
          (state.version === undefined || state.version >= deckVersionRef.current)
        ) {
          const newDeck = createDeckWithSeed(state.seed);
          setLocalDeck(newDeck);
          localDeckRef.current = newDeck;
          deckSeedRef.current = state.seed;
          if (state.version !== undefined) deckVersionRef.current = state.version;
        }

        if (state.deckOffset !== undefined) {
          setRemainingCards(52 - state.deckOffset);
        }

        if (state.bettingComplete !== undefined) {
          setBettingComplete(state.bettingComplete);
          bettingCompleteRef.current = state.bettingComplete;
        }
        const me = parsedPlayers.find(p => p.name === playerName);
        if (state.phase === "betting") setMyBet(0);

        if (state.phase === "reveal" && me?.isDealer && !gameOver) {
          startRevealTimeout();
        }

        const newCommunity = state.communityCard || communityCard;
        if (me) {
          setIsDealer(me.isDealer || false);
          setMyCards(me.cards || []);
          if (newCommunity && me.cards && me.cards.length > 0) {
            const best = getBestThreeCards(newCommunity, me.cards[0]);
            setMyBestHand(best);
          } else {
            setMyBestHand([]);
          }
        }
        setDisconnected(false);
      })
      .on('presence', { event: 'sync' }, () => handlePresenceSync())
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          try { await channel.track({ name: playerName, ts: Date.now() }); } catch (_) {}
        }
      });

    channelRef.current = channel;
    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, [roomId, playerName]);

  // 🔥 修复7：心跳上报 + 定期自检。
  // 上报自己"JS 还活着"；顺便定期跑一遍幽灵/卡死检测（不能只靠 presence sync 事件，
  // 因为对方彻底冻结时不会再发事件，需要本端自己按节奏复查）。
  useEffect(() => {
    if (!roomId) return;
    const timer = setInterval(() => {
      const ch = channelRef.current;
      if (!ch) return;
      try { ch.track({ name: playerName, ts: Date.now() }); } catch (_) {}
      handlePresenceSync();
    }, HEARTBEAT_MS);
    return () => clearInterval(timer);
  }, [roomId, playerName]);

  // 🔥 修复P1：低频 DB 轮询兜底（弱网 broadcast 丢帧时自愈），每 POLL_MS 拉一次权威状态
  useEffect(() => {
    if (!roomId) return;
    const t = setInterval(pollRoomStateFromDB, POLL_MS);
    return () => clearInterval(t);
  }, [roomId, playerName]);

  // ===== 新增：远程客户端自动同步转盘动画 =====
  useEffect(() => {
    // 当收到 wheelSpinning = true 且 wheelRotation = 0 时（表示开始旋转），所有客户端用相同的 seed 和 segments 计算目标角度
    if (wheelSpinning && wheelRotation === 0 && wheelSegments.length > 0 && seed !== null) {
      const totalSegments = wheelSegments.length;
      const rand = new SeededRandom(seed);
      const winIndex = Math.floor(rand.next() * totalSegments);
      const segmentAngle = 360 / totalSegments;
      const extraSpins = 5 + Math.floor(rand.next() * 3);
      const targetAngle = 360 * extraSpins + (360 - winIndex * segmentAngle - segmentAngle / 2);
      setWheelRotation(targetAngle);
      // 注意：最终 winner 将在广播中由庄家公布，这里只负责动画
    }
  }, [wheelSpinning, wheelRotation, wheelSegments, seed]);
  // ==========================================

  const createRoom = async () => {
    if (!playerName.trim()) { setErrorMsg("请输入名字"); return; }
    if (!roomPassword.trim()) { setErrorMsg("请设置房间密码"); return; }
    setErrorMsg("");

    const { data: existing } = await supabase
      .from("rooms")
      .select("password")
      .eq("password", roomPassword.trim())
      .maybeSingle();

    if (existing) {
      setErrorMsg("这个密码已被使用,请换一个");
      return;
    }

    const newPlayer = { name: playerName.trim(), cards: [], cardCount: 0, seatId: 0, isDealer: false, status: 'playing', bet: 0 };
    const { data, error } = await supabase
      .from("rooms")
      .insert({
        game_type: "zhajinhua",
        password: roomPassword.trim(),
        players: [newPlayer],
        phase: "waiting",
        dealerid: null,
        gameover: false,
        currentplayerindex: 0,
        seed: null,
        readyplayers: [playerName.trim()],
        result: "",
        resultdetails: [],
        settlementstep: 0,
        deckoffset: 0,
        wheelvisible: false,
        wheelselected: null,
        wheelsegments: [],
        communitycard: null,
      })
      .select()
      .single();

    if (error) {
      setErrorMsg("创建失败: " + error.message);
      return;
    }

    setRoomId(data.id);
    roomIdRef.current = data.id; // 🔧 同步即时房间号，供本次调用内的写库/广播使用
    const parsedPlayers = parsePlayers(data.players);
    setPlayers(parsedPlayers);
    playersRef.current = parsedPlayers;
    setJoined(true);
    try {
      localStorage.setItem('zjh_name', playerName.trim());
      localStorage.setItem('zjh_pass', roomPassword.trim());
      localStorage.setItem('zjh_room', data.id);
    } catch (_) {}
    await broadcastAndSyncDB({
      players: parsedPlayers,
      phase: "waiting",
      dealerId: null,
      currentPlayerIndex: 0,
      gameOver: false,
      result: "",
      resultDetails: [],
      readyPlayers: [playerName.trim()],
      settlementStep: 0,
      seed: null,
      deckOffset: 0,
      wheelVisible: false,
      wheelSelected: null,
      wheelSegments: [],
      communityCard: null,
      revealTargets: [],
      allCompareData: [],
      globalDealerHand: [],
      globalDealerHandName: '',
    });
  };

  const joinRoom = async () => {
    if (!playerName.trim()) { setErrorMsg("请输入名字"); return; }
    if (!roomPassword.trim()) { setErrorMsg("请输入房间密码"); return; }
    setErrorMsg("");

    const { data: roomData, error: roomError } = await supabase
      .from("rooms")
      .select("*")
      .eq("password", roomPassword.trim())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (roomError || !roomData) {
      setErrorMsg("密码错误,未找到对应房间");
      return;
    }

    // 🔴 2026-08-02：原先在这里"从数据库对表版本号"，但 rooms 表根本没有 version 列，
    // 读出来永远 undefined → 这段是死代码。现在 version 一律用 Date.now() 时间戳（广播专用），
    // 天然单调递增、跨客户端可比，无需与数据库对表。

    const currentPlayers = parsePlayers(roomData.players);
    if (currentPlayers.length >= 12) {
      setErrorMsg("房间已满(最多12人)");
      return;
    }

    // 修复8：恢复会话分支也要触发广播，保证人数同步
    if (currentPlayers.some((p: any) => p.name === playerName.trim())) {
      setRoomId(roomData.id);
      roomIdRef.current = roomData.id; // 🔧 同步即时房间号
      setJoined(true);
      setPlayers(currentPlayers);
      playersRef.current = currentPlayers;
      setPhase(roomData.phase || "waiting");
      setDealerId(roomData.dealerid || null);
      setGameOver(roomData.gameover || false);
      setCurrentPlayerIndex(roomData.currentplayerindex || 0);
      setSeed(roomData.seed || null);
      setReadyPlayers(roomData.readyplayers || []);
      setResult(roomData.result || "");
      setResultDetails(roomData.resultdetails || []);
      resultDetailsRef.current = roomData.resultdetails || [];
      // 修复7：保留牌堆进度
      // 🔥 修改：从数据库读取 deckOffset，如果为0但游戏已开始，尝试从 localStorage 恢复
      let deckOffsetFromDB = roomData.deckoffset || 0;

      if (deckOffsetFromDB === 0 && roomData.seed) {
        try {
          const savedOffset = localStorage.getItem(`zjh_deckOffset_${roomData.id}`);
          if (savedOffset !== null) {
            const parsed = parseInt(savedOffset, 10);
            if (!isNaN(parsed) && parsed > 0) {
              deckOffsetFromDB = parsed;
              await supabase.from("rooms").update({ deckoffset: parsed }).eq("id", roomData.id);
            }
          }
        } catch (_) {}
      }

      setDeckOffset(deckOffsetFromDB);
      setRemainingCards(52 - deckOffsetFromDB);
      setWheelVisible(roomData.wheelvisible || false);
      setWheelSelected(roomData.wheelselected || null);
      setWheelSegments(roomData.wheelsegments || []);
      // 恢复转盘旋转状态（通常为 false, 0）
      setWheelSpinning(false);
      setWheelRotation(0);
      setCommunityCard(roomData.communitycard || null);
      if (roomData.result) setResult(roomData.result);
      if (roomData.revealtargets) setRevealTargets(roomData.revealtargets);
      else setRevealTargets([]);
      if (roomData.allCompareData) setAllCompareData(roomData.allCompareData);
      else setAllCompareData([]);

      if (roomData.seed) {
        const newDeck = createDeckWithSeed(roomData.seed);
        setLocalDeck(newDeck);
        localDeckRef.current = newDeck;
        deckSeedRef.current = roomData.seed;
      }
      const meRestore = currentPlayers.find((p: any) => p.name === playerName.trim());
      if (meRestore) {
        if (meRestore.cards && meRestore.cards.length > 0) {
          setMyCards(meRestore.cards);
          if (roomData.communitycard && meRestore.cards[0]) {
            const best = getBestThreeCards(roomData.communitycard, meRestore.cards[0]);
            setMyBestHand(best);
          }
        }
        setIsDealer(meRestore.isDealer || false);
        setMyBet(meRestore.bet || 0);
      }

      if (roomData.phase === "betting") {
        const cp = currentPlayers[roomData.currentplayerindex || 0];
        if (cp && cp.name === playerName.trim() && !cp.bet) {
          startBettingTimeout();
        }
      }

      try {
        localStorage.setItem('zjh_name', playerName.trim());
        localStorage.setItem('zjh_pass', roomPassword.trim());
        localStorage.setItem('zjh_room', roomData.id);
      } catch (_) {}

      // 修复8：恢复会话时也要广播，确保所有客户端人数同步
      let retries = 0;
      while (!channelRef.current && retries < 30) {
        await new Promise(resolve => setTimeout(resolve, 100));
        retries++;
      }
      await broadcastAndSyncDB({
        structuralSync: true,
        players: currentPlayers,
        phase: roomData.phase || "waiting",
        dealerId: roomData.dealerid || null,
        currentPlayerIndex: roomData.currentplayerindex || 0,
        gameOver: roomData.gameover || false,
        result: roomData.result || "",
        resultDetails: roomData.resultdetails || [],
        readyPlayers: roomData.readyplayers || [],
        settlementStep: roomData.settlementstep || 0,
        seed: roomData.seed || null,
        deckOffset: roomData.deckoffset || 0,
        wheelVisible: roomData.wheelvisible || false,
        wheelSelected: roomData.wheelselected || null,
        wheelSegments: roomData.wheelsegments || [],
        communityCard: roomData.communitycard || null,
        revealTargets: roomData.revealtargets || [],
        allCompareData: roomData.allCompareData || [],
        globalDealerHand: [],
        globalDealerHandName: '',
      });
      return;
    }

    // 修复7/9：新玩家加入时，如果在对局中则自动成为观战者
    // 在 waiting 阶段则直接成为 playing
    const isGameActive = roomData.phase !== "waiting" && roomData.phase !== "settlement";

    // 🔧 修复 1/12 根因 + C1 并发安全：进房写库改为「读 DB 最新名单 → 合并自己 → 直接写」。
    // 去掉原会误判失败的 .eq("version") 守卫（RLS 下 .select() 返回空→永远失败→finalPlayers 停在旧快照→1/12）。
    // 成功判定改用写入 error；每次重读最新库再合并，最后写赢；极端并发丢人由 8 秒轮询兜底自愈。
    let finalPlayers: any[] = currentPlayers;
    let joinSuccess = false;
    for (let attempt = 0; attempt < 5 && !joinSuccess; attempt++) {
      const { data: latestRoom, error: readErr } = await supabase
        .from("rooms")
        .select("players, readyplayers")
        .eq("id", roomData.id)
        .single();
      if (readErr) continue; // 读库失败 → 重试
      const latestPlayers = latestRoom ? parsePlayers((latestRoom as any).players) : currentPlayers;
      const myName = playerName.trim();
      if (latestPlayers.some((p: any) => p.name === myName)) {
        // 已加入（多半是并发时对方先写入），直接采用最新名单，不再重复写
        finalPlayers = latestPlayers;
        joinSuccess = true;
        break;
      }
      // 基于最新名单重算座位号（避免并发两人拿到同一 seatId）
      const occupiedSeats = latestPlayers.map((p: any) => p.seatId).filter((id: number) => id !== undefined);
      let seatId = 0;
      for (let i = 0; i < 12; i++) {
        if (!occupiedSeats.includes(i)) { seatId = i; break; }
      }
      const newPlayer = {
        name: myName,
        cards: [],
        cardCount: 0,
        seatId,
        isDealer: false,
        status: isGameActive ? 'watching' : 'playing',
        bet: 0,
      };
      const merged = [...latestPlayers, newPlayer];
      const { error: writeErr } = await supabase
        .from("rooms")
        .update({ players: merged, readyplayers: (latestRoom as any)?.readyplayers || [] })
        .eq("id", roomData.id);
      if (!writeErr) {
        finalPlayers = merged;
        joinSuccess = true;
      }
      // 写入失败（网络等）→ 重试，重新读取最新名单再合并
    }
    // 🔧 修复 1/12 根因兜底：万一 5 次重试仍失败（如持续断网），最后以 DB 为准强制补上自己。
    // 同样去掉脆弱的 .select() 行数判定，改用写入 error 判成功。
    if (!joinSuccess) {
      try {
        const { data: latestRoom2, error: readErr2 } = await supabase.from("rooms").select("players, readyplayers").eq("id", roomData.id).single();
        if (latestRoom2 && !readErr2) {
          const dbPlayers = parsePlayers((latestRoom2 as any).players);
          if (!dbPlayers.some((p: any) => p.name === playerName.trim())) {
            const occupiedSeats = dbPlayers.map((p: any) => p.seatId).filter((id: number) => id !== undefined);
            let seatId = 0;
            for (let i = 0; i < 12; i++) { if (!occupiedSeats.includes(i)) { seatId = i; break; } }
            const newPlayer = { name: playerName.trim(), cards: [], cardCount: 0, seatId, isDealer: false, status: isGameActive ? 'watching' : 'playing', bet: 0 };
            const { error: writeErr2 } = await supabase.from("rooms").update({ players: [...dbPlayers, newPlayer], readyplayers: (latestRoom2 as any)?.readyplayers || [] }).eq("id", roomData.id);
            if (!writeErr2) { finalPlayers = [...dbPlayers, newPlayer]; joinSuccess = true; }
          } else {
            finalPlayers = dbPlayers;
            joinSuccess = true;
          }
        }
      } catch (_) {}
    }
    const updatedPlayers = finalPlayers;

    setRoomId(roomData.id);
    roomIdRef.current = roomData.id; // 🔧 同步即时房间号：紧接着的 broadcastAndSyncDB 就靠它，否则写库拿到空串报 22P02
    setJoined(true);
    setPlayers(updatedPlayers);
    playersRef.current = updatedPlayers;
    setReadyPlayers(roomData.readyplayers || []);
    setPhase(roomData.phase || "waiting");
    setDealerId(roomData.dealerid || null);
    setGameOver(roomData.gameover || false);
    setCurrentPlayerIndex(roomData.currentplayerindex || 0);
    setSeed(roomData.seed || null);
    setResult(roomData.result || "");
    setResultDetails(roomData.resultdetails || []);
    resultDetailsRef.current = roomData.resultdetails || [];
    // 修复7：保留牌堆进度，不重置
    // 🔥 修改：从数据库读取 deckOffset，如果为0但游戏已开始，尝试从 localStorage 恢复
    let deckOffsetFromDB = roomData.deckoffset || 0;

    if (deckOffsetFromDB === 0 && roomData.seed) {
      try {
        const savedOffset = localStorage.getItem(`zjh_deckOffset_${roomData.id}`);
        if (savedOffset !== null) {
          const parsed = parseInt(savedOffset, 10);
          if (!isNaN(parsed) && parsed > 0) {
            deckOffsetFromDB = parsed;
            await supabase.from("rooms").update({ deckoffset: parsed }).eq("id", roomData.id);
          }
        }
      } catch (_) {}
    }

    setDeckOffset(deckOffsetFromDB);
    setRemainingCards(52 - deckOffsetFromDB);
    setWheelVisible(roomData.wheelvisible || false);
    setWheelSelected(roomData.wheelselected || null);
    setWheelSegments(roomData.wheelsegments || []);
    setWheelSpinning(false);
    setWheelRotation(0);
    setCommunityCard(roomData.communitycard || null);
    if (roomData.revealtargets) setRevealTargets(roomData.revealtargets);
    else setRevealTargets([]);
    if (roomData.allCompareData) setAllCompareData(roomData.allCompareData);
    else setAllCompareData([]);

    if (roomData.seed) {
      const newDeck = createDeckWithSeed(roomData.seed);
      setLocalDeck(newDeck);
      localDeckRef.current = newDeck;
      deckSeedRef.current = roomData.seed;
    }

    try {
      localStorage.setItem('zjh_name', playerName.trim());
      localStorage.setItem('zjh_pass', roomPassword.trim());
      localStorage.setItem('zjh_room', roomData.id);
    } catch (_) {}

    let retries = 0;
    while (!channelRef.current && retries < 30) {
      await new Promise(resolve => setTimeout(resolve, 100));
      retries++;
    }
    if (!channelRef.current) {
      console.warn('⚠️ 等待超时，channel 未建立，广播可能无法送达');
    }

    // 修复8：广播更新，所有客户端同步人数
    await broadcastAndSyncDB({
      structuralSync: true,
      players: updatedPlayers,
      phase: roomData.phase || "waiting",
      dealerId: roomData.dealerid || null,
      currentPlayerIndex: roomData.currentplayerindex || 0,
      gameOver: roomData.gameover || false,
      result: roomData.result || "",
      resultDetails: roomData.resultdetails || [],
      readyPlayers: roomData.readyplayers || [],
      settlementStep: roomData.settlementstep || 0,
      seed: roomData.seed || null,
      deckOffset: roomData.deckoffset || 0,
      wheelVisible: roomData.wheelvisible || false,
      wheelSelected: roomData.wheelselected || null,
      wheelSegments: roomData.wheelsegments || [],
      communityCard: roomData.communitycard || null,
      revealTargets: roomData.revealtargets || [],
      allCompareData: roomData.allCompareData || [],
      globalDealerHand: [],
      globalDealerHandName: '',
    });
  };

  const joinRoomRef = useRef(joinRoom);
  joinRoomRef.current = joinRoom;

  useEffect(() => {
    let savedName: string | null = null;
    let savedPass: string | null = null;
    let savedRoom: string | null = null;
    try {
      savedName = localStorage.getItem('zjh_name');
      savedPass = localStorage.getItem('zjh_pass');
      savedRoom = localStorage.getItem('zjh_room');
    } catch (_) {}
    if (savedName && savedPass && savedRoom) {
      console.log('🔄 检测到存档，自动恢复:', savedName, savedRoom);
      setPlayerName(savedName);
      setRoomPassword(savedPass);
      setRoomId(savedRoom);
      roomIdRef.current = savedRoom; // 🔧 同步即时房间号
      setTimeout(() => { joinRoomRef.current(); }, 500);
    }
  }, []);

  // 修复：开全部（revealAll）后，自动给每位玩家展示“自己 vs 庄家”的输赢结果。
  // 仅在「reveal 阶段 + 全部数据已到 + 当前对比卡为空」时触发；
  // 逐开（对比卡已有内容）、结算、下一局均不会误触发。每个客户端各算各的，不改服务器/他人。
  useEffect(() => {
    if (phase === 'reveal' && allCompareData.length > 0 && !compareData) {
      const myRecord = resultDetails.find(d => d.player === playerName);
      if (myRecord && myRecord.dealerHand && myRecord.dealerHand.length > 0) {
        setCompareData({
          dealerHand: myRecord.dealerHand,
          targetHand: myRecord.targetHand,
          dealerHandName: myRecord.dealerHandName,
          targetHandName: myRecord.targetHandName,
          playerName: '庄家',
          result: myRecord.result,
          penalty: myRecord.penalty,
          who: myRecord.who,
          showResult: true,
        });
      }
    }
  }, [phase, allCompareData, compareData, resultDetails, playerName]);

  const leaveRoom = async () => {
    if (!roomId) return;

    // 🔧 修复C4：下注阶段已发牌(已参与本局)即拦截离开(含压0杯者)，不再只拦 bet>0
    if (phase === "betting" && myPlayer?.cards?.length > 0) {
      setErrorMsg("压酒中不能离开房间");
      return;
    }

    if (phase !== "waiting" && phase !== "dealing") {
      setConfirmDialog({
        message: "游戏还在进行中，确定要离开房间吗？",
        onConfirm: () => {
          setConfirmDialog(null);
          doLeaveRoom();
        },
      });
      return;
    }
    await doLeaveRoom();
  };

  // 修复1：doLeaveRoom 重写
  const doLeaveRoom = async (targetName?: string) => {
    if (!roomId) return;
    const leaver = targetName || playerName;
    // 🔥 幽灵清理：若指定的人已不在名单里，无需重复处理
    if (targetName && !players.find(p => p.name === targetName)) return;

    // 1. 判断离开的人是否是庄家
    const isDealerLeaving = leaver === dealerId || players.find(p => p.name === leaver)?.isDealer;

    // 2. 过滤掉离开的人
    let updatedPlayers = players.filter(p => p.name !== leaver);

    // 3. 如果房间没人了，直接清理（仅本人主动离开时）
    if (updatedPlayers.length === 0) {
      if (!targetName) {
        setJoined(false);
        setRoomId("");
        roomIdRef.current = ""; // 🔧 人走了要清空，否则还会往旧房间写
        if (channelRef.current) supabase.removeChannel(channelRef.current);
        try { localStorage.removeItem('zjh_name'); localStorage.removeItem('zjh_pass'); localStorage.removeItem('zjh_room'); } catch (_) {}
        // 🔧 Bug4 修复：最后一人离开时清理 DB 房间行,避免残留旧名单导致后来同密码加入粘到空/旧房间
        try { await supabase.from("rooms").delete().eq("id", roomId); } catch (_) {}
      }
      return;
    }

    // 4. 计算新的当前玩家索引
    let newIndex = currentPlayerIndex;
    const currentName = players[currentPlayerIndex]?.name;
    if (currentName === leaver) {
      let next = 0;
      let count = 0;
      while (count < updatedPlayers.length) {
        const p = updatedPlayers[next];
        if (p.status === 'playing') break;
        next = (next + 1) % updatedPlayers.length;
        count++;
      }
      newIndex = next;
    } else {
      const foundIdx = updatedPlayers.findIndex(p => p.name === currentName);
      newIndex = foundIdx >= 0 ? foundIdx : 0;
    }

    // 5. 准备状态变量
    let newPhase = phase;
    let newDealerId = dealerId;
    let newGameOver = gameOver;
    let newResult = result;
    let newResultDetails = resultDetails;
    let newRevealTargets = revealTargets;
    let newAllCompareData = allCompareData;
    let newCommunityCard = communityCard;
    let newSeed = seed;
    // 修复7：无论如何都不重置牌堆进度
    let newDeckOffset = deckOffset;
    let newWheelVisible = wheelVisible;
    let newWheelSelected = wheelSelected;
    let newWheelSegments = wheelSegments;
    let newReadyPlayers = readyPlayers.filter(p => p !== leaver);
    // 🔥 原庄家退返：庄家离开时记下其名字（仅记录，不影响转移逻辑），待结算开新局前归还
    let newPendingReturnDealer = null;

    // 核心判断：庄家离开 → 任何阶段都优先按座位顺序转移给下一位在玩的人（保留牌堆与全部进度）
    if (isDealerLeaving) {
      // 🔥 记录原庄家名字，待结算开新局前归还（转移照常发生，此标记不影响）
      newPendingReturnDealer = dealerId;
      // 在座位顺序（players 数组顺序，与下注轮转同一套）中找到离开庄家之后的下一位"在玩"的玩家
      // 🔥 兼容 dealerId 可能过期/为空：先按 dealerId 找，找不到则退回按"离开者自身"定位座位起点
      let dealerIdx = players.findIndex(p => p.name === dealerId);
      if (dealerIdx < 0) dealerIdx = players.findIndex(p => p.name === playerName);
      let nextDealer = null;
      if (dealerIdx >= 0) {
        const n = players.length;
        for (let step = 1; step <= n; step++) {
          const cand = players[(dealerIdx + step) % n];
          if (cand.name !== playerName && cand.status === 'playing') {
            nextDealer = cand;
            break;
          }
        }
      }
      // 兜底：若座位顺序没找到（理论上不会），退而求其次取任意在玩的人
      if (!nextDealer) nextDealer = updatedPlayers.find(p => p.status === 'playing');

      if (nextDealer) {
        // 有接庄者：无缝转移，保留牌堆、阶段、下注、手牌、公牌
        newDealerId = nextDealer.name;
        updatedPlayers = updatedPlayers.map(p => ({
          ...p,
          isDealer: p.name === nextDealer.name,
        }));
        newPhase = phase;
        newResult = `👑 庄家已转移给 ${nextDealer.name}`;
        // 🔧 修复C3：仅游戏进行中(非 waiting 阶段)转移庄家才清空他人准备；waiting 阶段(还在准备)换庄家应保留准备，免得全员重点
        if (phase !== "waiting") newReadyPlayers = [];
        // 保留牌堆进度，绝不重洗
        newDeckOffset = deckOffset;
      } else {
        // 没有人接庄（在玩不足 2 人）→ 退回等待准备，牌堆保留
        newPhase = "waiting";
        newDealerId = null;
        newGameOver = false;
        newResult = `👑 庄家已离开，游戏已重置，请重新准备开始`;
        newResultDetails = [];
        newRevealTargets = [];
        newAllCompareData = [];
        newCommunityCard = null;
        newSeed = null;
        // 保留牌堆进度
        newDeckOffset = deckOffset;
        newWheelVisible = false;
        newWheelSelected = null;
        newWheelSegments = [];
        newReadyPlayers = [];
        updatedPlayers = updatedPlayers.map(p => ({
          ...p,
          cards: [],
          cardCount: 0,
          isDealer: false,
          bet: 0,
          status: p.status === 'watching' ? 'watching' : 'playing',
        }));
      }
    }

    // 8. 非庄家玩家离开 → 从列表删除，不做其他修改，保留牌堆
    // 已经过滤掉了，无需额外处理

    // 9. 更新数据库
    // 修复C4：防并发离开覆盖——以 DB 最新名单为基准移除离开者，并套用本端计算的其他人状态变更(如庄家转移)
    let finalPlayers = updatedPlayers;
    try {
      const { data: fresh } = await supabase.from("rooms").select("players").eq("id", roomId).single();
      // 🔧 修复：DB players 列可能是 JSON 字符串，必须 parsePlayers（否则 .filter 崩溃→离开房间失败）
      const freshParsed = fresh?.players ? parsePlayers(fresh.players) : [];
      if (freshParsed.length > 0) {
        const otherChanges = new Map(
          updatedPlayers.filter(p => p.name !== leaver).map(p => [p.name, p])
        );
        finalPlayers = freshParsed
          .filter((p: any) => p.name !== leaver)
          .map((p: any) => otherChanges.get(p.name) || p);
      }
    } catch (_) {}
    await supabase.from("rooms").update({
      players: finalPlayers,
      readyplayers: newReadyPlayers,
    }).eq("id", roomId);

    // 10. 广播同步
    await broadcastAndSyncDB({
      structuralSync: true,
      // 🔥 仅庄家离开时置 true：让接收端落地"转移后的新庄家 + 保留的阶段/牌堆"，
      // 非庄家离开/加入/重进均不带此标记，继续走原"只收敛名单"逻辑，零回归。
      leaveSync: isDealerLeaving,
      // 🔥 强制接收端采用本广播的阶段（避免 forward-phase 守卫把结算/等待误判为回退而保留旧阶段）
      forcePhase: true,
      players: finalPlayers,
      phase: newPhase,
      dealerId: newDealerId,
      // 🔥 原庄家退返标记随广播同步给所有玩家（庄家离开时=newPendingReturnDealer，否则为 null）
      pendingReturnDealer: newPendingReturnDealer,
      currentPlayerIndex: newIndex,
      gameOver: newGameOver,
      result: newResult,
      resultDetails: newResultDetails,
      readyPlayers: newReadyPlayers,
      settlementStep: 0,
      seed: newSeed,
      deckOffset: newDeckOffset,
      wheelVisible: newWheelVisible,
      wheelSelected: newWheelSelected,
      wheelSegments: newWheelSegments,
      communityCard: newCommunityCard,
      revealTargets: newRevealTargets,
      allCompareData: newAllCompareData,
      globalDealerHand: [],
      globalDealerHandName: '',
    });
    // 🔥 新增：保存牌堆进度到 localStorage，用于重连恢复
    try {
      localStorage.setItem(`zjh_deckOffset_${roomId}`, String(newDeckOffset));
    } catch (_) {}

    // 11. 清理离开的人自己的界面状态（仅本人主动离开时）
    if (!targetName) {
      setJoined(false);
      setRoomId("");
      roomIdRef.current = ""; // 🔧 人走了要清空，否则还会往旧房间写
      setPlayers([]);
      playersRef.current = [];
      setPhase("waiting");
      phaseRef.current = "waiting";
      setDealerId(null);
      setCurrentPlayerIndex(0);
      setGameOver(false);
      setResult("");
      setResultDetails([]);
      resultDetailsRef.current = [];
      setMyCards([]);
      setMyBestHand([]);
      setShowMyHand(false);
      setMyBet(0);
      setBettingComplete(false);
      bettingCompleteRef.current = false;
      setRevealTargets([]);
      setIsDealer(false);
      setReadyPlayers([]);
      setErrorMsg("");
      setDisconnected(false);
      setSeed(null);
      setLocalDeck([]);
      setDeckOffset(0);
      setWheelVisible(false);
      setWheelSelected(null);
      setWheelSegments([]);
      setWheelSpinning(false);
      setWheelRotation(0);
      setCommunityCard(null);
      setRemainingCards(52);
      setCompareData(null);
      setPendingReveal(null);
      setAllCompareData([]);
      setGlobalDealerHand([]);
      setGlobalDealerHandName('');

      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }

      try {
        localStorage.removeItem('zjh_name');
        localStorage.removeItem('zjh_pass');
        localStorage.removeItem('zjh_room');
      } catch (_) {}
    } else {
      // 🔥 幽灵清理：仅更新本地名单/庄家/当前轮转，不清空本人界面、不移除频道
      setPlayers(updatedPlayers);
      playersRef.current = updatedPlayers;
      setDealerId(newDealerId);
      setCurrentPlayerIndex(newIndex);
    }
  };

  // 🔥 让 presence 幽灵清理处理器能调用到最新的 doLeaveRoom
  doLeaveRoomRef.current = doLeaveRoom;

  const sitOutCurrentRound = async () => {
    setConfirmDialog({
      message: "确定退出本局吗？你将变为观战者，本局结束后可重新加入。",
      onConfirm: async () => {
        setConfirmDialog(null);
        // 修复C8：防并发覆盖——先读 DB 最新名单，再合并自己的变更写回
        let basePlayers = players;
        try {
          const { data: fresh } = await supabase.from("rooms").select("players").eq("id", roomId).single();
          // 🔧 修复：DB players 列可能是 JSON 字符串，必须 parsePlayers（否则 .map 崩溃→本局不玩失败）
          if (fresh?.players) {
            const parsed = parsePlayers(fresh.players);
            if (parsed.length > 0) basePlayers = parsed;
          }
        } catch (_) {}
        const updatedPlayers = basePlayers.map(p => {
          if (p.name === playerName) {
            return { ...p, status: 'watching', bet: 0 };
          }
          return p;
        });
        setPlayers(updatedPlayers);
        playersRef.current = updatedPlayers;

        await broadcastAndSyncDB({
          players: updatedPlayers,
          phase,
          dealerId,
          currentPlayerIndex,
          gameOver,
          result: `👀 ${playerName} 退出本局，变为观战者`,
          resultDetails,
          readyPlayers,
          settlementStep: 0,
          seed,
          deckOffset,
          wheelVisible,
          wheelSelected,
          wheelSegments,
          communityCard,
          revealTargets,
          allCompareData,
          globalDealerHand,
          globalDealerHandName,
        });

        setErrorMsg(`你已退出本局，变为观战者。下一局可重新加入。`);
      },
    });
  };

  // 修复9：观战者在 settlement 阶段也能重新加入
  const rejoinGame = async () => {
    if (phase !== "waiting" && phase !== "settlement") {
      setErrorMsg("当前不是等待或结算阶段，无法加入");
      return;
    }
    const updatedPlayers = players.map(p => {
      if (p.name === playerName) {
        return { ...p, status: 'playing' };
      }
      return p;
    });
    setPlayers(updatedPlayers);
    playersRef.current = updatedPlayers;
    const newReady = readyPlayers.filter(p => p !== playerName);
    setReadyPlayers(newReady);

    await broadcastAndSyncDB({
      players: updatedPlayers,
      phase,
      dealerId,
      currentPlayerIndex,
      gameOver,
      result,
      resultDetails,
      readyPlayers: newReady,
      settlementStep: 0,
      seed,
      deckOffset,
      wheelVisible,
      wheelSelected,
      wheelSegments,
      communityCard,
      revealTargets,
      allCompareData,
      globalDealerHand,
      globalDealerHandName,
    });
    setErrorMsg("你已重新加入，请点击准备开始游戏。");
  };

  // 修复6：观战者不能点准备
  const toggleReady = async () => {
    if (phase !== "waiting") {
      setErrorMsg("游戏已开始,不能准备");
      return;
    }
    const myPlayer = getMyPlayer();
    let updatedPlayers = players;
    let needStatusChange = false;

    // 观战者点准备 → 自动变成玩家 + 加入准备列表（一步到位）
    if (myPlayer?.status === 'watching') {
      updatedPlayers = players.map(p => {
        if (p.name === playerName) {
          return { ...p, status: 'playing' };
        }
        return p;
      });
      needStatusChange = true;
    }

    // 准备逻辑（🔧 防并发覆盖：以数据库最新 readyplayers 为准合并自己，避免两人同时点准备互相冲掉，
    // 弱网下广播迟到也不会丢"已准备"标记。仅多一次只读查询，免费档完全扛得住）
    let baseReady: string[] = readyPlayers;
    try {
      const { data } = await supabase.from("rooms").select("readyplayers").eq("id", roomId).single();
      if (data?.readyplayers) baseReady = Array.from(new Set([...(data.readyplayers as string[]), ...readyPlayers]));
    } catch (_) {}
    const isReady = baseReady.includes(playerName);
    const newReady = isReady ? baseReady.filter(p => p !== playerName) : [...baseReady, playerName];

    // 🔧 修复 1/12：点准备时必须确保自己在 players 里。
    // joinRoom 可能因网络/RLS/覆盖导致新人没写进 players，但 readyplayers 能写进。
    // 点准备这一下把"我"补进 players，让人数和发牌名单都正确。
    let mergedPlayers = needStatusChange ? updatedPlayers : players;
    if (!mergedPlayers.some((p: any) => p.name === playerName)) {
      const occupiedSeats = mergedPlayers.map((p: any) => p.seatId).filter((id: number) => id !== undefined);
      let seatId = 0;
      for (let i = 0; i < 12; i++) { if (!occupiedSeats.includes(i)) { seatId = i; break; } }
      mergedPlayers = [...mergedPlayers, {
        name: playerName,
        cards: [],
        cardCount: 0,
        seatId,
        isDealer: false,
        status: 'playing',
        bet: 0,
      }];
    }

    setPlayers(mergedPlayers);
    playersRef.current = mergedPlayers;
    setReadyPlayers(newReady);

    await broadcastAndSyncDB({
      players: mergedPlayers,
      phase,
      dealerId,
      currentPlayerIndex,
      gameOver,
      result,
      resultDetails,
      readyPlayers: newReady,
      settlementStep: 0,
      seed,
      deckOffset,
      wheelVisible,
      wheelSelected,
      wheelSegments,
      communityCard,
      revealTargets,
      allCompareData,
      globalDealerHand,
      globalDealerHandName,
    });

    if (needStatusChange) {
      setErrorMsg("已自动转为玩家并已准备！");
    }
  };

  // 修复3：只有房主（第一个 playing 玩家）能开始游戏
  // 🔧 修复：开局前以数据库权威名单补齐可能因实时广播迟到而漏掉的新玩家（首局无手牌却能压酒）
  const fetchAuthoritativeRoom = async () => {
    if (!roomId) return null;
    try {
      const { data } = await supabase.from("rooms").select("players, readyplayers").eq("id", roomId).single();
      if (!data) return null;
      const dbPlayers = parsePlayers(data.players);
      const dbReady = data.readyplayers || [];
      // 🔧 修复P5/A2：以数据库权威名单为主，不再把"本地有但DB已删除"的人加回（否则刚离开者会被误加回参与发牌）。
      // 仅当数据库完全读不到人(读库异常)时回退本地，作极端兜底。
      const merged: any[] = dbPlayers.length > 0 ? [...dbPlayers] : [...players];
      // 准备状态取本地与数据库的并集，避免任一方瞬时滞后误判"未准备"
      const mergedReady = Array.from(new Set([...dbReady, ...readyPlayers]));
      return { players: merged, ready: mergedReady };
    } catch (e) {
      return null;
    }
  };

  // 🔧 漏收发牌广播时，从数据库拉权威牌补上（替代旧 seed+deckOffset 算牌兜底，
  // 避免退出重进后座位顺序偏移导致算到别人/庄家的牌）
  const rebuildAttemptedRef = useRef<string>("");
  useEffect(() => {
    if (!roomId || !playerName) return;
    const me = players.find(p => p.name === playerName);
    if (phase !== "betting" || !me || me.status !== 'playing' || (me.cards && me.cards.length > 0)) {
      return;
    }
    // 防重复：同一轮（相同 seed+deckOffset）只拉一次
    const roundKey = `${seed ?? 0}-${deckOffset ?? 0}`;
    if (rebuildAttemptedRef.current === roundKey) return;
    rebuildAttemptedRef.current = roundKey;

    let cancelled = false;
    (async () => {
      try {
        // 🔧 修复：DB 列名为小写 communitycard（原驼峰 communityCard 导致整条查询报错→补牌兜底从未生效）
        const { data } = await supabase
          .from("rooms")
          .select("players, communitycard")
          .eq("id", roomId)
          .single();
        if (!data || cancelled) return;
        const dbPlayers = parsePlayers(data.players);
        const dbMe = dbPlayers.find((p: any) => p.name === playerName);
        if (dbMe && dbMe.cards && dbMe.cards.length > 0) {
          setPlayers(prev => prev.map(p =>
            p.name === playerName
              ? { ...p, cards: dbMe.cards, cardCount: dbMe.cards.length }
              : p
          ));
        }
        // 公牌也补上（漏收发牌广播时公牌可能也没拿到）
        if (data.communitycard && !communityCard) {
          let cc: any = data.communitycard;
          if (typeof cc === 'string') { try { cc = JSON.parse(cc); } catch (_) {} }
          if (cc) setCommunityCard(cc);
        }
      } catch (e) {}
    })();
    return () => { cancelled = true; };
  }, [phase, players, roomId, playerName, seed, deckOffset, communityCard]);

  // 🔧 拉库去重：短时间多次进/出房间只合并为一次拉库核对，避免频繁查库
  const reconcileScheduledRef = useRef(false);
  const scheduleReconcile = () => {
    if (reconcileScheduledRef.current) return; // 已有待执行的核对，合并到本次
    reconcileScheduledRef.current = true;
    setTimeout(async () => {
      reconcileScheduledRef.current = false;
      await reconcilePlayersFromDB();
    }, 400);
  };

  // 🔥 彻底兜底：结构性同步（有人进/出/准备）时，以数据库权威名单收敛人数。
  // 只增删人，绝不覆盖已有玩家的牌/下注/身份，避免实时广播丢一条就人数错乱。
  const reconcilePlayersFromDB = async () => {
    if (!roomId) return;
    try {
      const { data, error } = await supabase
        .from("rooms")
        .select("players, readyplayers")
        .eq("id", roomId)
        .single();
      if (error || !data) return;
      const dbPlayers = parsePlayers(data.players);
      const dbNames = new Set(dbPlayers.map((p: any) => p.name));
      const dbReady = data.readyplayers || [];
      setPlayers(prev => {
        const localNames = new Set(prev.map((p: any) => p.name));
        let next = prev.filter((p: any) => dbNames.has(p.name)); // 移除已离开者
        dbPlayers.forEach((dp: any) => {
          if (!localNames.has(dp.name)) next.push(dp); // 补齐新加入者（用库里的完整对象）
        });
        return next;
      });
      // 准备状态取本地与数据库交集：两边都标记"已准备"才算，
      // 避免某人取消准备后，数据库瞬时残留其名字导致被误标"已准备"
      setReadyPlayers(prevReady => {
        if (!dbReady || dbReady.length === 0) return prevReady; // 库无准备数据则保持本地，防误清空
        return prevReady.filter(name => dbReady.includes(name));
      });
    } catch (e) {
      // 兜底失败不应影响游戏
    }
  };

  // 🔥 修复P1：低频从数据库拉取权威房间状态做兜底（弱网 broadcast 丢帧时自愈）。
  // 复用 broadcast 接收端同样的"安全收敛"策略：名单只增删人不覆盖牌/下注/身份、
  // phase 防回退护栏、本人手牌/下注本地优先保护。每 POLL_MS 一次，免费档读取量可忽略。
  const POLL_MS = 8000;
  // ⛔ 2026-08-02 临时停用轮询兜底：此前列名写错→轮询自上线从未生效；修好后才发现
  // 数据库里的 phase 长期停在 waiting（疑似写库一直失败），轮询一生效就每 8 秒把
  // 全场从压酒硬拉回准备界面（死循环）。先停掉 = 回到之前能正常玩的状态。
  // 待「写库为什么失败」查清并修复后，把下面这个开关改回 true 即可恢复兜底。
  const POLL_ENABLED: boolean = false;
  const pollRoomStateFromDB = async () => {
    if (!POLL_ENABLED) return;
    if (!roomId) return;
    try {
      // 🔧 修复：DB 列名全小写（dealerid/gameover/...），此前用驼峰列名+不存在的列(wheelSpinning等)
      // 导致整条查询报错→轮询兜底从未生效过。改为只查真实存在的小写列。
      const { data, error } = await supabase
        .from("rooms")
        .select("players, readyplayers, phase, currentplayerindex, dealerid, seed, deckoffset, communitycard, wheelvisible, wheelselected, wheelsegments, revealtargets, result, resultdetails, gameover")
        .eq("id", roomId)
        .single();
      if (error || !data) return;
      const parsedPlayers = parsePlayers(data.players);
      if (parsedPlayers.length === 0) return;
      playersRef.current = parsedPlayers;

      // 名单收敛（只增删人，不覆盖已有玩家的牌/下注/身份）
      setPlayers(prev => {
        const localNames = new Set(prev.map((p: any) => p.name));
        const dbNames = new Set(parsedPlayers.map((p: any) => p.name));
        let next = prev.filter((p: any) => dbNames.has(p.name));
        parsedPlayers.forEach((dp: any) => {
          if (!localNames.has(dp.name)) next.push(dp);
        });
        return next;
      });

      // phase 防回退护栏（同 broadcast 接收端）
      const prevPhase = phaseRef.current;
      const newPhase = data.phase || "waiting";
      const forwardPhases = ["dealing", "betting", "reveal", "settlement", "wheel"];
      const ci = forwardPhases.indexOf(prevPhase);
      const ni = forwardPhases.indexOf(newPhase);
      let eff = newPhase;
      if (!(newPhase === "waiting" || newPhase === "dealing" || (newPhase === "betting" && prevPhase === "reveal") || (ni >= ci && ci >= 0))) {
        eff = prevPhase;
      }
      setPhase(eff);
      phaseRef.current = eff;

      // 关键字段同步（数据库是服务器真相，无条件应用）——列名与 DB 实际小写列对齐
      setDealerId(data.dealerid || null);
      if (data.seed !== undefined) setSeed(data.seed);
      // 🔧 D1修复：轮询兜底也重建牌堆——否则重洗时若广播全丢，本地牌堆停在旧副导致错牌（数据库为权威，data.seed 即真相）
      if (data.seed !== undefined && data.seed !== deckSeedRef.current) {
        const pd = createDeckWithSeed(data.seed);
        setLocalDeck(pd);
        localDeckRef.current = pd;
        deckSeedRef.current = data.seed;
      }
      if (data.deckoffset !== undefined && data.deckoffset !== null) setDeckOffset(data.deckoffset);
      if (data.communitycard !== undefined) {
        let cc: any = data.communitycard;
        if (typeof cc === "string") { try { cc = JSON.parse(cc); } catch (_) {} }
        if (cc) setCommunityCard(cc);
      }
      setCurrentPlayerIndex(data.currentplayerindex || 0);
      setResult(data.result || "");
      if (data.resultdetails) {
        let rd: any = data.resultdetails;
        if (typeof rd === "string") { try { rd = JSON.parse(rd); } catch (_) {} }
        if (rd) { setResultDetails(rd); resultDetailsRef.current = rd; }
      }
      setReadyPlayers(data.readyplayers || []);
      setWheelVisible(data.wheelvisible || false);
      setWheelSelected(data.wheelselected || null);
      if (data.wheelsegments) {
        let ws: any = data.wheelsegments;
        if (typeof ws === "string") { try { ws = JSON.parse(ws); } catch (_) {} }
        if (ws) setWheelSegments(ws);
      }
      if (data.revealtargets) {
        let rt: any = data.revealtargets;
        if (typeof rt === "string") { try { rt = JSON.parse(rt); } catch (_) {} }
        if (rt) setRevealTargets(rt);
      }
      setGameOver(data.gameover || false);

      // 本人手牌/下注本地优先保护（避免轮询把已下注/已发牌覆盖回旧值）
      setPlayers(prev => prev.map(p => {
        if (p.name !== playerName) return p;
        const dbMe = parsedPlayers.find((x: any) => x.name === playerName);
        if (!dbMe) return p;
        const hasLocalCards = p.cards && p.cards.length > 0;
        return {
          ...p,
          cards: hasLocalCards ? p.cards : (dbMe.cards || []),
          cardCount: hasLocalCards ? p.cardCount : (dbMe.cards?.length || 0),
          bet: hasLocalCards ? p.bet : (dbMe.bet || 0),
          status: hasLocalCards ? p.status : (dbMe.status || "playing"),
        };
      }));

      // 修复C1 同源：轮询纠正了轮转后，若"当前该下注的变成我且未下注"，补一次超时（防挂机卡死）
      if (eff === "betting" && !bettingCompleteRef.current && !timeoutRef.current) {
        const cpNow = parsedPlayers[data.currentplayerindex || 0];
        if (cpNow && cpNow.name === playerName && !(cpNow.bet > 0)) {
          startBettingTimeoutRef.current?.(data.currentplayerindex || 0);
        }
      }
    } catch (e) {
      // 轮询失败不应影响游戏
    }
  };

  const startingRef = useRef(false);
  const finishingRef = useRef(false);
  const deckOffsetRef = useRef(0);
  const startGame = async () => {
    if (startingRef.current) return; // 🔧 C3修复：防连点双发牌（异步 setPhase 守卫在极快连点下失效）
    startingRef.current = true;
    try {
      if (phase !== "waiting") return;

    // 🔧 开局前先以数据库权威名单补齐可能迟到的新玩家，避免发牌漏人（首局无手牌却能压酒）
    const authoritative = await fetchAuthoritativeRoom();
    const workingPlayers = authoritative ? authoritative.players : players;
    const workingReady = authoritative ? authoritative.ready : readyPlayers;

    let playingPlayers = workingPlayers.filter(p => p.status === 'playing');
    // 🔧 修复 1/12 兜底：players 数组可能因 joinRoom 没写进新人而只有房主，但 readyplayers 是准的。
    // 若 playing 不够 2 人，而 ready 名单里有 ≥2 人，则以 readyplayers 重建 playing 名单，确保能开局。
    if (playingPlayers.length < 2 && workingReady.length >= 2) {
      const occupiedSeats = workingPlayers.map((p: any) => p.seatId).filter((id: number) => id !== undefined);
      playingPlayers = workingReady.map((name: string, idx: number) => {
        const existing = workingPlayers.find((p: any) => p.name === name);
        if (existing) return existing;
        let seatId = 0;
        for (let i = 0; i < 12; i++) { if (!occupiedSeats.includes(i)) { seatId = i; break; } }
        occupiedSeats.push(seatId);
        return { name, cards: [], cardCount: 0, seatId, isDealer: false, status: 'playing', bet: 0 };
      });
    }
    if (playingPlayers.length < 2) { setErrorMsg("至少2人才能开始"); return; }
    const allReadyHere = playingPlayers.length >= 2 && playingPlayers.every(p => workingReady.includes(p.name));
    if (!allReadyHere) { setErrorMsg("还有玩家未准备"); return; }

    // 只有第一个 playing 玩家（房主）能开始
    const firstPlaying = playingPlayers[0];
    if (firstPlaying.name !== playerName) {
      setErrorMsg(`只有房主 ${firstPlaying.name} 可以开始游戏`);
      return;
    }

    const firstDealer = playingPlayers[0].name;
    // 🔧 修复：发牌名单必须包含 readyplayers 兜底重建出来的新人（此前只用 workingPlayers，
    // 重建的新人被丢掉→只剩房主一人有牌、全场卡死）。用并集：workingPlayers 为底 + 补上重建名单里缺的人。
    const rosterForStart = [...workingPlayers];
    playingPlayers.forEach((pp: any) => {
      if (!rosterForStart.some((p: any) => p.name === pp.name)) rosterForStart.push(pp);
    });
    const resetPlayers = rosterForStart.map(p => ({
      ...p,
      cards: [],
      cardCount: 0,
      isDealer: p.name === firstDealer,
      status: 'playing', // 修复1：新对局开始时把观战者也转为玩家并发牌
      bet: 0,
    }));
    setPlayers(resetPlayers);
    playersRef.current = resetPlayers;
    setDealerId(firstDealer);
    setIsDealer(playerName === firstDealer);
    setMyBet(0);
    setBettingComplete(false);
    bettingCompleteRef.current = false;
    setRevealTargets([]);
    setResult("");
    setResultDetails([]);
    resultDetailsRef.current = [];
    setCommunityCard(null);
    setMyBestHand([]);
    setCompareData(null);
    setPendingReveal(null);
    setAllCompareData([]);
    setGlobalDealerHand([]);
    setGlobalDealerHandName('');

    const newSeed = Math.floor(Math.random() * 1000000);
    setSeed(newSeed);
    const deck = createDeckWithSeed(newSeed);
    setLocalDeck(deck);
    deckSeedRef.current = newSeed;
    setDeckOffset(0);
    setRemainingCards(52);

    setPhase("dealing");
    phaseRef.current = "dealing";
    setReadyPlayers([]);

    await broadcastAndSyncDB({
      players: resetPlayers,
      phase: "dealing",
      dealerId: firstDealer,
      currentPlayerIndex: 0,
      gameOver: false,
      result: "",
      resultDetails: [],
      readyPlayers: [],
      settlementStep: 0,
      seed: newSeed,
      deckOffset: 0,
      wheelVisible: false,
      wheelSelected: null,
      wheelSegments: [],
      communityCard: null,
      revealTargets: [],
      allCompareData: [],
      globalDealerHand: [],
      globalDealerHandName: '',
    });

      await dealCards(resetPlayers, firstDealer, newSeed, 0); // 第一局从头发
    } finally {
      startingRef.current = false;
    }
  };

  const dealCards = async (currentPlayers: any[], dealerName: string, deckSeed: number, startOffset: number = 0) => {
    console.log('🃏 dealCards 被调用');
    setShowMyHand(false);

    const deck = createDeckWithSeed(deckSeed);
    let offset = startOffset; // 修复6：从当前进度继续发牌，实现一副牌打到底

    const community = deck[offset++];
    setCommunityCard(community);

    const newPlayers = currentPlayers.map(p => {
      const card = deck[offset++];
      return {
        ...p,
        cards: [card],
        cardCount: 1,
        bet: 0,
      };
    });

    setDeckOffset(offset);
    deckOffsetRef.current = offset;
    setRemainingCards(52 - offset);
    setPlayers(newPlayers);
    playersRef.current = newPlayers;

    const me = newPlayers.find(p => p.name === playerName);
    if (me) {
      setMyCards(me.cards);
      if (community && me.cards.length > 0) {
        const best = getBestThreeCards(community, me.cards[0]);
        setMyBestHand(best);
      }
    }

    const playingPlayers = newPlayers.filter(p => p.status === 'playing' && p.name !== dealerName);
    const firstIndex = newPlayers.findIndex(p => p.name === playingPlayers[0]?.name);
    setCurrentPlayerIndex(firstIndex >= 0 ? firstIndex : 0);
    setPhase("betting");
    phaseRef.current = "betting";
    setGameOver(false);
    setMyBet(0);
    setBettingComplete(false);
    bettingCompleteRef.current = false;
    setCompareData(null);
    setPendingReveal(null);
    setRevealTargets([]);
    setAllCompareData([]);
    setGlobalDealerHand([]);
    setGlobalDealerHandName('');

    const bettingPayload = {
      players: newPlayers,
      phase: "betting",
      dealerId: dealerName,
      currentPlayerIndex: firstIndex >= 0 ? firstIndex : 0,
      gameOver: false,
      result: "🃏 发牌完成,开始压酒!",
      resultDetails: [],
      readyPlayers,
      settlementStep: 0,
      seed: deckSeed,
      deckOffset: offset,
      wheelVisible: false,
      wheelSelected: null,
      wheelSegments: [],
      communityCard: community,
      bettingComplete: false,
      revealTargets: [],
      allCompareData: [],
      globalDealerHand: [],
      globalDealerHandName: '',
      resetView: true,
    };
    await broadcastAndSyncDB(bettingPayload);
    // 🔧 重发一次发牌广播：Supabase broadcast 不可靠，重连/网络抖动可能漏收，
    // 导致迟到客户端"无手牌却能压酒"。600ms 后重发一次补漏，所有人必收到牌面。
    setTimeout(() => {
      // 🔧 L4修复：600ms重发用当前最新名单(playersRef.current，已含这期间下的注)，
      // 避免用发牌时的旧快照(bet:0)把刚下的注冲掉。
      // 🔧 Bug5修复：同时带当前最新的 result/resultDetails/readyPlayers，避免重发用发牌时旧 meta 把别人刚下的注文案覆盖。
      broadcastAndSyncDB({
        ...bettingPayload,
        players: playersRef.current,
        result: result,
        resultDetails: resultDetails,
        readyPlayers: readyPlayers,
      });
    }, 600);

    if (newPlayers[firstIndex >= 0 ? firstIndex : 0]?.name === playerName) {
      startBettingTimeout();
    }
  };

  const startBettingTimeout = (overrideIndex?: number) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    bettingTimeoutFiredRef.current = false;
    timeoutRef.current = setTimeout(() => {
      if (bettingTimeoutFiredRef.current) return;
      bettingTimeoutFiredRef.current = true;
      const idx = overrideIndex !== undefined ? overrideIndex : currentPlayerIndex;
      const cp = playersRef.current[idx];
      if (phaseRef.current === "betting" && cp?.name === playerName && !bettingCompleteRef.current) {
        console.log('\u23F0 压酒超时,自动压半杯');
        handleBet(0.5);
      }
    }, 30000);
  };
  startBettingTimeoutRef.current = startBettingTimeout;

  const handleBet = async (amount: number) => {
    console.log('🔥 handleBet 被调用, amount:', amount, 'phase:', phase, 'currentPlayer:', currentPlayer?.name, 'playerName:', playerName, 'bettingComplete:', bettingComplete);

    if (phase !== "betting") {
      setErrorMsg("当前不是压酒阶段");
      return;
    }
    // Bug9 修复：不再依赖可能过期的 currentPlayerIndex 判定轮到谁，
    // 改用"谁还没压酒"反推真正的当前下注人（与轮转推进同一套逻辑，但来源是已同步的 bet 状态，不会过期）
    const firstIdx = playersRef.current.findIndex(p => p.status === 'playing' && p.name !== dealerId);
    const totalP = playersRef.current.length;
    let expectedIdx = -1;
    for (let s = 0; s < totalP; s++) {
      const idx = (firstIdx + s) % totalP;
      const cand = playersRef.current[idx];
      if (cand && cand.status === 'playing' && cand.name !== dealerId && (cand.bet || 0) === 0) {
        expectedIdx = idx;
        break;
      }
    }
    const expectedName = expectedIdx >= 0 ? playersRef.current[expectedIdx].name : null;
    if (expectedName !== playerName) {
      setErrorMsg(`当前不是你的回合(${expectedName || currentPlayer?.name || '无人'} 的回合)`);
      return;
    }
    if (bettingComplete) {
      setErrorMsg("本轮压酒已完成");
      return;
    }
    if (isDealer) {
      setErrorMsg("庄家不用压酒");
      return;
    }

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    setMyBet(amount);

    // 🔧 并发写覆盖防护(仿067):写库前先读 DB 最新 players,只合并自己这笔 bet,
    // 避免两人几乎同时下注时后写者用旧本地表覆盖掉先写者的注(同样的病067用读库合并治好了)
    let basePlayers = players;
    try {
      const { data: freshRoom } = await supabase.from('rooms').select('players').eq('id', roomId).single();
      // 🔧 修复：DB players 列可能是 JSON 字符串，必须 parsePlayers 解析（直接 as any[] 会让下面 .map 崩溃→压酒无反应）
      if (freshRoom?.players) {
        const parsed = parsePlayers(freshRoom.players);
        if (parsed.length > 0) basePlayers = parsed;
      }
    } catch (_) { /* 读库失败降级用本地 players */ }
    const updatedPlayers = basePlayers.map(p => {
      if (p.name === playerName) {
        return { ...p, bet: amount };
      }
      return p;
    });
    setPlayers(updatedPlayers);
    playersRef.current = updatedPlayers;

    const activePlayers = updatedPlayers.filter(p => p.status === 'playing' && p.name !== dealerId);
    const allBet = activePlayers.every(p => p.bet > 0);
    setBettingComplete(allBet);
    bettingCompleteRef.current = allBet;

    if (allBet) {
      setPhase("reveal");
      phaseRef.current = "reveal";
      setResult(`💰 压酒完成,庄家请开牌!`);
      setRevealTargets([]);
      setAllCompareData([]);
      setGlobalDealerHand([]);
      setGlobalDealerHandName('');
      await broadcastAndSyncDB({
        players: updatedPlayers,
        phase: "reveal",
        dealerId,
        currentPlayerIndex,
        gameOver: false,
        result: `💰 压酒完成,庄家请开牌!`,
        resultDetails,
        readyPlayers,
        settlementStep: 0,
        seed,
        deckOffset,
        wheelVisible: false,
        wheelSelected: null,
        wheelSegments: [],
        communityCard,
        revealTargets,
        allCompareData: [],
        globalDealerHand: [],
        globalDealerHandName: '',
      });
      startRevealTimeout();
      return;
    }

    let next = (currentPlayerIndex + 1) % updatedPlayers.length;
    let count = 0;
    while (count < updatedPlayers.length) {
      const p = updatedPlayers[next];
      if (p.status === 'playing' && p.bet === 0 && p.name !== dealerId) break;
      next = (next + 1) % updatedPlayers.length;
      count++;
    }
    setCurrentPlayerIndex(next);

    await broadcastAndSyncDB({
      players: updatedPlayers,
      phase: "betting",
      dealerId,
      currentPlayerIndex: next,
      gameOver: false,
      result: `💰 ${playerName} 压了 ${formatBet(amount)}`,
      resultDetails,
      readyPlayers,
      settlementStep: 0,
      seed,
      deckOffset,
      wheelVisible: false,
      wheelSelected: null,
      wheelSegments: [],
      communityCard,
      revealTargets,
      allCompareData,
      globalDealerHand,
      globalDealerHandName,
    });

    if (updatedPlayers[next]?.name === playerName) {
      startBettingTimeout();
    }
  };

  const startRevealTimeout = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(async () => {
      if (phase === "reveal" && isDealer && !gameOver) {
        console.log('⏰ 庄家超时未开牌,自动开全部');
        await revealAll();
      }
    }, 60000);
  };

  const revealPlayer = async (targetName: string) => {
    console.log('🔥 revealPlayer 开始, targetName:', targetName, 'phase:', phase, 'isDealer:', isDealer);
    if (phase !== "reveal") { console.log('❌ revealPlayer: phase !== reveal'); return; }
    if (!isDealer) { setErrorMsg("只有庄家可以开牌"); return; }
    if (revealTargets.includes(targetName)) {
      setErrorMsg(`${targetName} 已被开过`);
      return;
    }

    isSettlingRef.current = true;

    const target = playersRef.current.find(p => p.name === targetName);
    if (!target) { console.log('❌ revealPlayer: 找不到目标玩家'); isSettlingRef.current = false; return; }
    if (target.isDealer) { console.log('❌ revealPlayer: 不能开庄家'); isSettlingRef.current = false; return; }
    if (target.status !== 'playing') { console.log('❌ revealPlayer: 目标不是playing状态'); isSettlingRef.current = false; return; }

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    const newTargets = [...revealTargets, targetName];
    setRevealTargets(newTargets);
    setAllCompareData([]);

    const dealerPlayer = playersRef.current.find(p => p.name === dealerId) || playersRef.current.find(p => p.isDealer);
    if (!dealerPlayer || !dealerPlayer.cards || dealerPlayer.cards.length === 0) {
      console.log('❌ revealPlayer: 庄家没有手牌, dealerId:', dealerId);
      setErrorMsg("庄家没有手牌,无法开牌");
      isSettlingRef.current = false;
      return;
    }

    const dealerCard = dealerPlayer.cards[0];
    const targetCard = target.cards[0];
    if (!targetCard) {
      setErrorMsg(`${targetName} 没有手牌`);
      isSettlingRef.current = false;
      return;
    }

    const dealerBest = getBestThreeCards(communityCard, dealerCard);
    const targetBest = getBestThreeCards(communityCard, targetCard);

    // 修复5：设置全局庄家牌
    setGlobalDealerHand(dealerBest);
    setGlobalDealerHandName(getHandName(dealerBest));

    const betAmount = target.bet || 0.5;
    betRef.current = betAmount;

    setResult(`⚔️ 庄家 vs ${targetName} 开牌!`);

    setCompareData({
      dealerHand: dealerBest,
      targetHand: targetBest,
      dealerHandName: getHandName(dealerBest),
      targetHandName: getHandName(targetBest),
      playerName: targetName,
      result: null,
      penalty: 0,
      who: "",
      showResult: false,
    });

    await broadcastAndSyncDB({
      players: playersRef.current,
      phase: "reveal",
      dealerId,
      currentPlayerIndex,
      gameOver: false,
      result: `⚔️ 庄家 vs ${targetName} 开牌!`,
      resultDetails: resultDetailsRef.current,
      readyPlayers,
      settlementStep: 0,
      seed,
      deckOffset,
      wheelVisible: false,
      wheelSelected: null,
      wheelSegments: [],
      communityCard,
      compareData: {
        dealerHand: dealerBest,
        targetHand: targetBest,
        dealerHandName: getHandName(dealerBest),
        targetHandName: getHandName(targetBest),
        playerName: targetName,
        result: null,
        penalty: 0,
        who: "",
        showResult: false,
      },
      revealTargets: newTargets,
      allCompareData: [],
      globalDealerHand: dealerBest,
      globalDealerHandName: getHandName(dealerBest),
    });

    await new Promise(resolve => setTimeout(resolve, 600));

    const compareResult = compareHandsZhaJinHua(dealerBest, targetBest);
    let resultText = "";
    let penalty = 0;
    let who = "";
    let announceMsg = "";

    const finalBet = betRef.current;
    if (compareResult === 1) {
      resultText = "庄家赢";
      penalty = finalBet;
      who = target.name;
      announceMsg = `🏆 ${targetName} ${resultText},${targetName} 喝 ${formatBet(penalty)}!`;
    } else if (compareResult === -1) {
      resultText = "庄家输";
      penalty = finalBet;
      who = "dealer";
      announceMsg = `😅 ${targetName} ${resultText},庄家 喝 ${formatBet(penalty)}!`;
    } else {
      resultText = "平局";
      penalty = 0;
      who = "none";
      announceMsg = `🤝 ${targetName} ${resultText},不喝!`;
    }

    const newDetail = {
      player: targetName,
      dealerHand: dealerBest,
      targetHand: targetBest,
      dealerHandName: getHandName(dealerBest),
      targetHandName: getHandName(targetBest),
      result: resultText,
      penalty: penalty,
      who: who,
      bet: finalBet,
    };
    const nextResultDetails = [...resultDetailsRef.current, newDetail];
    setResultDetails(nextResultDetails);
    resultDetailsRef.current = nextResultDetails;
    // 🔧 2026-08-02：累加本轮统计（谁喝多少杯）
    if (who && who !== 'none' && penalty > 0) {
      const name = who === 'dealer' ? '庄家' : who;
      roundDrinkTotalsRef.current = { ...roundDrinkTotalsRef.current, [name]: (roundDrinkTotalsRef.current[name] || 0) + penalty };
      setRoundDrinkTotals(roundDrinkTotalsRef.current);
    }
    setResult(announceMsg);

    setCompareData({
      dealerHand: dealerBest,
      targetHand: targetBest,
      dealerHandName: getHandName(dealerBest),
      targetHandName: getHandName(targetBest),
      playerName: targetName,
      result: resultText,
      penalty: penalty,
      who: who,
      showResult: true,
    });

    if (isDealer) {
      const dealerPlayerNow = playersRef.current.find(p => p.isDealer);
      if (dealerPlayerNow && communityCard && dealerPlayerNow.cards && dealerPlayerNow.cards.length > 0) {
        const best = getBestThreeCards(communityCard, dealerPlayerNow.cards[0]);
        setMyBestHand(best);
      }
    }

    setPendingReveal({
      targetName,
      targetBet: finalBet,
    });

    await broadcastAndSyncDB({
      players: playersRef.current,
      phase: "reveal",
      dealerId,
      currentPlayerIndex,
      gameOver: false,
      result: announceMsg,
      resultDetails: resultDetailsRef.current,
      roundDrinkTotals: roundDrinkTotalsRef.current,
      readyPlayers,
      settlementStep: 0,
      seed,
      deckOffset,
      wheelVisible: false,
      wheelSelected: null,
      wheelSegments: [],
      communityCard,
      compareData: {
        dealerHand: dealerBest,
        targetHand: targetBest,
        dealerHandName: getHandName(dealerBest),
        targetHandName: getHandName(targetBest),
        playerName: targetName,
        result: resultText,
        penalty: penalty,
        who: who,
        showResult: true,
      },
      revealTargets: newTargets,
      allCompareData: [],
      globalDealerHand: dealerBest,
      globalDealerHandName: getHandName(dealerBest),
    });
  };

  const revealAll = async () => {
    if (phase !== "reveal") return;
    if (!isDealer) return;
    if (gameOver) return;

    const playingPlayers = players.filter(p => p.status === 'playing' && p.name !== dealerId);
    const toReveal = playingPlayers.filter(p => !revealTargets.includes(p.name));

    if (toReveal.length === 0) {
      setErrorMsg("所有玩家都已开过");
      return;
    }

    const newTargets = [...revealTargets, ...toReveal.map(p => p.name)];
    setRevealTargets(newTargets);

    setCompareData(null);

    const dealerPlayer = playersRef.current.find(p => p.name === dealerId) || playersRef.current.find(p => p.isDealer);
    if (!dealerPlayer || !dealerPlayer.cards || dealerPlayer.cards.length === 0) {
      setErrorMsg("庄家没有手牌");
      return;
    }
    const dealerCard = dealerPlayer.cards[0];
    const dealerBest = getBestThreeCards(communityCard, dealerCard);
    const dealerHandName = getHandName(dealerBest);

    // 修复5：设置全局庄家牌
    setGlobalDealerHand(dealerBest);
    setGlobalDealerHandName(dealerHandName);

    const allResults: {
      player: string;
      targetHandName: string;
      dealerHandName: string;
      result: string;
      penalty: number;
      who: string;
      bet: number;
    }[] = [];

    const newDetails: any[] = [];

    for (const targetName of toReveal.map(p => p.name)) {
      const target = playersRef.current.find(p => p.name === targetName);
      if (!target || target.isDealer || target.status !== 'playing') continue;

      const targetCard = target.cards[0];
      if (!targetCard) continue;

      const targetBest = getBestThreeCards(communityCard, targetCard);
      const targetHandName = getHandName(targetBest);
      const compareResult = compareHandsZhaJinHua(dealerBest, targetBest);
      const betAmount = target.bet || 0.5;
      betRef.current = betAmount;

      let resultText = "", penalty = 0, who = "";
      if (compareResult === 1) {
        resultText = "庄家赢";
        penalty = betAmount;
        who = target.name;
      } else if (compareResult === -1) {
        resultText = "庄家输";
        penalty = betAmount;
        who = "dealer";
      } else {
        resultText = "平局";
        penalty = 0;
        who = "none";
      }

      allResults.push({
        player: targetName,
        targetHandName: targetHandName,
        dealerHandName: dealerHandName,
        result: resultText,
        penalty: penalty,
        who: who,
        bet: betAmount,
      });

      newDetails.push({
        player: targetName,
        dealerHand: dealerBest,
        targetHand: targetBest,
        dealerHandName: dealerHandName,
        targetHandName: targetHandName,
        result: resultText,
        penalty: penalty,
        who: who,
        bet: betAmount,
      });
    }

    setAllCompareData(allResults);
    const nextResultDetails = [...resultDetailsRef.current, ...newDetails];
    setResultDetails(nextResultDetails);
    resultDetailsRef.current = nextResultDetails;
    // 🔧 2026-08-02：累加本轮统计（每把开牌的输赢）
    for (const d of newDetails) {
      if (d.who && d.who !== 'none' && d.penalty > 0) {
        const name = d.who === 'dealer' ? '庄家' : d.who;
        roundDrinkTotalsRef.current = { ...roundDrinkTotalsRef.current, [name]: (roundDrinkTotalsRef.current[name] || 0) + d.penalty };
      }
    }
    setRoundDrinkTotals(roundDrinkTotalsRef.current);

    const last = allResults[allResults.length - 1];
    if (last) {
      setPendingReveal({ targetName: last.player, targetBet: last.penalty });
      setResult(`⚔️ 已开 ${allResults.length} 位玩家`);
    }

    await broadcastAndSyncDB({
      players: playersRef.current,
      phase: "reveal",
      dealerId,
      currentPlayerIndex,
      gameOver: false,
      result: `⚔️ 已开 ${allResults.length} 位玩家`,
      resultDetails: resultDetailsRef.current,
      roundDrinkTotals: roundDrinkTotalsRef.current,
      readyPlayers,
      settlementStep: 0,
      seed,
      deckOffset,
      wheelVisible: false,
      wheelSelected: null,
      wheelSegments: [],
      communityCard,
      compareData: null,
      revealTargets: newTargets,
      allCompareData: allResults,
      globalDealerHand: dealerBest,
      globalDealerHandName: dealerHandName,
    });
  };

  const finishReveal = async () => {
    setErrorMsg("");
    setResult("");
    
    if (phase !== "reveal") return;
    if (!isDealer) return;
    if (revealTargets.length === 0) {
      setErrorMsg("还没有开过任何玩家");
      return;
    }

    // 🔥 原庄家退返：结算阶段、开新局之前才处理（进行中绝不动）。
    // 若标记的原庄家已回到房间 → 把庄家身份还给他；否则保持当前庄家，标记留待下一局（其回来后生效）。
    let effectiveDealerId = dealerId;
    // 🔥 修复5：用独立变量记录"本次广播要带出的退返标记值"。默认保留当前标记；
    // 仅当原庄家已回来、确实归还庄家时才置 null。否则（原庄家未回）必须保留标记随广播传出去，
    // 否则下面结算/新一轮广播写成 null 会把未消费的标记冲掉，导致原庄家回来后无法自动归位。
    let broadcastPendingReturn = pendingReturnDealer;
    if (pendingReturnDealer) {
      const retDealer = playersRef.current.find(p => p.name === pendingReturnDealer);
      if (retDealer) {
        effectiveDealerId = pendingReturnDealer;
        setPendingReturnDealer(null);
        broadcastPendingReturn = null;
      }
    }

    if (finishingRef.current) return; // 🔥 修复（2026-08-02）：防连点/并发重复发牌
    finishingRef.current = true;
    try {
    const deck = localDeckRef.current;
    let offset = deckOffsetRef.current;
    // 🔥 规则修正（2026-08-02）：诈金花核心规则 = "开了谁，谁跟庄家重发；没被开的人手牌原样留到下一把"。
    // 旧"修复6"错把这条规则当成 bug（注释写"避免部分人用旧牌"），改成了全场重发 → 后果有两个：
    // ① 未被开的玩家手牌被无故换掉（违反规则）② 每把吃牌数翻倍，52 张几把就见底，出现"有的没牌开"。
    // 现恢复：只有【被开过的玩家】+【本把新上桌的观战者】+【庄家】需要新牌。
    const revealedCount = playersRef.current.filter(
      p => p.status === 'playing' && !p.isDealer && revealTargets.includes(p.name)
    ).length;
    // 🔥 观战者即时上桌：中途加入的观战者本把转正、手上没牌必须发，牌数要一起算进去，
    // 否则会算出"牌够"但实际发牌时人多一张，导致最后一人拿到 undefined 牌。
    const watchingCount = playersRef.current.filter(p => p.status === 'watching').length;
    const totalNeeded = revealedCount + watchingCount + 1;

    // 🔥 牌堆不够 → 进入结算，显示抽庄按钮
    if (offset + totalNeeded > 52) {
      // 🔥 若发生退返，同步 isDealer 标记与 dealerId（牌不够时按原规则走抽庄转盘，不跳过）
      const settlePlayers = playersRef.current.map(p => ({ ...p, isDealer: p.name === effectiveDealerId }));
      setPlayers(settlePlayers);
      playersRef.current = settlePlayers;
      setDealerId(effectiveDealerId);
      setPhase("settlement");
      setGameOver(true);
      const summary = generateSummary();
      setResult(summary);
      await broadcastAndSyncDB({
        players: settlePlayers,
        phase: "settlement",
        dealerId: effectiveDealerId,
        // 🔥 归还已完成（或原庄家未回，标记保留），这里把标记清掉广播出去，避免残留
        pendingReturnDealer: broadcastPendingReturn,
        currentPlayerIndex,
        gameOver: true,
        result: summary,
        resultDetails,
        readyPlayers,
        settlementStep: 0,
        seed,
        deckOffset: offset,
        wheelVisible: false,
        wheelSelected: null,
        wheelSegments: [],
        communityCard,
        revealTargets: [],
        compareData: null,
        allCompareData: [],
        globalDealerHand: [],
        globalDealerHandName: '',
      });
      return;
    }

    // 牌堆够 → 正常发牌
    // 🔥 记录"本把新上桌的观战者"：他们手上没牌，必须发新牌（与"被开过的人"合并成发牌名单）
    const promotedNames: string[] = [];
    let updatedPlayers = playersRef.current.map(p => {
      // 🔥 同步 isDealer 标记（若发生退返，effectiveDealerId 已是原庄家）
      const isDealer = p.name === effectiveDealerId;
      // 🔥 观战者即时上桌：中途加入的新人在每一把开始时就转为正式玩家，不必再等一整副牌打完。
      // 走到这里说明牌堆够（上面已按"含观战者"的人数校验过），下面的发牌循环会给他们发牌。
      if (p.status === 'watching') {
        promotedNames.push(p.name);
        return { ...p, isDealer, status: 'playing', bet: 0, cards: [], cardCount: 0 };
      }
      if (p.status === 'playing') {
        // 注清零、下一把重新压（用户确认规则②）；这里刻意不动 cards ——
        // 没被开的玩家手牌必须原样带进下一把。
        return { ...p, isDealer, bet: 0 };
      }
      return { ...p, isDealer };
    });

    // 🔥 规则修正（2026-08-02）：只给【被开过的玩家】和【本把新上桌的观战者】发新牌。
    // 没被开的玩家手牌原样带进下一把；庄家全开时 revealTargets 即全员非庄家，自动等于全场重发，与规则自洽。
    const needDealNames = new Set([...revealTargets, ...promotedNames]);
    const dealtNames = updatedPlayers
      .filter(p => p.status === 'playing' && !p.isDealer && needDealNames.has(p.name))
      .map(p => p.name);
    for (const name of dealtNames) {
      const card = deck[offset++];
      updatedPlayers = updatedPlayers.map(p => {
        if (p.name === name) {
          return { ...p, cards: [card], cardCount: 1 };
        }
        return p;
      });
    }

    const dealerName = effectiveDealerId;
    if (dealerName) {
      const card = deck[offset++];
      updatedPlayers = updatedPlayers.map(p => {
        if (p.name === dealerName) {
          return { ...p, cards: [card], cardCount: 1 };
        }
        return p;
      });
    }

    setDeckOffset(offset);
    deckOffsetRef.current = offset;
    setRemainingCards(52 - offset);
    setPlayers(updatedPlayers);
    playersRef.current = updatedPlayers;
    setDealerId(effectiveDealerId);
    setShowMyHand(false); // 修复9b：开牌后重发（开始新对局/子轮）也收起查看，保持默认暗牌

    const me = updatedPlayers.find(p => p.name === playerName);
    if (me) {
      setMyCards(me.cards);
      if (communityCard) {
        setMyBestHand(getBestThreeCards(communityCard, me.cards[0]));
      }
    }

    setCompareData(null);
    setAllCompareData([]);
    setPendingReveal(null);
    setResult("");
    setRevealTargets([]);
    setResultDetails([]);
    resultDetailsRef.current = [];
    setGlobalDealerHand([]);
    setGlobalDealerHandName('');

    const playingPlayers = updatedPlayers.filter(p => p.status === 'playing' && !p.isDealer);
    const firstIdx = updatedPlayers.findIndex(p => p.name === playingPlayers[0]?.name);
    setCurrentPlayerIndex(firstIdx >= 0 ? firstIdx : 0);
    setPhase("betting");
    phaseRef.current = "betting";
    setGameOver(false); // 🔧 2026-08-02：开新局本地同步清空 gameOver，不依赖广播延迟，避免 betting 阶段还挂着上一局 settlement 的旧摘要
    setMyBet(0);
    setBettingComplete(false);
    bettingCompleteRef.current = false;

    setResult(`🔄 新一轮压酒开始！`);

    const bettingPayload = {
      players: updatedPlayers,
      phase: "betting",
      dealerId: effectiveDealerId,
      // 🔥 归还已完成才清标记；未消费（原庄家未回）则保留标记随广播带出（修复5）
      pendingReturnDealer: broadcastPendingReturn,
      currentPlayerIndex: firstIdx >= 0 ? firstIdx : 0,
      gameOver: false,
      result: `🔄 新一轮压酒开始！`,
      resultDetails: [],
      readyPlayers,
      settlementStep: 0,
      seed,
      deckOffset: offset,
      wheelVisible: false,
      wheelSelected: null,
      wheelSegments: [],
      communityCard,
      bettingComplete: false,
      compareData: null,
      revealTargets: [],
      allCompareData: [],
      forcePhase: true,
      globalDealerHand: [],
      globalDealerHandName: '',
      resetView: true,
    };
    await broadcastAndSyncDB(bettingPayload);

    if (updatedPlayers[firstIdx >= 0 ? firstIdx : 0]?.name === playerName) {
      startBettingTimeout();
    }
    } finally {
      finishingRef.current = false;
    }
  };

  const generateSummary = () => {
    const details = resultDetails;
    let summary = "";
    let dealerTotal = 0;

    for (const d of details) {
      if (d.who === 'dealer') {
        summary += `${d.player} 庄家输,庄家喝 ${formatBet(d.bet)}\n`;
        dealerTotal += d.bet;
      } else if (d.who === 'none') {
        summary += `${d.player} 平局,不喝\n`;
      } else {
        summary += `${d.player} 庄家赢,${d.player} 喝 ${formatBet(d.bet)}\n`;
      }
    }

    if (dealerTotal > 0) {
      summary += `\n→ 庄家共喝 ${formatBet(dealerTotal)}`;
    }

    return summary || "游戏结束";
  };

  const changeCommunityCard = async () => {
    if (phase !== "betting" || myBet > 0) {
      setErrorMsg("当前阶段不能换公牌");
      return;
    }
    if (deckOffset >= 52) {
      setErrorMsg("牌堆已用完,无法换公牌");
      return;
    }

    setConfirmDialog({
      message: "换公牌需要喝1杯酒，确定吗？",
      onConfirm: () => {
        setConfirmDialog(null);
        doChangeCommunityCard();
      },
    });
    return;
  };

  const doChangeCommunityCard = async () => {
    if (phase !== "betting" || myBet > 0) {
      setErrorMsg("当前阶段不能换公牌");
      return;
    }
    if (deckOffset >= 52) {
      setErrorMsg("牌堆已用完,无法换公牌");
      return;
    }

    // 修复C6：先读 DB 最新名单与牌堆进度，避免多人同时换公牌覆盖（同张牌/跳张/少杯）
    let basePlayers = players;
    let baseOffset = deckOffset;
    try {
      // 🔧 修复：DB 列名为小写 deckoffset（原驼峰导致整条查询报错→C6防覆盖保护从未生效）；players 需 parsePlayers 解析
      const { data: fresh } = await supabase.from("rooms").select("players, deckoffset").eq("id", roomId).single();
      if (fresh?.players) {
        const parsed = parsePlayers(fresh.players);
        if (parsed.length > 0) basePlayers = parsed;
      }
      if (typeof fresh?.deckoffset === 'number') baseOffset = fresh.deckoffset;
    } catch (_) {}
    if (baseOffset >= 52) {
      setErrorMsg("牌堆已用完,无法换公牌");
      return;
    }
    const deck = localDeckRef.current;
    const newCommunity = deck[baseOffset];
    const newOffset = baseOffset + 1;
    setDeckOffset(newOffset);
    setRemainingCards(52 - newOffset);
    setCommunityCard(newCommunity);
    setLocalDeck(deck);

    const updatedPlayers = basePlayers.map(p => {
      if (p.cards && p.cards.length > 0) {
        const best = getBestThreeCards(newCommunity, p.cards[0]);
        return { ...p, bestHand: best };
      }
      return p;
    });

    const me = updatedPlayers.find(p => p.name === playerName);
    if (me && me.cards && me.cards.length > 0) {
      const best = getBestThreeCards(newCommunity, me.cards[0]);
      setMyBestHand(best);
    }

    const updatedPlayersWithDrink = updatedPlayers.map(p => {
      if (p.name === playerName) {
        return { ...p, drinkCount: (p.drinkCount || 0) + 1 };
      }
      return p;
    });

    setResult("🔄 公牌已更换! " + playerName + " 已喝1杯");

    await broadcastAndSyncDB({
      players: updatedPlayersWithDrink,
      phase,
      dealerId,
      currentPlayerIndex,
      gameOver,
      result: "🔄 公牌已更换! " + playerName + " 已喝1杯",
      resultDetails,
      readyPlayers,
      settlementStep: 0,
      seed,
      deckOffset: newOffset,
      wheelVisible,
      wheelSelected,
      wheelSegments,
      communityCard: newCommunity,
      revealTargets,
      allCompareData,
      globalDealerHand,
      globalDealerHandName,
    });

    setTimeout(() => setResult(""), 3000);
  };

  // ===== 修改 showWheel：广播初始转盘状态 =====
  const showWheel = async (currentPlayers: any[]) => {
    const names = currentPlayers.map(p => p.name);
    if (names.length < 2) return;
    setWheelSegments(names);
    setWheelSelected(null);
    setWheelRotation(0);
    wheelRotationRef.current = 0;
    setWheelSpinning(false);
    wheelSpinningRef.current = false; // 修复4：进入转盘时同步 ref，避免残留 true 导致其他客户端误触发旋转
    setWheelVisible(true);
    setPhase("wheel");
    await broadcastAndSyncDB({
      players: currentPlayers,
      phase: "wheel",
      dealerId,
      currentPlayerIndex,
      gameOver: true,
      result: "🎡 抽庄中...",
      resultDetails,
      readyPlayers,
      settlementStep: 0,
      seed,
      deckOffset,
      wheelVisible: true,
      wheelSelected: null,
      wheelSegments: names,
      communityCard,
      revealTargets: [],
      allCompareData: [],
      globalDealerHand: [],
      globalDealerHandName: '',
      // 显式传递初始旋转状态（虽然会被 ref 覆盖，但为了明确）
    });
  };
  // ==========================================

  // ===== 修改 spinWheel：先广播开始，再计算并广播结束 =====
  const spinWheel = async () => {
    if (wheelSpinningRef.current) return; // 🔧 C7修复：用 ref 而非 state 守卫，避免极快连点两都见 false 而双转
    setWheelSpinning(true);
    wheelSpinningRef.current = true; // 修复4：先同步 ref，保证广播带出 wheelSpinning:true，所有客户端同步旋转
    setWheelRotation(0); // 重置角度
    wheelRotationRef.current = 0;

    // 1. 广播开始旋转（让所有客户端知道开始）
    await broadcastAndSyncDB({
      players,
      phase: "wheel",
      dealerId,
      currentPlayerIndex,
      gameOver: true,
      result: "🎡 转盘中...",
      resultDetails,
      readyPlayers,
      settlementStep: 0,
      seed,
      deckOffset,
      wheelVisible: true,
      wheelSelected: null,
      wheelSegments,
      communityCard,
      revealTargets: [],
      allCompareData: [],
      globalDealerHand: [],
      globalDealerHandName: '',
    });

    // 2. 计算目标角度（所有客户端使用相同 seed 和 segments）
    const totalSegments = wheelSegments.length;
    const rand = new SeededRandom(seed || 0);
    const winIndex = Math.floor(rand.next() * totalSegments);
    const segmentAngle = 360 / totalSegments;
    const extraSpins = 5 + Math.floor(rand.next() * 3);
    const targetAngle = 360 * extraSpins + (360 - winIndex * segmentAngle - segmentAngle / 2);
    
    // 3. 本地设置角度（触发动画）
    setWheelRotation(targetAngle);
    wheelRotationRef.current = targetAngle; // 修复4：让最终广播带出正确角度，避免其他客户端转盘回弹到 0

    // 4. 动画结束后公布结果
    setTimeout(async () => {
      const winner = wheelSegments[winIndex];
      setWheelSelected(winner);
      setWheelSpinning(false);
      wheelSpinningRef.current = false; // 修复4：同步 ref，避免最终广播仍带 wheelSpinning:true
      // 🔧 2026-08-02：转盘结束即结算完毕，本地把旧 resultDetails 清掉，且广播不再携带旧摘要，
      // 避免某些窗口在下一局 betting 阶段还挂着上一局"XX 庄家赢，喝X杯"的结算记录
      setResultDetails([]);
      resultDetailsRef.current = [];
      // 🔧 2026-08-02：本轮统计清零，新的一轮重新累计
      setRoundDrinkTotals({});
      roundDrinkTotalsRef.current = {};
      // 广播最终状态
      await broadcastAndSyncDB({
        players,
        phase: "wheel",
        dealerId,
        currentPlayerIndex,
        gameOver: true,
        result: `👑 ${winner} 成为新庄家!`,
        resultDetails: [],
        readyPlayers,
        settlementStep: 0,
        seed,
        deckOffset,
        wheelVisible: true,
        wheelSelected: winner,
        wheelSegments,
        communityCard,
        revealTargets: [],
        allCompareData: [],
        globalDealerHand: [],
        globalDealerHandName: '',
      });
      setTimeout(() => {
        startNextRound(winner);
      }, 1500);
    }, 3500);
  };
  // ==========================================

  const startNextRound = async (newDealerName: string) => {
    console.log('🔄 开始新一局,庄家:', newDealerName);

    // 🔧 以数据库权威名单补齐可能迟到的新玩家（如结算阶段才加入者），避免发牌漏人
    const authoritative = await fetchAuthoritativeRoom();
    const workingPlayers = authoritative ? authoritative.players : players;

    setWheelVisible(false);
    setWheelSelected(null);
    setWheelSegments([]);
    setWheelSpinning(false);
    setWheelRotation(0);
    setPhase("dealing");
    phaseRef.current = "dealing";
    setGameOver(false);
    setResult("");
    setResultDetails([]);
    resultDetailsRef.current = [];
    setReadyPlayers([]);
    setMyBet(0);
    setBettingComplete(false);
    bettingCompleteRef.current = false;
    setRevealTargets([]);
    setMyBestHand([]);
    setCompareData(null);
    setPendingReveal(null);
    setAllCompareData([]);
    setGlobalDealerHand([]);
    setGlobalDealerHandName('');

    const resetPlayers = workingPlayers.map(p => ({
      ...p,
      cards: [],
      cardCount: 0,
      isDealer: p.name === newDealerName,
      status: 'playing', // 修复1：抽庄后新对局把观战者也转为玩家
      bet: 0,
    }));

    setPlayers(resetPlayers);
    playersRef.current = resetPlayers;
    setDealerId(newDealerName);
    setIsDealer(playerName === newDealerName);
    setCommunityCard(null);

    // 修复6：一副牌打到底——抽庄后先检查牌堆剩余，够发新局就接着用，发不完才重洗
    const playersCount = resetPlayers.length;
    const cardsForNewRound = playersCount + 1; // 公牌1张 + 每人1张私牌
    const remainingCardsCount = 52 - deckOffset;
    let useSeed: number = seed ?? Math.floor(Math.random() * 1000000); // 沿用当前这副牌，seed为null时新建一副
    let useOffset = deckOffset;  // 接着用当前进度
    // 🔧 修复P4：seed 为 null/undefined(异常)时同步重置 offset，避免"换新牌却沿用旧位置"导致牌发错
    if (seed === null || seed === undefined) {
      useOffset = 0;
    }
    if (remainingCardsCount < cardsForNewRound) {
      // 真的发不完了，才重洗一副新牌
      useSeed = Math.floor(Math.random() * 1000000);
      useOffset = 0;
    }
    setSeed(useSeed);
    const deck = createDeckWithSeed(useSeed);
    setLocalDeck(deck);
    deckSeedRef.current = useSeed;
    setDeckOffset(useOffset);
    setRemainingCards(52 - useOffset);

    await broadcastAndSyncDB({
      players: resetPlayers,
      phase: "dealing",
      dealerId: newDealerName,
      currentPlayerIndex: 0,
      gameOver: false,
      result: "🃏 洗牌中...",
      resultDetails: [],
      readyPlayers: [],
      settlementStep: 0,
      seed: useSeed,
      deckOffset: useOffset,
      wheelVisible: false,
      wheelSelected: null,
      wheelSegments: [],
      communityCard: null,
      bettingComplete: false,
      revealTargets: [],
      allCompareData: [],
      globalDealerHand: [],
      globalDealerHandName: '',
    });

    setPhase("dealing");
    phaseRef.current = "dealing";
    setGameOver(false);

    await dealCards(resetPlayers, newDealerName, useSeed, useOffset); // 修复6：接着用剩牌发新局
  };

  const resetGame = async () => {
    setGameOver(false);
    setResult("");
    setResultDetails([]);
    resultDetailsRef.current = [];
    setPhase("waiting");
    phaseRef.current = "waiting";
    setDealerId(null);
    setPendingReturnDealer(null); // 修复25：重置时清退返庄家标记，避免下一局误指庄家
    setCurrentPlayerIndex(0);
    setMyCards([]);
    setMyBestHand([]);
    setShowMyHand(false);
    setMyBet(0);
    setBettingComplete(false);
    bettingCompleteRef.current = false;
    setRevealTargets([]);
    setIsDealer(false);
    setReadyPlayers([]);
    setWheelVisible(false);
    setWheelSelected(null);
    setWheelSegments([]);
    setWheelSpinning(false);
    setWheelRotation(0);
    setCommunityCard(null);
    setRemainingCards(52);
    setCompareData(null);
    setPendingReveal(null);
    setAllCompareData([]);
    setGlobalDealerHand([]);
    setGlobalDealerHandName('');

    const newSeed = Math.floor(Math.random() * 1000000);
    setSeed(newSeed);
    setLocalDeck(createDeckWithSeed(newSeed));
    deckSeedRef.current = newSeed;

    const resetPlayers = players.map(p => ({
      ...p,
      cards: [],
      cardCount: 0,
      isDealer: false,
      status: 'playing',
      bet: 0,
    }));
    setPlayers(resetPlayers);
    playersRef.current = resetPlayers;

    await broadcastAndSyncDB({
      players: resetPlayers,
      forcePhase: true,
      phase: "waiting",
      dealerId: null,
      pendingReturnDealer: null,
      currentPlayerIndex: 0,
      gameOver: false,
      result: "",
      resultDetails: [],
      readyPlayers: [],
      settlementStep: 0,
      seed: newSeed,
      deckOffset: 0,
      wheelVisible: false,
      wheelSelected: null,
      wheelSegments: [],
      communityCard: null,
      revealTargets: [],
      allCompareData: [],
      globalDealerHand: [],
      globalDealerHandName: '',
    });

    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  };

  const renderSeats = () => {
    const seatPositions = [
      { seatId: 0, left: 33, top: 6 },
      { seatId: 1, left: 67, top: 6 },
      { seatId: 2, left: 8, top: 23 },
      { seatId: 3, left: 8, top: 43 },
      { seatId: 4, left: 8, top: 63 },
      { seatId: 5, left: 8, top: 83 },
      { seatId: 6, left: 92, top: 23 },
      { seatId: 7, left: 92, top: 43 },
      { seatId: 8, left: 92, top: 63 },
      { seatId: 9, left: 92, top: 83 },
      { seatId: 10, left: 33, top: 94 },
      { seatId: 11, left: 67, top: 94 },
    ];

    return seatPositions.map((pos, idx) => {
      const player = players.find(p => p.seatId === pos.seatId) || null;
      const isMe = player?.name === playerName;
      const isDealerFlag = player?.name === dealerId;
      const isActive = phase === "betting" && player?.name === currentPlayer?.name && !gameOver;
      const hasCards = player && player.cardCount > 0;
      // 修复6：观战者不显示准备标记
      const isReady = phase === "waiting" && player?.status === 'playing' && readyPlayers.includes(player?.name || "");
      const displayName = player ? (player.name.length > 4 ? player.name.slice(0, 4) + '..' : player.name) : '';
      const betDisplay = player?.bet > 0 ? `${formatBet(player.bet)}` : '';

      const isRevealMode = phase === "reveal" && isDealer && !allCompareData.length;
      const isViewMode = phase === "reveal" && allCompareData.length > 0;

      const canClick = (isRevealMode || isViewMode) && player && player.status !== 'watching' && !player.isDealer;

      return (
        <div
          key={pos.seatId}
          style={{
            position: 'absolute',
            left: `${pos.left}%`,
            top: `${pos.top}%`,
            transform: 'translate(-50%, -50%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            width: '58px',
            minHeight: '46px',
            background: isActive ? 'rgba(220,38,38,0.25)' : (isDealerFlag ? 'rgba(251,191,36,0.15)' : (player ? 'rgba(255,255,255,0.04)' : 'transparent')),
            borderRadius: '12px',
            border: isActive ? '2px solid #dc2626' : (isDealerFlag ? '2px solid #fbbf24' : (player ? '1px solid rgba(255,255,255,0.06)' : 'none')),
            boxShadow: isActive ? '0 0 25px rgba(220,38,38,0.3)' : (isDealerFlag ? '0 0 15px rgba(251,191,36,0.15)' : 'none'),
            padding: '3px 4px',
            transition: 'all 0.3s',
            cursor: canClick ? 'pointer' : 'default',
            zIndex: 2,
            animation: isActive ? 'activeGlow 1.2s ease-in-out infinite' : 'none',
            pointerEvents: canClick || isViewMode ? 'auto' : 'none',
          }}
          onClick={() => {
            if (!player) return;

            if (isViewMode) {
              const myPlayerData = playersRef.current.find(p => p.name === playerName);
              const isDealerSelf = player.name === dealerId;
              const isCurrentUserPlaying = myPlayerData?.status === 'playing';

              if (isDealerSelf) {
                // 优先获取庄家牌
                let dealerHand = globalDealerHand;
                let dealerHandName = globalDealerHandName;
                if (!dealerHand || dealerHand.length === 0) {
                  const anyRecord = resultDetails.find(d => d.dealerHand && d.dealerHand.length > 0);
                  if (anyRecord) {
                    dealerHand = anyRecord.dealerHand;
                    dealerHandName = anyRecord.dealerHandName || '';
                  }
                }
                if (!dealerHand || dealerHand.length === 0) {
                  setErrorMsg('未找到庄家的牌');
                  return;
                }

                // 检查当前玩家是否是庄家
                const isCurrentUserDealer = myPlayerData?.isDealer || false;

                if (isCurrentUserDealer) {
                  // 庄家点击自己的座位 → 只显示庄家牌
                  setCompareData({
                    dealerHand: dealerHand,
                    targetHand: [],
                    dealerHandName: dealerHandName,
                    targetHandName: '',
                    playerName: '庄家',
                    result: null,
                    penalty: 0,
                    who: '',
                    showResult: true,
                  });
                  setResult(`👑 庄家的牌（${dealerHandName}）`);
                } else {
                  // 非庄家玩家点击庄家座位 → 显示自己的牌 vs 庄家牌
                  const myRecord = resultDetails.find(d => d.player === playerName);
                  if (myRecord && myRecord.targetHand && myRecord.targetHand.length > 0) {
                    setCompareData({
                      dealerHand: dealerHand,
                      targetHand: myRecord.targetHand,
                      dealerHandName: dealerHandName,
                      targetHandName: myRecord.targetHandName || '无牌',
                      playerName: '庄家',
                      result: myRecord.result || null,
                      penalty: myRecord.penalty || 0,
                      who: myRecord.who || '',
                      showResult: true,
                    });
                    setResult(`👤 你的牌 vs 庄家牌`);
                  } else {
                    // 如果自己的记录还没同步，则只显示庄家牌（兜底）
                    setCompareData({
                      dealerHand: dealerHand,
                      targetHand: [],
                      dealerHandName: dealerHandName,
                      targetHandName: '',
                      playerName: '庄家',
                      result: null,
                      penalty: 0,
                      who: '',
                      showResult: true,
                    });
                    setResult(`👑 庄家的牌（${dealerHandName}）`);
                  }
                }
                return;
              }

              const record = resultDetails.find(d => d.player === player.name);
              if (!record) {
                setErrorMsg('未找到该玩家的牌');
                return;
              }

              const isMySelf = player.name === playerName;

              if (isCurrentUserPlaying) {
                const myRecord = resultDetails.find(d => d.player === playerName);
                const dealerRecord = resultDetails.find(d => d.dealerHand && d.dealerHand.length > 0);

                if (isMySelf) {
                  if (myRecord && myRecord.dealerHand && myRecord.dealerHand.length > 0) {
                    setCompareData({
                      dealerHand: myRecord.dealerHand,
                      targetHand: myRecord.targetHand,
                      dealerHandName: myRecord.dealerHandName,
                      targetHandName: myRecord.targetHandName,
                      playerName: playerName,
                      result: myRecord.result,
                      penalty: myRecord.penalty,
                      who: myRecord.who,
                      showResult: true,
                    });
                    setResult(`👤 ${playerName} vs 庄家`);
                  } else {
                    setErrorMsg('未找到你的牌');
                  }
                  return;
                }

                // B2. 点击其他玩家
                if (myRecord && myRecord.targetHand && myRecord.targetHand.length > 0) {
                  console.log('🔍 被点击玩家:', player.name, '当前玩家:', playerName);
                  const targetRecord = record;
                  setCompareData({
                    dealerHand: myRecord.targetHand,
                    targetHand: targetRecord.targetHand || [],
                    dealerHandName: myRecord.targetHandName || myRecord.dealerHandName || '无牌',
                    targetHandName: targetRecord.targetHandName || '无牌',
                    playerName: player.name,
                    result: targetRecord.result,
                    penalty: targetRecord.penalty,
                    who: targetRecord.who,
                    showResult: true,
                  });
                  setResult(`👤 ${playerName} vs ${player.name}`);
                } else {
                  // 兜底
                  if (dealerRecord) {
                    console.log('🔍 兜底: 被点击玩家:', player.name, '当前玩家:', playerName);
                    setCompareData({
                      dealerHand: dealerRecord.dealerHand,
                      targetHand: record.targetHand || [],
                      dealerHandName: dealerRecord.dealerHandName,
                      targetHandName: record.targetHandName || '无牌',
                      playerName: player.name,
                      result: record.result || null,
                      penalty: record.penalty || 0,
                      who: record.who || '',
                      showResult: true,
                    });
                    setResult(`👤 ${playerName} vs ${player.name}`);
                  } else {
                    setErrorMsg('未找到你的牌');
                  }
                }
                return;
              }

              if (!isCurrentUserPlaying || myPlayerData?.status === 'watching') {
                setCompareData({
                  dealerHand: [],
                  targetHand: record.targetHand || [],
                  dealerHandName: '',
                  targetHandName: record.targetHandName || '无牌',
                  playerName: player.name,
                  result: null,
                  penalty: 0,
                  who: '',
                  showResult: true,
                });
                setResult(`🃏 ${player.name} 的牌`);
                return;
              }
              return;
            }

            if (isRevealMode && player && !player.isDealer && !revealTargets.includes(player.name)) {
              revealPlayer(player.name);
            }
          }}
        >
          {player ? (
            <>
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '1px',
                fontSize: '10px',
                fontWeight: isMe ? 'bold' : 'normal',
                color: isMe ? '#dc2626' : '#ddd',
                maxWidth: '100%',
                textAlign: 'center' as const,
                lineHeight: 1.2,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1px', flexWrap: 'wrap' as const, justifyContent: 'center' }}>
                  {isDealerFlag && <span style={{ fontSize: '12px', color: '#fbbf24' }}>👑</span>}
                  <span>{isMe ? '你' : displayName}</span>
                  {player?.status === 'watching' && <span style={{ fontSize: '8px', color: '#888' }}>(观战)</span>}
                  {revealTargets.includes(player?.name) && !isDealerFlag && <span style={{ fontSize: '8px', color: '#22d3ee' }}>✅</span>}
                </div>
                {betDisplay && player?.status === 'playing' && !isDealerFlag && (
                  <div style={{ fontSize: '10px', color: '#fbbf24', fontWeight: 'bold' }}>
                    🍺 {betDisplay}
                  </div>
                )}
                <div style={{ display: 'flex', gap: '2px', fontSize: '9px', flexWrap: 'wrap' as const, justifyContent: 'center' }}>
                  {isReady && <span style={{ color: '#22d3ee' }}>✅</span>}
                  {hasCards && <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '8px', animation: phase === 'dealing' ? ('dealIn 0.4s ease ' + (idx * 0.08) + 's') : 'none' }}>🃏</span>}
                </div>
              </div>
            </>
          ) : (
            <span style={{ fontSize: '16px', color: 'rgba(255,255,255,0.12)' }}>+</span>
          )}
        </div>
      );
    });
  };

  if (!joined) {
    return (
      <div style={styles.container}>
        <div style={styles.cardGlow1}></div>
        <div style={styles.cardGlow2}></div>
        <div style={styles.cardGlow3}></div>
        <div style={styles.card}>
          <div style={styles.logoContainer}>
            <span style={styles.logoEmoji}>♠</span>
            <span style={styles.logoEmoji}>♥</span>
            <span style={styles.logoEmoji}>♣</span>
            <span style={styles.logoEmoji}>♦</span>
          </div>
          <h1 style={styles.title}>
            <span style={styles.titleRed}>公牌</span>
            <span style={styles.titleGold}>炸金花</span>
          </h1>
          <p style={styles.subtitle}>♢ 第三张牌 · 想象为王 ♢</p>
          <input
            placeholder="👤 输入你的名字"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            style={styles.input}
          />
          <input
            placeholder="🔐 房间密码(设置或加入)"
            value={roomPassword}
            onChange={(e) => setRoomPassword(e.target.value)}
            style={styles.input}
          />
          <div style={styles.btnGroup}>
            <button onClick={createRoom} style={styles.btnPrimary}>🃏 创建房间</button>
            <button onClick={joinRoom} style={styles.btnSecondary}>♢ 加入房间</button>
          </div>
          {errorMsg && <div style={{ color: "#f87171", marginTop: 12, fontSize: 14 }}>{errorMsg}</div>}
          {disconnected && <div style={{ color: "#f87171", marginTop: 8, fontSize: 14 }}>⚠️ 网络连接断开,请检查网络</div>}
        </div>
      </div>
    );
  }

  const isMyBetTurn = phase === "betting" && currentPlayer?.name === playerName && !gameOver && !isDealer;
  const myPlayer = getMyPlayer();
  const someonePressed = players.some(p => (p.bet ?? 0) > 0);
  const canChangeCommunity = (
    (isMyBetTurn && myBet === 0) ||                          // 闲家：轮到你压酒、且你还没压酒
    (isDealer && phase === "betting" && !someonePressed)     // 庄家：下注阶段、且全场还没人压酒（发牌/重发后空档可换）
  ) && deckOffset < 52 && deckOffset > 0;

  // 🔧 修复：想象牌兜底用 players 里"我"的真实手牌(myPlayer.cards)，而非 myCards 这个独立 state——
  // 重进/晚到的接收端不会触发 setMyCards，但 setPlayers 已正确更新 myPlayer.cards，否则想象牌恒显示"无牌"
  const myDisplayHand = myBestHand && myBestHand.length > 0 ? myBestHand :
    (communityCard && myPlayer?.cards?.length > 0 ? getBestThreeCards(communityCard, myPlayer.cards[0]) : []);

  const activeCount = players.filter(p => p.status === 'playing').length;
  const cardsNeededForNext = activeCount;
  const isDeckEnough = deckOffset + cardsNeededForNext <= 52;

  const showRevealAll = phase === "reveal" && isDealer && !gameOver;
  const showFinishReveal = phase === "reveal" && isDealer && revealTargets.length > 0;
  const showSitOut = phase === "settlement" && myPlayer?.status === 'playing';
  // 修复9：观战者在 settlement 阶段也能重新加入
  const showRejoin = (phase === "waiting" || phase === "settlement") && myPlayer?.status === 'watching';
  // 修复26：对局中(非等待/结算)且本人是观战者时，显示醒目横幅，避免刷新重进后误以为在正常游戏
  const showSpectatorHint = myPlayer?.status === 'watching' && phase !== 'waiting' && phase !== 'settlement';

  return (
    <div style={styles.container}>
      <div style={styles.glowOrb}></div>
      <div style={styles.glowOrb2}></div>

      <div style={{
        ...styles.tableContainer,
        display: 'flex',
        flexDirection: 'column',
        height: phase === "settlement" ? '95vh' : '100dvh',
        maxHeight: phase === "settlement" ? '95vh' : '100dvh',
        overflowY: phase === "settlement" ? 'auto' : 'visible',
        WebkitOverflowScrolling: 'touch',
      }} className="table-container">
        <div style={{
          ...styles.table,
          flex: '1 1 auto',
          minHeight: 0,
        }}>
          {renderSeats()}

          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            width: '80%',
            maxHeight: '70%',
            zIndex: 1,
            pointerEvents: 'none' as const,
          }}>
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
            }}>
              {dealerId && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '4px',
                  marginBottom: '10px',
                  padding: '3px 14px',
                  borderRadius: '12px',
                  background: 'rgba(251,191,36,0.12)',
                  border: '1px solid rgba(251,191,36,0.35)',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: '#fbbf24',
                }}>
                  👑 庄家：{dealerId}
                </div>
              )}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '12px',
                marginBottom: '8px',
                padding: '2px 6px',
              }}>
                <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>公牌</span>
              {communityCard ? (
                <div style={{ animation: 'dealIn 0.4s ease' }}><PokerCard card={communityCard} hidden={false} size="medium" /></div>
              ) : (
                <span style={{ fontSize: '14px', color: 'rgba(255,255,255,0.2)' }}>等待发牌...</span>
              )}
              <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)' }}>
                🃏 {remainingCards}张
                {!isDeckEnough && phase !== "settlement" && phase !== "wheel" && (
                  <span style={{ color: '#f87171', marginLeft: '6px' }}>⚠️牌堆不足</span>
                )}
              </span>
            </div>
            </div>

            {compareData && compareData.showResult && (allCompareData.length > 0 || isDealer || (compareData.playerName && compareData.playerName === playerName)) ? (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '4px',
                padding: '2px 6px',
                marginBottom: '6px',
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '12px',
                  flexWrap: 'nowrap' as const,
                }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
                  <span style={{ fontSize: '11px', color: '#fbbf24' }}>
  {(phase === "reveal" && allCompareData.length > 0 && compareData) ? 
    (compareData.playerName === '庄家' ? '庄家' : playerName) 
    : (dealerId ? `庄家（${dealerId}）` : '庄家')}
</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                    {compareData.dealerHand && compareData.dealerHand.length > 0 ? (
                      compareData.dealerHand.map((card: any, idx: number) => (
                        <PokerCard key={idx} card={card} hidden={false} size="small" small />
                      ))
                    ) : (
                      <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)' }}>无牌</span>
                    )}
                  </div>
                  <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)' }}>{compareData.dealerHandName || ''}</span>
                </div>
                {compareData.targetHand && compareData.targetHand.length > 0 && (
                  <>
                    <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: '16px' }}>vs</span>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
                      <span style={{ fontSize: '11px', color: '#ddd' }}>{compareData.playerName === '庄家' ? playerName : compareData.playerName}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                        {compareData.targetHand.map((card: any, idx: number) => (
                          <PokerCard key={idx} card={card} hidden={false} size="small" small />
                        ))}
                      </div>
                      <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)' }}>{compareData.targetHandName || ''}</span>
                    </div>
                  </>
                )}
                </div>
                {compareData.result && (
                  <span style={{
                    fontSize: '14px',
                    fontWeight: 600,
                    color: compareData.result === '庄家赢' ? '#22d3ee' : compareData.result === '庄家输' ? '#f87171' : '#888',
                    textAlign: 'center',
                  }}>
                    {compareData.result}
                    {compareData.penalty > 0 && (
                      <span style={{ fontSize: '12px', color: '#fbbf24', marginLeft: '6px' }}>
                        🍺 {compareData.who === 'dealer' ? `庄家喝 ${formatBet(compareData.penalty)}` :
                             compareData.who === 'none' ? '不喝' :
                             `${compareData.who} 喝 ${formatBet(compareData.penalty)}`}
                      </span>
                    )}
                    {compareData.penalty === 0 && compareData.result === '平局' && (
                      <span style={{ fontSize: '12px', color: '#888' }}> 不喝</span>
                    )}
                  </span>
                )}
              </div>
            ) : (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '4px',
                marginBottom: '6px',
                color: 'rgba(255,255,255,0.4)',
                fontSize: '12px',
              }}>
                {allCompareData.length > 0
                  ? "💡 点击座位查看牌面对比"
                  : (revealTargets.includes(playerName)
                      ? (() => { const r = resultDetails.find(d => d.player === playerName); return r ? `你已开牌：${r.result}` : "你已开牌"; })()
                      : (compareData && compareData.playerName ? `🔒 ${compareData.playerName} 已开牌` : "⏳ 庄家开牌中，请稍候")
                    )
                }
              </div>
            )}

            {result && phase === "betting" && (
              <div style={{
                fontSize: '13px',
                fontWeight: 400,
                color: 'rgba(255,255,255,0.8)',
                background: 'rgba(0,0,0,0.3)',
                padding: '6px 16px',
                borderRadius: '8px',
                border: '1px solid rgba(255,255,255,0.05)',
                marginTop: '4px',
                textAlign: 'center',
                whiteSpace: 'pre-wrap',
                maxWidth: '100%',
                wordBreak: 'break-word',
              }}>
                {result}
              </div>
            )}

            <div style={{
              fontSize: '11px',
              color: 'rgba(255,255,255,0.4)',
              background: 'rgba(0,0,0,0.2)',
              padding: '2px 12px',
              borderRadius: '12px',
              marginTop: '4px',
            }}>
              {phase === "waiting" && `⏳ 等待开始 (${readyPlayers.length}/${players.filter(p => p.status !== 'watching').length} 已准备)`}
              {phase === "dealing" && "🃏 发牌中..."}
              {phase === "reveal" && (
                isDealer
                  ? '👑 点击座位开牌'
                  : (allCompareData.length > 0
                      ? '👑 已全部开牌,等待庄家开始新对局'
                      : (revealTargets.length > 0
                          ? '👑 庄家开牌中...'
                          : '👑 等待庄家开牌...'))
              )}
              {phase === "settlement" && "📊 结算完成"}
              {phase === "wheel" && "🎡 抽庄中..."}
            </div>
          </div>

          <div style={styles.roomInfo}>
            <span style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <span>👥 {Math.max(players.filter(p => p.status === 'playing' || p.status === 'watching').length, phase === 'waiting' ? readyPlayers.length : 0)}/{12}</span>
              {phase === "betting" && currentPlayer && !isDealer && <span style={{ color: '#fbbf24', fontSize: '12px' }}>🎯 {currentPlayer.name}</span>}
              {phase === "betting" && currentPlayer && isDealer && currentPlayer.name === playerName && <span style={{ color: '#fbbf24', fontSize: '12px' }}>⏳ 等待压酒</span>}
              {phase === "betting" && currentPlayer && isDealer && currentPlayer.name !== playerName && <span style={{ color: '#fbbf24', fontSize: '12px' }}>🎯 {currentPlayer.name}</span>}
            </span>
            <span style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              {showRejoin && (
                <button
                  onClick={rejoinGame}
                  style={{
                    background: 'rgba(34,211,238,0.15)',
                    border: '1px solid #22d3ee',
                    color: '#22d3ee',
                    padding: '2px 10px',
                    borderRadius: '12px',
                    fontSize: '11px',
                    cursor: 'pointer'
                  }}
                >
                  🔄 重新加入
                </button>
              )}
              {/* 修复2：压酒阶段且已下注时隐藏离开按钮 */}
              {(phase !== "betting" || (myPlayer?.bet ?? 0) === 0) && (
                <button
                  onClick={leaveRoom}
                  style={{
                    background: 'rgba(239,68,68,0.2)',
                    border: '1px solid #ef4444',
                    color: '#f87171',
                    padding: '2px 10px',
                    borderRadius: '12px',
                    fontSize: '11px',
                    cursor: 'pointer'
                  }}
                >
                  🚪 离开
                </button>
              )}
            </span>
          </div>
        </div>

        {showSpectatorHint && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            padding: '8px 12px',
            margin: '8px 12px 0',
            borderRadius: '12px',
            background: 'rgba(34,211,238,0.12)',
            border: '1px solid rgba(34,211,238,0.4)',
            color: '#22d3ee',
            fontSize: '13px',
            fontWeight: 600,
          }}>
            👀 你正在观战，这一把打完就自动上桌
          </div>
        )}

        <div key={`status-${phase}`} style={{ ...styles.statusBar, animation: 'fadeIn 0.3s ease' }}>
          {!gameOver && phase !== "settlement" && (
            <span style={styles.statusText}>
              {phase === "waiting" && `⏳ 等待开始 ${players.length >= 2 ? `(${readyPlayers.length}/${players.filter(p => p.status !== 'watching').length} 已准备)` : '(至少2人)'}`}
              {phase === "dealing" && "🃏 发牌中..."}
              {phase === "betting" && isDealer && currentPlayer?.name === playerName && `⏳ 等待其他玩家压酒`}
              {phase === "betting" && isDealer && currentPlayer && currentPlayer.name !== playerName && `⏳ ${currentPlayer.name} 压酒中`}
              {phase === "betting" && !isDealer && currentPlayer?.name === playerName && `⏳ 下注下注`}
              {phase === "betting" && !isDealer && currentPlayer && currentPlayer.name !== playerName && `⏳ ${currentPlayer.name} 压酒中...`}
              {phase === "betting" && !currentPlayer && `⏳ 等待中...`}
              {phase === "wheel" && "🎡 抽庄中..."}
            </span>
          )}
          {gameOver && phase !== "wheel" && phase !== "settlement" && <span style={styles.resultText}>{result || '游戏结束'}</span>}
          {phase === "settlement" && <span style={styles.resultText}>📊 本轮结束，请庄家抽庄</span>}
        </div>

        <div key={`action-${phase}`} style={styles.actionBar}>
          {phase === "waiting" && (
            <>
              {showRejoin && (
                <button onClick={rejoinGame} style={{ ...styles.btnStart, background: 'linear-gradient(135deg, #22d3ee, #0891b2)' }}>
                  🔄 重新加入
                </button>
              )}
              <button onClick={toggleReady} style={readyPlayers.includes(playerName) ? styles.btnReady : styles.btnNotReady}>
                {readyPlayers.includes(playerName) ? '已准备' : '准备'}
              </button>
              {/* 修复3：只有房主能开始游戏 */}
              {players.length >= 2 && allReady && players.find(p => p.status === 'playing')?.name === playerName && (
                <button onClick={startGame} style={styles.btnStart}>🎯 开始游戏</button>
              )}
            </>
          )}

          {phase === "betting" && isMyBetTurn && (myBet ?? 0) === 0 && (
            <>
              <button onClick={() => handleBet(0.5)} style={{ ...styles.btnBid, borderColor: '#dc2626', color: '#dc2626' }}>🍺 半杯</button>
              <button onClick={() => handleBet(1)} style={{ ...styles.btnBid, borderColor: '#f59e0b', color: '#f59e0b' }}>🍺 1杯</button>
              <button onClick={() => handleBet(2)} style={{ ...styles.btnBid, borderColor: '#fbbf24', color: '#fbbf24' }}>🍺 2杯</button>
            </>
          )}
          {phase === "reveal" && isDealer && (
            <>
              {showRevealAll && (
                <button onClick={revealAll} style={{ ...styles.btnStart, background: 'linear-gradient(135deg, #dc2626, #b91c1c)' }}>
                  🎯 开全部
                </button>
              )}
              {revealTargets.length > 0 && (
                <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)' }}>
                  已开: {revealTargets.join(', ')}
                </span>
              )}
              {showFinishReveal && (
                <button onClick={finishReveal} style={{ ...styles.btnStart, background: 'linear-gradient(135deg, #22d3ee, #0891b2)' }}>
                  🃏 开始新对局
                </button>
              )}
            </>
          )}
          {canChangeCommunity && (
            <button onClick={changeCommunityCard} style={{ ...styles.btnBid, background: 'rgba(251,191,36,0.1)', border: '1px solid #fbbf24', color: '#fbbf24' }}>
              🔄 换公牌 (喝1杯)
            </button>
          )}

          {(gameOver && phase !== "wheel") && (
            <>
              {isDealer ? (
                <button onClick={() => showWheel(players.filter(p => p.status === 'playing'))} style={styles.btnStart}>
                  🎡 开始抽庄
                </button>
              ) : (
                <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '13px' }}>
                  ⏳ 等待庄家开始抽庄...
                </span>
              )}
            </>
          )}
          {errorMsg && <div style={{ color: "#f87171", fontSize: 13, marginTop: 8 }}>{errorMsg}</div>}
        </div>

        {myPlayer && myPlayer.cards && myPlayer.cards.length > 0 && !gameOver && phase !== "settlement" && (
          <div style={styles.myCardsArea}>
            <div style={styles.myCardsLabel}>
              ♠♥ 你的手牌（点击翻转）
            </div>
            <div style={styles.myCardsRow}>
              {myPlayer.cards.map((card: any, idx: number) => (
                <PokerCard key={`${seed ?? 0}-${idx}`} card={card} hidden={!showMyHand} size="medium" onClick={() => setShowMyHand(!showMyHand)} />
              ))}
              {showMyHand && (
                <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.3)', marginLeft: '6px' }}>
                  + 想象牌 → {getHandName(myDisplayHand)}
                </span>
              )}
            </div>
          </div>
        )}

        {Object.keys(roundDrinkTotals).length > 0 && phase === "settlement" && (
          <div style={{
            marginTop: '10px',
            padding: '10px',
            background: phase === "settlement"
              ? 'linear-gradient(135deg, rgba(251,191,36,0.08), rgba(220,38,38,0.06))'
              : 'rgba(0,0,0,0.35)',
            borderRadius: '14px',
            border: phase === "settlement"
              ? '1px solid rgba(251,191,36,0.2)'
              : '1px solid rgba(255,255,255,0.06)',
            maxHeight: phase === "settlement" ? '50vh' : '100px',
            overflowY: 'auto',
            WebkitOverflowScrolling: 'touch',
            flexShrink: 0,
          }}>
            {phase === "settlement" && (
              <div style={{
                textAlign: 'center',
                fontSize: '18px',
                fontWeight: 700,
                color: '#fbbf24',
                marginBottom: '10px',
                textShadow: '0 0 20px rgba(251,191,36,0.3)',
              }}>
                📊 本轮统计
              </div>
            )}
            {Object.entries(roundDrinkTotals)
              .sort((a, b) => b[1] - a[1])
              .map(([name, total], idx, arr) => (
                <div key={idx} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '6px 0',
                  borderBottom: idx < arr.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                }}>
                  <span style={{ fontSize: '14px', color: '#ddd', fontWeight: 500 }}>{name}</span>
                  <span style={{ fontSize: '15px', fontWeight: 700, color: '#fbbf24' }}>
                    🍺 {formatBet(total)}
                  </span>
                </div>
              ))}
          </div>
        )}
      </div>

      {wheelVisible && (
        <div style={styles.wheelOverlay}>
          <div style={styles.wheelContainer}>
            <h2 style={styles.wheelTitle}>🎡 抽庄</h2>
            <div style={styles.wheelWrapper}>
              <div style={{
                ...styles.wheel,
                transform: `rotate(${wheelRotation}deg)`,
                transition: wheelSpinning ? 'transform 3.5s cubic-bezier(0.17, 0.67, 0.12, 1)' : 'none',
              }}>
                {wheelSegments.map((name, idx) => {
                  const angle = (360 / wheelSegments.length) * idx;
                  return (
                    <div key={idx} style={{
                      ...styles.wheelSegment,
                      transform: `rotate(${angle}deg)`,
                      backgroundColor: idx % 2 === 0 ? '#dc2626' : '#b91c1c',
                    }}>
                      <span style={styles.wheelSegmentText}>{name}</span>
                    </div>
                  );
                })}
              </div>
              <div style={styles.wheelPointer}>▼</div>
            </div>
            {wheelSelected && <div style={styles.wheelResult}>👑 {wheelSelected} 成为新庄家!</div>}
            {!wheelSelected && !wheelSpinning && isDealer && (
              <button onClick={spinWheel} style={styles.btnStart}>🎯 开始抽庄</button>
            )}
            {wheelSpinning && <div style={styles.wheelSpinningText}>🎲 转盘中...</div>}
          </div>
        </div>
      )}

      {confirmDialog && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
          backgroundColor: 'rgba(0,0,0,0.6)',
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          zIndex: 9999,
        }}>
          <div style={{
            backgroundColor: '#1a1a2e',
            borderRadius: '20px',
            padding: '24px',
            maxWidth: '340px',
            width: '90%',
            boxShadow: '0 20px 60px rgba(0,0,0,0.8)',
            textAlign: 'center',
            border: '1px solid rgba(251,191,36,0.2)',
          }}>
            <div style={{
              fontSize: '16px',
              fontWeight: 600,
              color: '#fff',
              marginBottom: '20px',
              lineHeight: 1.4,
            }}>
              {confirmDialog.message}
            </div>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button onClick={confirmDialog.onConfirm} style={{
                padding: '10px 24px',
                borderRadius: '12px',
                border: 'none',
                background: 'linear-gradient(135deg, #dc2626, #b91c1c)',
                color: '#fff',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 4px 16px rgba(220,38,38,0.3)',
              }}>
                确定
              </button>
              <button onClick={() => setConfirmDialog(null)} style={{
                padding: '10px 24px',
                borderRadius: '12px',
                border: '1px solid rgba(255,255,255,0.12)',
                background: 'rgba(255,255,255,0.04)',
                color: '#fff',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
              }}>
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .table-container.shake-warning { animation: shakeRed 0.5s ease-in-out 3; border: 3px solid #ef4444 !important; }
        @keyframes shakeRed { 0%,100% { transform: translateX(0); border-color: #ef4444; } 25% { transform: translateX(-10px); } 75% { transform: translateX(10px); } }
        @keyframes pulse { 0%,100% { opacity: 0.4; transform: scale(1); } 50% { opacity: 0.8; transform: scale(1.1); } }
        @keyframes activeGlow { 0%,100% { box-shadow: 0 0 12px rgba(220,38,38,0.25); } 50% { box-shadow: 0 0 28px rgba(220,38,38,0.65); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes dealIn { from { opacity: 0; transform: scale(0.5) translateY(-10px); } to { opacity: 1; transform: scale(1) translateY(0); } }
      `}</style>
    </div>
  );
}

const styles: any = {
  container: {
    minHeight: "100dvh",
    background: "radial-gradient(ellipse at 30% 40%, #2a0a0a 0%, #1a0505 40%, #0a0505 100%)",
    display: "flex", justifyContent: "center", alignItems: "center", padding: "8px",
    fontFamily: "system-ui, sans-serif", position: "relative", overflow: "hidden",
  },
  glowOrb: {
    position: "absolute", top: "-20%", right: "-10%", width: "500px", height: "500px",
    background: "radial-gradient(circle, rgba(220,38,38,0.15), transparent 70%)",
    borderRadius: "50%", pointerEvents: "none" as const, animation: "pulse 4s ease-in-out infinite",
  },
  glowOrb2: {
    position: "absolute", bottom: "-30%", left: "-10%", width: "400px", height: "400px",
    background: "radial-gradient(circle, rgba(251,191,36,0.12), transparent 70%)",
    borderRadius: "50%", pointerEvents: "none" as const, animation: "pulse 5s ease-in-out infinite reverse",
  },
  cardGlow1: {
    position: "absolute",
    top: "-15%",
    right: "-5%",
    width: "300px",
    height: "300px",
    background: "radial-gradient(circle, rgba(220,38,38,0.25), transparent 70%)",
    borderRadius: "50%",
    pointerEvents: "none" as const,
    animation: "pulse 3s ease-in-out infinite",
  },
  cardGlow2: {
    position: "absolute",
    bottom: "-20%",
    left: "-10%",
    width: "250px",
    height: "250px",
    background: "radial-gradient(circle, rgba(251,191,36,0.18), transparent 70%)",
    borderRadius: "50%",
    pointerEvents: "none" as const,
    animation: "pulse 4s ease-in-out infinite reverse",
  },
  cardGlow3: {
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    width: "400px",
    height: "400px",
    background: "radial-gradient(circle, rgba(251,191,36,0.04), transparent 70%)",
    borderRadius: "50%",
    pointerEvents: "none" as const,
  },
  logoContainer: {
    display: "flex",
    justifyContent: "center",
    gap: "6px",
    marginBottom: "4px",
  },
  logoEmoji: {
    fontSize: "28px",
    lineHeight: 1,
    display: "inline-block",
  },
  title: {
    textAlign: "center" as const,
    fontSize: "34px",
    fontWeight: 800,
    marginBottom: "2px",
    lineHeight: 1.2,
  },
  titleRed: {
    color: "#dc2626",
    textShadow: "0 0 40px rgba(220,38,38,0.25), 0 0 80px rgba(220,38,38,0.1)",
  },
  titleGold: {
    color: "#fbbf24",
    textShadow: "0 0 40px rgba(251,191,36,0.3), 0 0 80px rgba(251,191,36,0.1)",
  },
  card: {
    background: "linear-gradient(135deg, rgba(220,38,38,0.06), rgba(251,191,36,0.04), rgba(0,0,0,0.6))",
    backdropFilter: "blur(30px)",
    borderRadius: "28px",
    padding: "32px 24px",
    maxWidth: "400px",
    width: "100%",
    border: "1px solid rgba(251,191,36,0.15)",
    boxShadow: "0 30px 80px rgba(220,38,38,0.3), inset 0 1px 0 rgba(251,191,36,0.08)",
    position: "relative",
    zIndex: 1,
    overflow: "hidden",
  },
  logo: { fontSize: "48px", textAlign: "center" as const, marginBottom: "8px" },
  subtitle: { textAlign: "center" as const, color: "rgba(251,191,36,0.5)", fontSize: "13px", marginBottom: "24px" },
  input: {
    width: "100%", padding: "12px 16px", marginBottom: "10px", borderRadius: "12px",
    border: "1px solid rgba(251,191,36,0.15)", background: "rgba(0,0,0,0.3)",
    color: "#fff", fontSize: "15px", outline: "none", transition: "all 0.3s",
    boxSizing: "border-box" as const,
  },
  btnGroup: { display: "flex", gap: "10px", marginTop: "4px" },
  btnPrimary: {
    flex: 1, padding: "12px", borderRadius: "12px", border: "none",
    background: "linear-gradient(135deg, #dc2626, #b91c1c)", color: "#fff",
    fontSize: "15px", fontWeight: "600", cursor: "pointer", boxShadow: "0 4px 20px rgba(220,38,38,0.3)",
  },
  btnSecondary: {
    flex: 1, padding: "12px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.04)", color: "#fff", fontSize: "15px", fontWeight: "600", cursor: "pointer",
  },
  tableContainer: {
    position: "relative", zIndex: 1, width: "100%", maxWidth: "500px",
    background: "linear-gradient(135deg, rgba(220,38,38,0.04), rgba(251,191,36,0.03), rgba(0,0,0,0.5))",
    backdropFilter: "blur(30px)",     borderRadius: "24px",
    padding: "12px 2px", border: "1px solid rgba(251,191,36,0.12)",
    boxShadow: "0 30px 80px rgba(220,38,38,0.2), 0 0 40px rgba(251,191,36,0.05)",
  },
  table: {
    position: "relative", width: "100%", flex: "1 1 auto", minHeight: 0,
    background: "linear-gradient(180deg, #2a1f3d 0%, #1a1329 100%)",
    borderRadius: "18px", border: "2px solid rgba(251,191,36,0.2)",
    boxShadow: "inset 0 0 40px rgba(0,0,0,0.5)", marginBottom: "16px", overflow: "visible",
  },
  roomInfo: {
    position: "absolute", top: "6px", right: "10px", left: "10px",
    color: "rgba(255,255,255,0.5)", fontSize: "11px",
    display: "flex", justifyContent: "space-between", alignItems: "center",
    background: "rgba(0,0,0,0.3)", padding: "4px 10px", borderRadius: "14px", zIndex: 3,
  },
  statusBar: {
    background: "rgba(255,255,255,0.04)", borderRadius: "12px", padding: "8px 12px",
    textAlign: "center" as const, marginBottom: "10px", minHeight: "36px",
    display: "flex", alignItems: "center", justifyContent: "center",
    border: "1px solid rgba(255,255,255,0.04)", fontSize: "13px",
  },
  statusText: { color: "rgba(255,255,255,0.6)", fontSize: "13px" },
  resultText: { color: "#fbbf24", fontSize: "15px", fontWeight: "600", whiteSpace: "pre-wrap" as const, textAlign: "center" as const },
  actionBar: {
    display: "flex", flexWrap: "wrap" as const, gap: "8px", justifyContent: "center", marginTop: "8px",
    alignItems: "center",
  },
  btnBid: {
    padding: "8px 16px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.2)",
    background: "rgba(255,255,255,0.05)", color: "#fff", fontSize: "14px", fontWeight: "600", cursor: "pointer",
  },
  btnReady: {
    padding: "6px 16px", borderRadius: "16px", border: "none", background: "#22d3ee",
    color: "#0f0f1a", fontSize: "13px", fontWeight: "600", cursor: "pointer",
  },
  btnNotReady: {
    padding: "6px 16px", borderRadius: "16px", border: "1px solid rgba(255,255,255,0.2)",
    background: "rgba(255,255,255,0.05)", color: "#fff", fontSize: "13px", fontWeight: "600", cursor: "pointer",
  },
  btnStart: {
    padding: "8px 24px", borderRadius: "10px", border: "none",
    background: "linear-gradient(135deg, #fbbf24, #f59e0b)", color: "#0f0f1a",
    fontSize: "14px", fontWeight: "600", cursor: "pointer", boxShadow: "0 4px 16px rgba(251,191,36,0.25)",
  },
  btnReset: {
    padding: "8px 24px", borderRadius: "10px", border: "none",
    background: "linear-gradient(135deg, #dc2626, #b91c1c)", color: "#fff",
    fontSize: "14px", fontWeight: "600", cursor: "pointer", boxShadow: "0 4px 16px rgba(220,38,38,0.2)",
  },
  myCardsArea: {
    marginTop: "10px", padding: "8px 12px", background: "rgba(0,0,0,0.3)",
    borderRadius: "10px", textAlign: "center" as const,
    border: "1px solid rgba(220,38,38,0.15)",
  },
  myCardsLabel: {
    fontSize: "12px",
    color: "rgba(255,255,255,0.5)",
    marginBottom: "4px",
    cursor: "pointer",
    userSelect: "none" as const,
  },
  myCardsRow: {
    display: "flex",
    gap: "6px",
    alignItems: "center",
    flexWrap: "wrap" as const,
    justifyContent: "center",
    padding: "4px 0",
  },
  wheelOverlay: {
    position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
    backgroundColor: 'rgba(0,0,0,0.7)',
    display: 'flex', justifyContent: 'center', alignItems: 'center',
    zIndex: 999,
  },
  wheelContainer: {
    backgroundColor: '#1a1a2e', borderRadius: '32px', padding: '24px',
    maxWidth: '400px', width: '90%',
    boxShadow: '0 20px 60px rgba(0,0,0,0.8)',
    textAlign: 'center',
  },
  wheelTitle: { color: '#fff', fontSize: '24px', marginBottom: '16px' },
  wheelWrapper: {
    position: 'relative', width: '280px', height: '280px',
    margin: '0 auto 20px',
  },
  wheel: {
    width: '100%', height: '100%', borderRadius: '50%',
    overflow: 'hidden',
    border: '4px solid #dc2626',
    boxShadow: '0 0 30px rgba(220,38,38,0.3)',
    position: 'relative',
  },
  wheelSegment: {
    position: 'absolute', top: 0, left: '50%',
    width: '50%', height: '50%',
    transformOrigin: '0% 100%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    clipPath: 'polygon(0% 0%, 100% 0%, 0% 100%)',
  },
  wheelSegmentText: {
    position: 'absolute', top: '10px', left: '10px',
    color: '#fff', fontWeight: 'bold', fontSize: '14px',
    transform: 'rotate(-90deg)',
    textShadow: '0 1px 3px rgba(0,0,0,0.5)',
  },
  wheelPointer: {
    position: 'absolute', top: '-12px', left: '50%',
    transform: 'translateX(-50%)',
    color: '#fbbf24', fontSize: '36px', fontWeight: 'bold',
    zIndex: 10,
    textShadow: '0 0 10px rgba(251,191,36,0.5)',
  },
  wheelResult: {
    color: '#fbbf24', fontSize: '20px', fontWeight: 'bold',
    marginBottom: '16px',
    animation: 'pulse 1s ease-in-out infinite',
  },
  wheelSpinningText: {
    color: '#aaa', fontSize: '16px', marginTop: '12px',
  },
};

if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `
    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.6; transform: scale(1.05); }
    }
  `;
  document.head.appendChild(style);
}