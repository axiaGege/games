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
    return { rank: 6, score: [values[0], 0, 0] };
  }
  if (isStraightFlushResult) {
    if (values[0] === 12 && values[1] === 1 && values[2] === 0) {
      return { rank: 5, score: [2, 0, 0] };
    }
    return { rank: 5, score: [values[0], 0, 0] };
  }
  if (isFlushResult) {
    return { rank: 4, score: values };
  }
  if (isStraightResult) {
    if (values[0] === 12 && values[1] === 1 && values[2] === 0) {
      return { rank: 3, score: [2, 0, 0] };
    }
    return { rank: 3, score: [values[0], 0, 0] };
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
    return { rank: 2, score: [pairRank, kicker, 0] };
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

// 🔧 按名字去重：名字是游戏的权威身份（压酒/轮转/庄家判定全用名字）。
// 同一名字出现多条（多为重连时 cid 变化导致的历史脏数据）一律合并为一条，
// 优先保留有牌/有下注/是庄家/有座位号的字段，避免人数被重复计数(表现为 2/12、3/13)。
// 这是根治"名单滚雪球"的核心：之前接收端按名字去重、写库却按 cid||名字 去重，
// cid 一变就识别不出老条目 → 每次重连追加一条同名重复 → 名单累积到房间上限 12。
const dedupePlayers = (arr: any[]): any[] => {
  if (!Array.isArray(arr)) return [];
  const map = new Map<string, any>();
  for (const p of arr) {
    if (!p || typeof p !== 'object') continue;
    const key = ((p.name && String(p.name).trim()) || p.cid || '') as string;
    if (!key) continue;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, { ...p });
    } else {
      const merged: any = { ...existing, ...p };
      merged.cards = (p.cards && p.cards.length) ? p.cards : (existing.cards || []);
      merged.cardCount = merged.cards.length || p.cardCount || existing.cardCount || 0;
      merged.bet = p.bet ? p.bet : (existing.bet || 0);
      merged.isDealer = p.isDealer || existing.isDealer || false;
      merged.seatId = (p.seatId !== undefined && p.seatId !== null) ? p.seatId : existing.seatId;
      merged.status = p.status || existing.status || 'playing';
      merged.cid = p.cid || existing.cid;
      merged.lastSeen = Math.max(existing.lastSeen || 0, p.lastSeen || 0);
      map.set(key, merged);
    }
  }
  return Array.from(map.values());
};

const getHandName = (cards: any[]): string => {
  if (!cards || cards.length !== 3) return '无牌';
  const r = getHandRank(cards);
  const names = ['单张', '对子(最低)', '对子', '顺子', '金花', '同花顺', '豹子'];
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

  const [players, setPlayers] = useState<any[]>([]);
  const [phase, setPhase] = useState<"waiting" | "dealing" | "betting" | "reveal" | "settlement" | "wheel">("waiting");
  const [dealerId, setDealerId] = useState<string | null>(null);
  // 🔥 原庄家退返标记：庄家离开时记下其名字，待结算阶段开新局前、若其已回房则把庄家身份还给他（仅走广播，不改数据库）
  const [pendingReturnDealer, setPendingReturnDealer] = useState<string | null>(null);
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0);

  // 🔧 根因修复：各端 players 数组顺序不一致（谁先进房谁排前），而压酒轮转/下一个谁/重连定位
  // 全用数组下标 currentPlayerIndex，顺序一不同→同一下标指不同的人→压酒卡死等问题。
  // 用"稳定座位号 seatId"统一排序，所有客户端顺序完全一致，下标自然对得上号。一次性根治。
  const bySeat = (a: any, b: any) => (a?.seatId ?? 9999) - (b?.seatId ?? 9999);
  const sortPlayers = (arr: any[]) => [...(arr || [])].sort(bySeat);

  const [gameOver, setGameOver] = useState(false);
  const [result, setResult] = useState<string>("");
  const [resultDetails, setResultDetails] = useState<any[]>([]);
  const [seed, setSeed] = useState<number | null>(null);
  const [localDeck, setLocalDeck] = useState<any[]>([]);
  const localDeckRef = useRef<any[]>([]);
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
  const [errorMsg, setErrorMsg] = useState("");
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

  const broadcastAndSyncDB = async (state: any, readyOnly = false, joinSync = false) => {
    const newVersion = versionRef.current + 1;
    versionRef.current = newVersion;
    setVersion(newVersion);
    // 自动从 ref 获取当前转盘状态
    const payload = {
      ...state,
      readyOnly,
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
      const channel = channelRef.current || supabase.channel(`zhajinhua:${roomId}`, { config: { broadcast: { ack: true } } });
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

    try {
      // 🔧 readyOnly(点准备/取消准备)：只同步准备名单与(观战转玩家时的)玩家名单，绝不写相位/牌堆/庄家等游戏状态，
      // 否则携带滞后 phase:"waiting" 的迟到广播会把发牌中的对局拽回准备、并把自己落后的 players 名单广播出去把人删掉
      // 🔧 根因修复：写库前把 incoming 名单与数据库现有名单按名字并集，绝不因本端暂时缺人就把库里已有玩家冲掉。
      const mergePlayersWithDB = async (incoming: any[]) => {
        try {
          const { data: cur } = await supabase.from("rooms").select("players").eq("id", roomId).single();
          const curArr = parsePlayers(cur?.players);
          const keys = new Set((incoming || []).map((p: any) => p.cid || p.name));
          return dedupePlayers([...(incoming || []), ...curArr.filter((p: any) => !keys.has(p.cid || p.name))]);
        } catch { return incoming; }
      };

      const dbUpdate: any = { version: newVersion };
      let playersToWrite: any = undefined;
      if (readyOnly) {
        // 点准备/取消准备：只同步准备名单（及观战转玩家时的 players），绝不碰相位/牌堆/庄家
        dbUpdate.readyplayers = state.readyPlayers || [];
        if (state.players) playersToWrite = await mergePlayersWithDB(state.players);
      } else if (joinSync) {
        // 加入/重连房间：只把"我来了/我回来了"写进 players，绝不写相位/准备/牌堆。
        // 否则携带滞后 phase:"waiting" 的迟到写库会把发牌中的对局拽回准备、准备名单打回[房主]
        // （表现：发牌后顶部又冒出"等待开始(1/3 已准备)"）
        playersToWrite = state.players;
      } else {
        playersToWrite = await mergePlayersWithDB(state.players);
        dbUpdate.phase = state.phase;
        dbUpdate.dealerid = state.dealerId;
        dbUpdate.gameover = state.gameOver;
        dbUpdate.currentplayerindex = state.currentPlayerIndex || 0;
        dbUpdate.result = state.result || "";
        dbUpdate.resultdetails = state.resultDetails || [];
        dbUpdate.settlementstep = state.settlementStep || 0;
        dbUpdate.seed = state.seed;
        // 修复2：仅在确实携带 deckOffset 时才写库，避免 undefined/0 把库里已有进度清零
        if (state.deckOffset !== undefined && state.deckOffset !== null) dbUpdate.deckoffset = state.deckOffset;
        dbUpdate.wheelvisible = state.wheelVisible || false;
        dbUpdate.wheelselected = state.wheelSelected || null;
        dbUpdate.wheelsegments = state.wheelSegments || [];
        dbUpdate.communitycard = state.communityCard || null;
        dbUpdate.bettingcomplete = state.bettingComplete !== undefined ? state.bettingComplete : false;
        dbUpdate.revealtargets = state.revealTargets || [];
      }
      if (playersToWrite !== undefined) dbUpdate.players = playersToWrite;
      await supabase.from("rooms").update(dbUpdate).eq("id", roomId);
      console.log('💾 数据库同步成功');
      setDisconnected(false);
    } catch (error) {
      console.error('⚠️ 数据库同步失败(不影响游戏实时同步):', error);
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
      .channel(`zhajinhua:${roomId}`, { config: { broadcast: { ack: true } } })
      .on('broadcast', { event: 'gameState' }, (payload) => {
        const state = payload.payload;
        // 🔧 根因修复：原版本号是"每客户端各自递增"的计数器，跨客户端根本无法比较大小，
        // 导致其他玩家发来的【新鲜】广播被误判成"旧版本"直接丢弃 → 准备/压酒状态各手机对不上、压酒卡死。
        // 改为不再因版本号丢弃任何广播；相位回退由专门的相位护栏拦截，玩家名单由并集保护，故可全部接受。
        // 仅记录版本号便于排查。
        versionRef.current = Math.max(versionRef.current, state.version || 0);
        const parsedPlayers = parsePlayers(state.players);
        // 🔧 任何广播都让内部名单(playersRef)立刻跟上最新，避免发起方(finishReveal/dealCards)
        // 用滞后快照算错下注顺序/归还判定。
        // 典型场景：原庄家返回时新庄家端名单靠 400ms 异步补齐且只更 state 不更 ref，
        // 导致点"开始新对局"时 ref 里无原庄家→归还失效、firstIdx 错位、压酒按钮不出。
        if (parsedPlayers.length > 0) {
          playersRef.current = sortPlayers(parsedPlayers);
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

          const normalize = (p: any) => ({
            ...p,
            cards: p.cards || [],
            cardCount: p.cards?.length || p.cardCount || 0,
            bet: p.bet || 0,
            status: p.status || 'playing',
          });

          // 1) 以广播名单为主，逐人规范化（保留"我"的牌/下注/身份兜底逻辑）
          let merged = parsedPlayers.map((p: any) => {
            if (p.name === playerName && localMe && remoteMe) {
              const isDealing = state.phase === "dealing";
              if (isDealing) return p;
              const hasLocalCards = localMe.cards && localMe.cards.length > 0;
              const isNewBettingRound = state.phase === "betting" && remoteMe.bet === 0;
              const shouldUseRemoteCards = isNewBettingRound && remoteMe.cards && remoteMe.cards.length > 0;
              // 🔧 兜底：betting 阶段自己是 playing 但完全没牌（漏收发牌广播），用 seed+deckOffset 确定性重建
              const needRebuild = state.phase === "betting" && localMe.status === 'playing' && !hasLocalCards && !(remoteMe.cards && remoteMe.cards.length > 0);
              if (needRebuild) {
                try {
                  const N = parsedPlayers.length;
                  const myIndex = parsedPlayers.findIndex(pp => pp.name === playerName);
                  const dk = createDeckWithSeed(state.seed);
                  const startOff = (state.deckOffset || 0) - 1 - N;
                  const myCard = dk[startOff + 1 + myIndex];
                  const community = dk[startOff];
                  if (myCard) {
                    if (!state.communityCard) setCommunityCard(community);
                    return { ...p, cards: [myCard], cardCount: 1, status: 'playing' };
                  }
                } catch (_) {}
              }
              return {
                ...p,
                cards: shouldUseRemoteCards ? (p.cards || []) : (hasLocalCards ? localMe.cards : (p.cards || [])),
                cardCount: shouldUseRemoteCards ? (p.cardCount || p.cards?.length || 0) : (hasLocalCards ? localMe.cardCount : (p.cardCount || 0)),
                bet: isNewBettingRound ? 0 : (hasLocalCards ? (localMe.bet || 0) : (p.bet || 0)),
                status: isNewBettingRound ? 'playing' : (hasLocalCards ? (localMe.status || 'playing') : (p.status || 'playing')),
              };
            }
            const prevPlayer = prev.find(pp => pp.name === p.name);
            // 🔧 结构性同步（加入/离开）时，已存在的玩家保留自己的牌/下注/身份
            if (state.structuralSync && prevPlayer) return prevPlayer;
            return normalize(p);
          });

          // 2) 🔧 并集：补齐"本地有但广播没带"的人——迟到加入广播(只带[p1,p2])不能把已加入的玩家3整体删掉，
          // 否则表现为"人数变少 / 准备名单有3人但玩家列表只有2人 / 点了开始却只有两人能玩"
          const localOnly = prev.filter((pp: any) => !parsedPlayers.some((p: any) => p.name === pp.name));
          merged = [...merged, ...localOnly];

          // 3) 有人离开(justUnready)时剔除离开者，避免迟到加入广播把它又加回来
          if (state.justUnready) {
            merged = merged.filter((p: any) => p.name !== state.justUnready);
          }
          return sortPlayers(dedupePlayers(merged)); // 🔧 统一按座位号排序 + 按名字去重(防历史脏数据)
        });

        // 🔧 结构性同步（加入/离开房间）只更新玩家名单，绝不覆盖任何游戏状态
        // （牌堆/阶段/准备名单/seed 等）。否则重进者用他从数据库读到的快照把正在玩的人全重置，
        // 表现为：牌堆跳回52、对局没了、其他人被跳成已准备。
        // 🔥 例外：庄家离开（leaveSync）时，必须落地"转移后的新庄家 + 保留的阶段/牌堆"，
        // 否则算好的转移传不出去（其他人永远看不到新庄家、牌堆被刷）。
        // leaveSync 仅由 doLeaveRoom 在"庄家离开"时置 true，加入/重进/非庄家离开均不置，故不回归。

        // ===== 准备名单同步（所有广播都先处理，放在结构性提前返回之前）=====
        // 根因修复：原逻辑收到任何广播都用广播里的 readyPlayers 整体覆盖本地，
        // 迟到/滞后的子集广播会把已准备的人全冲掉(变回1/4)。
        // 现改为：clearReady 或 游戏已开始(phase≠waiting)→整体清空；justUnready→精确移除该玩家；
        // 正常准备广播(非结构性)→并集吸收(只增不冲)，结构性广播(加入/离开)的 readyPlayers 是发送者滞后快照，不并集。
        setReadyPlayers(prev => {
          if (state.clearReady || (state.phase && state.phase !== "waiting")) return [];
          let next = prev;
          if (state.justUnready) next = next.filter(n => n !== state.justUnready);
          if (!state.structuralSync && state.readyPlayers) {
            next = Array.from(new Set([...next, ...state.readyPlayers]));
          }
          return next;
        });

        // 🔧 readyOnly 广播(点准备/取消准备)只同步准备名单，绝不触碰相位/牌堆/庄家等游戏状态，
        // 否则携带滞后 phase:"waiting" 或落后 players 名单的迟到广播会把发牌中的对局拽回准备、或把已加入的人删掉
        if (state.readyOnly) return;

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
        const forwardPhases = ["dealing", "betting", "reveal", "settlement", "wheel"];
        const currentIdx = forwardPhases.indexOf(prevPhase);
        const newIdx = forwardPhases.indexOf(newPhase);

        let effectivePhase;
        if (state.forcePhase) {
          effectivePhase = newPhase;
        } else if (newPhase === "dealing" || prevPhase === "waiting") {
          // 🔧 仅两种情形接受等待/开局推进：①本地本就在等待界面(正常准备)；②收到开局(dealing)推进。
          // 绝不在游戏进行中(dealing/betting/...)接受 waiting——否则一条迟到旧广播或轮询读到滞后的库相位，
          // 就会把正在打牌的对局拽回准备(表现：发牌后顶部又冒出"等待开始(1/3 已准备)")。
          effectivePhase = newPhase;
        } else if (newPhase === "betting" && prevPhase === "reveal") {
          effectivePhase = newPhase;
        } else if (newIdx >= currentIdx && currentIdx >= 0) {
          effectivePhase = newPhase;
        } else {
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
        setResult(state.result || "");
        setResultDetails(state.resultDetails || []);
        // 🔧 准备名单已由上方"所有广播统一处理"块接管（并集/精确移除/开局清空），此处不再整体覆盖
        // 修复8：接收端牌堆保护——只在广播显式携带时才更新，避免漏带字段把本地进度误清零（与修复2写库保护对称）
        if (state.seed !== undefined) setSeed(state.seed);
        if (state.deckOffset !== undefined) setDeckOffset(state.deckOffset);
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

        if (state.seed === null) {
          setLocalDeck([]);
          localDeckRef.current = [];
          setDeckOffset(0);
        } else if (state.seed && localDeckRef.current.length === 0) {
          const newDeck = createDeckWithSeed(state.seed);
          setLocalDeck(newDeck);
          localDeckRef.current = newDeck;
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
      .subscribe();

    channelRef.current = channel;
    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, [roomId, playerName]);

  // ---------- 定时对账：每 3 秒以数据库权威账本兜底（漏听广播最多 3 秒自动追平） ----------
  // 复用已存在的命名名单收敛函数，再补阶段/轮次/转盘/公牌等标量状态对账。
  // 与黑杰克 syncFromDB 同思路：DB 即公共账本，永远最新，故对账直接以 DB 为准应用。
  useEffect(() => {
    if (!roomId) return;
    const id = setInterval(async () => {
      try {
        const { data, error } = await supabase.from("rooms").select("*").eq("id", roomId).single();
        if (error || !data) return;
        // 心跳 + 幽灵清理：刷新自己的 lastSeen，剔除超过 15 分钟没动静的幽灵（自己除外）
        const myCid = (() => { try { return localStorage.getItem('zjh_cid') || ''; } catch { return ''; } })();
        const now = Date.now();
        let playersArr: any[] = parsePlayers(data.players);
        let changed = false;
        playersArr = playersArr.map((p: any) => {
          if ((p.cid && p.cid === myCid) || (!p.cid && p.name === playerName)) { changed = true; return { ...p, lastSeen: now }; }
          if (p.lastSeen && now - p.lastSeen > 15 * 60 * 1000) { changed = true; return null; }
          return p;
        }).filter(Boolean) as any[];
        playersArr = dedupePlayers(playersArr); // 🔧 按名字去重，清理历史累积的重复条目
        if (changed) {
          try { await supabase.from("rooms").update({ players: playersArr }).eq("id", roomId); } catch (_) {}
        }
        await reconcilePlayersFromDB(); // 名单收敛（已有函数，零风险）
        // 阶段防护：沿用接收端 forwardPhases 逻辑，避免把对局中状态拉回 waiting
        const prevPhase = phaseRef.current;
        const forwardPhases = ["dealing", "betting", "reveal", "settlement", "wheel"];
        const cur = forwardPhases.indexOf(prevPhase);
        const nxt = forwardPhases.indexOf(data.phase || "waiting");
        let eff = data.phase || "waiting";
        if (!(eff === "dealing" || prevPhase === "waiting" || (eff === "betting" && prevPhase === "reveal") || (nxt >= cur && cur >= 0))) {
          // 🔧 轮询同理：游戏进行中(dealing/betting/...)收到库里的 waiting 一律忽略(保留本地真实相位)，
          // 不再因库相位滞后/写库慢半秒就把对局拽回准备。仅本地本就在等待、或收到合法前向推进时才采用库值。
          eff = prevPhase;
        }
        setPhase(eff); phaseRef.current = eff;
        setDealerId(data.dealerid || null);
        setCurrentPlayerIndex(data.currentplayerindex || 0);
        setSeed(data.seed);
        if (data.deckoffset !== undefined && data.deckoffset !== null) setDeckOffset(data.deckoffset);
        setWheelVisible(data.wheelvisible || false);
        setWheelSelected(data.wheelselected || null);
        setWheelSegments(data.wheelsegments || []);
        if (data.communitycard !== undefined) setCommunityCard(data.communitycard);
        setResult(data.result || "");
        setResultDetails(data.resultdetails || []);
        // 准备名单：准备阶段并集吸收(防迟到/库滞后把已准备的人冲掉)；游戏中以库为准(开局后库为[])
        setReadyPlayers(prev => {
          if (phaseRef.current !== "waiting") return data.readyplayers || [];
          return Array.from(new Set([...prev, ...(data.readyplayers || [])]));
        });
        setBettingComplete(data.bettingcomplete !== undefined ? data.bettingcomplete : false);
        bettingCompleteRef.current = data.bettingcomplete || false;
        if (data.revealtargets) setRevealTargets(data.revealtargets);
        if (data.deckoffset !== undefined) setRemainingCards(52 - data.deckoffset);
      } catch (_) {}
    }, 3000);
    return () => clearInterval(id);
  }, [roomId]);

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

  // ============ 隐形身份证：每台设备一个永久编号，退出也不删，认人靠编号不靠名字 ============
  const getOrCreateCid = () => {
    try {
      let c = localStorage.getItem('zjh_cid');
      if (!c) {
        c = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : ('zjh_' + Math.random().toString(36).slice(2) + Date.now().toString(36));
        localStorage.setItem('zjh_cid', c);
      }
      return c;
    } catch (_) {
      return 'zjh_' + Math.random().toString(36).slice(2);
    }
  };

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

    const newPlayer = { cid: getOrCreateCid(), lastSeen: Date.now(), name: playerName.trim(), cards: [], cardCount: 0, seatId: 0, isDealer: false, status: 'playing', bet: 0 };
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
    const parsedPlayers = sortPlayers(dedupePlayers(parsePlayers(data.players)));
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

    // 🔧 重进/加入时先把本地版本号对表到房间数据库的最新版本，
    // 否则发出的广播版本号过旧，会被其他玩家当成旧消息丢弃，导致人数/准备/牌堆不同步
    const dbVersion = (roomData as any).version || 0;
    versionRef.current = Math.max(versionRef.current, dbVersion);
    setVersion(versionRef.current);

    let currentPlayers = dedupePlayers(sortPlayers(parsePlayers(roomData.players)));
    if (currentPlayers.length >= 12) {
      setErrorMsg("房间已满(最多12人)");
      return;
    }

    const myCid = getOrCreateCid();
    // 玩家已存在（重连）：优先按编号认人，老房间无编号按名字兜底；认出后补编号、同步最新昵称
    // 🔧 重连/加入按名字认人（名字是权威身份），避免 cid 变化导致识别不出老条目而被当成"新玩家"重复追加
    const existingIdx = currentPlayers.findIndex((p: any) => p.name === playerName.trim());
    if (existingIdx >= 0) {
      currentPlayers = currentPlayers.map((p, i) => i === existingIdx ? { ...p, cid: myCid, name: playerName.trim(), lastSeen: Date.now() } : p);
    }

    // 修复8：恢复会话分支也要触发广播，保证人数同步
    if (existingIdx >= 0) {
      setRoomId(roomData.id);
      setJoined(true);
      setPlayers(sortPlayers(currentPlayers));
      playersRef.current = sortPlayers(currentPlayers);
      setPhase(roomData.phase || "waiting");
      setDealerId(roomData.dealerid || null);
      setGameOver(roomData.gameover || false);
      setCurrentPlayerIndex(roomData.currentplayerindex || 0);
      setSeed(roomData.seed || null);
      setReadyPlayers(roomData.readyplayers || []);
      setResult(roomData.result || "");
      setResultDetails(roomData.resultdetails || []);
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
      }, false, true);
      return;
    }

    const occupiedSeats = currentPlayers.map((p: any) => p.seatId).filter((id: number) => id !== undefined);
    let seatId = 0;
    for (let i = 0; i < 12; i++) {
      if (!occupiedSeats.includes(i)) { seatId = i; break; }
    }

    // 修复7/9：新玩家加入时，如果在对局中则自动成为观战者
    // 在 waiting 阶段则直接成为 playing
    const isGameActive = roomData.phase !== "waiting" && roomData.phase !== "settlement";
    const newPlayer = {
      cid: myCid,
      lastSeen: Date.now(),
      name: playerName.trim(),
      cards: [],
      cardCount: 0,
      seatId,
      isDealer: false,
      status: isGameActive ? 'watching' : 'playing',
      bet: 0,
    };
    const updatedPlayers = sortPlayers(dedupePlayers([...currentPlayers, newPlayer]));

    await supabase.from("rooms").update({
      players: updatedPlayers,
    }).eq("id", roomData.id);

    setRoomId(roomData.id);
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
    }, false, true);
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

    // 修复2：压酒阶段且已下注时弹窗阻止离开（兜底）
    if (phase === "betting" && myPlayer?.bet > 0) {
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
  const doLeaveRoom = async () => {
    if (!roomId) return;

    // 1. 判断离开的人是否是庄家
    const isDealerLeaving = playerName === dealerId || players.find(p => p.name === playerName)?.isDealer;

    // 2. 过滤掉离开的人（按编号或名字兜底，绝不靠改名逃掉）
    const myCid = getOrCreateCid();
    let updatedPlayers = players.filter(p => !((p.cid && p.cid === myCid) || (!p.cid && p.name === playerName)));

    // 3. 如果房间没人了，直接清理
    if (updatedPlayers.length === 0) {
      setJoined(false);
      setRoomId("");
      if (channelRef.current) supabase.removeChannel(channelRef.current);
      try { localStorage.removeItem('zjh_name'); localStorage.removeItem('zjh_pass'); localStorage.removeItem('zjh_room'); /* 保留 zjh_cid */ } catch (_) {}
      return;
    }

    // 4. 计算新的当前玩家索引
    let newIndex = currentPlayerIndex;
    const currentName = players[currentPlayerIndex]?.name;
    if (currentName === playerName) {
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
    let newReadyPlayers = readyPlayers.filter(p => p !== playerName);
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
        newReadyPlayers = [];
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
    await supabase.from("rooms").update({
      players: updatedPlayers,
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
      players: updatedPlayers,
      phase: newPhase,
      dealerId: newDealerId,
      // 🔥 原庄家退返标记随广播同步给所有玩家（庄家离开时=newPendingReturnDealer，否则为 null）
      pendingReturnDealer: newPendingReturnDealer,
      currentPlayerIndex: newIndex,
      gameOver: newGameOver,
      result: newResult,
      resultDetails: newResultDetails,
      readyPlayers: newReadyPlayers,
      // 非庄家离开→精确移除自己；庄家离开重置→清空全部准备
      ...(isDealerLeaving ? { clearReady: true } : { justUnready: playerName }),
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

    // 11. 清理离开的人自己的界面状态
    setJoined(false);
    setRoomId("");
    setPlayers([]);
    playersRef.current = [];
    setPhase("waiting");
    phaseRef.current = "waiting";
    setDealerId(null);
    setCurrentPlayerIndex(0);
    setGameOver(false);
    setResult("");
    setResultDetails([]);
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
      localStorage.removeItem('zjh_room'); /* 保留 zjh_cid */
    } catch (_) {}
  };

  const sitOutCurrentRound = async () => {
    setConfirmDialog({
      message: "确定退出本局吗？你将变为观战者，本局结束后可重新加入。",
      onConfirm: async () => {
        setConfirmDialog(null);
        const updatedPlayers = players.map(p => {
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

    // 准备逻辑（根因修复：写库前先读库当前准备名单，只改自己，杜绝用本地不全名单整体覆盖库导致互相冲掉）
    const isReady = readyPlayers.includes(playerName);
    // 读库失败时用本地名单兜底，绝不用空数组把库覆盖成只剩自己（否则复现"变回1/4"）
    let dbReady: string[] = readyPlayers;
    try {
      const { data: rd } = await supabase.from("rooms").select("readyplayers").eq("id", roomId).single();
      if (rd?.readyplayers) dbReady = rd.readyplayers;
    } catch (_) {}
    const newReady = isReady
      ? Array.from(new Set(dbReady.filter(p => p !== playerName)))
      : Array.from(new Set([...dbReady, playerName]));

    if (needStatusChange) {
      setPlayers(updatedPlayers);
      playersRef.current = updatedPlayers;
    }
    setReadyPlayers(newReady);

    await broadcastAndSyncDB({
      players: needStatusChange ? updatedPlayers : players,
      phase,
      dealerId,
      currentPlayerIndex,
      gameOver,
      result,
      resultDetails,
      readyPlayers: newReady,
      justUnready: isReady ? playerName : undefined, // 取消准备时精确移除自己
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
    }, true);

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
      // 以数据库玩家为主，补齐本地可能漏掉的人（如刚加入、广播迟到者）
      const merged: any[] = [...dbPlayers];
      players.forEach(lp => {
        if (!merged.find(p => p.name === lp.name)) merged.push(lp);
      });
      // 准备状态取本地与数据库的并集，避免任一方瞬时滞后误判"未准备"
      const mergedReady = Array.from(new Set([...dbReady, ...readyPlayers]));
      return { players: merged, ready: mergedReady };
    } catch (e) {
      return null;
    }
  };

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
      const keyOf = (p: any) => p.cid || p.name;
      const dbReady = data.readyplayers || [];
      setPlayers(prev => {
        const localKeys = new Set(prev.map(keyOf));
        // 🔧 根因修复：保留本地全部玩家，不再因"库里暂时缺人"就删人（避免 3→2 闪退）。
        // 库里多出的新加入者照常补齐；离开者已由 justUnready/leaveSync 广播精确移除，不会在此被复活。
        let next = [...prev];
        dbPlayers.forEach((dp: any) => {
          if (!localKeys.has(keyOf(dp))) next.push(dp); // 补齐库里多出的新加入者
        });
        return sortPlayers(dedupePlayers(next)); // 🔧 统一按座位号排序 + 按名字去重(防历史脏数据)
      });
      // 准备状态：准备阶段并集吸收(防冲掉)；游戏中以库为准(开局后库为[])
      setReadyPlayers(prevReady => {
        if (phaseRef.current !== "waiting") return dbReady;
        return Array.from(new Set([...prevReady, ...dbReady]));
      });
    } catch (e) {
      // 兜底失败不应影响游戏
    }
  };

  const startGame = async () => {
    if (phase !== "waiting") return;

    // 🔧 开局前先以数据库权威名单补齐可能迟到的新玩家，避免发牌漏人（首局无手牌却能压酒）
    const authoritative = await fetchAuthoritativeRoom();
    const workingPlayers = sortPlayers(dedupePlayers(authoritative ? authoritative.players : players));
    const workingReady = authoritative ? authoritative.ready : readyPlayers;

    const playingPlayers = workingPlayers.filter(p => p.status === 'playing');
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
    const resetPlayers = sortPlayers(workingPlayers.map(p => ({
      ...p,
      cards: [],
      cardCount: 0,
      isDealer: p.name === firstDealer,
      status: 'playing', // 修复1：新对局开始时把观战者也转为玩家并发牌
      bet: 0,
    })));
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
      clearReady: true,
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
    setRemainingCards(52 - offset);
    setPlayers(sortPlayers(newPlayers));
    playersRef.current = sortPlayers(newPlayers);

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
      broadcastAndSyncDB(bettingPayload);
    }, 600);

    if (newPlayers[firstIndex >= 0 ? firstIndex : 0]?.name === playerName) {
      startBettingTimeout();
    }
  };

  const startBettingTimeout = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    bettingTimeoutFiredRef.current = false;
    timeoutRef.current = setTimeout(() => {
      if (bettingTimeoutFiredRef.current) return;
      bettingTimeoutFiredRef.current = true;
      const cp = playersRef.current[currentPlayerIndex];
      if (phaseRef.current === "betting" && cp?.name === playerName && !bettingCompleteRef.current) {
        console.log('\u23F0 压酒超时,自动压半杯');
        handleBet(0.5);
      }
    }, 30000);
  };

  const handleBet = async (amount: number) => {
    console.log('🔥 handleBet 被调用, amount:', amount, 'phase:', phase, 'currentPlayer:', currentPlayer?.name, 'playerName:', playerName, 'bettingComplete:', bettingComplete);

    if (phase !== "betting") {
      setErrorMsg("当前不是压酒阶段");
      return;
    }
    if (currentPlayer?.name !== playerName) {
      const myIndex = players.findIndex(p => p.name === playerName && p.status === 'playing' && p.name !== dealerId);
      if (myIndex >= 0 && players[myIndex]?.name === playerName) {
        console.log('🔧 自动修复 currentPlayerIndex 从', currentPlayerIndex, '改为', myIndex);
        setCurrentPlayerIndex(myIndex);
        setTimeout(() => handleBet(amount), 50);
        return;
      }
      setErrorMsg(`当前不是你的回合(${currentPlayer?.name} 的回合)`);
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

    const updatedPlayers = players.map(p => {
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
      result: `💰 ${currentPlayer?.name} 压了 ${formatBet(amount)}`,
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
    if (!target) { console.log('❌ revealPlayer: 找不到目标玩家'); return; }
    if (target.isDealer) { console.log('❌ revealPlayer: 不能开庄家'); return; }
    if (target.status !== 'playing') { console.log('❌ revealPlayer: 目标不是playing状态'); return; }

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
      resultDetails,
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
    setResultDetails(prev => [...prev, newDetail]);
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
      resultDetails: [...resultDetails, newDetail],
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
    setResultDetails(prev => [...prev, ...newDetails]);

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
      result: result,
      resultDetails: [...resultDetails, ...newDetails],
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
    if (pendingReturnDealer) {
      const retDealer = playersRef.current.find(p => p.name === pendingReturnDealer);
      if (retDealer) {
        effectiveDealerId = pendingReturnDealer;
        setPendingReturnDealer(null);
      }
    }

    const deck = localDeckRef.current;
    let offset = deckOffset;
    const totalNeeded = revealTargets.length + 1;

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
        pendingReturnDealer: null,
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
    let updatedPlayers = playersRef.current.map(p => {
      // 🔥 同步 isDealer 标记（若发生退返，effectiveDealerId 已是原庄家）
      const isDealer = p.name === effectiveDealerId;
      if (p.status === 'playing') {
        return { ...p, isDealer, bet: 0 };
      }
      return { ...p, isDealer };
    });

    for (const name of revealTargets) {
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
    setGlobalDealerHand([]);
    setGlobalDealerHandName('');

    const playingPlayers = updatedPlayers.filter(p => p.status === 'playing' && !p.isDealer);
    const firstIdx = updatedPlayers.findIndex(p => p.name === playingPlayers[0]?.name);
    setCurrentPlayerIndex(firstIdx >= 0 ? firstIdx : 0);
    setPhase("betting");
    phaseRef.current = "betting";
    setMyBet(0);
    setBettingComplete(false);
    bettingCompleteRef.current = false;

    setResult(`🔄 新一轮压酒开始！`);

    const bettingPayload = {
      players: updatedPlayers,
      phase: "betting",
      dealerId: effectiveDealerId,
      // 🔥 归还已完成，清掉标记广播出去
      pendingReturnDealer: null,
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
  };

  const generateSummary = () => {
    const details = resultDetails;
    let summary = "";
    let dealerTotal = 0;

    for (const d of details) {
      if (d.who === 'dealer') {
        summary += `${d.player} 庄家赢,${d.player} 喝 ${formatBet(d.bet)}\n`;
        dealerTotal += d.bet;
      } else if (d.who === 'none') {
        summary += `${d.player} 平局,不喝\n`;
      } else {
        summary += `${d.player} 庄家输,庄家喝 ${formatBet(d.bet)}\n`;
      }
    }

    if (dealerTotal > 0) {
      summary += `\n→ 庄家共喝 ${formatBet(dealerTotal)}`;
    }

    return summary || "游戏结束";
  };

  const changeCommunityCard = async () => {
    if (phase !== "betting") {
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
    if (phase !== "betting") {
      setErrorMsg("当前阶段不能换公牌");
      return;
    }
    if (deckOffset >= 52) {
      setErrorMsg("牌堆已用完,无法换公牌");
      return;
    }

    const deck = localDeck;
    const newCommunity = deck[deckOffset];
    const newOffset = deckOffset + 1;
    setDeckOffset(newOffset);
    setRemainingCards(52 - newOffset);
    setCommunityCard(newCommunity);
    setLocalDeck(deck);

    const updatedPlayers = players.map(p => {
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
    if (wheelSpinning) return;
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
    const rand = new SeededRandom(seed || Date.now());
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
      // 广播最终状态
      await broadcastAndSyncDB({
        players,
        phase: "wheel",
        dealerId,
        currentPlayerIndex,
        gameOver: true,
        result: `👑 ${winner} 成为新庄家!`,
        resultDetails,
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
    if (remainingCardsCount < cardsForNewRound) {
      // 真的发不完了，才重洗一副新牌
      useSeed = Math.floor(Math.random() * 1000000);
      useOffset = 0;
    }
    setSeed(useSeed);
    const deck = createDeckWithSeed(useSeed);
    setLocalDeck(deck);
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
      clearReady: true,
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
    setPhase("waiting");
    phaseRef.current = "waiting";
    setDealerId(null);
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
      phase: "waiting",
      dealerId: null,
      currentPlayerIndex: 0,
      gameOver: false,
      result: "",
      resultDetails: [],
      readyPlayers: [],
      clearReady: true,
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
      <div style={{ position:'relative', minHeight:'100dvh', width:'100%', background:'#060606', overflow:'hidden', fontFamily:"'Courier New',Courier,monospace", color:'#e8e8e8', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', boxSizing:'border-box', padding:'24px' }}>
        <style>{`
          @keyframes zjhDrift { 0%{top:28%} 100%{top:56%} }
          @keyframes zjhFlick { 0%,100%{opacity:1} 92%{opacity:1} 94%{opacity:0.35} 96%{opacity:1} }
          @keyframes zjhBlink { 0%,49%{opacity:1} 50%,100%{opacity:0} }
          @keyframes zjhFlow { 0%{background-position:0% 50%} 100%{background-position:300% 50%} }
          .zjh-scan{position:absolute;inset:0;background:repeating-linear-gradient(to bottom,rgba(255,255,255,0.04) 0 1px,transparent 1px 3px);pointer-events:none;}
          .zjh-noise{position:absolute;inset:0;opacity:0.05;background-image:radial-gradient(#fff 0.5px,transparent 0.5px);background-size:4px 4px;pointer-events:none;}
          .zjh-title{font-size:66px;font-weight:900;letter-spacing:8px;color:#fff;text-shadow:-3px 0 #ff2b2b,3px 0 #00e5ff;animation:zjhFlick 4s infinite;margin:0;}
          .zjh-flow{font-size:24px;font-weight:700;letter-spacing:5px;background:linear-gradient(90deg,#ff3b6b,#ffd24d,#00e5ff,#ff3b6b);background-size:300% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;animation:zjhFlow 4s linear infinite;margin-top:14px;}
          .zjh-term{border:1px solid #555;background:rgba(0,0,0,0.55);padding:18px 20px;width:100%;max-width:420px;box-sizing:border-box;position:relative;z-index:1;}
          .zjh-row{display:flex;align-items:center;gap:10px;margin:10px 0;font-size:22px;color:#d2d2d2;}
          .zjh-prompt{color:#888;font-weight:bold;}
          .zjh-input{flex:1;background:transparent;border:none;border-bottom:1px solid #444;color:#e8e8e8;font-family:inherit;font-size:22px;padding:4px 2px;outline:none;}
          .zjh-input:focus{border-bottom-color:#ff3b3b;box-shadow:0 2px 8px -2px rgba(255,59,59,0.6);}
          .zjh-input::placeholder{color:#666;}
          .zjh-cursor{display:inline-block;width:11px;height:22px;background:#e8e8e8;vertical-align:-3px;animation:zjhBlink 1s step-end infinite;}
          .zjh-btn{border:2px solid #ff3b3b;color:#ff5b5b;font-size:26px;font-weight:700;padding:14px 28px;background:rgba(255,43,43,0.08);letter-spacing:4px;cursor:pointer;font-family:inherit;margin-top:28px;}
          .zjh-btn:active{background:rgba(255,43,43,0.22);}
          .zjh-sub{font-size:16px;color:#7fd9e8;letter-spacing:1px;margin-top:18px;cursor:pointer;background:none;border:none;font-family:inherit;}
          .zjh-band{position:absolute;left:0;right:0;height:70px;background:linear-gradient(to bottom,transparent,rgba(255,255,255,0.10),transparent);animation:zjhDrift 6s infinite alternate;pointer-events:none;}
        `}</style>
        <div className="zjh-scan"></div>
        <div className="zjh-noise"></div>
        <div className="zjh-band"></div>
        <h1 className="zjh-title">炸金花</h1>
        <div className="zjh-flow">第三张,想象为王</div>
        <div className="zjh-term">
          <div className="zjh-row">
            <span className="zjh-prompt">&gt;</span>
            <input className="zjh-input" placeholder="代号" value={playerName} onChange={(e) => setPlayerName(e.target.value)} />
            <span className="zjh-cursor"></span>
          </div>
          <div className="zjh-row">
            <span className="zjh-prompt">&gt;</span>
            <input className="zjh-input" placeholder="暗号" value={roomPassword} onChange={(e) => setRoomPassword(e.target.value)} />
          </div>
        </div>
        <button className="zjh-btn" onClick={joinRoom}>▶ 我要验牌</button>
        <button className="zjh-sub" onClick={createRoom}>没有房间？点这里开桌</button>
        {errorMsg && <div style={{ color:"#f87171", marginTop:16, fontSize:14 }}>{errorMsg}</div>}
        {disconnected && <div style={{ color:"#f87171", marginTop:8, fontSize:14 }}>⚠️ 网络连接断开,请检查网络</div>}
      </div>
    );
  }

  const isMyBetTurn = phase === "betting" && currentPlayer?.name === playerName && !gameOver && !isDealer;
  const myPlayer = getMyPlayer();
  const canChangeCommunity = phase === "betting" && deckOffset < 52 && deckOffset > 0;

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
              {phase === "betting" && isDealer && currentPlayer?.name === playerName && `⏳ 等待其他玩家压酒`}
              {phase === "betting" && isDealer && currentPlayer?.name !== playerName && `💰 ${currentPlayer?.name} 压酒中 (庄家不用压)`}
              {phase === "betting" && !isDealer && currentPlayer?.name === playerName && `💰 你的回合 — 选择压酒`}
              {phase === "betting" && !isDealer && currentPlayer?.name !== playerName && `💰 ${currentPlayer?.name} 压酒中...`}
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
              <span>👥 {players.filter(p => p.status === 'playing' || p.status === 'watching').length}/{12}</span>
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

        <div key={`status-${phase}`} style={{ ...styles.statusBar, animation: 'fadeIn 0.3s ease' }}>
          {!gameOver && phase !== "settlement" && (
            <span style={styles.statusText}>
              {phase === "waiting" && `⏳ 等待开始 ${players.length >= 2 ? `(${readyPlayers.length}/${players.filter(p => p.status !== 'watching').length} 已准备)` : '(至少2人)'}`}
              {phase === "dealing" && "🃏 发牌中..."}
              {phase === "betting" && isDealer && currentPlayer?.name === playerName && `⏳ 等待其他玩家压酒`}
              {phase === "betting" && isDealer && currentPlayer?.name !== playerName && `⏳ ${currentPlayer?.name} 压酒中`}
              {phase === "betting" && !isDealer && currentPlayer?.name === playerName && `⏳ 下注下注`}
              {phase === "betting" && !isDealer && currentPlayer?.name !== playerName && `⏳ ${currentPlayer?.name} 压酒中...`}
              {phase === "wheel" && "🎡 抽庄中..."}
            </span>
          )}
          {gameOver && phase !== "wheel" && phase !== "settlement" && <span style={styles.resultText}>{result || '游戏结束'}</span>}
          {phase === "settlement" && <span style={styles.resultText}>{result || '结算完成'}</span>}
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

          {phase === "betting" && isMyBetTurn && (
            <>
              <button onClick={() => handleBet(0.5)} style={{ ...styles.btnBid, borderColor: '#dc2626', color: '#dc2626' }}>🍺 半杯</button>
              <button onClick={() => handleBet(1)} style={{ ...styles.btnBid, borderColor: '#f59e0b', color: '#f59e0b' }}>🍺 1杯</button>
              <button onClick={() => handleBet(2)} style={{ ...styles.btnBid, borderColor: '#fbbf24', color: '#fbbf24' }}>🍺 2杯</button>
            </>
          )}
          {phase === "betting" && !isMyBetTurn && !isDealer && !gameOver && (
            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '13px' }}>
              ⏳ 等待 {currentPlayer?.name} 压酒...
            </span>
          )}
          {phase === "betting" && isDealer && !gameOver && (
            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '13px' }}>
              👑 庄家等待玩家压酒...
            </span>
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

        {resultDetails.length > 0 && (phase === "settlement" || (phase === "reveal" && isDealer)) && (
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
                📊 本局结算
              </div>
            )}
            {resultDetails.map((d, idx) => {
              const isDealerWin = d.result === '庄家赢';
              const isDealerLose = d.result === '庄家输';
              const isDraw = d.result === '平局';
              return (
                <div key={idx} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: phase === "settlement" ? '8px 12px' : '4px 8px',
                  marginBottom: phase === "settlement" ? '6px' : '2px',
                  borderRadius: '10px',
                  background: phase === "settlement"
                    ? (isDealerWin ? 'rgba(34,211,238,0.08)' : isDealerLose ? 'rgba(248,113,113,0.08)' : 'rgba(136,136,136,0.06)')
                    : 'transparent',
                  border: phase === "settlement"
                    ? (isDealerWin ? '1px solid rgba(34,211,238,0.15)' : isDealerLose ? '1px solid rgba(248,113,113,0.15)' : '1px solid rgba(255,255,255,0.04)')
                    : 'none',
                }}>
                  <span style={{
                    fontSize: phase === "settlement" ? '14px' : '11px',
                    fontWeight: phase === "settlement" ? 600 : 400,
                    color: '#ddd',
                    minWidth: '40px',
                  }}>{d.player}</span>

                  <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                    <span style={{
                      fontSize: phase === "settlement" ? '11px' : '9px',
                      padding: phase === "settlement" ? '2px 6px' : '1px 4px',
                      borderRadius: '6px',
                      background: 'rgba(251,191,36,0.15)',
                      color: '#fbbf24',
                    }}>庄:{d.dealerHandName}</span>
                    <span style={{ fontSize: phase === "settlement" ? '10px' : '8px', color: 'rgba(255,255,255,0.3)' }}>vs</span>
                    <span style={{
                      fontSize: phase === "settlement" ? '11px' : '9px',
                      padding: phase === "settlement" ? '2px 6px' : '1px 4px',
                      borderRadius: '6px',
                      background: 'rgba(255,255,255,0.08)',
                      color: '#aaa',
                    }}>{d.targetHandName}</span>
                  </div>

                  <span style={{
                    fontSize: phase === "settlement" ? '13px' : '10px',
                    fontWeight: phase === "settlement" ? 700 : 400,
                    padding: phase === "settlement" ? '3px 10px' : '1px 6px',
                    borderRadius: '8px',
                    background: isDealerWin ? 'rgba(34,211,238,0.2)' : isDealerLose ? 'rgba(248,113,113,0.2)' : 'rgba(136,136,136,0.15)',
                    color: isDealerWin ? '#22d3ee' : isDealerLose ? '#f87171' : '#888',
                    textShadow: isDealerWin ? '0 0 8px rgba(34,211,238,0.3)' : isDealerLose ? '0 0 8px rgba(248,113,113,0.3)' : 'none',
                  }}>
                    {isDealerWin ? '🏆赢' : isDealerLose ? '😅输' : '🤝平'}
                  </span>

                  {d.penalty > 0 ? (
                    <span style={{
                      fontSize: phase === "settlement" ? '13px' : '10px',
                      fontWeight: phase === "settlement" ? 700 : 400,
                      color: '#fbbf24',
                      padding: phase === "settlement" ? '3px 8px' : '0',
                      borderRadius: '6px',
                      background: phase === "settlement" ? 'rgba(251,191,36,0.12)' : 'transparent',
                    }}>
                      🍺 {d.who === 'dealer' ? `庄家喝 ${formatBet(d.penalty)}` :
                           d.who === 'none' ? '不喝' :
                           `${d.player} 喝 ${formatBet(d.penalty)}`}
                    </span>
                  ) : (
                    <span style={{ fontSize: '10px', color: '#888' }}>不喝</span>
                  )}
                </div>
              );
            })}

            {phase === "settlement" && (() => {
              const drinkMap: Record<string, number> = {};
              for (const d of resultDetails) {
                if (d.who === 'dealer') {
                  drinkMap[d.player] = (drinkMap[d.player] || 0) + (d.bet || 0.5);
                } else if (d.who !== 'none') {
                  drinkMap['庄家'] = (drinkMap['庄家'] || 0) + (d.bet || 0.5);
                }
              }
              for (const p of players) {
                if (p.drinkCount && p.drinkCount > 0) {
                  drinkMap[p.name] = (drinkMap[p.name] || 0) + p.drinkCount;
                }
              }
              const entries = Object.entries(drinkMap).filter(([_, v]) => v > 0);
              if (entries.length === 0) return null;
              return (
                <div style={{
                  marginTop: '12px',
                  padding: '10px',
                  background: 'rgba(220,38,38,0.06)',
                  borderRadius: '10px',
                  border: '1px solid rgba(220,38,38,0.15)',
                }}>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: '#f87171', marginBottom: '6px' }}>
                    🍻 喝酒总计
                  </div>
                  {entries.map(([name, total], idx) => (
                    <div key={idx} style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '4px 0',
                      borderBottom: idx < entries.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                    }}>
                      <span style={{ fontSize: '13px', color: '#ddd', fontWeight: 500 }}>{name}</span>
                      <span style={{ fontSize: '14px', fontWeight: 700, color: '#fbbf24' }}>
                        🍺 {formatBet(total)}
                      </span>
                    </div>
                  ))}
                </div>
              );
            })()}
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