"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";

// ==================== 扑克牌工具 ====================
const SUITS = ["♠", "♥", "♣", "♦"];
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

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

// ==================== 炸金花牌型计算 ====================
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
  // 公牌炸金花中不可能出现单张，最低也是对子。
  // 但如果有人传入3张完全无关的牌，仍返回对子等级以确保游戏逻辑安全。
  return { rank: 2, score: values };
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

// 🔥 修复:优先取后形成更大顺子,且最后默认返回对子而不是单张A高
const getBestThreeCards = (communityCard: any, handCard: any): any[] => {
  if (!communityCard || !handCard) return [];

  const allRanks = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
  const allSuits = ["♠", "♥", "♣", "♦"];

  // 1. 公牌和手牌同点数 → 豹子
  if (communityCard.rank === handCard.rank) {
    return [communityCard, handCard, { suit: communityCard.suit, rank: communityCard.rank, isImaginary: true }];
  }

  const v1 = getRankValue(communityCard.rank);
  const v2 = getRankValue(handCard.rank);
  const diff = Math.abs(v1 - v2);

  // 2. 同花色 → 优先同花顺
  if (communityCard.suit === handCard.suit) {
    if (diff <= 2 || (v1 === 0 && v2 === 12) || (v1 === 12 && v2 === 0)) {
      let thirdRank = "";
      const sorted = [v1, v2].sort((a, b) => a - b);

      if (sorted[1] - sorted[0] === 1) {
        // 相邻:优先取后(更大的牌)
        if (sorted[1] < 12) {
          thirdRank = allRanks[sorted[1] + 1];
        } else {
          thirdRank = allRanks[sorted[0] - 1];
        }
      } else if (sorted[1] - sorted[0] === 2) {
        thirdRank = allRanks[sorted[0] + 1];
      }       else if (v1 === 0 && v2 === 12) thirdRank = "3";
      else if (v1 === 12 && v2 === 0) thirdRank = "3";
      else thirdRank = "A";

      if (thirdRank === communityCard.rank || thirdRank === handCard.rank) {
        const available = allRanks.filter(r => r !== communityCard.rank && r !== handCard.rank);
        thirdRank = available[available.length - 1] || "A";
      }
      return [communityCard, handCard, { suit: communityCard.suit, rank: thirdRank, isImaginary: true }];
    }
    // 同花色但凑不成顺子 → 金花
    const available = allRanks.filter(r => r !== communityCard.rank && r !== handCard.rank);
    return [communityCard, handCard, { suit: communityCard.suit, rank: available[available.length - 1] || "A", isImaginary: true }];
  }

  // 3. 不同花色 → 尝试顺子
  if (diff <= 2 || (v1 === 0 && v2 === 12) || (v1 === 12 && v2 === 0)) {
    let thirdRank = "";
    const sorted = [v1, v2].sort((a, b) => a - b);

    if (sorted[1] - sorted[0] === 1) {
      if (sorted[1] < 12) {
        thirdRank = allRanks[sorted[1] + 1];
      } else {
        thirdRank = allRanks[sorted[0] - 1];
      }
    } else if (sorted[1] - sorted[0] === 2) {
      thirdRank = allRanks[sorted[0] + 1];
    } else if (v1 === 0 && v2 === 12) thirdRank = "3";
    else if (v1 === 12 && v2 === 0) thirdRank = "3";
    else thirdRank = "A";

    if (thirdRank === communityCard.rank || thirdRank === handCard.rank) {
      const available = allRanks.filter(r => r !== communityCard.rank && r !== handCard.rank);
      thirdRank = available[available.length - 1] || "A";
    }
    return [communityCard, handCard, { suit: communityCard.suit, rank: thirdRank, isImaginary: true }];
  }

  // 4. 默认:优先组成对子(取公牌或手牌中较大的点数)
  // 对子牌型等级为2,高于单张(1),所以这里不再返回单张A高
  const bestPairRank = getRankValue(communityCard.rank) > getRankValue(handCard.rank) ? communityCard.rank : handCard.rank;
  const pairSuit = allSuits.find(s => s !== communityCard.suit && s !== handCard.suit) || allSuits[0];
  return [communityCard, handCard, { suit: pairSuit, rank: bestPairRank, isImaginary: true }];
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
    try {
      const matches = raw.match(/"name":"([^"]+)"/g);
      if (matches) {
        return matches.map((m: string) => {
          const name = m.match(/"name":"([^"]+)"/)?.[1] || '未知';
          return { name, cards: [], cardCount: 0, seatId: 0, isDealer: false, status: 'playing', bet: 0 };
        });
      }
    } catch {}
  }
  return [];
};

const getHandName = (cards: any[]): string => {
  if (!cards || cards.length !== 3) return '无牌';
  const r = getHandRank(cards);
  const names = ['', '对子(最低)', '对子', '顺子', '金花', '同花顺', '豹子'];
  return names[r.rank] || '未知';
};

// ==================== 🃏 扑克牌组件(方案B+C:中间超大花色 + 颜色增强) ====================
const PokerCard = ({ card, hidden, size = 'medium', small }: { card?: any; hidden?: boolean; size?: 'small' | 'medium' | 'large'; small?: boolean }) => {
  const actualSize = small ? 'small' : size;
  const sizeMap = {
    small: { width: 22, height: 32, fontSize: 9, symbolSize: 14, padding: 2 },
    medium: { width: 28, height: 40, fontSize: 11, symbolSize: 18, padding: 3 },
    large: { width: 36, height: 50, fontSize: 14, symbolSize: 24, padding: 4 },
  };
  const s = sizeMap[actualSize] || sizeMap.medium;

  if (hidden) {
    return (
      <div style={{
        width: s.width,
        height: s.height,
        borderRadius: 4,
        background: 'linear-gradient(135deg, #1a237e 0%, #0d1442 100%)',
        border: '1.5px solid rgba(255,255,255,0.15)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        overflow: 'hidden',
        flexShrink: 0,
      }}>
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(255,255,255,0.05) 4px, rgba(255,255,255,0.05) 8px)',
        }} />
        <span style={{ fontSize: s.symbolSize, opacity: 0.3, color: '#fff' }}>🃏</span>
      </div>
    );
  }

  if (!card) return null;
  const isRed = card.suit === '♥' || card.suit === '♦';
  const color = isRed ? '#ff1744' : '#1a1a1a';
  const rankDisplay = card.rank === '10' ? '10' : card.rank;
  const isImaginary = card.isImaginary;

  if (actualSize === 'small') {
    return (
      <div style={{
        width: s.width,
        height: s.height,
        borderRadius: 3,
        background: isImaginary ? 'rgba(255,215,0,0.15)' : '#ffffff',
        border: isImaginary ? '1.5px dashed #ffd700' : '1px solid rgba(0,0,0,0.1)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        position: 'relative',
      }}>
        {isImaginary && (
          <span style={{ position: 'absolute', top: -2, right: -2, fontSize: 7, color: '#ffd700' }}>★</span>
        )}
        <span style={{ fontSize: s.fontSize, fontWeight: 700, color }}>
          {rankDisplay}{card.suit}
        </span>
      </div>
    );
  }

  return (
    <div style={{
      width: s.width,
      height: s.height,
      borderRadius: 4,
      background: isImaginary ? 'rgba(255,215,0,0.08)' : '#ffffff',
      border: isImaginary ? '2px dashed #ffd700' : '1.5px solid rgba(0,0,0,0.12)',
      boxShadow: '0 2px 8px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.8)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
      flexShrink: 0,
      fontFamily: '"Segoe UI", "Helvetica Neue", "Apple Color Emoji", system-ui, sans-serif',
    }}>
      {isImaginary && (
        <div style={{
          position: 'absolute',
          top: -4,
          right: -4,
          fontSize: 10,
          color: '#ffd700',
          fontWeight: 'bold',
          textShadow: '0 0 4px rgba(255,215,0,0.4)',
        }}>★</div>
      )}
      <div style={{
        position: 'absolute',
        top: s.padding,
        left: s.padding,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        lineHeight: 1,
        fontSize: s.fontSize * 0.85,
        fontWeight: 700,
        color: color,
      }}>
        <span>{rankDisplay}</span>
        <span style={{ fontSize: s.fontSize * 0.65 }}>{card.suit}</span>
      </div>
      <span style={{
        fontSize: s.symbolSize * 1.4,
        color: color,
        opacity: 0.9,
        textShadow: '0 1px 3px rgba(0,0,0,0.05)',
        marginTop: actualSize === 'large' ? 4 : 0,
        lineHeight: 1,
      }}>
        {card.suit}
      </span>
      <div style={{
        position: 'absolute',
        bottom: s.padding,
        right: s.padding,
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
        <span style={{ fontSize: s.fontSize * 0.65 }}>{rankDisplay}</span>
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
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0);
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
  const [bettingRound, setBettingRound] = useState(0);
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

  // ==================== 新增 state/ref ====================
  const [confirmDialog, setConfirmDialog] = useState<{
    message: string;
    onConfirm: () => void;
  } | null>(null);
  const isSettlingRef = useRef(false);
  const bettingTimeoutFiredRef = useRef(false);
  const [sitOutRequested, setSitOutRequested] = useState(false);

  useEffect(() => {
    playersRef.current = players;
  }, [players]);

  useEffect(() => {
    localDeckRef.current = localDeck;
  }, [localDeck]);

  // ==================== 刷新/关闭浏览器提示 ====================
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

  // ==================== 广播同步 ====================
  const broadcastAndSyncDB = async (state: any) => {
    const newVersion = versionRef.current + 1;
    versionRef.current = newVersion;
    setVersion(newVersion);
    try {
      // 使用已订阅的 channel 而非每次创建新 channel
      const channel = channelRef.current || supabase.channel(`zhajinhua:${roomId}`, { config: { broadcast: { ack: true } } });
      await channel.send({
        type: 'broadcast',
        event: 'gameState',
        payload: {
          ...state,
          version: newVersion,
          bettingComplete: state.bettingComplete !== undefined ? state.bettingComplete : false,
          bettingRound: state.bettingRound || 0,
          revealTargets: state.revealTargets || [],
        },
      });
      console.log('📤 广播成功');
    } catch (error) {
      // 广播失败 = 真正的连接问题
      console.error('❌ 广播失败:', error);
      setDisconnected(true);
      setErrorMsg('⚠️ 连接断开,请检查网络后重试');
      return;
    }

    try {
      await supabase.from("rooms").update({
        players: state.players,
        phase: state.phase,
        dealerid: state.dealerId,
        gameover: state.gameOver,
        currentplayerindex: state.currentPlayerIndex || 0,
        result: state.result || "",
        resultdetails: state.resultDetails || [],
        readyplayers: state.readyPlayers || [],
        settlementstep: state.settlementStep || 0,
        seed: state.seed,
        deckoffset: state.deckOffset || 0,
        wheelvisible: state.wheelVisible || false,
        wheelselected: state.wheelSelected || null,
        wheelsegments: state.wheelSegments || [],
        communitycard: state.communityCard || null,
        bettingcomplete: state.bettingComplete !== undefined ? state.bettingComplete : false,
        bettinground: state.bettingRound || 0,
        revealtargets: state.revealTargets || [],
        version: newVersion,
      }).eq("id", roomId).gte("version", newVersion - 1);
      console.log('💾 数据库同步成功');
      setDisconnected(false);
    } catch (error) {
      // 广播已成功(实时同步不受影响),仅数据库持久化失败,不误报断线
      console.error('⚠️ 数据库同步失败(不影响游戏实时同步):', error);
    }
  };

  const getMyPlayer = () => players.find(p => p.name === playerName);
  // 只算 playing 状态的玩家（观战者不参与准备/开始检查）
  const activePlayers = players.filter(p => p.status === 'playing');
  const allReady = activePlayers.length >= 2 && activePlayers.every(p => readyPlayers.includes(p.name));
  const currentPlayer = players[currentPlayerIndex] || null;

  // ==================== Supabase 订阅 ====================
  useEffect(() => {
    if (!roomId) return;
    console.log('🔄 订阅房间:', roomId);
    const channel = supabase
      .channel(`zhajinhua:${roomId}`, { config: { broadcast: { ack: true } } })
      .on('broadcast', { event: 'gameState' }, (payload) => {
        const state = payload.payload;
        // 忽略旧版本的广播，防止过时消息覆盖最新状态
        if (state.version && state.version <= versionRef.current) {
          console.log('⏭️ 忽略旧版本广播:', state.version, '当前:', versionRef.current);
          return;
        }
        if (state.version) {
          versionRef.current = state.version;
          setVersion(state.version);
        }
        const parsedPlayers = parsePlayers(state.players);

        // 结算保护锁：结算/开牌期间不覆盖玩家数据
        setPlayers(prev => {
          if (isSettlingRef.current && state.phase !== "settlement" && state.phase !== "wheel") return prev;
          const localMe = prev.find(p => p.name === playerName);
          const remoteMe = parsedPlayers.find(p => p.name === playerName);
          if (localMe && remoteMe) {
            const isDealing = state.phase === "dealing";
            if (isDealing) return parsedPlayers;
            const hasLocalCards = localMe.cards && localMe.cards.length > 0;
            // 新一轮压酒开始时（phase=betting + 远端bet=0），强制重置本地bet为0，
            // 避免上一轮旧bet被 || 运算保住导致第二局压酒按钮无反应
            const isNewBettingRound = state.phase === "betting" && remoteMe.bet === 0;
            return parsedPlayers.map(p => {
              if (p.name === playerName) {
                return {
                  ...p,
                  cards: hasLocalCards ? localMe.cards : (p.cards || []),
                  cardCount: hasLocalCards ? localMe.cardCount : (p.cardCount || 0),
                  bet: isNewBettingRound ? 0 : (hasLocalCards ? (localMe.bet || 0) : (p.bet || 0)),
                  status: isNewBettingRound ? 'playing' : (hasLocalCards ? (localMe.status || 'playing') : (p.status || 'playing')),
                };
              }
              const prevPlayer = prev.find(pp => pp.name === p.name);
              const isNewPlayer = !prevPlayer;
              return {
                ...p,
                cards: p.cards || [],
                cardCount: p.cards?.length || p.cardCount || 0,
                bet: p.bet || 0,
                status: p.status || 'playing',
              };
            });
          }
          return parsedPlayers;
        });

        // 广播阶段保护：不允许过时阶段覆盖当前关键阶段
        setPhase(prevPhase => {
          const newPhase = state.phase || "waiting";
          // 允许的阶段升级路径
          const forwardPhases = ["dealing", "betting", "reveal", "settlement", "wheel"];
          const currentIdx = forwardPhases.indexOf(prevPhase);
          const newIdx = forwardPhases.indexOf(newPhase);
          // 允许：回到 waiting（新一局开始）、回到 dealing（发牌）、向前推进
          if (newPhase === "waiting" || newPhase === "dealing" || newIdx >= currentIdx) {
            return newPhase;
          }
          // 其他情况：不允许回退（比如从 reveal 回到 betting）
          return prevPhase;
        });
        phaseRef.current = state.phase || "waiting";
        setGameOver(state.gameOver || false);
        setDealerId(state.dealerId || null);
        setCurrentPlayerIndex(state.currentPlayerIndex || 0);
        setResult(state.result || "");
        setResultDetails(state.resultDetails || []);
        setReadyPlayers(state.readyPlayers || []);
        setSeed(state.seed || null);
        setDeckOffset(state.deckOffset || 0);
        setWheelVisible(state.wheelVisible || false);
        setWheelSelected(state.wheelSelected || null);
        setWheelSegments(state.wheelSegments || []);
        setCommunityCard(state.communityCard || null);

        if (state.compareData) {
          setCompareData(state.compareData);
          if (state.compareData.showResult) {
            setPendingReveal({
              targetName: state.compareData.playerName,
              targetBet: state.compareData.penalty || 0.5,
            });
          } else {
            setPendingReveal(null);
          }
        } else {
          setCompareData(null);
          setPendingReveal(null);
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
        if (state.bettingRound !== undefined) setBettingRound(state.bettingRound);
        if (state.revealTargets !== undefined) setRevealTargets(state.revealTargets);
        if (state.phase === "betting") setMyBet(0);

        // 庄家收到 reveal 阶段广播时，启动开牌超时（60秒自动开全部）
        if (state.phase === "reveal" && me?.isDealer && !gameOver) {
          startRevealTimeout();
        }

        if (me) {
          setIsDealer(me.isDealer || false);
          if (me.cards && me.cards.length > 0) {
            setMyCards(me.cards);
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

  // ==================== 创建/加入/离开 ====================
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
    const parsedPlayers = parsePlayers(data.players);
    setPlayers(parsedPlayers);
    playersRef.current = parsedPlayers;
    setJoined(true);
    setReadyPlayers([playerName.trim()]);
    // 存入 localStorage 以便刷新恢复
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

    const currentPlayers = parsePlayers(roomData.players);
    if (currentPlayers.length >= 12) {
      setErrorMsg("房间已满(最多12人)");
      return;
    }
    if (currentPlayers.some((p: any) => p.name === playerName.trim())) {
      setRoomId(roomData.id);
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
      setDeckOffset(roomData.deckoffset || 0);
      setWheelVisible(roomData.wheelvisible || false);
      setWheelSelected(roomData.wheelselected || null);
      setWheelSegments(roomData.wheelsegments || []);
      setCommunityCard(roomData.communitycard || null);
      setRemainingCards(52 - (roomData.deckoffset || 0));
      if (roomData.result) setResult(roomData.result);

      // 从数据库恢复手牌、牌堆、庄家身份
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
        if (meRestore.drinkCount) {
          // drinkCount 已恢复到 players 数组里
        }
      }

      // 如果正在压酒阶段且轮到我，重启超时定时器
      if (roomData.phase === "betting") {
        const cp = currentPlayers[roomData.currentplayerindex || 0];
        if (cp && cp.name === playerName.trim() && !cp.bet) {
          startBettingTimeout();
        }
      }

      // 存入 localStorage 以便刷新恢复
      try {
        localStorage.setItem('zjh_name', playerName.trim());
        localStorage.setItem('zjh_pass', roomPassword.trim());
        localStorage.setItem('zjh_room', roomData.id);
      } catch (_) {}

      return;
    }

    const occupiedSeats = currentPlayers.map((p: any) => p.seatId).filter((id: number) => id !== undefined);
    let seatId = 0;
    for (let i = 0; i < 12; i++) {
      if (!occupiedSeats.includes(i)) { seatId = i; break; }
    }

    const newPlayer = {
      name: playerName.trim(),
      cards: [],
      cardCount: 0,
      seatId,
      isDealer: false,
      status: 'playing',
      bet: 0,
    };
    const updatedPlayers = [...currentPlayers, newPlayer];

    await supabase.from("rooms").update({
      players: updatedPlayers,
      readyplayers: roomData.readyplayers || [],
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
    setDeckOffset(roomData.deckoffset || 0);
    setWheelVisible(roomData.wheelvisible || false);
    setWheelSelected(roomData.wheelselected || null);
    setWheelSegments(roomData.wheelsegments || []);
    setCommunityCard(roomData.communitycard || null);
    setRemainingCards(52 - (roomData.deckoffset || 0));

    // 如果游戏进行中，重建牌堆以便换公牌等功能正常
    if (roomData.seed) {
      const newDeck = createDeckWithSeed(roomData.seed);
      setLocalDeck(newDeck);
      localDeckRef.current = newDeck;
    }

    // 存入 localStorage 以便刷新恢复
    try {
      localStorage.setItem('zjh_name', playerName.trim());
      localStorage.setItem('zjh_pass', roomPassword.trim());
      localStorage.setItem('zjh_room', roomData.id);
    } catch (_) {}

    await broadcastAndSyncDB({
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
    });
  };

  // ==================== 刷新自动恢复 ====================
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
      // 延迟执行，等 state 更新完成后再调用 joinRoom（它依赖 playerName 和 roomPassword）
      setTimeout(() => { joinRoomRef.current(); }, 500);
    }
  }, []);

  // ==================== 退出本局（变成观战者） ====================
  const sitOutCurrentRound = async () => {
    setConfirmDialog({
      message: "退出本局后你将变成观战者，只能看不能操作，确定吗？",
      onConfirm: async () => {
        setConfirmDialog(null);
        setSitOutRequested(true);
        const updatedPlayers = players.map(p => {
          if (p.name === playerName) {
            return { ...p, status: 'watching', bet: 0 };
          }
          return p;
        });
        setPlayers(updatedPlayers);
        playersRef.current = updatedPlayers;

        // 如果当前轮到你压酒，跳过你
        if (phase === "betting" && currentPlayer?.name === playerName) {
          let next = (currentPlayerIndex + 1) % updatedPlayers.length;
          let count = 0;
          while (count < updatedPlayers.length) {
            const p = updatedPlayers[next];
            if (p.status === 'playing' && p.bet === 0 && p.name !== dealerId) break;
            next = (next + 1) % updatedPlayers.length;
            count++;
          }
          setCurrentPlayerIndex(next);
          if (timeoutRef.current) clearTimeout(timeoutRef.current);
        }

        await broadcastAndSyncDB({
          players: updatedPlayers,
          phase,
          dealerId,
          currentPlayerIndex: phase === "betting" && currentPlayer?.name === playerName
            ? (updatedPlayers.findIndex(p => p.status === 'playing' && p.bet === 0 && p.name !== dealerId) || 0)
            : currentPlayerIndex,
          gameOver,
          result: `👀 ${playerName} 退出本局,变成观战者`,
          resultDetails,
          readyPlayers,
          settlementStep: 0,
          seed,
          deckOffset,
          wheelVisible,
          wheelSelected,
          wheelSegments,
          communityCard,
        });
      },
    });
  };

  const leaveRoom = async () => {
    if (!roomId) return;

    // 游戏进行中离开，弹出确认
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

  const doLeaveRoom = async () => {
    if (!roomId) return;

    let newIndex = currentPlayerIndex;
    const updatedPlayers = players.filter(p => p.name !== playerName);

    // 根据当前回合玩家的名字重新定位索引（数组删人后索引会偏移）
    const currentName = players[currentPlayerIndex]?.name;
    if (currentName === playerName) {
      // 离开的人就是当前回合玩家，找下一个活跃玩家
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
      // 离开的人在数组中别的位置，用名字重新找索引避免偏移
      const foundIdx = updatedPlayers.findIndex(p => p.name === currentName);
      newIndex = foundIdx >= 0 ? foundIdx : 0;
    }

    await supabase.from("rooms").update({
      players: updatedPlayers,
      readyplayers: readyPlayers.filter(p => p !== playerName),
    }).eq("id", roomId);

    // 广播只移除离开的玩家，保留游戏状态让其他人继续
    await broadcastAndSyncDB({
      players: updatedPlayers,
      phase,
      dealerId,
      currentPlayerIndex: newIndex,
      gameOver,
      result,
      resultDetails,
      readyPlayers: readyPlayers.filter(p => p !== playerName),
      settlementStep: 0,
      seed,
      deckOffset,
      wheelVisible,
      wheelSelected,
      wheelSegments,
      communityCard,
    });

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
    setCommunityCard(null);
    setRemainingCards(52);
    setBettingRound(0);
    setCompareData(null);
    setPendingReveal(null);
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }
    // 清除 localStorage
    try {
      localStorage.removeItem('zjh_name');
      localStorage.removeItem('zjh_pass');
      localStorage.removeItem('zjh_room');
    } catch (_) {}
  };

  const toggleReady = async () => {
    if (phase !== "waiting") {
      setErrorMsg("游戏已开始,不能准备");
      return;
    }
    const isReady = readyPlayers.includes(playerName);
    const newReady = isReady ? readyPlayers.filter(p => p !== playerName) : [...readyPlayers, playerName];
    setReadyPlayers(newReady);
    await broadcastAndSyncDB({
      players,
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
    });
  };

  // ==================== 开始游戏 ====================
  const startGame = async () => {
    if (phase !== "waiting") return;
    if (activePlayers.length < 2) { setErrorMsg("至少2人才能开始"); return; }
    if (!allReady) { setErrorMsg("还有玩家未准备"); return; }

    const firstDealer = players[0].name;
    const resetPlayers = players.map(p => ({
      ...p,
      cards: [],
      cardCount: 0,
      isDealer: p.name === firstDealer,
      status: 'playing',
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
    setCommunityCard(null);
    setMyBestHand([]);
    setBettingRound(0);
    setCompareData(null);
    setPendingReveal(null);

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
      settlementStep: 0,
      seed: newSeed,
      deckOffset: 0,
      wheelVisible: false,
      wheelSelected: null,
      wheelSegments: [],
      communityCard: null,
    });

    await dealCards(resetPlayers, firstDealer, newSeed);
  };

  // ==================== 发牌 ====================
  const dealCards = async (currentPlayers: any[], dealerName: string, deckSeed: number) => {
    console.log('🃏 dealCards 被调用');

    const deck = createDeckWithSeed(deckSeed);
    let offset = 0;

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

    // 🔥 修复:只从活跃玩家中计算第一个压酒的人(跳过观战者)
    const playingPlayers = newPlayers.filter(p => p.status === 'playing' && p.name !== dealerName);
    const firstIndex = newPlayers.findIndex(p => p.name === playingPlayers[0]?.name);
    setCurrentPlayerIndex(firstIndex >= 0 ? firstIndex : 0);
    setPhase("betting");
    phaseRef.current = "betting";
    setGameOver(false);
    setMyBet(0);
    setBettingComplete(false);
    bettingCompleteRef.current = false;
    setBettingRound(0);
    setCompareData(null);
    setPendingReveal(null);

    await broadcastAndSyncDB({
      players: newPlayers,
      phase: "betting",
      dealerId: dealerName,
      currentPlayerIndex: firstIndex >= 0 ? firstIndex : 0,
      gameOver: false,
      result: "🃏 发牌完成,开始压酒!",
      resultDetails: [],
      readyPlayers,
      settlementStep: 0,
      seed,
      deckOffset: offset,
      wheelVisible: false,
      wheelSelected: null,
      wheelSegments: [],
      communityCard: community,
      bettingComplete: false,
      bettingRound: 1,
    });

    if (newPlayers[firstIndex >= 0 ? firstIndex : 0]?.name === playerName) {
      startBettingTimeout();
    }
  };

  // ==================== 压酒超时 ====================
  const startBettingTimeout = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    bettingTimeoutFiredRef.current = false; // 重置防双触发标记
    timeoutRef.current = setTimeout(() => {
      // 防双触发：已经触发过就不再触发
      if (bettingTimeoutFiredRef.current) return;
      bettingTimeoutFiredRef.current = true;
      const cp = playersRef.current[currentPlayerIndex];
      if (phaseRef.current === "betting" && cp?.name === playerName && !bettingCompleteRef.current) {
        console.log('\u23F0 压酒超时,自动压半杯');
        handleBet(0.5);
      }
    }, 30000);
  };

  // ==================== 压酒 ====================
  const handleBet = async (amount: number) => {
    console.log('🔥 handleBet 被调用, amount:', amount, 'phase:', phase, 'currentPlayer:', currentPlayer?.name, 'playerName:', playerName, 'bettingComplete:', bettingComplete);

    if (phase !== "betting") {
      setErrorMsg("当前不是压酒阶段");
      return;
    }
    if (currentPlayer?.name !== playerName) {
      // 自动修复索引
      const myIndex = players.findIndex(p => p.name === playerName && p.status === 'playing' && p.name !== dealerId);
      if (myIndex >= 0 && players[myIndex]?.name === playerName) {
        console.log('🔧 自动修复 currentPlayerIndex 从', currentPlayerIndex, '改为', myIndex);
        setCurrentPlayerIndex(myIndex);
        // 重新执行压酒
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
    });

    if (updatedPlayers[next]?.name === playerName) {
      startBettingTimeout();
    }
  };

  // ==================== 庄家开牌超时 ====================
  const startRevealTimeout = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(async () => {
      if (phase === "reveal" && isDealer && !gameOver) {
        console.log('⏰ 庄家超时未开牌,自动开全部');
        await revealAll();
      }
    }, 60000);
  };

  // ==================== 庄家开牌 ====================
  const revealPlayer = async (targetName: string) => {
    if (phase !== "reveal") return;
    if (!isDealer) { setErrorMsg("只有庄家可以开牌"); return; }

    // 结算保护锁：开牌期间防止广播覆盖
    isSettlingRef.current = true;

    const target = players.find(p => p.name === targetName);
    if (!target) return;
    if (target.name === dealerId) return;
    if (target.status !== 'playing') return;
    if (revealTargets.includes(targetName)) return;

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    const newTargets = [...revealTargets, targetName];
    setRevealTargets(newTargets);

    const dealerPlayer = players.find(p => p.name === dealerId);
    if (!dealerPlayer || dealerPlayer.cards.length === 0) {
      setErrorMsg("庄家没有手牌,无法开牌");
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

    setResult(`⚔️ 庄家 vs ${targetName} 开牌!`);

    // 第一步：先显示牌型对比（showResult=false，只看牌不看胜负）
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

    // 广播第一步（牌型对比，不含结果）
    await broadcastAndSyncDB({
      players,
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
    });

    // 延迟2秒后再显示胜负结果
    await new Promise(resolve => setTimeout(resolve, 2000));

    const compareResult = compareHandsZhaJinHua(dealerBest, targetBest);
    let resultText = "";
    let penalty = 0;
    let who = "";
    let announceMsg = "";

    if (compareResult === 1) {
      resultText = "庄家赢";
      penalty = target.bet || 0.5;
      who = "dealer";
      announceMsg = `🏆 ${targetName} ${resultText},${targetName} 喝 ${formatBet(penalty)}!`;
    } else if (compareResult === -1) {
      resultText = "庄家输";
      penalty = target.bet || 0.5;
      who = target.name;
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
      bet: target.bet || 0.5,
    };
    setResultDetails(prev => [...prev, newDetail]);
    setResult(announceMsg);

    // 更新对比数据,显示结果
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

    setPendingReveal({
      targetName,
      targetBet: target.bet || 0.5,
    });

    await broadcastAndSyncDB({
      players,
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
    });
  };

  // ==================== 拿牌 ====================
  const handleTakeCards = async () => {
    if (!pendingReveal) return;

    // 解除结算保护锁
    isSettlingRef.current = false;

    const { targetName } = pendingReveal;

    // 清除中央对比信息
    setCompareData(null);
    setPendingReveal(null);
    setResult("");

    const currentPlayers = playersRef.current;
    const deck = localDeck;
    let offset = deckOffset;

    const newDealerCard = deck[offset++];
    const newTargetCard = deck[offset++];

    let updatedPlayers = currentPlayers.map(p => {
      if (p.name === dealerId) {
        return { ...p, cards: [newDealerCard], cardCount: 1, bet: 0 };
      }
      if (p.name === targetName) {
        return { ...p, cards: [newTargetCard], cardCount: 1, bet: 0 };
      }
      return { ...p, bet: 0 };
    });

    setDeckOffset(offset);
    setRemainingCards(52 - offset);
    setPlayers(updatedPlayers);
    playersRef.current = updatedPlayers;
    setLocalDeck(deck);

    const me = updatedPlayers.find(p => p.name === playerName);
    if (me && me.cards && me.cards.length > 0) {
      setMyCards(me.cards);
      if (communityCard) {
        const best = getBestThreeCards(communityCard, me.cards[0]);
        setMyBestHand(best);
      }
    }

    const activePlayersCount = updatedPlayers.filter(p => p.status === 'playing').length;
    const cardsNeeded = activePlayersCount;

    if (offset + cardsNeeded > 52) {
      setPhase("settlement");
      setGameOver(true);
      const summary = generateSummary();
      setResult(summary);
      await broadcastAndSyncDB({
        players: updatedPlayers,
        phase: "settlement",
        dealerId,
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
      });
      return;
    }

    const allRevealed = updatedPlayers.filter(p => p.status === 'playing' && p.name !== dealerId)
      .every(p => revealTargets.includes(p.name));

    if (allRevealed) {
      setRevealTargets([]);
      setBettingComplete(false);
    bettingCompleteRef.current = false;
      const newBettingRound = bettingRound + 1;
      setBettingRound(newBettingRound);

      // 只从活跃玩家中计算第一个压酒的人
      const playingPlayers = updatedPlayers.filter(p => p.status === 'playing' && p.name !== dealerId);
      const firstIdx = updatedPlayers.findIndex(p => p.name === playingPlayers[0]?.name);
      setCurrentPlayerIndex(firstIdx >= 0 ? firstIdx : 0);
      setPhase("betting");
    phaseRef.current = "betting";
      setGameOver(false);


      // 新轮开始,重置所有活跃玩家的bet(避免显示上一轮旧注)
      updatedPlayers = updatedPlayers.map(p =>
        p.status === 'playing' ? { ...p, bet: 0 } : p
      );
      setMyBet(0);
      await broadcastAndSyncDB({
        players: updatedPlayers,
        phase: "betting",
        dealerId,
        currentPlayerIndex: firstIdx >= 0 ? firstIdx : 0,
        gameOver: false,
        result: `🔄 第 ${bettingRound + 2} 轮压酒开始!`,
        resultDetails,
        readyPlayers,
        settlementStep: 0,
        seed,
        deckOffset: offset,
        wheelVisible: false,
        wheelSelected: null,
        wheelSegments: [],
        communityCard,
        bettingComplete: false,
        bettingRound: newBettingRound,
      });

      if (updatedPlayers[firstIdx >= 0 ? firstIdx : 0]?.name === playerName) {
        startBettingTimeout();
      }
    } else {
      setPhase("reveal");
    phaseRef.current = "reveal";
      await broadcastAndSyncDB({
        players: updatedPlayers,
        phase: "reveal",
        dealerId,
        currentPlayerIndex,
        gameOver: false,
        result: `👑 继续开牌...`,
        resultDetails,
        readyPlayers,
        settlementStep: 0,
        seed,
        deckOffset: offset,
        wheelVisible: false,
        wheelSelected: null,
        wheelSegments: [],
        communityCard,
        bettingComplete: false,
        bettingRound: bettingRound,
      });
      startRevealTimeout();
    }
  };

  // ==================== 开全部 ====================
  const revealAll = async () => {
    if (phase !== "reveal") return;
    if (!isDealer) return;
    if (gameOver) return;

    const playingPlayers = players.filter(p => p.status === 'playing' && p.name !== dealerId);
    for (const p of playingPlayers) {
      if (!revealTargets.includes(p.name)) {
        await revealPlayer(p.name);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  };

  // ==================== 生成结算总结 ====================
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

  // ==================== 换公牌 ====================
  const changeCommunityCard = async () => {
    if (phase !== "betting" && phase !== "reveal") {
      setErrorMsg("当前阶段不能换公牌");
      return;
    }
    if (deckOffset >= 52) {
      setErrorMsg("牌堆已用完,无法换公牌");
      return;
    }

    // 使用自定义确认弹窗而非 window.confirm
    setConfirmDialog({
      message: "换公牌需要喝1杯酒，确定吗？",
      onConfirm: () => {
        setConfirmDialog(null);
        doChangeCommunityCard();
      },
    });
    return;
  };

  // 换公牌实际执行（确认后调用）
  const doChangeCommunityCard = async () => {
    if (phase !== "betting" && phase !== "reveal") {
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

    // 记录谁喝了酒：给换公牌的玩家增加 drinkCount
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
    });

    setTimeout(() => setResult(""), 3000);
  };

  // ==================== 转盘抽庄 ====================
  const showWheel = async (currentPlayers: any[]) => {
    const names = currentPlayers.map(p => p.name);
    if (names.length < 2) return;
    setWheelSegments(names);
    setWheelSelected(null);
    setWheelRotation(0);
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
    });
  };

  const spinWheel = async () => {
    if (wheelSpinning) return;
    setWheelSpinning(true);
    setWheelSelected(null);

    const names = wheelSegments;
    const totalSegments = names.length;
    // 使用当前局的seed生成确定性随机结果，所有客户端一致
    const rand = new SeededRandom(seed || Date.now());
    const winIndex = Math.floor(rand.next() * totalSegments);
    const segmentAngle = 360 / totalSegments;
    const extraSpins = 5 + Math.floor(rand.next() * 3);
    const targetAngle = 360 * extraSpins + (360 - winIndex * segmentAngle - segmentAngle / 2);
    setWheelRotation(targetAngle);

    setTimeout(() => {
      const winner = names[winIndex];
      setWheelSelected(winner);
      setWheelSpinning(false);
      broadcastAndSyncDB({
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
        wheelSegments: names,
        communityCard,
      });
      setTimeout(() => {
        startNextRound(winner);
      }, 1500);
    }, 3500);
  };

  // ==================== 下一局 ====================
  const startNextRound = async (newDealerName: string) => {
    console.log('🔄 开始新一局,庄家:', newDealerName);

    setWheelVisible(false);
    setWheelSelected(null);
    setWheelSegments([]);
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
    setBettingRound(0);
    setCompareData(null);
    setPendingReveal(null);

    const resetPlayers = players.map(p => ({
      ...p,
      cards: [],
      cardCount: 0,
      isDealer: p.name === newDealerName,
      // 新局开始，所有人都恢复为 playing（观战者自动回到游戏中）
      status: 'playing',
      bet: 0,
    }));
    setSitOutRequested(false);

    setPlayers(resetPlayers);
    playersRef.current = resetPlayers;
    setDealerId(newDealerName);
    setIsDealer(playerName === newDealerName);
    setCommunityCard(null);

    const newSeed = Math.floor(Math.random() * 1000000);
    setSeed(newSeed);
    const deck = createDeckWithSeed(newSeed);
    setLocalDeck(deck);
    setDeckOffset(0);
    setRemainingCards(52);

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
      seed: newSeed,
      deckOffset: 0,
      wheelVisible: false,
      wheelSelected: null,
      wheelSegments: [],
      communityCard: null,
      bettingComplete: false,
      bettingRound: 0,
    });

    setPhase("dealing");
    phaseRef.current = "dealing";
    setGameOver(false);

    await dealCards(resetPlayers, newDealerName, newSeed);
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
    setCommunityCard(null);
    setRemainingCards(52);
    setBettingRound(0);
    setCompareData(null);
    setPendingReveal(null);

    const newSeed = Math.floor(Math.random() * 1000000);
    setSeed(newSeed);
    setLocalDeck(createDeckWithSeed(newSeed));
    setDeckOffset(0);

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
      settlementStep: 0,
      seed: newSeed,
      deckOffset: 0,
      wheelVisible: false,
      wheelSelected: null,
      wheelSegments: [],
      communityCard: null,
    });

    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  };

  // ==================== 座位渲染 ====================
  const renderSeats = () => {
    const seatPositions = [
      { seatId: 0, left: 12, top: 5 },
      { seatId: 1, left: 37, top: 5 },
      { seatId: 2, left: 63, top: 5 },
      { seatId: 3, left: 88, top: 5 },
      { seatId: 4, left: 4, top: 28 },
      { seatId: 5, left: 4, top: 56 },
      { seatId: 6, left: 12, top: 86 },
      { seatId: 7, left: 37, top: 86 },
      { seatId: 10, left: 63, top: 86 },
      { seatId: 11, left: 88, top: 86 },
      { seatId: 8, left: 96, top: 28 },
      { seatId: 9, left: 96, top: 56 },
    ];

    return seatPositions.map((pos) => {
      const player = players.find(p => p.seatId === pos.seatId) || null;
      const isMe = player?.name === playerName;
      const isDealerFlag = player?.isDealer || false;
      const isActive = phase === "betting" && player?.name === currentPlayer?.name && !gameOver;
      const hasCards = player && player.cardCount > 0;
      const isReady = readyPlayers.includes(player?.name || "");
      const displayName = player ? (player.name.length > 4 ? player.name.slice(0, 4) + '..' : player.name) : '';
      const betDisplay = player?.bet > 0 ? `${formatBet(player.bet)}` : '';

      return (
        <div key={pos.seatId} style={{
          position: 'absolute',
          left: `${pos.left}%`,
          top: `${pos.top}%`,
          transform: 'translate(-50%, -50%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          width: '70px',
          minHeight: '60px',
          background: isActive ? 'rgba(220,38,38,0.25)' : (isDealerFlag ? 'rgba(251,191,36,0.15)' : (player ? 'rgba(255,255,255,0.04)' : 'transparent')),
          borderRadius: '12px',
          border: isActive ? '2px solid #dc2626' : (isDealerFlag ? '2px solid #fbbf24' : (player ? '1px solid rgba(255,255,255,0.06)' : 'none')),
          boxShadow: isActive ? '0 0 25px rgba(220,38,38,0.3)' : (isDealerFlag ? '0 0 15px rgba(251,191,36,0.15)' : 'none'),
          padding: '4px 6px',
          transition: 'all 0.3s',
          cursor: 'default',
          zIndex: 2,
          pointerEvents: 'none' as const,
        }}>
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
                </div>
                <div style={{ display: 'flex', gap: '2px', fontSize: '9px', flexWrap: 'wrap' as const, justifyContent: 'center' }}>
                  {isReady && phase === "waiting" && <span style={{ color: '#22d3ee' }}>✅</span>}
                  {hasCards && <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '8px' }}>🃏</span>}
                  {betDisplay && <span style={{ color: '#fbbf24', fontSize: '9px' }}>💰{betDisplay}</span>}
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

  // ==================== 登录界面 ====================
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

  // ==================== 游戏主界面 ====================
  const isMyBetTurn = phase === "betting" && currentPlayer?.name === playerName && !gameOver && !isDealer;
  const isDealerTurn = phase === "reveal" && isDealer && !gameOver;
  const myPlayer = getMyPlayer();
  const canChangeCommunity = (phase === "betting" || phase === "reveal") && deckOffset < 52 && deckOffset > 0;

  const myDisplayHand = myBestHand && myBestHand.length > 0 ? myBestHand :
    (communityCard && myCards.length > 0 ? getBestThreeCards(communityCard, myCards[0]) : []);

  const activeCount = players.filter(p => p.status === 'playing').length;
  const cardsNeededForNext = activeCount;
  const isDeckEnough = deckOffset + cardsNeededForNext <= 52;

  // 拿牌按钮:仅庄家和被开玩家可见
  const showTakeCards = compareData && compareData.showResult &&
    (playerName === dealerId || playerName === compareData.playerName);

  // 开全部按钮:仅在开牌阶段且是庄家且游戏未结束
  const showRevealAll = phase === "reveal" && isDealer && !gameOver;

  return (
    <div style={styles.container}>
      <div style={styles.glowOrb}></div>
      <div style={styles.glowOrb2}></div>

      <div style={{
        ...styles.tableContainer,
        display: 'flex',
        flexDirection: 'column',
        maxHeight: phase === "settlement" ? '95vh' : 'none',
        overflowY: phase === "settlement" ? 'auto' : 'visible',
        WebkitOverflowScrolling: 'touch',
      }} className="table-container">
        <div style={{
          ...styles.table,
          aspectRatio: phase === "settlement" ? "16/6" : "16/9",
        }}>
          {renderSeats()}

          {/* 中央区域:公牌 + 对比牌型 + 公告结果 */}
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
            {/* 公牌 + 牌堆 */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '12px',
              marginBottom: '8px',
              background: 'rgba(0,0,0,0.35)',
              padding: '8px 16px',
              borderRadius: '12px',
              border: '1px solid rgba(255,255,255,0.06)',
            }}>
              <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>公牌</span>
              {communityCard ? (
                <PokerCard card={communityCard} hidden={false} size="medium" />
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

            {/* 对比牌型展示 */}
            {compareData && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '12px',
                background: 'rgba(0,0,0,0.5)',
                padding: '8px 14px',
                borderRadius: '10px',
                border: '1px solid rgba(255,255,255,0.08)',
                marginBottom: '6px',
                flexWrap: 'wrap' as const,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ fontSize: '11px', color: '#fbbf24' }}>庄家</span>
                  {compareData.dealerHand.map((card, idx) => (
                    <PokerCard key={idx} card={card} hidden={false} size="small" small />
                  ))}
                  <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)' }}>{compareData.dealerHandName}</span>
                </div>
                <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: '16px' }}>vs</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ fontSize: '11px', color: '#ddd' }}>{compareData.playerName}</span>
                  {compareData.targetHand.map((card, idx) => (
                    <PokerCard key={idx} card={card} hidden={false} size="small" small />
                  ))}
                  <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)' }}>{compareData.targetHandName}</span>
                </div>
                {compareData.showResult && compareData.result && (
                  <span style={{
                    fontSize: '14px',
                    fontWeight: 600,
                    color: compareData.result === '庄家赢' ? '#22d3ee' : compareData.result === '庄家输' ? '#f87171' : '#888',
                    marginLeft: '8px',
                  }}>
                    {compareData.result}
                    {compareData.penalty > 0 && (
                      <span style={{ fontSize: '12px', color: '#fbbf24' }}> 🍺{formatBet(compareData.penalty)}</span>
                    )}
                  </span>
                )}
              </div>
            )}

            {/* 公告结果 — 结算阶段美化版 */}
            {result && phase !== "settlement" && (
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

            {/* 阶段状态 */}
            <div style={{
              fontSize: '11px',
              color: 'rgba(255,255,255,0.4)',
              background: 'rgba(0,0,0,0.2)',
              padding: '2px 12px',
              borderRadius: '12px',
              marginTop: '4px',
            }}>
              {phase === "waiting" && `⏳ 等待开始 (${readyPlayers.length}/${activePlayers.length} 已准备)`}
              {phase === "dealing" && "🃏 发牌中..."}
              {phase === "betting" && isDealer && currentPlayer?.name === playerName && `⏳ 等待其他玩家压酒`}
              {phase === "betting" && isDealer && currentPlayer?.name !== playerName && `💰 ${currentPlayer?.name} 压酒中 (庄家不用压)`}
              {phase === "betting" && !isDealer && currentPlayer?.name === playerName && `💰 你的回合 — 选择压酒`}
              {phase === "betting" && !isDealer && currentPlayer?.name !== playerName && `💰 ${currentPlayer?.name} 压酒中...`}
              {phase === "reveal" && `👑 ${isDealer ? '选择要开的玩家' : '等待庄家开牌...'}`}
              {phase === "settlement" && "📊 结算完成"}
              {phase === "wheel" && "🎡 抽庄中..."}
            </div>
          </div>

          <div style={styles.roomInfo}>
            <span style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <span>👥 {players.length}/12</span>
              {dealerId && <span>👑 {dealerId}</span>}
              {phase === "betting" && currentPlayer && !isDealer && <span style={{ color: '#fbbf24', fontSize: '12px' }}>🎯 {currentPlayer.name}</span>}
              {phase === "betting" && currentPlayer && isDealer && currentPlayer.name === playerName && <span style={{ color: '#fbbf24', fontSize: '12px' }}>⏳ 等待压酒</span>}
              {phase === "betting" && currentPlayer && isDealer && currentPlayer.name !== playerName && <span style={{ color: '#fbbf24', fontSize: '12px' }}>🎯 {currentPlayer.name}</span>}
              {bettingRound > 0 && <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '10px' }}>第{bettingRound + 1}轮</span>}
            </span>
            <button onClick={leaveRoom} style={{ background: 'rgba(239,68,68,0.2)', border: '1px solid #ef4444', color: '#f87171', padding: '2px 10px', borderRadius: '12px', fontSize: '12px', cursor: 'pointer', marginLeft: 'auto' }}>🚪 离开</button>
          </div>
        </div>

        <div style={styles.statusBar}>
          {!gameOver && phase !== "settlement" && (
            <span style={styles.statusText}>
              {phase === "waiting" && `⏳ 等待开始 ${activePlayers.length >= 2 ? `(${readyPlayers.length}/${activePlayers.length} 已准备)` : '(至少2人)'}`}
              {phase === "dealing" && "🃏 发牌中..."}
              {phase === "betting" && isDealer && currentPlayer?.name === playerName && `⏳ 等待其他玩家压酒`}
              {phase === "betting" && isDealer && currentPlayer?.name !== playerName && `💰 ${currentPlayer?.name} 压酒中`}
              {phase === "betting" && !isDealer && currentPlayer?.name === playerName && `💰 选择压酒金额`}
              {phase === "betting" && !isDealer && currentPlayer?.name !== playerName && `💰 ${currentPlayer?.name} 压酒中...`}
              {phase === "reveal" && `👑 ${isDealer ? '选择要开的玩家' : '等待庄家开牌...'}`}
              {phase === "wheel" && "🎡 抽庄中..."}
            </span>
          )}
          {gameOver && phase !== "wheel" && phase !== "settlement" && <span style={styles.resultText}>{result || '游戏结束'}</span>}
          {phase === "settlement" && <span style={styles.resultText}>{result || '结算完成'}</span>}
        </div>

        <div style={styles.actionBar}>
          {phase === "waiting" && (
            <>
              <button onClick={toggleReady} style={readyPlayers.includes(playerName) ? styles.btnReady : styles.btnNotReady}>
                {readyPlayers.includes(playerName) ? '✅ 已准备' : '⏳ 准备'}
              </button>
              {players.length >= 2 && allReady && players.find(p => p.name === playerName)?.seatId === 0 && (
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
              {players.filter(p => p.status === 'playing' && p.name !== dealerId && !revealTargets.includes(p.name)).map(p => (
                <button key={p.name} onClick={() => revealPlayer(p.name)} style={{ ...styles.btnBid, background: 'rgba(220,38,38,0.15)', border: '1px solid #dc2626', color: '#dc2626' }}>
                  {p.name} {p.bet > 0 ? `(${formatBet(p.bet)})` : ''}
                </button>
              ))}
              {revealTargets.length > 0 && (
                <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)' }}>
                  已开: {revealTargets.join(', ')}
                </span>
              )}
            </>
          )}
          {phase === "reveal" && !isDealer && !gameOver && (
            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '13px' }}>
              ⏳ 等待庄家开牌...
            </span>
          )}

          {showTakeCards && (
            <button onClick={handleTakeCards} style={{ ...styles.btnStart, background: 'linear-gradient(135deg, #fbbf24, #f59e0b)', color: '#0f0f1a' }}>
              🃏 拿牌
            </button>
          )}

          {canChangeCommunity && (
            <button onClick={changeCommunityCard} style={{ ...styles.btnBid, background: 'rgba(251,191,36,0.1)', border: '1px solid #fbbf24', color: '#fbbf24' }}>
              🔄 换公牌 (喝1杯)
            </button>
          )}

          {/* 退出本局按钮 — 游戏进行中、自己不是庄家、自己还在玩 */}
          {(phase === "betting" || phase === "reveal") && !isDealer && myPlayer?.status === 'playing' && !gameOver && (
            <button onClick={sitOutCurrentRound} style={{ ...styles.btnBid, background: 'rgba(136,136,136,0.1)', border: '1px solid #888', color: '#888', fontSize: '12px' }}>
              👀 退出本局
            </button>
          )}

          {gameOver && phase !== "wheel" && phase !== "settlement" && (
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
              <button onClick={resetGame} style={styles.btnReset}>🔄 重置</button>
            </>
          )}
          {phase === "settlement" && (
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
              <button onClick={resetGame} style={styles.btnReset}>🔄 重置</button>
            </>
          )}
          {errorMsg && <div style={{ color: "#f87171", fontSize: 13, marginTop: 8 }}>{errorMsg}</div>}
        </div>

        {/* 手牌展示 */}
        {myPlayer && myPlayer.cards && myPlayer.cards.length > 0 && !gameOver && phase !== "settlement" && (
          <div style={styles.myCardsArea}>
            <div style={styles.myCardsLabel} onClick={() => setShowMyHand(!showMyHand)}>
              ♠♥ 你的手牌 {showMyHand ? '▼' : '▶'} 点击查看
            </div>
            {showMyHand && (
              <div style={styles.myCardsRow}>
                {myPlayer.cards.map((card: any, idx: number) => (
                  <PokerCard key={idx} card={card} hidden={false} size="medium" />
                ))}
                <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.3)' }}>+ 想象牌 = </span>
                {myDisplayHand.length > 0 && (
                  <div style={{ display: 'flex', gap: '2px', alignItems: 'center' }}>
                    {myDisplayHand.map((card: any, idx: number) => (
                      <PokerCard key={idx} card={card} hidden={false} size="small" small />
                    ))}
                    <span style={{ fontSize: '11px', color: '#fbbf24', marginLeft: '4px' }}>
                      {getHandName(myDisplayHand)}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* 开牌详情 — 美化版 */}
        {resultDetails.length > 0 && (phase === "reveal" || phase === "settlement") && (
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
                  {/* 玩家名 */}
                  <span style={{
                    fontSize: phase === "settlement" ? '14px' : '11px',
                    fontWeight: phase === "settlement" ? 600 : 400,
                    color: '#ddd',
                    minWidth: '40px',
                  }}>{d.player}</span>

                  {/* 牌型标签 */}
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

                  {/* 结果徽章 */}
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

                  {/* 酒量 */}
                  {d.penalty > 0 && (
                    <span style={{
                      fontSize: phase === "settlement" ? '13px' : '10px',
                      fontWeight: phase === "settlement" ? 700 : 400,
                      color: '#fbbf24',
                      padding: phase === "settlement" ? '3px 8px' : '0',
                      borderRadius: '6px',
                      background: phase === "settlement" ? 'rgba(251,191,36,0.12)' : 'transparent',
                    }}>
                      🍺{formatBet(d.penalty)}
                    </span>
                  )}
                  {d.penalty === 0 && (
                    <span style={{ fontSize: '10px', color: '#888' }}>不喝</span>
                  )}
                </div>
              );
            })}

            {/* 结算阶段的喝酒总计 */}
            {phase === "settlement" && (() => {
              const drinkMap: Record<string, number> = {};
              for (const d of resultDetails) {
                if (d.who === 'dealer') {
                  drinkMap[d.player] = (drinkMap[d.player] || 0) + (d.bet || 0.5);
                } else if (d.who !== 'none') {
                  drinkMap['庄家'] = (drinkMap['庄家'] || 0) + (d.bet || 0.5);
                }
              }
              // 加上换公牌的喝酒记录
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

      {/* ==================== 确认弹窗 ==================== */}
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
      `}</style>
    </div>
  );
};

// ==================== 样式 ====================
const styles: any = {
  container: {
    minHeight: "100vh",
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
    backdropFilter: "blur(30px)", borderRadius: "24px",
    padding: "12px 10px", border: "1px solid rgba(251,191,36,0.12)",
    boxShadow: "0 30px 80px rgba(220,38,38,0.2), 0 0 40px rgba(251,191,36,0.05)",
  },
  table: {
    position: "relative", width: "100%", aspectRatio: "16/9",
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