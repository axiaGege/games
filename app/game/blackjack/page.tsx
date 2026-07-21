"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";

// ==================== 扑克牌工具 ====================
const SUITS = ["♠", "♥", "♣", "♦"];
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

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
      let value = 0;
      if (rank === "A") value = 11;
      else if (["J", "Q", "K"].includes(rank)) value = 10;
      else value = parseInt(rank);
      deck.push({ suit, rank, value, id: `${rank}${suit}` });
    }
  }
  const rand = new SeededRandom(seed);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rand.next() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
};

const calculateHand = (cards: any[]) => {
  let total = 0, aces = 0;
  for (const card of cards) {
    if (card.rank === "A") { aces++; total += 11; }
    else total += card.value;
  }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return total;
};

const isBlackjack = (cards: any[]) => {
  if (cards.length !== 2) return false;
  const ranks = cards.map(c => c.rank);
  return ranks.includes("A") && ranks.some(r => ["10", "J", "Q", "K"].includes(r));
};

const isFiveCardCharlie = (cards: any[]) => cards.length === 5 && calculateHand(cards) <= 21;
const isBust = (cards: any[]) => calculateHand(cards) > 21;

const compareHands = (hand1: any[], hand2: any[]) => {
  const total1 = calculateHand(hand1);
  const total2 = calculateHand(hand2);
  const isFive1 = isFiveCardCharlie(hand1);
  const isFive2 = isFiveCardCharlie(hand2);
  const isBj1 = isBlackjack(hand1);
  const isBj2 = isBlackjack(hand2);

  if (isFive1 && !isFive2) return 1;
  if (!isFive1 && isFive2) return -1;
  if (isFive1 && isFive2) return 0;

  if (isBj1 && !isBj2) return 1;
  if (!isBj1 && isBj2) return -1;
  if (isBj1 && isBj2) return 0;

  if (total1 > 21 && total2 > 21) return 0;
  if (total1 > 21) return -1;
  if (total2 > 21) return 1;

  if (total1 === total2) {
    if (hand1.length < hand2.length) return 1;
    if (hand1.length > hand2.length) return -1;
    return 0;
  }
  return total1 > total2 ? 1 : -1;
};

// ==================== 解析 players ====================
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
          return { name, cards: [], cardCount: 0, isStanding: false, isBust: false, isBlackjack: false, isFiveCard: false, seatId: 0, isDealer: false, bustType: 'none', status: 'playing' };
        });
      }
    } catch {}
  }
  return [];
};

// ==================== 🃏 扑克牌组件 ====================
const PokerCard = ({ card, hidden, size = 'medium' }: { card?: any; hidden?: boolean; size?: 'small' | 'medium' | 'large' | 'tiny' | 'dealer' }) => {
  const sizeMap = {
    small: { width: 22, height: 32, fontSize: 9, symbolSize: 14, corner: 3 },
    medium: { width: 34, height: 50, fontSize: 10, symbolSize: 10, corner: 5 },
    large: { width: 36, height: 50, fontSize: 14, symbolSize: 24, corner: 7 },
    tiny: { width: 28, height: 40, fontSize: 11, symbolSize: 16, corner: 4 },
    dealer: { width: 32, height: 46, fontSize: 11, symbolSize: 13, corner: 5 },
  };
  const s = sizeMap[size] || sizeMap.medium;

  if (hidden) {
    return (
      <div style={{
        width: s.width,
        height: s.height,
        borderRadius: s.corner,
        background: 'linear-gradient(135deg, #7a1f2b 0%, #4a0e18 100%)',
        border: '1.5px solid rgba(255,215,190,0.25)',
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
          background: 'repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(255,220,200,0.06) 4px, rgba(255,220,200,0.06) 8px)',
        }} />
        <div style={{
          position: 'absolute',
          inset: 3,
          borderRadius: 2,
          border: '1px solid rgba(255,220,200,0.12)',
        }} />
        <span style={{ fontSize: s.symbolSize, opacity: 0.35, color: '#ffe8e0', textShadow: '0 1px 3px rgba(0,0,0,0.3)' }}>♠</span>
        <span style={{ position: 'absolute', top: 2, left: 3, fontSize: 5, color: 'rgba(255,220,200,0.25)' }}>♠</span>
        <span style={{ position: 'absolute', bottom: 2, right: 3, fontSize: 5, color: 'rgba(255,220,200,0.25)', transform: 'rotate(180deg)' }}>♠</span>
      </div>
    );
  }

  if (!card) return null;
  const isRed = card.suit === '♥' || card.suit === '♦';
  const color = isRed ? '#A32D2D' : '#2C2C2A';
  const rankDisplay = card.rank === '10' ? '10' : card.rank;
  // tiny 牌（网格 16×24）太窄，放不下完整三件套，用"左上点数 + 中心花色"；small/medium/large 保留完整三件套
  const isCompact = size === 'tiny';

  return (
    <div style={{
      width: s.width,
      height: s.height,
      borderRadius: s.corner,
      background: '#ffffff',
      border: '1.5px solid #D3D1C7',
      boxShadow: '0 2px 8px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.8)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
      flexShrink: 0,
      fontFamily: '"Segoe UI", "Helvetica Neue", Arial, system-ui, sans-serif',
    }}>
      <div style={{
        position: 'absolute',
        top: 1,
        left: 2,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        lineHeight: 1,
        fontSize: s.fontSize,
        fontWeight: 700,
        color: color,
      }}>
        <span>{rankDisplay}</span>
        {!isCompact && <span style={{ fontSize: s.fontSize * 0.7 }}>{card.suit}</span>}
      </div>
      <span style={{
        fontSize: s.symbolSize,
        color: color,
        opacity: 0.9,
        textShadow: '0 1px 2px rgba(0,0,0,0.05)',
        marginTop: isCompact ? 4 : 0,
        lineHeight: 1,
        display: 'block',
      }}>
        {card.suit + '\uFE0E'}
      </span>
      {!isCompact && (
        <div style={{
          position: 'absolute',
          bottom: 1,
          right: 2,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          lineHeight: 1,
          fontSize: s.fontSize,
          fontWeight: 700,
          color: color,
          transform: 'rotate(180deg)',
        }}>
          <span>{rankDisplay}</span>
          <span style={{ fontSize: s.fontSize * 0.7 }}>{card.suit}</span>
        </div>
      )}
    </div>
  );
};

export default function BlackjackPage() {
  const [playerName, setPlayerName] = useState("");
  const [roomPassword, setRoomPassword] = useState("");
  const [joined, setJoined] = useState(false);
  const [roomId, setRoomId] = useState("");

  const [players, setPlayers] = useState<any[]>([]);
  const [phase, setPhase] = useState<"waiting" | "dealing" | "player_turn" | "dealer_turn" | "wheel" | "waiting_for_dealer">("waiting");
  const [dealerId, setDealerId] = useState<string | null>(null);
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [result, setResult] = useState<string>("");
  const [resultDetails, setResultDetails] = useState<any[]>([]);
  const [seed, setSeed] = useState<number | null>(null);
  const [localDeck, setLocalDeck] = useState<any[]>([]);
  const [deckOffset, setDeckOffset] = useState(0);
  const [myCards, setMyCards] = useState<any[]>([]);
  const [showMyCards, setShowMyCards] = useState(false);
  const [myCardCount, setMyCardCount] = useState(0);
  const [myBustType, setMyBustType] = useState<'none' | 'confessed' | 'hidden'>('none');
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [disconnected, setDisconnected] = useState(false);
  const [mySeatId, setMySeatId] = useState<number | null>(null);
  const [isDealer, setIsDealer] = useState(false);
  const [readyPlayers, setReadyPlayers] = useState<string[]>([]);
  const [settlementStep, setSettlementStep] = useState(0);
  // 轮盘/抽牌选庄复用状态（DB字段兼容）
  const [wheelVisible, setWheelVisible] = useState(false);
  const [wheelSelected, setWheelSelected] = useState<any>(null);
  const [wheelSegments, setWheelSegments] = useState<any>([]);
  // 抽牌选庄 state
  const [drawRule, setDrawRule] = useState<"big" | "small" | null>(null);
  const [drawCards, setDrawCards] = useState<{ name: string; card: any }[]>([]);
  const [drawRevealed, setDrawRevealed] = useState<Set<string>>(new Set());
  const [drawSubPhase, setDrawSubPhase] = useState<"choose" | "reveal" | "done">("choose");
  const [drawDeadline, setDrawDeadline] = useState<number | null>(null);
  const [drawWinner, setDrawWinner] = useState<string | null>(null);
  const [drawOwner, setDrawOwner] = useState<string | null>(null);
  const [drawCountdown, setDrawCountdown] = useState(5);
  const [newDealerName, setNewDealerName] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{show:boolean, message:string, callback:any}>({show:false, message:'', callback:null});
  const [spectators, setSpectators] = useState<string[]>([]);
  const [showRules, setShowRules] = useState(false);
  const channelRef = useRef<any>(null);
  const playersRef = useRef<any[]>([]);
  const seedRef = useRef<number | null>(null);
  const deckOffsetRef = useRef(0);
  const isSettlingRef = useRef(false);
  const drawTimeoutFiredRef = useRef(false);

  // ==================== ConfirmDialog 组件 ====================
  const ConfirmDialog = () => {
    if (!confirmDialog.show) return null;
    return (
      <div style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", backgroundColor: "rgba(0,0,0,0.6)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 9999 }}>
        <div style={{ background: "linear-gradient(145deg, #2a0f24, #1a0512)", borderRadius: "16px", padding: "24px", maxWidth: "320px", width: "90%", textAlign: "center", border: "1px solid rgba(214,140,170,0.4)" }}>
          <p style={{ color: "#fff", fontSize: "15px", marginBottom: "20px" }}>{confirmDialog.message}</p>
          <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
            <button onClick={() => setConfirmDialog({ show: false, message: "", callback: null })} style={{ padding: "8px 24px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.1)", color: "#fff", cursor: "pointer" }}>取消</button>
            <button onClick={async () => { if (confirmDialog.callback) await confirmDialog.callback(); setConfirmDialog({ show: false, message: "", callback: null }); }} style={{ padding: "8px 24px", borderRadius: "8px", border: "none", background: "linear-gradient(135deg, #e879a8, #be185d)", color: "#fff", fontWeight: "600", cursor: "pointer" }}>确认</button>
          </div>
        </div>
      </div>
    );
  };

  // 刷新/关闭标签页时提示
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  // 同步 players 到 ref，解决闭包问题
  useEffect(() => {
    playersRef.current = players;
  }, [players]);

  // ==================== 辅助函数 ====================
  const broadcastAndSyncDB = async (state: any) => {
    try {
      await supabase.channel(`blackjack:${roomId}`).send({
        type: 'broadcast',
        event: 'gameState',
        payload: state,
      });
      console.log('📤 广播成功');

      await supabase.from("rooms").update({
        players: state.players,
        phase: state.phase,
        dealerid: state.dealerId,
        gameover: state.gameOver,
        currentplayerindex: state.currentPlayerIndex,
        result: state.result,
        resultdetails: state.resultDetails,
        readyplayers: state.readyPlayers,
        settlementstep: state.settlementStep || 0,
        seed: state.seed,
        deckoffset: state.deckOffset || 0,
        wheelvisible: state.wheelVisible || false,
        wheelselected: state.wheelSelected || null,
        wheelsegments: state.wheelSegments || [],
      }).eq("id", roomId);
      console.log('💾 数据库同步成功');
      setDisconnected(false);
    } catch (error) {
      console.error('❌ 广播/同步失败:', error);
      setDisconnected(true);
      setErrorMsg('⚠️ 连接断开，请检查网络后重试');
    }
  };

  const getMyPlayer = () => players.find(p => p.name === playerName);
  const activePlayers = players.filter(p => p.status !== 'watching');
  const allReady = activePlayers.length >= 2 && activePlayers.every(p => readyPlayers.includes(p.name));
  const currentPlayer = players[currentPlayerIndex] || null;

  // ==================== 数据库兜底同步（解决广播丢包导致漏人） ====================
  const syncFromDB = (row: any) => {
    const dbPlayers = parsePlayers(row.players);
    const keyOf = (p: any) => p.cid || p.name;
    setPlayers(prev => {
      const dbMap = new Map(dbPlayers.map((p: any) => [keyOf(p), p]));
      const out: any[] = [];
      const seen = new Set<string>();
      for (const p of prev) {
        const db = dbMap.get(keyOf(p));
        if (db) {
          // DB 有此人：用 DB 的非牌字段，但保留本地当前牌面（避免回退进行中的操作）
          out.push({ ...db, cards: p.cards, cardCount: p.cardCount, isStanding: p.isStanding, isBust: p.isBust, isBlackjack: p.isBlackjack, isFiveCard: p.isFiveCard, bustType: p.bustType });
          seen.add(keyOf(p));
        } else {
          // 本地独有且 DB 已无：观战者丢弃（已退出），进行中玩家保留（保护进行中状态）
          if (p.status === 'watching') continue;
          out.push(p);
        }
      }
      // 把 DB 有、本地没有的人加入（新加入者）
      for (const p of dbPlayers) if (!seen.has(keyOf(p))) out.push(p);
      return out;
    });
    // 仅非对局阶段全量同步其他状态，避免回退进行中的 phase/准备
    const ph: string = row.phase;
    if (ph === 'waiting' || ph === 'waiting_for_dealer' || ph === 'wheel') {
      setPhase(ph);
      setReadyPlayers(row.readyplayers || []);
      setDealerId(row.dealerid || null);
      setResultDetails(row.resultdetails || []);
      setSpectators(row.spectators || []);
      setSeed(row.seed ?? null);
      setDeckOffset(row.deckoffset || 0);
      setWheelVisible(row.wheelvisible || false);
      setWheelSelected(row.wheelselected || null);
      setWheelSegments(row.wheelsegments || []);
    }
  };

  // ==================== Supabase 订阅 ====================
  useEffect(() => {
    if (!roomId) return;
    const myCid = getOrCreateCid();
    console.log('🔄 订阅房间:', roomId);
    const channel = supabase
      .channel(`blackjack:${roomId}`, { config: { broadcast: { ack: true } } })
      .on('broadcast', { event: 'gameState' }, (payload) => {
        const state = payload.payload;
        console.log("📥 收到广播, players:", state.players?.map?.((p: any) => typeof p === "string" ? p : (p?.name || "?")), "spectators:", state.spectators);
        const parsedPlayers = parsePlayers(state.players);

        setPlayers(prev => {
          if (isSettlingRef.current) return prev;
          const broadcastNames = new Set(parsedPlayers.map(p => p.name));
          const localOnlySpectators = prev.filter(p =>
            !broadcastNames.has(p.name) && p.status === 'watching'
          );
          const localMe = prev.find(p => (p.cid && myCid && p.cid === myCid) || p.name === playerName);
          const remoteMe = parsedPlayers.find(p => (p.cid && myCid && p.cid === myCid) || p.name === playerName);
          if (localMe && remoteMe) {
            const isDealing = state.phase === "dealing";
            if (isDealing) return [...localOnlySpectators, ...parsedPlayers];

            return [
              ...localOnlySpectators,
              ...parsedPlayers.map(p => {
                if (p.name === playerName) {
                  return {
                    ...p,
                    cards: p.cards || [],
                    cardCount: p.cards?.length || p.cardCount || 0,
                    bustType: p.bustType || 'none',
                    isStanding: p.isStanding || false,
                    isBust: p.isBust || false,
                    isBlackjack: p.isBlackjack || false,
                    isFiveCard: p.isFiveCard || false,
                    status: p.status || 'playing',
                  };
                }
                const prevPlayer = prev.find(pp => (pp.cid && p.cid && pp.cid === p.cid) || pp.name === p.name);
                const isNewPlayer = !prevPlayer;
                return {
                  ...p,
                  cards: p.cards || [],
                  cardCount: p.cards?.length || p.cardCount || 0,
                  isFiveCard: p.isFiveCard || (p.cards?.length === 5 && calculateHand(p.cards) <= 21),
                  status: prevPlayer ? prevPlayer.status : (p.status || 'playing'),
                };
              }),
            ];
          }
          return [...localOnlySpectators, ...parsedPlayers];
        });

        setPhase(prevPhase => {
          // 防回退：已进入发牌/玩家回合/庄家回合时，拒绝被迟到旧广播拉回 抽庄/等待
          // （合法流程里对局阶段只会自动走向下一局 dealing，从不回退 wheel/waiting）
          const _protected = prevPhase === "dealing" || prevPhase === "player_turn" || prevPhase === "dealer_turn";
          if (_protected && (state.phase === "wheel" || state.phase === "waiting" || state.phase === "waiting_for_dealer")) {
            return prevPhase;
          }
          if (state.phase === "dealing" || state.phase === "player_turn" || state.phase === "dealer_turn") {
            return state.phase;
          }
          if (state.phase === "waiting_for_dealer") return "waiting_for_dealer";
          return state.phase || "waiting";
        });

        if (state.phase === "dealing") {
          setShowMyCards(false);
          setMyCards([]);
          setMyCardCount(0);
          setMyBustType('none');
        }

        setGameOver(prevGameOver => {
          if (state.phase === "dealing" || state.phase === "player_turn") {
            return false;
          }
          if (state.phase === "waiting_for_dealer" || state.phase === "wheel") {
            return state.gameOver || false;
          }
          return prevGameOver;
        });

        setDealerId(state.dealerId || null);
        setCurrentPlayerIndex(state.currentPlayerIndex || 0);
        setResult(state.result || "");
        setResultDetails(state.resultDetails || []);
        setReadyPlayers(state.readyPlayers || []);
        if (state.newDealerName !== undefined) setNewDealerName(state.newDealerName);
        if (state.spectators !== undefined) setSpectators(state.spectators);
        setSettlementStep(state.settlementStep || 0);
        setSeed(state.seed || null);
        {
          const _inc = state.deckOffset || 0;
          if (state.seed === null) { setDeckOffset(0); deckOffsetRef.current = 0; }
          else if (state.seed !== seedRef.current) { setDeckOffset(_inc); deckOffsetRef.current = _inc; }
          else { setDeckOffset(prev => Math.max(prev, _inc)); deckOffsetRef.current = Math.max(deckOffsetRef.current, _inc); }
          seedRef.current = state.seed ?? null;
        }
        // —— 处理抽牌选庄同步 ——
        setWheelVisible(state.wheelVisible || false);
        const rawCtrl = state.wheelSelected;
        if (rawCtrl) {
          const ctrl = unpackDrawCtrl(rawCtrl);
          if (ctrl) {
            setDrawOwner(ctrl.owner || null);
            setDrawRule(ctrl.rule || null);
            setDrawSubPhase(ctrl.rule ? "reveal" : "choose");
            // 倒计时改为各自本地起算，避免各手机时钟偏差导致显示不一致
            setDrawDeadline(ctrl.deadline ? Date.now() + 8000 : null);
            const revealed = ctrl.revealed ? new Set<string>(ctrl.revealed) : new Set<string>();
            setDrawRevealed(revealed);
            const cards = unpackDrawCards(state.wheelSegments);
            setDrawCards(cards);
            if (ctrl.winner) {
              setDrawWinner(ctrl.winner);
              setDrawSubPhase("done");
            }
          } else {
            setDrawOwner(null); setDrawRule(null); setDrawSubPhase("choose");
            setDrawCards([]); setDrawRevealed(new Set<string>());
          }
        } else if (state.wheelVisible) {
          setDrawSubPhase("choose");
        }
        setWheelSelected(rawCtrl || null);
        setWheelSegments(state.wheelSegments || []);

        if (state.seed === null) {
          setLocalDeck([]);
          setDeckOffset(0);
        } else if (state.seed && localDeck.length === 0) {
          setLocalDeck(createDeckWithSeed(state.seed));
        }

        const me = parsedPlayers.find(p => (p.cid && myCid && p.cid === myCid) || p.name === playerName);
        if (me) {
          setIsDealer(me.isDealer || false);
          setMySeatId(me.seatId !== undefined ? me.seatId : null);
          setMyBustType(me.bustType || 'none');
          if (me.cards && me.cards.length > 0) {
            setMyCards(me.cards);
            setMyCardCount(me.cards.length);
          }
        }
        setDisconnected(false);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` }, (payload: any) => {
        if (payload.new) syncFromDB(payload.new);
      })
      .subscribe();

    // 兜底轮询：定时从数据库拉最新房间状态，保证全员名单同步（广播丢包也不漏人）
    const pollTimer = setInterval(async () => {
      try {
        const { data } = await supabase.from("rooms").select("*").eq("id", roomId).single();
        if (data) {
          // 心跳清理：把超过 15 分钟没动静的幽灵清掉（自己除外）
          const ps: any[] = parsePlayers(data.players);
          const now = Date.now();
          const pruned = ps.filter((p: any) => {
            if ((p.cid && p.cid === myCid) || (!p.cid && p.name === playerName)) return true; // 自己保留
            if (p.lastSeen && now - p.lastSeen > 15 * 60 * 1000) return false; // 超时幽灵剔除
            return true;
          });
          if (pruned.length !== ps.length) {
            await supabase.from("rooms").update({ players: pruned }).eq("id", roomId);
            syncFromDB({ ...data, players: pruned });
          } else {
            syncFromDB(data);
          }
        }
      } catch (_) {}
    }, 2500);

    // 心跳：每 12 秒刷新自己的 lastSeen，证明"我还活着"
    const hbTimer = setInterval(async () => {
      try {
        const { data } = await supabase.from("rooms").select("players").eq("id", roomId).single();
        if (!data) return;
        const ps: any[] = parsePlayers(data.players);
        let changed = false;
        const next = ps.map((p: any) => {
          if ((p.cid && p.cid === myCid) || (!p.cid && p.name === playerName)) { changed = true; return { ...p, lastSeen: Date.now() }; }
          return p;
        });
        if (changed) await supabase.from("rooms").update({ players: next }).eq("id", roomId);
      } catch (_) {}
    }, 12000);

    channelRef.current = channel;
    return () => {
      clearInterval(pollTimer);
      clearInterval(hbTimer);
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, [roomId, playerName]);

  // ============ 隐形身份证：每台设备一个永久编号，退出也不删，认人靠编号不靠名字 ============
  const getOrCreateCid = () => {
    try {
      let c = localStorage.getItem('bj_cid');
      if (!c) {
        c = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : ('bj_' + Math.random().toString(36).slice(2) + Date.now().toString(36));
        localStorage.setItem('bj_cid', c);
      }
      return c;
    } catch (_) {
      return 'bj_' + Math.random().toString(36).slice(2);
    }
  };

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
      setErrorMsg("这个密码已被使用，请换一个");
      return;
    }

    const newPlayer = { cid: getOrCreateCid(), lastSeen: Date.now(), name: playerName.trim(), cards: [], cardCount: 0, isStanding: false, isBust: false, isBlackjack: false, isFiveCard: false, seatId: 0, isDealer: false, bustType: 'none', status: 'playing' };
    const { data, error } = await supabase
      .from("rooms")
      .insert({
        game_type: "blackjack",
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
    setJoined(true);
    setReadyPlayers([playerName.trim()]);
    try {
      localStorage.setItem('bj_name', playerName.trim());
      localStorage.setItem('bj_pass', roomPassword.trim());
      localStorage.setItem('bj_room', data.id);
    } catch (_) {}
    await broadcastAndSyncDB({
      players: parsedPlayers,
      spectators: [],
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
      setErrorMsg("密码错误，未找到对应房间");
      return;
    }

    let currentPlayers = parsePlayers(roomData.players);
    if (currentPlayers.length >= 12) {
      setErrorMsg("房间已满（最多12人）");
      return;
    }

    const myCid = getOrCreateCid();
    // 玩家已存在（重连）：优先按编号认人，老房间无编号按名字兜底；认出后补编号、同步最新昵称
    const existingIdx = currentPlayers.findIndex((p: any) => (p.cid && p.cid === myCid) || (!p.cid && p.name === playerName.trim()));
    if (existingIdx >= 0) {
      currentPlayers = currentPlayers.map((p, i) => i === existingIdx ? { ...p, cid: myCid, name: playerName.trim(), lastSeen: Date.now() } : p);
    }

    // 玩家已存在（重连）
    if (existingIdx >= 0) {
      setRoomId(roomData.id);
      setJoined(true);
      setPlayers(currentPlayers);
      setPhase(roomData.phase || "waiting");
      setDealerId(roomData.dealerid || null);
      setGameOver(roomData.gameover || false);
      setCurrentPlayerIndex(roomData.currentplayerindex || 0);
      setSeed(roomData.seed || null);
      const validReady = (roomData.readyplayers || []).filter((name: string) =>
        currentPlayers.some((p: any) => p.name === name)
      );
      setReadyPlayers(validReady);
      setResult(roomData.result || "");
      setResultDetails(roomData.resultdetails || []);
      setSettlementStep(roomData.settlementstep || 0);
      {
        const _inc = roomData.deckoffset || 0;
        if (roomData.seed === null) { setDeckOffset(0); deckOffsetRef.current = 0; }
        else if (roomData.seed !== seedRef.current) { setDeckOffset(_inc); deckOffsetRef.current = _inc; }
        else { setDeckOffset(prev => Math.max(prev, _inc)); deckOffsetRef.current = Math.max(deckOffsetRef.current, _inc); }
        seedRef.current = roomData.seed ?? null;
      }
      setWheelVisible(roomData.wheelvisible || false);
      setWheelSelected(roomData.wheelselected || null);
      setWheelSegments(roomData.wheelsegments || []);
      // 恢复抽牌选庄状态
      { const rc = roomData.wheelselected; if (rc) { try { const c = JSON.parse(rc); setDrawOwner(c.owner||null); setDrawRule(c.rule||null); setDrawSubPhase(c.rule?"reveal":"choose"); setDrawDeadline(c.deadline||null); setDrawRevealed(new Set<string>(c.revealed||[])); try{setDrawCards(JSON.parse(roomData.wheelsegments||"[]"));}catch{setDrawCards([]);} if (c.winner) { setDrawWinner(c.winner); setDrawSubPhase("done"); } } catch { setDrawSubPhase("choose"); } } else if (!roomData.wheelvisible) { setDrawSubPhase("choose"); } }

      const meRestore = currentPlayers.find((p: any) => p.name === playerName.trim());
      if (meRestore) {
        setMyCards(meRestore.cards || []);
        setMyCardCount(meRestore.cardCount || 0);
        setMyBustType(meRestore.bustType || 'none');
        setShowMyCards(meRestore.isDealer ? false : true);
        setIsDealer(meRestore.isDealer || false);
        setMySeatId(meRestore.seatId !== undefined ? meRestore.seatId : null);
      }

      try {
        localStorage.setItem('bj_name', playerName.trim());
        localStorage.setItem('bj_pass', roomPassword.trim());
        localStorage.setItem('bj_room', roomData.id);
      } catch (_) {}

      await broadcastAndSyncDB({
        players: currentPlayers,
        phase: roomData.phase || "waiting",
        dealerId: roomData.dealerid || null,
        currentPlayerIndex: roomData.currentplayerindex || 0,
        gameOver: roomData.gameover || false,
        result: roomData.result || "",
        resultDetails: roomData.resultdetails || [],
        readyPlayers: validReady,
        settlementStep: roomData.settlementstep || 0,
        seed: roomData.seed || null,
        deckOffset: roomData.deckoffset || 0,
        wheelVisible: roomData.wheelvisible || false,
        wheelSelected: roomData.wheelselected || null,
        wheelSegments: roomData.wheelsegments || [],
      });

      return;
    }

    // 分配座位
    const occupiedSeats = currentPlayers.map((p: any) => p.seatId).filter((id: number) => id !== undefined);
    let seatId = 0;
    for (let i = 0; i < 12; i++) {
      if (!occupiedSeats.includes(i)) { seatId = i; break; }
    }

    const isMidGame = roomData.phase && roomData.phase !== "waiting";

    // 🔥 关键修改：所有加入的人都进 players，用 status 区分
    const newPlayer = {
      cid: myCid,
      lastSeen: Date.now(),
      name: playerName.trim(),
      cards: [],
      cardCount: 0,
      isStanding: false,
      isBust: false,
      isBlackjack: false,
      isFiveCard: false,
      seatId,
      isDealer: false,
      bustType: 'none',
      status: isMidGame ? 'watching' : 'playing',
    };
    const updatedPlayers = [...currentPlayers, newPlayer];

    await supabase.from("rooms").update({
      players: updatedPlayers,
      readyplayers: roomData.readyplayers || [],
    }).eq("id", roomData.id);

    setRoomId(roomData.id);
    setJoined(true);
    setPlayers(updatedPlayers);
    setSpectators([]);
    const validReady = (roomData.readyplayers || []).filter((name: string) =>
      updatedPlayers.some((p: any) => p.name === name)
    );
    setReadyPlayers(validReady);
    try {
      localStorage.setItem('bj_name', playerName.trim());
      localStorage.setItem('bj_pass', roomPassword.trim());
      localStorage.setItem('bj_room', roomData.id);
    } catch (_) {}

    setPhase(roomData.phase || "waiting");
    setDealerId(roomData.dealerid || null);
    setGameOver(roomData.gameover || false);
    setCurrentPlayerIndex(roomData.currentplayerindex || 0);
    setSeed(roomData.seed || null);
    setResult(roomData.result || "");
    setResultDetails(roomData.resultdetails || []);
    setSettlementStep(roomData.settlementstep || 0);
    {
      const _inc = roomData.deckoffset || 0;
      if (roomData.seed === null) { setDeckOffset(0); deckOffsetRef.current = 0; }
      else if (roomData.seed !== seedRef.current) { setDeckOffset(_inc); deckOffsetRef.current = _inc; }
      else { setDeckOffset(prev => Math.max(prev, _inc)); deckOffsetRef.current = Math.max(deckOffsetRef.current, _inc); }
      seedRef.current = roomData.seed ?? null;
    }
    setWheelVisible(roomData.wheelvisible || false);
    setWheelSelected(roomData.wheelselected || null);
    setWheelSegments(roomData.wheelsegments || []);
    // 恢复抽牌选庄状态
    { const rc = roomData.wheelselected; if (rc) { try { const c = JSON.parse(rc); setDrawOwner(c.owner||null); setDrawRule(c.rule||null); setDrawSubPhase(c.rule?"reveal":"choose"); setDrawDeadline(c.deadline||null); setDrawRevealed(new Set<string>(c.revealed||[])); try{setDrawCards(JSON.parse(roomData.wheelsegments||"[]"));}catch{setDrawCards([]);} if (c.winner) { setDrawWinner(c.winner); setDrawSubPhase("done"); } } catch { setDrawSubPhase("choose"); } } else if (!roomData.wheelvisible) { setDrawSubPhase("choose"); } }

    await broadcastAndSyncDB({
      players: updatedPlayers,
      spectators: [],
      phase: roomData.phase || "waiting",
      dealerId: roomData.dealerid || null,
      currentPlayerIndex: roomData.currentplayerindex || 0,
      gameOver: roomData.gameover || false,
      result: roomData.result || "",
      resultDetails: roomData.resultdetails || [],
      readyPlayers: validReady,
      settlementStep: roomData.settlementstep || 0,
      seed: roomData.seed || null,
      deckOffset: roomData.deckoffset || 0,
      wheelVisible: roomData.wheelvisible || false,
      wheelSelected: roomData.wheelselected || null,
      wheelSegments: roomData.wheelsegments || [],
    });
  };

  const joinRoomRef = useRef(joinRoom);
  joinRoomRef.current = joinRoom;

  useEffect(() => {
    let savedName, savedPass, savedRoom;
    try {
      savedName = localStorage.getItem('bj_name');
      savedPass = localStorage.getItem('bj_pass');
      savedRoom = localStorage.getItem('bj_room');
    } catch (_) {}
    if (savedName && savedPass && savedRoom) {
      setPlayerName(savedName);
      setRoomPassword(savedPass);
      setRoomId(savedRoom);
      setTimeout(() => { joinRoomRef.current(); }, 500);
    }
  }, []);

  const leaveRoom = async () => {
    if (!roomId) return;
    const myCid = getOrCreateCid();
    const isLeavingSpectator = spectators.includes(playerName);
    // 按编号(或名字兜底)移除自己，绝不靠改名逃掉
    const updatedPlayers = players.filter(p => !((p.cid && p.cid === myCid) || (!p.cid && p.name === playerName)));
    const updatedSpectators = isLeavingSpectator
      ? spectators.filter(n => n !== playerName)
      : spectators;
    await supabase.from("rooms").update({
      players: updatedPlayers,
      readyplayers: readyPlayers.filter(p => p !== playerName),
    }).eq("id", roomId);
    try { await supabase.from("rooms").update({ spectators: updatedSpectators }).eq("id", roomId); } catch (_) {}
    await broadcastAndSyncDB({
      players: updatedPlayers,
      spectators: updatedSpectators,
      phase: "waiting",
      dealerId: null,
      currentPlayerIndex: 0,
      gameOver: false,
      result: "",
      resultDetails: [],
      readyPlayers: readyPlayers.filter(p => p !== playerName),
      settlementStep: 0,
      seed: null,
      deckOffset: 0,
      wheelVisible: false,
      wheelSelected: null,
      wheelSegments: [],
    });
    setJoined(false);
    setRoomId("");
    setPlayers([]);
    setPhase("waiting");
    setDealerId(null);
    setCurrentPlayerIndex(0);
    setGameOver(false);
    setResult("");
    setResultDetails([]);
    setMyCards([]);
    setShowMyCards(false);
    setMyCardCount(0);
    setMyBustType('none');
    setIsDealer(false);
    setMySeatId(null);
    setReadyPlayers([]);
    setSettlementStep(0);
    setErrorMsg("");
    setDisconnected(false);
    setSeed(null);
    setLocalDeck([]);
    setDeckOffset(0);
    setWheelVisible(false);
    setWheelSelected(null);
    setWheelSegments([]);
    setDrawRule(null);
    setDrawCards([]);
    setDrawRevealed(new Set<string>());
    setDrawSubPhase("choose");
    setDrawWinner(null);
    setDrawOwner(null);
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }
    try {
      localStorage.removeItem('bj_name');
      localStorage.removeItem('bj_pass');
      localStorage.removeItem('bj_room');
      // 注意：保留 bj_cid（退出房间也不删），保证回头再进仍被认出，不会变成新玩家
    } catch (_) {}
  };

  const toggleReady = async () => {
    if (phase !== "waiting") {
      setErrorMsg("游戏已开始，不能准备");
      return;
    }

    const me = players.find(p => p.name === playerName);
    if (me?.status === 'watching') {
      setErrorMsg('观战模式不能准备，请等本局结束');
      return;
    }
    const isReady = readyPlayers.includes(playerName);
    const newReady = isReady ? readyPlayers.filter(p => p !== playerName) : [...readyPlayers, playerName];
    setReadyPlayers(newReady);
    await broadcastAndSyncDB({
      spectators: spectators || [],
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
    });
  };

  // ==================== 开始游戏 ====================
  const startGame = async () => {
    if (phase !== "waiting") return;
    // 先从数据库拉最新房间，确保名单包含所有已加入者（避免本地名单过时漏人）
    const { data: latest } = await supabase.from("rooms").select("*").eq("id", roomId).single();
    const basePlayers = latest ? parsePlayers(latest.players) : players;
    const baseReady = latest ? (latest.readyplayers || []) : readyPlayers;
    const activeNow = basePlayers.filter(p => p.status !== 'watching');
    if (activeNow.length < 2) { setErrorMsg("至少2人才能开始"); return; }
    if (!activeNow.every(p => baseReady.includes(p.name))) { setErrorMsg("还有玩家未准备"); return; }

    const firstDealer = activeNow[0].name;
    const resetPlayers = basePlayers.map(p => ({
      ...p,
      cards: [],
      cardCount: 0,
      isStanding: false,
      isBust: false,
      isBlackjack: false,
      isFiveCard: false,
      bustType: 'none',
      isDealer: p.name === firstDealer,
      status: p.status === 'watching' ? 'watching' : 'playing',
    }));
    setPlayers(resetPlayers);
    setDealerId(firstDealer);
    setIsDealer(playerName === firstDealer);

    const newSeed = Math.floor(Math.random() * 1000000);
    setSeed(newSeed);
    setLocalDeck(createDeckWithSeed(newSeed));
    setDeckOffset(0);

    setPhase("dealing");
    setReadyPlayers([]);
    setShowMyCards(false);
    setMyCards([]);
    setMyCardCount(0);
    setMyBustType('none');

    await broadcastAndSyncDB({
      players: resetPlayers,
      spectators: spectators || [],
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
    });

    await dealCards(resetPlayers, firstDealer, newSeed);
  };

  // ==================== 发牌 ====================
  const dealCards = async (currentPlayers: any[], dealerName: string, seed: number) => {
    console.log('🃏 dealCards 被调用，玩家列表:', currentPlayers.map(p => p.name));

    const cleanPlayers = currentPlayers.map(p => ({
      ...p,
      cards: [],
      cardCount: 0,
      isStanding: false,
      isBust: false,
      isBlackjack: false,
      isFiveCard: false,
      bustType: 'none',
      status: p.status || 'playing',
    }));

    const deck = createDeckWithSeed(seed);
    let offset = 0;

    const newPlayers = cleanPlayers.map(p => {
      const cards = [deck[offset++], deck[offset++]];
      const isBj = isBlackjack(cards);
      return {
        ...p,
        cards,
        cardCount: cards.length,
        isBlackjack: isBj,
        isStanding: false,
        isBust: false,
        isFiveCard: false,
        bustType: 'none',
      };
    });

    setDeckOffset(offset);
    setPlayers(newPlayers);

    const me = newPlayers.find(p => p.name === playerName);
    if (me) {
      setMyCards(me.cards);
      setMyCardCount(me.cards.length);
      setMyBustType('none');
    }

    const dealer = newPlayers.find(p => p.name === dealerName);
    if (dealer && isBlackjack(dealer.cards)) {
      setGameOver(true);
      const resultMsg = `庄家黑杰克！所有玩家各喝 2 杯！`;
      setResult(resultMsg);
      const details = [
        {
          name: dealerName,
          cards: dealer.cards,
          result: '庄家黑杰克',
          penalty: 0,
          who: 'dealer'
        },
        ...newPlayers.filter(p => p.name !== dealerName).map(p => ({
          name: p.name,
          cards: p.cards,
          result: '庄家黑杰克，喝2杯',
          penalty: 2,
          who: 'all_players'
        }))
      ];
      setResultDetails(details);
      setPhase("waiting_for_dealer");
      await broadcastAndSyncDB({
        players: newPlayers,
        spectators: spectators || [],
        phase: "waiting_for_dealer",
        dealerId: dealerName,
        currentPlayerIndex: 0,
        gameOver: true,
        result: resultMsg,
        resultDetails: details,
        readyPlayers,
        settlementStep: 0,
        seed,
        deckOffset: offset,
        wheelVisible: false,
        wheelSelected: null,
        wheelSegments: [],
      });
      return;
    }

    const playerNames = newPlayers.map(p => p.name);
    const dealerIndex = playerNames.indexOf(dealerName);
    const firstIndex = (dealerIndex + 1) % playerNames.length;
    setCurrentPlayerIndex(firstIndex);
    setPhase("player_turn");
    setGameOver(false);

    await broadcastAndSyncDB({
      players: newPlayers,
      spectators: spectators || [],
      phase: "player_turn",
      dealerId: dealerName,
      currentPlayerIndex: firstIndex,
      gameOver: false,
      result: "",
      resultDetails: [],
      readyPlayers,
      settlementStep: 0,
      seed,
      deckOffset: offset,
      wheelVisible: false,
      wheelSelected: null,
      wheelSegments: [],
    });

    setPhase("player_turn");
    setGameOver(false);

    startTimeout();
  };

  // ==================== 超时 ====================
  const startTimeout = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      if (phase === "player_turn" && currentPlayer && currentPlayer.name === playerName) {
        console.log('⏰ 超时，自动停牌');
        handleStand(true);
      } else if (phase === "dealer_turn" && isDealer) {
        console.log('⏰ 超时，庄家自动停牌');
        handleDealerStand(true);
      }
    }, 30000);
  };

  // ==================== 玩家操作 ====================
  const handleHit = async () => {
  console.log('🔥 handleHit 被调用');
  // 玩家回合或庄家回合（庄家也自由拿牌，无17点限制）均可要牌
  if (phase !== "player_turn" && phase !== "dealer_turn") return;
  // 🔒 回合制：仅"当前玩家"(player_turn)或"庄家"(dealer_turn)可拿牌，杜绝多人同刻抽同一张牌导致重复
  if (phase === "player_turn") {
    const cur = players[currentPlayerIndex];
    if (cur && cur.name !== playerName) { setErrorMsg("还没轮到你拿牌"); return; }
  } else if (phase === "dealer_turn") {
    if (!isDealer) { setErrorMsg("庄家回合，你无法操作"); return; }
  }
  const pNow = playersRef.current;
  const me = pNow.find(p => p.name === playerName);
  if (!me) { console.warn('⛔ 找不到自己'); return; }
  if (me.status === 'watching') { console.warn('⛔ 观战模式，不能操作'); return; }
  if (me.isStanding) { console.warn('⛔ 已停牌'); return; }
  if (me.cardCount >= 5) { setErrorMsg("已达最大牌数5张"); return; }

  if (timeoutRef.current) {
    clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  }

  let deck = localDeck;
  let offset = deckOffsetRef.current;
  // 🔥 修改：牌堆用完则自动停牌，不再重新生成新牌堆
  if (deck.length === 0 || offset >= 52) {
    setErrorMsg("牌堆已用完，自动停牌");
    await handleStand(true);
    return;
  }

  const card = deck[offset];
  offset++;
  deckOffsetRef.current = offset;
  setDeckOffset(offset);
  const newCards = [...myCards, card];
  const newCount = newCards.length;
  const total = calculateHand(newCards);
  const isBustNow = total > 21;
  const isFive = newCount === 5 && total <= 21;
  const isFiveBust = newCount === 5 && total > 21;

  setMyCards(newCards);
  setMyCardCount(newCount);

  const updatedPlayers = pNow.map(p => {
    if (p.name === playerName) {
      const isBj = isBlackjack(newCards);
      return { ...p, cards: newCards, cardCount: newCount, isBlackjack: isBj, isFiveCard: isFive, isBust: isBustNow, bustType: isBustNow ? 'hidden' : 'none' };
    }
    return p;
  });
  setPlayers(updatedPlayers);

  if (newCount === 5) {
    if (isFive) setResult(`🎉 五小龙！`);
    else if (isFiveBust) setResult(`💥 第5张爆牌！`);

    const updatedPlayersWithStand = updatedPlayers.map(p => {
      if (p.name === playerName) {
        return { ...p, isStanding: true };
      }
      return p;
    });
    setPlayers(updatedPlayersWithStand);

    await broadcastAndSyncDB({
      players: updatedPlayersWithStand,
      spectators: spectators || [],
      phase,
      dealerId,
      currentPlayerIndex,
      gameOver,
      result,
      resultDetails,
      readyPlayers,
      settlementStep: 0,
      seed,
      deckOffset: offset,
      wheelVisible,
      wheelSelected,
      wheelSegments,
    });

    await handleStand(true);
    return;
  }

  await broadcastAndSyncDB({
    players: updatedPlayers,
    spectators: spectators || [],
    phase,
    dealerId,
    currentPlayerIndex,
    gameOver,
    result,
    resultDetails,
    readyPlayers,
    settlementStep: 0,
    seed,
    deckOffset: offset,
    wheelVisible,
    wheelSelected,
    wheelSegments,
  });
  startTimeout();
};

  const handleStand = async (auto: boolean = false) => {
    console.log('🔥 handleStand 被调用, auto:', auto);

    // 玩家回合或庄家回合（庄家也自由拿牌，无17点限制）均可停牌
    if (phase !== "player_turn" && phase !== "dealer_turn") return;

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    let allDone: boolean = false;
    let finalPlayers: any[] = [];

    setPlayers(prev => {
      const me = prev.find((p: any) => p.name === playerName);
      if (!me) {
        console.warn('⛔ 找不到自己');
        return prev;
      }
      if (me.status === 'watching') {
        console.warn('⛔ 观战模式，不能操作');
        return prev;
      }

      let updatedPlayers = prev;

      if (me.isStanding) {
          console.warn('⚠️ 已经停牌，忽略（但继续检查 allDone）');
      } else {
        updatedPlayers = prev.map((p: any) => {
          if (p.name === playerName) {
            const hasPrevCards = p.cards && p.cards.length > 0;
            const hasMyCards = myCards && myCards.length > 0;
            const cards = hasMyCards && !hasPrevCards ? myCards : (p.cards || []);
            const cardCount = hasMyCards && !hasPrevCards ? myCardCount : (p.cardCount || 0);
            return {
              ...p,
              cards: cards,
              cardCount: cardCount,
              isStanding: true,
              bustType: p.bustType || 'none',
              status: p.status || 'playing',
            };
          }
          return p;
        });
      }

      const allDoneNow = updatedPlayers
        .filter((p: any) => p.status === 'playing')
        .every((p: any) => p.isStanding || p.isBust || p.cardCount === 5);
      finalPlayers = updatedPlayers;
      allDone = allDoneNow;
      console.log('📊 allDone:', allDoneNow);

      return updatedPlayers;
    });

    await new Promise(resolve => setTimeout(resolve, 100));

    if (allDone) {
      console.log('✅ 所有人都已完成，直接结算');
      await settleGame(finalPlayers);
      return;
    }

    let next = (currentPlayerIndex + 1) % finalPlayers.length;
    let count = 0;
    while (count < finalPlayers.length) {
      const p = finalPlayers[next];
      if (p.status === 'playing' && !p.isStanding && !p.isBust && p.cardCount < 5) break;
      next = (next + 1) % finalPlayers.length;
      count++;
    }
    setCurrentPlayerIndex(next);
    await broadcastAndSyncDB({
      players: finalPlayers,
      spectators: spectators || [],
      phase,
      dealerId,
      currentPlayerIndex: next,
      gameOver,
      result,
      resultDetails,
      readyPlayers,
      settlementStep: 0,
      seed,
      deckOffset,
      wheelVisible,
      wheelSelected,
      wheelSegments,
    });
    if (finalPlayers[next]?.name === playerName) startTimeout();
  };

  const handleConfess = async () => {
    console.log('🔥 认罚');
    if (phase !== "player_turn") return;
    const pNow = playersRef.current;
    const me = pNow.find(p => p.name === playerName);
    if (!me || !me.isBust) return;
    if (me.status === 'watching') { console.warn('⛔ 观战模式，不能操作'); return; }

    const updatedPlayers = pNow.map(p => {
      if (p.name === playerName) {
        return { ...p, bustType: 'confessed', isStanding: true };
      }
      return p;
    });
    setPlayers(updatedPlayers);

    await handleStand(true);
  };

  // ==================== 退出本局 ====================
  const exitCurrentRound = async () => {
    setConfirmDialog({ show: true, message: '确定退出本局吗？退出后可在准备阶段重新加入。', callback: async () => {
      if (!roomId) return;
      const myCid = getOrCreateCid();
      const updatedPlayers = players.filter(p => !((p.cid && p.cid === myCid) || (!p.cid && p.name === playerName)));
      const updatedSpectators = [...(spectators || []), playerName];
      await supabase.from('rooms').update({ players: updatedPlayers, spectators: updatedSpectators }).eq('id', roomId);
      setPlayers(updatedPlayers);
      setSpectators(updatedSpectators);
      await broadcastAndSyncDB({ players: updatedPlayers, spectators: updatedSpectators, phase, dealerId, currentPlayerIndex, gameOver, result, resultDetails, readyPlayers, settlementStep: 0, seed, deckOffset, wheelVisible, wheelSelected, wheelSegments });
      setConfirmDialog({ show: false, message: '', callback: null });
      setErrorMsg('你已退出本局，进入观战模式。下一局可重新加入。');
    } });
  };

  // ==================== 重新加入 ====================
  const rejoinGame = async () => {
    if (!roomId) return;
    const updatedSpectators = (spectators || []).filter(n => n !== playerName);
    const { data: roomData } = await supabase
      .from('rooms')
      .select('players')
      .eq('id', roomId)
      .single();
    if (!roomData) return;
    const myCid = getOrCreateCid();
    const currentPlayers = parsePlayers(roomData.players);
    if (currentPlayers.length >= 12) {
      setErrorMsg('房间已满，无法加入'); return;
    }
    const newPlayer = {
      cid: myCid, lastSeen: Date.now(),
      name: playerName.trim(), cards: [], cardCount: 0,
      isStanding: false, isBust: false, isBlackjack: false,
      isFiveCard: false, seatId: currentPlayers.length,
      isDealer: false, bustType: 'none', status: 'playing',
    };
    const updatedPlayers = [...currentPlayers, newPlayer];
    await supabase.from('rooms').update({
      players: updatedPlayers,
      spectators: updatedSpectators,
    }).eq('id', roomId);
    setPlayers(updatedPlayers);
    setSpectators(updatedSpectators);
    await broadcastAndSyncDB({
      players: updatedPlayers,
      spectators: updatedSpectators,
      phase, dealerId, currentPlayerIndex, gameOver, result, resultDetails,
      readyPlayers, settlementStep: 0, seed, deckOffset,
      wheelVisible, wheelSelected, wheelSegments,
    });
    setErrorMsg('你已重新加入本局！');
  };

  // ==================== 庄家操作 ====================
  const handleDealerHit = async () => {
  console.log('🔥 handleDealerHit 被调用');
  if (phase !== "dealer_turn") return;
  if (gameOver) return;
  if (!isDealer) { console.warn('⛔ 你不是庄家'); return; }
  const pNow = playersRef.current;
  const dealer = pNow.find(p => p.name === dealerId);
  if (!dealer) return;
  if (dealer.cardCount >= 5) { setErrorMsg("已达最大牌数5张"); return; }

  if (timeoutRef.current) {
    clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  }

  let deck = localDeck;
  let offset = deckOffsetRef.current;
  // 🔥 修改：牌堆用完则自动停牌，不再重新生成新牌堆
  if (deck.length === 0 || offset >= 52) {
    setErrorMsg("牌堆已用完，庄家自动停牌");
    await handleDealerStand(true);
    return;
  }

  const card = deck[offset];
  offset++;
  deckOffsetRef.current = offset;
  setDeckOffset(offset);
  const newCards = [...dealer.cards, card];
  const newCount = newCards.length;
  const total = calculateHand(newCards);
  const isBustNow = total > 21;
  const isFive = newCount === 5 && total <= 21;
  const isFiveBust = newCount === 5 && total > 21;

  const updatedPlayers = pNow.map(p => {
    if (p.name === dealerId) {
      const isBj = isBlackjack(newCards);
      return { ...p, cards: newCards, cardCount: newCount, isBlackjack: isBj, isFiveCard: isFive, isBust: isBustNow, bustType: isBustNow ? 'hidden' : 'none' };
    }
    return p;
  });
  setPlayers(updatedPlayers);

  if (isBustNow) {
    setResult(`💥 庄家爆牌！`);
    await settleGame(updatedPlayers);
    return;
  }

  if (newCount === 5) {
    if (isFive) setResult(`🎉 庄家五小龙！`);
    else if (isFiveBust) setResult(`💥 庄家第5张爆牌！`);

    const updatedPlayersWithStand = updatedPlayers.map(p => {
      if (p.name === dealerId) {
        return { ...p, isStanding: true };
      }
      return p;
    });
    setPlayers(updatedPlayersWithStand);

    await broadcastAndSyncDB({
      players: updatedPlayersWithStand,
      spectators: spectators || [],
      phase,
      dealerId,
      currentPlayerIndex,
      gameOver,
      result,
      resultDetails,
      readyPlayers,
      settlementStep: 0,
      seed,
      deckOffset: offset,
      wheelVisible,
      wheelSelected,
      wheelSegments,
    });

    await settleGame(updatedPlayersWithStand);
    return;
  }

  await broadcastAndSyncDB({
    players: updatedPlayers,
    spectators: spectators || [],
    phase,
    dealerId,
    currentPlayerIndex,
    gameOver,
    result,
    resultDetails,
    readyPlayers,
    settlementStep: 0,
    seed,
    deckOffset: offset,
    wheelVisible,
    wheelSelected,
    wheelSegments,
  });
  startTimeout();
};

  const handleDealerStand = async (auto: boolean = false) => {
    console.log('🎯 handleDealerStand 被调用', auto);
    if (phase !== "dealer_turn") return;
    if (!isDealer) { console.warn('❌ 你不是庄家'); return; }
    if (!dealerId) { console.warn('❌ dealerId 为空'); return; }
    const me = playersRef.current.find(p => p.name === playerName);
    if (me?.status === 'watching') { console.warn('⛔ 观战模式，不能操作'); return; }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
    await settleGame(playersRef.current);
  };

  // ==================== 结算 ====================
  const settleGame = async (overridePlayers?: any[]) => {
    isSettlingRef.current = true;
    try {
    console.log('📊 settleGame 被调用, dealerId:', dealerId, 'players count:', players.length);
    console.log('📊 players:', players.map(p => ({ name: p.name, cardCount: p.cardCount, hasCards: !!p.cards, cardsLen: p.cards?.length, status: p.status })));

    const ps = overridePlayers && overridePlayers.length > 0 ? overridePlayers : players;
    console.log('📊 settleGame 使用 ps 数量:', ps.length);
    console.log('📊 ps 每个玩家牌数:', ps.map((p: any) => ({ name: p.name, cardCount: p.cardCount, cardsLen: p.cards?.length, status: p.status })));

    let effectiveDealerId = dealerId;
    if (!effectiveDealerId) {
      const found = ps.find((p: any) => p.isDealer);
      effectiveDealerId = found ? found.name : (ps.length > 0 ? ps[0].name : null);
      if (effectiveDealerId) {
        console.warn('⚠️ dealerId 自动补全为:', effectiveDealerId);
        setDealerId(effectiveDealerId);
      } else {
        console.error('❌ 无法找到庄家，强制结束');
        setPhase("waiting");
        setGameOver(true);
        setResult("游戏结束（无庄家）");
        await broadcastAndSyncDB({
          players: ps,
          spectators: spectators || [],
          phase: "waiting",
          dealerId: null,
          currentPlayerIndex,
          gameOver: true,
          result: "游戏结束（无庄家）",
          resultDetails: [],
          readyPlayers,
          settlementStep: 0,
          seed,
          deckOffset,
          wheelVisible: false,
          wheelSelected: null,
          wheelSegments: [],
        });
        return;
      }
    }

    const dealer = ps.find((p: any) => p.name === effectiveDealerId);
    if (!dealer) {
      console.warn('⚠️ 找不到庄家玩家，强制结束');
      setPhase("waiting");
      setGameOver(true);
      setResult("游戏结束（庄家已离开）");
      await broadcastAndSyncDB({
        players: ps,
        spectators: spectators || [],
        phase: "waiting",
        dealerId: effectiveDealerId,
        currentPlayerIndex,
        gameOver: true,
        result: "游戏结束（庄家已离开）",
        resultDetails: [],
        readyPlayers,
        settlementStep: 0,
        seed,
        deckOffset,
        wheelVisible: false,
        wheelSelected: null,
        wheelSegments: [],
      });
      return;
    }

    setPhase("waiting_for_dealer");
    setGameOver(true);

    const results: any[] = [];
    const activePlayers = ps.filter((p: any) => p.status === 'playing');
    const isDealerFive = isFiveCardCharlie(dealer.cards);
    const activeNonDealerPlayers = activePlayers.filter((p: any) => p.name !== effectiveDealerId);

    // 先统计庄家输赢情况
    let dealerWins = 0, dealerLosses = 0, dealerTies = 0;
    for (const player of activeNonDealerPlayers) {
      if (player.cardCount === 0 || !player.cards || player.cards.length === 0) continue;
      const cmp = compareHands(player.cards, dealer.cards);
      if (cmp === 1) dealerLosses++;
      else if (cmp === -1) dealerWins++;
      else dealerTies++;
    }

    let dealerResult = '';
    if (isBust(dealer.cards)) {
      // 庄家爆牌：不再误判为「平局」，杯数按"取最大一份"口径稍后回填
      dealerResult = '庄家爆牌';
    } else if (dealerLosses > 0 && dealerWins > 0) { dealerResult = '庄家输（部分赢）'; }
    else if (dealerLosses > 0) { dealerResult = '庄家输'; }
    else if (dealerWins > 0 && dealerTies === 0) dealerResult = '庄家赢';
    else if (dealerWins === 0 && dealerTies > 0 && dealerLosses === 0) dealerResult = '庄家平局';
    else if (dealerWins > 0 && dealerTies > 0) dealerResult = '庄家赢（部分平局）';
    else dealerResult = '庄家';

    // 庄家黑杰克且无任何闲家黑杰克 → 纯通杀（双黑杰克时庄家输，不算通杀）
    const dealerSweep = isBlackjack(dealer.cards) && !activeNonDealerPlayers.some((p: any) => p.cards && isBlackjack(p.cards));
    // 添加庄家自己的牌面（penalty 稍后按"取最大一份"口径回填）
    const dealerRecord: any = {
      name: dealer.name,
      cards: dealer.cards,
      result: dealerSweep ? '庄家黑杰克·通杀' : dealerResult,
      penalty: 0,
      who: 'dealer',
      sweep: dealerSweep
    };
    results.push(dealerRecord);

    for (const player of activeNonDealerPlayers) {
      if (player.cardCount === 0 || !player.cards || player.cards.length === 0) continue;

      const isPlayerFive = isFiveCardCharlie(player.cards);

      if (isPlayerFive && isDealerFive) {
        results.push({
          name: player.name,
          cards: player.cards,
          result: '双方五小龙，平局',
          penalty: 0,
          who: 'none'
        });
        continue;
      }

      if (player.cardCount === 5 && isBust(player.cards)) {
        results.push({ name: player.name, cards: player.cards, result: '第5张爆牌', penalty: 3, who: player.name });
        continue;
      }
      if (dealer.cardCount === 5 && isBust(dealer.cards)) {
        results.push({ name: player.name, cards: player.cards, result: '庄家第5张爆牌，玩家赢', penalty: 0, who: 'dealer', dealerPenalty: 3 });
        continue;
      }

      if (isPlayerFive) {
        results.push({ name: player.name, cards: player.cards, result: '五小龙！', penalty: 3, who: 'dealer' });
        continue;
      }
      if (isDealerFive) {
        results.push({ name: player.name, cards: player.cards, result: '庄家五小龙！', penalty: 3, who: 'all_players' });
        continue;
      }

      if (isBlackjack(player.cards)) {
        results.push({ name: player.name, cards: player.cards, result: '黑杰克！', penalty: 2, who: 'dealer' });
        continue;
      }
      if (isBlackjack(dealer.cards)) {
        results.push({ name: player.name, cards: player.cards, result: '庄家黑杰克！', penalty: 2, who: 'all_players' });
        continue;
      }

      if (isBust(player.cards)) {
        if (player.bustType === 'hidden') {
          if (isBust(dealer.cards)) {
            results.push({ name: player.name, cards: player.cards, result: '庄家想偷鸡，庄家爆，免罚', penalty: 0, who: 'dealer', dealerPenalty: 2 });
          } else {
            results.push({ name: player.name, cards: player.cards, result: '想偷鸡被爆', penalty: 2, who: player.name });
          }
        } else {
          results.push({ name: player.name, cards: player.cards, result: '认爆1杯', penalty: 1, who: player.name });
        }
        continue;
      }
      if (isBust(dealer.cards)) {
        results.push({ name: player.name, cards: player.cards, result: '庄家爆牌', penalty: 0, who: 'dealer', dealerPenalty: 2 });
        continue;
      }

      const cmp = compareHands(player.cards, dealer.cards);
      if (cmp === 1) {
        results.push({ name: player.name, cards: player.cards, result: '赢', penalty: 0, who: 'dealer', dealerPenalty: 1 });
      } else if (cmp === -1) {
        results.push({ name: player.name, cards: player.cards, result: '输', penalty: 1, who: player.name });
      } else {
        results.push({ name: player.name, cards: player.cards, result: '平局', penalty: 0, who: 'none' });
      }
    }

    // 按"取最大一份"口径回填庄家自己该喝的杯数：
    // 取所有让庄家喝酒的玩家记录中最大的一份（五小龙3 / 黑杰克2 / 普通比牌赢1 / 庄家爆玩家赢2 / 庄家第5张爆3）
    let dealerDrink = 0;
    for (const r of results) {
      if (r === dealerRecord) continue;
      if (r.who === 'dealer') {
        const dp = r.dealerPenalty !== undefined ? r.dealerPenalty : r.penalty;
        if (dp > dealerDrink) dealerDrink = dp;
      }
    }
    // 庄家爆牌兜底：第5张爆自罚 3 杯（与玩家第5张爆一致），普通爆自罚 2 杯
    const dealerBustFive = dealer.cards.length === 5 && isBust(dealer.cards);
    if (isBust(dealer.cards)) dealerDrink = Math.max(dealerDrink, dealerBustFive ? 3 : 2);
    dealerRecord.penalty = dealerDrink;

    setResultDetails(results);

    let playerResults: string[] = [];
    let maxDealerPenalty = 0;
    let maxDealerName = "";
    let hasDealerPenalty = false;

for (const r of results) {
  // 只有 r.name 是玩家且触发庄家罚杯时才计入（排除庄家自己的记录）
  if (r.who === 'dealer' && r.name !== dealerId) {
    const dealerPenalty = r.dealerPenalty !== undefined ? r.dealerPenalty : r.penalty;
    if (dealerPenalty > maxDealerPenalty) {
      maxDealerPenalty = dealerPenalty;
      maxDealerName = r.name;
    }
    hasDealerPenalty = true;
    playerResults.push(`${r.name} ${r.result}`);
  } else if (r.who === 'all_players') {
    playerResults.push(`${r.name} ${r.result}，所有玩家各喝 ${r.penalty} 杯`);
  } else if (r.who === 'none') {
    playerResults.push(`${r.name} ${r.result}，不喝`);
  } else {
    playerResults.push(`${r.name} ${r.result}，${r.name} 喝 ${r.penalty} 杯`);
  }
}

    let summary = "";
    if (playerResults.length > 0) {
      summary = playerResults.join("\n") + "\n";
    }
    if (hasDealerPenalty) {
      summary += `→ 庄家共喝 ${maxDealerPenalty} 杯（最高，由 ${maxDealerName} 触发）`;
    } else if (dealerRecord.penalty > 0) {
      // 全员认爆+庄家爆等场景：无 who:'dealer' 记录，但庄家自己 penalty 已含杯数，补打一致
      summary += `→ 庄家共喝 ${dealerRecord.penalty} 杯`;
    } else {
      summary = summary.trim();
    }

    if (!summary) {
      summary = "游戏结束（无结算结果）";
    }
    setResult(summary);

    console.log('✅ 结算结果:', summary);

    await broadcastAndSyncDB({
      players: ps,
      spectators: spectators || [],
      phase: "waiting_for_dealer",
      dealerId: effectiveDealerId,
      currentPlayerIndex,
      gameOver: true,
      result: summary,
      resultDetails: results,
      readyPlayers,
      settlementStep: 0,
      seed,
      deckOffset,
      wheelVisible: false,
      wheelSelected: null,
      wheelSegments: [],
    });

    setGameOver(true);
    setPlayers(ps);
    console.log('✅ 结算完成');
    } finally {
      isSettlingRef.current = false;
    }
  };

  // ==================== 抽牌选庄辅助函数 ====================
  const RANK_ORDER: Record<string, number> = { A: 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9, "10": 10, J: 11, Q: 12, K: 13 };
  const drawRankValue = (rank: string) => RANK_ORDER[rank] ?? 0;

  const unpackDrawCtrl = (raw: string | null): any => {
    try { return raw ? JSON.parse(raw) : null; } catch { return null; }
  };
  const unpackDrawCards = (raw: any): { name: string; card: any }[] => {
    try {
      if (typeof raw === "string") {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
        return [];
      }
      if (Array.isArray(raw)) return raw;
      return [];
    } catch {
      return [];
    }
  };
  const packDrawCtrl = (ctrl: any): string => JSON.stringify(ctrl);

  const currentDrawOwner = (): string | null => {
    const ctrl = unpackDrawCtrl(wheelSelected);
    return ctrl?.owner ?? null;
  };

  // 庄家选大/小 → 发牌 + 广播
  const chooseDrawRule = async (rule: "big" | "small") => {
    const owner = dealerId;
    if (!owner) {
      console.error('❌ chooseDrawRule: 没有庄家');
      return;
    }

    // 只从 status === 'playing' 的玩家中抽，观战者不参与
    const playingPlayers = players.filter(p => p.status === 'playing');
    if (playingPlayers.length < 2) {
      console.error('❌ chooseDrawRule: 活跃玩家不足2人', playingPlayers.length);
      return;
    }

    const newSeed = Math.floor(Math.random() * 1000000);
    const deck = createDeckWithSeed(newSeed);
    const cards: { name: string; card: any }[] = playingPlayers.map((p, idx) => ({
      name: p.name,
      card: deck[idx % deck.length]
    }));

    console.log('✅ chooseDrawRule 生成的 cards:', JSON.stringify(cards, null, 2));

    const now = Date.now();
    const ctrl = packDrawCtrl({
      owner,
      rule,
      seed: newSeed,
      deadline: now + 8000,
      revealed: [],
      winner: null,
    });

    setDrawRule(rule);
    setDrawCards(cards);
    setDrawRevealed(new Set<string>());
    setDrawSubPhase("reveal");
    setDrawDeadline(now + 8000);
    setDrawCountdown(8);
    setDrawOwner(owner);
    setDrawWinner(null);
    setWheelSelected(ctrl);
    setWheelSegments(JSON.stringify(cards));
    setWheelVisible(true);
    setPhase("wheel");
    drawTimeoutFiredRef.current = false;

    await broadcastAndSyncDB({
      spectators: spectators || [],
      players,
      phase: "wheel",
      dealerId,
      currentPlayerIndex,
      gameOver: true,
      result: `🃏 庄家选择了 ${rule === "big" ? "大庄" : "小庄"}，请亮牌！`,
      resultDetails,
      readyPlayers,
      settlementStep: 0,
      seed,
      deckOffset,
      wheelVisible: true,
      wheelSelected: ctrl,
      wheelSegments: JSON.stringify(cards),
    });
  };

  // 玩家亮牌
  const revealOwnCard = async () => {
    const me = drawCards.find(d => d.name === playerName);
    if (!me || drawRevealed.has(playerName)) return;

    const next = new Set(drawRevealed);
    next.add(playerName);
    setDrawRevealed(next);

    const ctrl = unpackDrawCtrl(wheelSelected);
    if (ctrl) {
      const newCtrl = packDrawCtrl({
        ...ctrl,
        revealed: Array.from(next),
      });
      setWheelSelected(newCtrl);

      await broadcastAndSyncDB({
      spectators: spectators || [],
        players,
        phase: "wheel",
        dealerId,
        currentPlayerIndex,
        gameOver: true,
        result,
        resultDetails,
        readyPlayers,
        settlementStep: 0,
        seed,
        deckOffset,
        wheelVisible: true,
        wheelSelected: newCtrl,
        wheelSegments,
      });
    }

    // 如果所有人都亮了，立即判定
    if (next.size === drawCards.length) {
      await handleDrawRevealTimeout();
    }
  };

  // 平局重抽 + 自动判定（已修复所有 bug）
  const handleDrawRevealTimeout = useCallback(async () => {
    // 保护1：drawCards 为空或格式不对
    if (!drawCards || drawCards.length === 0) {
      console.warn('⚠️ drawCards 为空，跳过判定');
      return;
    }

    // 保护2：检查每个元素是否有 name
    if (!drawCards.every(d => d?.name && d?.card)) {
      console.warn('⚠️ drawCards 数据格式不正确，跳过判定');
      return;
    }

    if (drawSubPhase !== "reveal") {
      console.warn('⚠️ 当前不是 reveal 阶段，跳过判定');
      return;
    }
    if (drawWinner) {
      console.warn('⚠️ 已有赢家，跳过判定');
      return;
    }

    // 所有人强制亮牌
    const allNames = drawCards.map(d => d.name);
    setDrawRevealed(new Set<string>(allNames));

    const rule = drawRule || "big";
    let targetVal = rule === "big" ? -1 : 999;
    const playerVals = drawCards.map(d => ({ name: d.name, val: drawRankValue(d.card.rank) }));

    for (const p of playerVals) {
      if (rule === "big" ? p.val > targetVal : p.val < targetVal) {
        targetVal = p.val;
      }
    }

    const tied = playerVals.filter(p => p.val === targetVal);

    // 保护3：tied 为空（理论上不会发生，但加了安全）
    if (tied.length === 0) {
      console.error('❌ 没有找到赢家，playerVals:', playerVals);
      return;
    }

    // 平局：只给平局者重抽，保持 reveal 状态，重置倒计时
    if (tied.length > 1) {
      const losers = drawCards.filter(d => drawRankValue(d.card.rank) !== targetVal);
      const tiedNames = tied.map(p => p.name);

      const newSeed = Math.floor(Math.random() * 1000000);
      const deck = createDeckWithSeed(newSeed);
      const newTiedCards = tiedNames.map((name, idx) => ({
        name,
        card: deck[idx % deck.length]
      }));

      const newCards = [...newTiedCards, ...losers];
      setDrawCards(newCards);
      setDrawRevealed(new Set<string>());
      setDrawWinner(null);

      const now = Date.now();
      const ctrl = unpackDrawCtrl(wheelSelected);
      const newCtrl = packDrawCtrl({
        ...ctrl,
        deadline: now + 8000,
        revealed: [],
        winner: null,
      });
      setWheelSelected(newCtrl);
      setWheelSegments(JSON.stringify(newCards));
      setDrawDeadline(now + 8000);
      setDrawCountdown(8);
      drawTimeoutFiredRef.current = false;

      // 平局重抽也要广播
      await broadcastAndSyncDB({
      spectators: spectators || [],
        players,
        phase: "wheel",
        dealerId,
        currentPlayerIndex,
        gameOver: true,
        result: `🔄 ${tiedNames.join('、')} 平局，重抽！`,
        resultDetails,
        readyPlayers,
        settlementStep: 0,
        seed,
        deckOffset,
        wheelVisible: true,
        wheelSelected: newCtrl,
        wheelSegments: JSON.stringify(newCards),
      });
      return;
    }

    // 唯一赢家
    const winner = tied[0].name;
    setDrawWinner(winner);
    setDrawSubPhase("done");

    const ctrl = unpackDrawCtrl(wheelSelected);
    const newCtrl = packDrawCtrl({
      ...ctrl,
      winner,
      revealed: allNames,
    });
    setWheelSelected(newCtrl);

    const cardDisplay = drawCards.map(d => {
      const card = d.card;
      const rankDisplay = card.rank === '10' ? '10' : card.rank;
      return `🂠 ${d.name}：${card.suit}${rankDisplay}`;
    }).join("\n");
    const resultMsg = `${cardDisplay}\n\n👑 ${winner} 成为新庄家！`;

    setResult(resultMsg);

    await broadcastAndSyncDB({
      spectators: spectators || [],
      players,
      phase: "waiting",
      dealerId: winner,
      currentPlayerIndex,
      gameOver: true,
      result: resultMsg,
      resultDetails,
      readyPlayers,
      settlementStep: 0,
      seed,
      deckOffset,
      wheelVisible: true,
      wheelSelected: newCtrl,
      wheelSegments,
      newDealerName: winner,
    });

    setTimeout(() => {
      if (winner) startNextRound(winner);
    }, 4000);
  }, [drawSubPhase, drawWinner, drawRule, drawCards, drawRevealed, wheelSelected, players, dealerId, currentPlayerIndex, resultDetails, readyPlayers, seed, deckOffset]);

  // 倒计时 useEffect
  useEffect(() => {
    if (drawDeadline === null || drawSubPhase !== "reveal") return;
    const timer = setInterval(() => {
      const left = Math.max(0, Math.ceil((drawDeadline - Date.now()) / 1000));
      setDrawCountdown(left);
      if (left === 0 && !drawTimeoutFiredRef.current) {
        drawTimeoutFiredRef.current = true;
        handleDrawRevealTimeout();
      }
    }, 250);
    return () => clearInterval(timer);
  }, [drawDeadline, drawSubPhase, handleDrawRevealTimeout]);

  // 兜底：只要不在抽庄阶段，强制关闭抽庄遮罩（防止迟到旧广播把遮罩卡在“等待庄家选择”）
  useEffect(() => {
    if (phase !== "wheel") setWheelVisible(false);
  }, [phase]);

  // 进入选庄阶段
  const enterDrawPhase = async () => {
    const owner = dealerId;
    if (!owner) return;

    setDrawOwner(owner);
    setDrawSubPhase("choose");
    setDrawRule(null);
    setDrawCards([]);
    setDrawRevealed(new Set<string>());
    setDrawWinner(null);
    setWheelVisible(true);
    setPhase("wheel");
    setWheelSelected(null);
    setWheelSegments([]);

    await broadcastAndSyncDB({
      spectators: spectators || [],
      players,
      phase: "wheel",
      dealerId,
      currentPlayerIndex,
      gameOver: true,
      result: "🎴 请庄家选择 大庄 或 小庄",
      resultDetails,
      readyPlayers,
      settlementStep: 0,
      seed,
      deckOffset,
      wheelVisible: true,
      wheelSelected: null,
      wheelSegments: [],
    });
  };

  // 兼容旧函数（保留，防止其他地方调用报错）
  const showWheel = async (currentPlayers: any[]) => { await enterDrawPhase(); };
  const spinWheel = async () => {};

  // ==================== 下一局 ====================
  const startNextRound = async (newDealerName: string) => {
    console.log('🔄 开始新一局，庄家:', newDealerName);

    setWheelVisible(false);
    setWheelSelected(null);
    setWheelSegments([]);
    setDrawRule(null);
    setDrawCards([]);
    setDrawRevealed(new Set<string>());
    setDrawSubPhase("choose");
    setDrawWinner(null);
    setDrawOwner(null);
    setPhase("dealing");
    setGameOver(false);
    setResult("");
    setResultDetails([]);
    setSettlementStep(0);
    setReadyPlayers([]);
    setShowMyCards(false);
    setMyCards([]);
    setMyCardCount(0);
    setMyBustType('none');

    const occupiedSeats = players.map(p => p.seatId).filter((id: number) => id !== undefined);
    const freeSeats: number[] = [];
    for (let i = 0; i < 12; i++) if (!occupiedSeats.includes(i)) freeSeats.push(i);
    // spectators 不参与游戏，保持观战状态
    const resetPlayers = players.map(p => ({
      ...p,
      cards: [],
      cardCount: 0,
      isStanding: false,
      isBust: false,
      isBlackjack: false,
      isFiveCard: false,
      isDealer: p.name === newDealerName,
      status: 'playing',
      bustType: 'none',
    }));
    setPlayers(resetPlayers);
    setSpectators([]);
    try { await supabase.from("rooms").update({ spectators: [] }).eq("id", roomId); } catch (_) {}
    setDealerId(newDealerName);
    setIsDealer(playerName === newDealerName);

    const newSeed = Math.floor(Math.random() * 1000000);
    setSeed(newSeed);
    setLocalDeck(createDeckWithSeed(newSeed));
    setDeckOffset(0);

    await broadcastAndSyncDB({
      players: resetPlayers,
      spectators: spectators || [],
      phase: "dealing",
      dealerId: newDealerName,
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
    });

    setPhase("dealing");
    setGameOver(false);

    await dealCards(resetPlayers, newDealerName, newSeed);
  };

  const resetGame = async () => {
    setGameOver(false);
    setResult("");
    setResultDetails([]);
    setPhase("waiting");
    setDealerId(null);
    setCurrentPlayerIndex(0);
    setMyCards([]);
    setMyCardCount(0);
    setMyBustType('none');
    setIsDealer(false);
    setSettlementStep(0);
    setReadyPlayers([]);
    setWheelVisible(false);
    setWheelSelected(null);
    setWheelSegments([]);
    setDrawRule(null);
    setDrawCards([]);
    setDrawRevealed(new Set<string>());
    setDrawSubPhase("choose");
    setDrawWinner(null);
    setDrawOwner(null);

    const newSeed = Math.floor(Math.random() * 1000000);
    const newDeck = createDeckWithSeed(newSeed);
    setSeed(newSeed);
    setLocalDeck(newDeck);
    setDeckOffset(0);

    const occupiedSeats = players.map(p => p.seatId).filter((id: number) => id !== undefined);
    const freeSeats: number[] = [];
    for (let i = 0; i < 12; i++) if (!occupiedSeats.includes(i)) freeSeats.push(i);
    // spectators 不参与游戏，保持观战状态
    const resetPlayers = players.map(p => ({
      ...p,
      cards: [],
      cardCount: 0,
      isStanding: false,
      isBust: false,
      isBlackjack: false,
      isFiveCard: false,
      isDealer: false,
      status: 'playing',
      bustType: 'none',
    }));
    setPlayers(resetPlayers);
    setSpectators([]);
    try { await supabase.from("rooms").update({ spectators: [] }).eq("id", roomId); } catch (_) {}

    await broadcastAndSyncDB({
      players: resetPlayers,
      spectators: [],
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
    });

    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  };

  // ==================== 座位渲染 ====================
  const renderBoard = () => {
    const isSettle = phase === "waiting_for_dealer";
    const isWaiting = phase === "waiting";
    const isMyTurnFlag = phase === "player_turn" && currentPlayer?.name === playerName && !gameOver;

    const dealerP = players.find((p) => p.isDealer) || players.find((p) => p.name === dealerId);
    const dealerRD = resultDetails.find((d) => d.name === dealerId);
    const dealerName = dealerRD?.name || dealerP?.name || dealerId || '';
    const dealerIsMe = dealerName === playerName;

    let dealerCards: any[] = [];
    let dealerPt = '';
    let dealerBj = false;
    let dealerBust = false;
    let dealerFive = false;
    if (isSettle && dealerRD?.cards) {
      dealerCards = dealerRD.cards;
      const total = calculateHand(dealerCards);
      dealerBj = isBlackjack(dealerCards);
      dealerBust = total > 21;
      dealerFive = dealerCards.length === 5 && total <= 21;
      dealerPt = dealerBj ? '黑杰克' : String(total);
    } else if (dealerP) {
      dealerPt = dealerP.cardCount > 0 ? dealerP.cardCount + '张' : '—';
    }

    const dealerCard = (
      <div style={{
        width: '100%', maxWidth: '360px', borderRadius: '14px', padding: '7px 11px',
        background: 'linear-gradient(160deg, rgba(255,210,122,0.12), rgba(46,12,34,0.5))',
        border: `1px solid ${dealerBj ? '#ffd27a' : 'rgba(255,210,122,0.35)'}`,
        boxShadow: dealerBj ? '0 0 24px rgba(255,210,122,0.3)' : 'none',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px'
      }}>
        <div style={{ fontSize: '11px', color: '#ffd27a', letterSpacing: '2px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
          <span style={{ fontSize: '13px' }}>👑</span>
          <span>庄家 {dealerIsMe ? '（你）' : dealerName}</span>
          {dealerBj && <span style={{ background: 'linear-gradient(120deg,#ffd27a,#d89a2a)', color: '#2a0820', fontSize: '10px', fontWeight: 800, padding: '1px 7px', borderRadius: '6px', letterSpacing: '1px', boxShadow: '0 0 12px rgba(255,210,122,0.6)' }}>黑杰克</span>}
          {dealerBust && <span style={{ background: 'rgba(255,90,122,0.2)', color: '#ff7a93', fontSize: '10px', fontWeight: 800, padding: '1px 7px', borderRadius: '6px', letterSpacing: '1px' }}>爆</span>}
          {dealerFive && <span style={{ background: 'rgba(120,170,255,0.2)', color: '#9ec4ff', fontSize: '13px', fontWeight: 800, padding: '1px 6px', borderRadius: '6px', letterSpacing: '1px' }}>🐉</span>}
          {isSettle && dealerRD && (
            <span style={{ background: (dealerRD.penalty > 0) ? 'rgba(255,90,122,0.2)' : 'rgba(91,224,138,0.18)', color: (dealerRD.penalty > 0) ? '#ff7a93' : '#7bf0a0', fontSize: '10px', fontWeight: 800, padding: '1px 7px', borderRadius: '6px', letterSpacing: '1px' }}>
              {dealerRD.penalty > 0 ? `庄家喝 ${dealerRD.penalty} 杯` : '庄家免喝'}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '9px', marginTop: '3px' }}>
          <div style={{ fontSize: '28px', fontWeight: 800, color: '#ffd27a', lineHeight: 1, textShadow: '0 0 16px rgba(255,210,122,0.5)', minWidth: '44px' }}>
            {dealerPt}<small style={{ fontSize: '12px', color: '#d9b9c8', fontWeight: 400 }}>{isSettle && !dealerBj ? '点' : ''}</small>
          </div>
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
            {isSettle && dealerCards.length > 0 ? (
              dealerCards.map((c, i) => <PokerCard key={i} card={c} hidden={false} size="dealer" />)
            ) : dealerP && dealerP.cardCount > 0 ? (
              Array.from({ length: dealerP.cardCount }).map((_, i) => (
                <div key={i} style={{ width: '22px', height: '31px', borderRadius: '4px', background: 'repeating-linear-gradient(45deg, #4a1230, #4a1230 4px, #5e1840 4px, #5e1840 8px)', border: '1px solid #ff9ec4' }} />
              ))
            ) : null}
          </div>
        </div>
      </div>
    );

    const myRD = resultDetails.find((d) => d.name === playerName);
    let myIcon = '🤝';
    let myBig = '';
    let mySub = '';
    let myWin = false;
    let myLose = false;
    if (isSettle && myRD) {
      if (playerName === dealerId) {
        // 我是庄家：看庄家自己的记录（penalty = 庄家该喝的杯数）
        if ((myRD as any).sweep) {
          myIcon = '🔥'; myBig = '通杀全场！'; mySub = '所有玩家各喝 2 杯'; myWin = true;
        } else {
          const cups = (myRD as any).penalty || 0;
          if (cups > 0) {
            myIcon = '😢'; myBig = `你这局 输 · 喝 ${cups} 杯`; mySub = myRD.result || ''; myLose = true;
          } else {
            myIcon = '🎉'; myBig = '你这局 赢 · 免喝'; mySub = myRD.result || ''; myWin = true;
          }
        }
      } else if (myRD.who === 'none') {
        myIcon = '🤝'; myBig = '你这局 平局 · 免喝'; mySub = myRD.result || '';
      } else if (myRD.who === 'dealer') {
        myIcon = '🎉'; myBig = '你这局 赢 · 免喝'; mySub = `你 ${calculateHand(myRD.cards)} > 庄家 ${dealerPt}`; myWin = true;
      } else if (myRD.who === 'all_players') {
        myIcon = '😢'; myBig = `你这局 输 · 喝 ${myRD.penalty || 0} 杯`; mySub = myRD.result || ''; myLose = true;
      } else if (myRD.penalty > 0) {
        myIcon = '😢'; myBig = `你这局 输 · 喝 ${myRD.penalty} 杯`; mySub = myRD.result || ''; myLose = true;
      } else {
        myIcon = '🎉'; myBig = '你这局 赢 · 免喝'; mySub = myRD.result || ''; myWin = true;
      }
    } else if (isMyTurnFlag) {
      myIcon = '🎯'; myBig = '轮到你了'; mySub = '请决定：要牌 或 停牌'; myWin = true;
    } else if (isWaiting) {
      myIcon = '⏳'; myBig = '等待开始'; mySub = players.length >= 2 ? `${readyPlayers.length}/${players.length} 已准备` : '至少2人';
    }

    const resultBar = myBig ? (
      <div style={{
        margin: '6px 0 2px', borderRadius: '12px', padding: '8px 14px',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', textAlign: 'center',
        background: myWin ? 'linear-gradient(120deg, rgba(91,224,138,0.18), rgba(255,210,122,0.1))' : (myLose ? 'linear-gradient(120deg, rgba(255,90,122,0.18), rgba(255,210,122,0.1))' : 'linear-gradient(120deg, rgba(255,90,122,0.18), rgba(255,210,122,0.1))'),
        border: `1px solid ${myWin ? 'rgba(123,240,160,0.5)' : (myLose ? 'rgba(255,90,122,0.6)' : 'rgba(255,210,122,0.4)')}`,
        boxShadow: '0 0 14px rgba(255,90,122,0.12)'
      }}>
        <span style={{ fontSize: '22px', lineHeight: 1, marginBottom: '1px' }}>{myIcon}</span>
        <span style={{ fontSize: '13.5px', fontWeight: 800, color: myWin ? '#7bf0a0' : (myLose ? '#ff7a93' : '#ffd9e6') }}>{myBig}</span>
        {mySub && <span style={{ fontSize: '11px', color: '#d9b9c8', marginTop: '2px' }}>{mySub}</span>}
      </div>
    ) : null;

    const vs = (
      <div style={{
        width: '100%', textAlign: 'center', margin: '10px 0', fontSize: '12px', letterSpacing: '4px', color: '#ff7a93',
        display: 'flex', alignItems: 'center', gap: '10px'
      }}>
        <span style={{ flex: 1, height: '1px', background: 'linear-gradient(90deg, transparent, rgba(255,122,147,0.5), transparent)' }}></span>
        <span>VS</span>
        <span style={{ flex: 1, height: '1px', background: 'linear-gradient(90deg, transparent, rgba(255,122,147,0.5), transparent)' }}></span>
      </div>
    );

    const others = (isSettle
      ? resultDetails.filter((d) => d.name !== dealerName)
      : players.filter((p) => p.name !== dealerName)
    ).slice().sort((a: any, b: any) => ((a.seatId ?? 0) - (b.seatId ?? 0)) || (a.name || '').localeCompare(b.name || ''));

    const grid = (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(108px, 1fr))', gap: '7px', width: '100%' }}>
        {others.map((p, idx) => {
          const isMe = p.name === playerName;
          const isDealer = p.name === dealerId || p.isDealer;
          const isActive = phase === "player_turn" && p.name === currentPlayer?.name && !gameOver;
          const isWatching = p.status === 'watching';
          const avatar = (p.name || '？')[0];

          let cards: any[] = [];
          let total = '';
          let badge = '';
          let badgeClass = '';
          let specialIcon = '';   // 结算特殊牌型图标（纯图标，放在结论徽章旁）
          let specialClass = '';
          let cupTxt = '';
          let cupColor = '#d9b9c8';
          if (isSettle) {
            cards = (p as any).cards || [];
            const rawTotal = calculateHand(cards);
            total = isBlackjack(cards) ? '黑杰克' : String(rawTotal);
            // 网格是公共视图：所有人只看「赢/输/平局」结论，不写喝几杯（喝几杯只在各自顶部那行大字显示）
            if (p.who === 'all_players') { badge = '输'; badgeClass = 'b-lose'; }
            else if (p.who === 'dealer') { badge = '赢'; badgeClass = 'b-stand'; }
            else if (p.who === 'none') { badge = '平局'; badgeClass = 'b-wait'; }
            else {
              const win = (p.result || '').includes('赢') || p.penalty === 0;
              badge = win ? '赢' : '输'; badgeClass = win ? 'b-stand' : 'b-lose';
            }
            // 特殊牌型图标（用户选纯图标 B 方案；爆了统一 💥）
            // 从"玩家自己的牌"推导，避免把描述庄家的文字(如"庄家爆牌")误贴到玩家格
            const myCards = (p as any).cards || [];
            if (isFiveCardCharlie(myCards)) { specialIcon = '🐉'; specialClass = 's-drag'; }
            else if (isBust(myCards)) { specialIcon = '💥'; specialClass = 's-bust'; }
            else if (isBlackjack(myCards)) { specialIcon = '♠'; specialClass = 's-bj'; }
            // 杯数：仅结算显示（广播给所有人）。该玩家实际喝的杯数：
            // who==='dealer' → 玩家赢、庄家喝，该玩家免喝；who==='none' → 平局免喝；
            // who==='all_players' → 庄家特殊牌型，所有玩家各喝 penalty；其余 → 玩家输/认爆/偷鸡，喝 penalty
            let cups = 0;
            if (p.who === 'dealer' || p.who === 'none') cups = 0;
            else cups = p.penalty || 0;
            cupTxt = cups > 0 ? `喝 ${cups} 杯` : '免喝';
            cupColor = cups > 0 ? '#ff7a93' : '#7bf0a0';
          } else {
            total = p.cardCount > 0 ? String(p.cardCount) : '—';
            if (isMe) {
              // 自己的牌自己看得到牌型
              if (p.isBust) { badge = '爆'; badgeClass = 'b-bust'; }
              else if (p.isFiveCard) { badge = '五小龙'; badgeClass = 'b-drag'; }
              else if (p.isBlackjack && showMyCards) { badge = '♠'; badgeClass = 'b-bj'; }
              else if (p.isStanding) { badge = '停牌'; badgeClass = 'b-stand'; }
              else if (isActive) { badge = '你的回合'; badgeClass = 'b-stand'; }
              else if (isWatching) { badge = '观战'; badgeClass = 'b-wait'; }
              else if (readyPlayers.indexOf(p.name) >= 0 && isWaiting) { badge = '已准备'; badgeClass = 'b-stand'; }
              else { badge = '等待'; badgeClass = 'b-wait'; }
            } else {
              // 暗牌制：别人看不到你的牌型（爆/五小龙/黑杰克），只显示公开动作与状态
              if (p.isStanding) { badge = '停牌'; badgeClass = 'b-stand'; }
              else if (isActive) { badge = '他的回合'; badgeClass = 'b-stand'; }
              else if (isWatching) { badge = '观战'; badgeClass = 'b-wait'; }
              else if (readyPlayers.indexOf(p.name) >= 0 && isWaiting) { badge = '已准备'; badgeClass = 'b-stand'; }
              else { badge = '等待'; badgeClass = 'b-wait'; }
            }
          }

          const badgeStyle = badgeClass === 'b-stand' ? { background: 'rgba(91,224,138,0.18)', color: '#7bf0a0' } :
            badgeClass === 'b-bust' ? { background: 'rgba(255,90,122,0.2)', color: '#ff7a93' } :
            badgeClass === 'b-lose' ? { background: 'rgba(255,90,122,0.2)', color: '#ff7a93' } :
            badgeClass === 'b-bj' ? { background: 'rgba(255,210,122,0.2)', color: '#ffd27a' } :
            badgeClass === 'b-drag' ? { background: 'rgba(120,170,255,0.2)', color: '#9ec4ff' } :
            { background: 'rgba(255,255,255,0.1)', color: '#b89aaa' };

          return (
            <div key={p.name || idx} style={{
              background: 'rgba(20,6,16,0.6)', borderRadius: '11px', padding: '4px', position: 'relative',
              border: `1px solid ${isMe ? '#ff5a7a' : (isActive ? '#ffd27a' : 'rgba(255,255,255,0.1)')}`,
              boxShadow: isMe ? '0 0 0 1px rgba(255,90,122,0.4), 0 0 16px rgba(255,90,122,0.2)' : (isActive ? '0 0 0 1px rgba(255,210,122,0.5)' : 'none')
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <div style={{ width: '18px', height: '18px', borderRadius: '50%', background: 'linear-gradient(160deg,#ff5a7a,#a0204a)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700, color: '#fff', flexShrink: 0 }}>{avatar}</div>
                <div style={{ fontSize: '11px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, flex: 1, color: isMe ? '#f0a8c4' : '#ddd' }}>
                  {isMe ? '你' : p.name}
                  {isDealer && <span style={{ fontSize: '10px', color: '#ffd27a' }}> 👑</span>}
                </div>
                {badge && <span style={{ display: 'inline-block', padding: '1px 5px', borderRadius: '6px', fontSize: '9px', fontWeight: 700, flexShrink: 0, ...badgeStyle }}>{badge}</span>}
                {specialIcon && (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    width: '16px', height: '14px', borderRadius: '6px', fontSize: '10px', lineHeight: 1,
                    background: specialClass === 's-drag' ? 'rgba(120,170,255,0.22)' : specialClass === 's-bust' ? 'rgba(255,90,122,0.22)' : 'rgba(255,210,122,0.22)',
                    color: specialClass === 's-drag' ? '#9ec4ff' : specialClass === 's-bust' ? '#ff7a93' : '#ffd27a'
                  }}>{specialIcon}</span>
                )}
                <div style={{ marginLeft: 'auto', fontSize: total === '黑杰克' ? '11px' : '18px', fontWeight: 800, color: '#ffd9e6', lineHeight: 1 }}>
                  {total}<span style={{ fontSize: '10px', color: '#d9b9c8' }}>{isSettle && total !== '黑杰克' ? '点' : (!isSettle && total !== '—' ? '张' : '')}</span>
                </div>
                {isSettle && cupTxt && (
                  <span style={{ fontSize: '10px', fontWeight: 700, padding: '1px 5px', borderRadius: '6px', flexShrink: 0, marginLeft: '2px',
                    background: cupColor === '#ff7a93' ? 'rgba(255,90,122,0.2)' : 'rgba(91,224,138,0.18)',
                    color: cupColor }}>{cupTxt}</span>
                )}
              </div>
              <div style={{ display: 'flex', gap: '2px', flexWrap: 'nowrap', marginTop: '2px', justifyContent: 'center' }}>
                {isSettle && cards.length > 0 ? (
                  cards.map((c, i) => <PokerCard key={i} card={c} hidden={false} size="tiny" />)
                ) : (
                  p.cardCount > 0 && !isSettle ? (
                    Array.from({ length: p.cardCount }).map((_, i) => (
                      <div key={i} style={{ width: '28px', height: '40px', borderRadius: '4px', background: 'repeating-linear-gradient(45deg, #4a1230, #4a1230 4px, #5e1840 4px, #5e1840 8px)', border: '1px solid #ff9ec4' }} />
                    ))
                  ) : null
                )}
              </div>
            </div>
          );
        })}
      </div>
    );

    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', gap: '8px' }}>
        {dealerCard}
        {resultBar}
        {vs}
        {grid}
      </div>
    );
  };

  // ==================== 登录界面 ====================
  if (!joined) {
    return (
      <div style={styles.container}>
        <div style={styles.glowOrb}></div>
        <div style={styles.glowOrb2}></div>
        <div style={styles.card}>
          <div style={styles.logo}>🃏</div>
          <h1 style={styles.title}>黑杰克</h1>
          <p style={styles.subtitle}>酒桌21点 · 暗牌经典</p>
          <input placeholder="👤 输入你的名字" value={playerName} onChange={(e) => setPlayerName(e.target.value)} style={styles.input} />
          <input placeholder="🔐 房间密码（设置或加入）" value={roomPassword} onChange={(e) => setRoomPassword(e.target.value)} style={styles.input} />
          <div style={styles.btnGroup}>
            <button onClick={createRoom} style={styles.btnPrimary}>🆕 创建房间</button>
            <button onClick={joinRoom} style={styles.btnSecondary}>🔗 加入房间</button>
          </div>
          {errorMsg && <div style={{ color: "#f87171", marginTop: 12, fontSize: 14 }}>{errorMsg}</div>}
          {disconnected && <div style={{ color: "#f87171", marginTop: 8, fontSize: 14 }}>⚠️ 网络连接断开，请检查网络</div>}
        </div>
      </div>
    );
  }

  // ==================== 游戏主界面 ====================
  const isMyTurn = phase === "player_turn" && currentPlayer?.name === playerName && !gameOver;
  const isDealerTurn = phase === "dealer_turn" && isDealer && !gameOver;
  const myPlayer = getMyPlayer();

  return (
        <div style={styles.container}>
      {showRules && (
        <div onClick={() => setShowRules(false)} style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(15,3,11,0.82)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '16px' }}>
          <div onClick={(e: any) => e.stopPropagation()} style={{ position: 'relative', width: '100%', maxWidth: '420px', maxHeight: '82vh', overflowY: 'auto', background: 'linear-gradient(160deg, #2a0f24, #1a0512)', borderRadius: '20px', border: '1px solid rgba(240,168,196,0.4)', boxShadow: '0 0 60px rgba(180,60,110,0.35)', padding: '22px 20px' }}>
            <button onClick={() => setShowRules(false)} style={{ position: 'absolute', top: '10px', right: '12px', background: 'transparent', border: 'none', color: '#f0a8c4', fontSize: '20px', cursor: 'pointer', lineHeight: 1 }}>✕</button>
            <div style={{ color: '#f7d3e0', fontSize: '20px', fontWeight: 800, textAlign: 'center', marginBottom: '2px' }}>📖 黑杰克玩法</div>
            <div style={{ color: 'rgba(235,195,215,0.5)', fontSize: '12px', textAlign: 'center', marginBottom: '16px' }}>酒桌 21 点</div>
            {[
              ['🎯 目标', '手牌凑到尽量接近 21 点'],
              ['🃏 点数', '2~10 按牌面，J/Q/K 算 10，A 算 11 或 1'],
              ['🎮 你的回合', '可以「要牌」「停牌」'],
              ['💥 爆了怎么罚', '认爆喝 1 杯；偷鸡（装没爆）：庄家也爆→你免罚、庄家喝 2 杯，庄家没爆→你喝 2 杯；硬凑第 5 张爆了（五小龙失败）喝 3 杯'],
              ['👑 王炸', '黑杰克(10/J/Q/K + A) 或 五小龙(5 张不爆，不超过 21 点)'],
              ['⚖️ 比大小', '五小龙 > 黑杰克 > 没爆的 > 比点数 > 同点比张数(少者胜) > 真平局都不喝'],
              ['🍺 谁喝', '庄家黑杰克→闲家各 2 杯；玩家黑杰克→庄家 2 杯；五小龙同理 3 杯；普通比牌输家 1 杯。庄家罚酒取玩家最大的：有五小龙喝 3 杯，有黑杰克喝 2 杯，正常喝 1 杯'],
            ].map((row: any, i: number) => (
              <div key={i} style={{ marginBottom: '12px', paddingBottom: '12px', borderBottom: i < 6 ? '1px solid rgba(240,168,196,0.12)' : 'none' }}>
                <div style={{ color: '#f0a8c4', fontSize: '14px', fontWeight: 700, marginBottom: '3px' }}>{row[0]}</div>
                <div style={{ color: 'rgba(243,212,224,0.85)', fontSize: '13px', lineHeight: 1.5 }}>{row[1]}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      <div style={styles.glowOrb}></div>
      <div style={styles.glowOrb2}></div>

      <div style={styles.tableContainer} className="table-container">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', gap: '8px', paddingBottom: '8px' }}>
          {renderBoard()}
          {/* ====== 中央区域（已改由 renderBoard 统一渲染，旧绝对定位遮罩块整段停用，避免重叠） ====== */}
          <div style={{ display: 'none' }}>
            {(false) ? (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'center', width: '100%', fontSize: '11px' }}>
    {/* 庄家行：只显示 dealerId 对应的真正庄家 */}
    {resultDetails.find(d => d.name === dealerId) && (() => {
      const d = resultDetails.find(d => d.name === dealerId)!;
      const cards = d.cards || [];
      const total = calculateHand(cards);
      const isBust = total > 21;
      const isFive = cards.length === 5 && total <= 21;
      const isBj = isBlackjack(cards);
      const displayTotal = isBj ? '黑杰克' : total;
      let icon = '';
      if (isBust) icon = '💥';
      else if (isFive) icon = '🐉';
      else if (isBj) icon = '♠';
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'linear-gradient(120deg, rgba(214,140,170,0.22), rgba(255,210,122,0.12))', padding: '6px 12px', borderRadius: '10px', flexWrap: 'wrap', justifyContent: 'center', border: '1px solid rgba(255,210,122,0.4)', boxShadow: '0 0 14px rgba(214,140,170,0.25)', fontSize: '12px' }}>
          <span style={{ fontWeight: 'bold', color: '#f0a8c4' }}>庄家 {d.name}</span>
          <span style={{ color: '#ddd' }}>
            {cards.map((c: any, i: number) => {
              const isRed = c.suit === '♥' || c.suit === '♦';
              const color = isRed ? '#ff8aa8' : '#c9a9d6';
              return <span key={i} style={{ margin: '0 1px', fontWeight: 700, color }}>{c.rank}{c.suit}</span>;
            })}
          </span>
          <span style={{ color: '#aaa' }}>点数：{displayTotal}</span>
          {icon && <span style={{ fontSize: '14px' }}>{icon}</span>}
        </div>
      );
    })()}

    {/* 分割线 */}
    <div style={{ width: '80%', height: '1px', background: 'rgba(255,255,255,0.12)', margin: '2px 0' }} />

    {/* 玩家列表：排除真正庄家 */}
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'center', width: '100%' }}>
      {resultDetails.filter(d => d.name !== dealerId).map((d, idx) => {
        const cards = d.cards || [];
        const total = calculateHand(cards);
        const isBust = total > 21;
        const isFive = cards.length === 5 && total <= 21;
        const isBj = isBlackjack(cards);
        const displayTotal = isBj ? '黑杰克' : total;
        let icon = '';
        if (isBust) icon = '💥';
        else if (isFive) icon = '🐉';
        else if (isBj) icon = '♠';
        return (
          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.05)', padding: '3px 10px', borderRadius: '6px', flexWrap: 'wrap', justifyContent: 'center', fontSize: '11px' }}>
            <span style={{ fontWeight: 'bold', color: '#fff' }}>{d.name}</span>
            <span style={{ color: '#ddd' }}>
              {cards.map((c: any, i: number) => {
                const isRed = c.suit === '♥' || c.suit === '♦';
                const color = isRed ? '#ff8aa8' : '#c9a9d6';
                return <span key={i} style={{ margin: '0 1px', fontWeight: 700, color }}>{c.rank}{c.suit}</span>;
              })}
            </span>
            <span style={{ color: 'rgba(235,195,215,0.6)' }}>点数：{displayTotal}</span>
            {icon && <span style={{ fontSize: '14px' }}>{icon}</span>}
          </div>
        );
      })}
    </div>
  </div>
) : (
              // ===== 游戏进行中 =====
              <>
                {dealerId ? (() => {
                  const dealer = players.find(p => p.name === dealerId);
                  if (!dealer) return null;
                  const otherPlayers = players.filter(p => p.name !== dealerId);
                  const allPlayers = [dealer, ...otherPlayers];
                  return allPlayers.map((p, idx) => {
                    const isDealer = p.name === dealerId;
                    const isMe = p.name === playerName;
                    const hasCards = p.cards && p.cards.length > 0;
                    const isSettlement = phase === "waiting_for_dealer";
                    const displayName = p.name.length > 6 ? p.name.slice(0, 6) + '..' : p.name;

                    return (
                      <div key={p.name}>
                        {idx === 1 && (
                          <div style={{
                            width: '100%',
                            height: '1px',
                            background: 'rgba(255,255,255,0.15)',
                            margin: '2px 0 3px 0',
                          }} />
                        )}
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          justifyContent: 'center',
                          flexWrap: 'wrap' as const,
                          padding: '1px 4px',
                          borderRadius: '4px',
                          background: isMe ? 'rgba(214,140,170,0.08)' : 'transparent',
                        }}>
                          <span style={{
                            fontSize: '11px',
                            fontWeight: isMe ? 'bold' : 'normal',
                            color: isMe ? '#f0a8c4' : '#ddd',
                            minWidth: '40px',
                            textAlign: 'right' as const,
                            whiteSpace: 'nowrap' as const,
                          }}>
                            {isMe ? '你' : displayName}
                            {isDealer && <span style={{ color: '#f0a8c4', fontSize: '10px', marginLeft: '1px' }}>（庄家）</span>}
                          </span>
                          <div style={{
                            display: 'flex',
                            gap: '2px',
                            flexWrap: 'wrap' as const,
                            justifyContent: 'flex-start',
                          }}>
                            {hasCards ? (
                              p.cards.map((card: any, idx2: number) => {
                                if (!isSettlement) {
                                  return (
                                    <span key={idx2} style={{
                                      display: 'inline-block',
                                      width: '14px',
                                      height: '20px',
                                      fontSize: '10px',
                                      borderRadius: '3px',
                                      backgroundColor: '#2a0f1f',
                                      backgroundImage: `repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(240,168,196,0.14) 3px, rgba(240,168,196,0.14) 4px), repeating-linear-gradient(-45deg, transparent, transparent 3px, rgba(240,168,196,0.14) 3px, rgba(240,168,196,0.14) 4px), radial-gradient(circle at 50% 50%, rgba(240,168,196,0.35) 0%, rgba(240,168,196,0.35) 2px, transparent 2px), linear-gradient(135deg, #2a0f1f, #3a152a)`,
                                      border: '1px solid rgba(240,168,196,0.35)',
                                      boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)',
                                      color: 'transparent',
                                      overflow: 'hidden',
                                      verticalAlign: 'middle',
                                      textAlign: 'center',
                                    }}>🂠</span>
                                  );
                                } else {
                                  const isRed = card.suit === '♥' || card.suit === '♦';
                                  const color = isRed ? '#ff8aa8' : '#c9a9d6';
                                  const rankDisplay = card.rank === '10' ? '10' : card.rank;
                                  return (
                                    <span key={idx2} style={{
                                      fontSize: '15px',
                                      fontWeight: '700',
                                      color: color,
                                      background: 'rgba(255,255,255,0.06)',
                                      borderRadius: '3px',
                                      padding: '0 3px',
                                      minWidth: '20px',
                                      textAlign: 'center',
                                      fontFamily: '"Segoe UI", "Helvetica Neue", "Apple Color Emoji", system-ui, sans-serif',
                                    }}>
                                      {rankDisplay}{card.suit}
                                    </span>
                                  );
                                }
                              })
                            ) : (
                              <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.15)' }}>—</span>
                            )}
                          </div>
                          <div style={{
                            display: 'flex',
                            gap: '1px',
                            fontSize: '9px',
                            minWidth: '16px',
                          }}>
                            {p.isStanding && !isSettlement && <span style={{ color: '#e879a8' }}>✅</span>}
                            {p.isBlackjack && isSettlement && <span style={{ color: '#f0a8c4' }}>♠</span>}
                          </div>
                        </div>
                      </div>
                    );
                  });
                })() : (
                  players.map((p, idx) => {
                    const isMe = p.name === playerName;
                    const hasCards = p.cards && p.cards.length > 0;
                    const isSettlement = phase === "waiting_for_dealer";
                    const displayName = p.name.length > 6 ? p.name.slice(0, 6) + '..' : p.name;

                    return (
                      <div key={p.name}>
                        {idx === 1 && (
                          <div style={{
                            width: '100%',
                            height: '1px',
                            background: 'rgba(255,255,255,0.15)',
                            margin: '2px 0 3px 0',
                          }} />
                        )}
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          justifyContent: 'center',
                          flexWrap: 'wrap' as const,
                          padding: '1px 4px',
                          borderRadius: '4px',
                          background: isMe ? 'rgba(214,140,170,0.08)' : 'transparent',
                        }}>
                          <span style={{
                            fontSize: '11px',
                            fontWeight: isMe ? 'bold' : 'normal',
                            color: isMe ? '#f0a8c4' : '#ddd',
                            minWidth: '40px',
                            textAlign: 'right' as const,
                            whiteSpace: 'nowrap' as const,
                          }}>
                            {isMe ? '你' : displayName}
                            {p.status === 'watching' && <span style={{ color: '#888', fontSize: '10px', marginLeft: '2px' }}>（观战）</span>}
                          </span>
                          <div style={{
                            display: 'flex',
                            gap: '2px',
                            flexWrap: 'wrap' as const,
                            justifyContent: 'flex-start',
                          }}>
                            {hasCards ? (
                              p.cards.map((card: any, idx2: number) => {
                                if (!isSettlement) {
                                  return (
                                    <span key={idx2} style={{
                                      display: 'inline-block',
                                      width: '14px',
                                      height: '20px',
                                      fontSize: '10px',
                                      borderRadius: '3px',
                                      backgroundColor: '#2a0f1f',
                                      backgroundImage: `repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(240,168,196,0.14) 3px, rgba(240,168,196,0.14) 4px), repeating-linear-gradient(-45deg, transparent, transparent 3px, rgba(240,168,196,0.14) 3px, rgba(240,168,196,0.14) 4px), radial-gradient(circle at 50% 50%, rgba(240,168,196,0.35) 0%, rgba(240,168,196,0.35) 2px, transparent 2px), linear-gradient(135deg, #2a0f1f, #3a152a)`,
                                      border: '1px solid rgba(240,168,196,0.35)',
                                      boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)',
                                      color: 'transparent',
                                      overflow: 'hidden',
                                      verticalAlign: 'middle',
                                      textAlign: 'center',
                                    }}>🂠</span>
                                  );
                                } else {
                                  const isRed = card.suit === '♥' || card.suit === '♦';
                                  const color = isRed ? '#A32D2D' : '#2C2C2A';
                                  const rankDisplay = card.rank === '10' ? '10' : card.rank;
                                  return (
                                    <span key={idx2} style={{
                                      fontSize: '15px',
                                      fontWeight: '700',
                                      color: color,
                                      background: 'rgba(255,255,255,0.06)',
                                      borderRadius: '3px',
                                      padding: '0 3px',
                                      minWidth: '20px',
                                      textAlign: 'center',
                                      fontFamily: '"Segoe UI", "Helvetica Neue", "Apple Color Emoji", system-ui, sans-serif',
                                    }}>
                                      {rankDisplay}{card.suit}
                                    </span>
                                  );
                                }
                              })
                            ) : (
                              <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.15)' }}>—</span>
                            )}
                          </div>
                          <div style={{
                            display: 'flex',
                            gap: '1px',
                            fontSize: '9px',
                            minWidth: '16px',
                          }}>
                            {p.isStanding && !isSettlement && <span style={{ color: '#e879a8' }}>✅</span>}
                            {p.isBust && !isSettlement && <span style={{ color: '#ef4444' }}>💥</span>}
                            {p.isFiveCard && !isSettlement && <span style={{ color: '#f0a8c4' }}>🐉</span>}
                            {p.isBlackjack && !isSettlement && <span style={{ color: '#f0a8c4' }}>♠</span>}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </>
            )}
          </div>

          {/* 房间信息 */}
          <div style={styles.roomInfo}>
            <span style={{ display: 'flex', gap: '8px', alignItems: 'center', minWidth: 0 }}>
              <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#5fd38a', boxShadow: '0 0 6px #5fd38a', flex: 'none' }}></span>
              <span>{players.length} 人在玩</span>
              {dealerId && <span style={{ color: '#ffd27a' }}>庄家：{dealerId}</span>}
              {phase === "player_turn" && currentPlayer && <span style={{ color: '#f0a8c4', fontSize: '11px', whiteSpace: 'nowrap' }}>🎯 {currentPlayer.name}</span>}
            </span>
            <span style={{ display: 'flex', gap: '8px', alignItems: 'center', flex: 'none' }}>
              <button onClick={() => setShowRules(true)} style={{ background: 'transparent', border: '1px solid rgba(240,168,196,0.5)', color: '#f0a8c4', fontSize: '12px', borderRadius: '10px', padding: '3px 10px', cursor: 'pointer' }}>❓规则</button>
              <button onClick={() => setConfirmDialog({ show: true, message: '确定退出房间吗？退出后将返回登录页。', callback: leaveRoom })} style={{ background: 'transparent', border: '1px solid rgba(255,120,120,0.5)', color: '#ff8a8a', fontSize: '12px', borderRadius: '10px', padding: '3px 10px', cursor: 'pointer' }}>🚪退出</button>
            </span>
          </div>
        </div>

        {/* ====== 状态栏 ====== */}
        <div style={styles.statusBar}>
          {phase === "waiting" && (
            <span style={styles.statusText}>
              ⏳ 等待开始 {players.length >= 2 ? `（${readyPlayers.length}/${players.length} 已准备）` : '（至少2人）'}
            </span>
          )}
          {phase === "dealing" && <span style={styles.statusText}>🃏 发牌中...</span>}
          {phase === "player_turn" && !gameOver && (
            <span style={styles.statusText}>
              🎯 {currentPlayer?.name} 的回合 {currentPlayer?.isStanding ? '（停牌）' : ''}
            </span>
          )}
          {phase === "dealer_turn" && !gameOver && <span style={styles.statusText}>👑 庄家回合</span>}
          {phase === "wheel" && <span style={styles.statusText}>🎴 抽牌选庄中...</span>}
          {gameOver && phase !== "wheel" && phase !== "waiting_for_dealer" && (
            <span style={styles.resultText}>{result || '游戏结束'}</span>
          )}
        </div>

        {spectators.length > 0 && (
          <div style={{ textAlign: 'center', color: '#888', fontSize: '11px', marginBottom: '4px', padding: '2px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px' }}>
            👀 观战：{spectators.join('、')}
          </div>
        )}

        <div style={styles.actionBar}>
          {phase === "waiting" && (
            <>
              {myPlayer?.status === "watching" && (
                <button onClick={rejoinGame} style={{...styles.btnReady, background: "#e879a8"}}>重新加入本局</button>
              )}
              <button onClick={toggleReady} style={readyPlayers.includes(playerName) ? styles.btnReady : styles.btnNotReady}>
                {readyPlayers.includes(playerName) ? '✅ 已准备' : '⏳ 准备'}
              </button>
              {activePlayers.length >= 2 && allReady && players.find(p => p.name === playerName)?.seatId === 0 && (
                <button onClick={startGame} style={styles.btnStart}>🚀 开始游戏</button>
              )}
            </>
          )}
          {phase === "player_turn" && isMyTurn && (
            <>
              <button onClick={handleHit} style={styles.btnBid}>要牌</button>
              <button onClick={() => handleStand(false)} style={styles.btnBid}>停牌</button>
              {myPlayer?.isBust && !myPlayer?.isStanding && (myPlayer.cardCount === 3 || myPlayer.cardCount === 4) && playerName !== dealerId && (
                <>
                  <button onClick={handleConfess} style={{ ...styles.btnBid, background: 'rgba(239,68,68,0.15)', border: '1px solid #ef4444', color: '#f87171' }}>认爆1杯</button>
                  <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px' }}>或继续要牌迷惑</span>
                </>
              )}
            </>
          )}
          {phase === "player_turn" && !isMyTurn && !gameOver && (
            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '13px' }}>
              ⏳ 等待 {currentPlayer?.name} 操作...
            </span>
          )}
          {phase === "dealer_turn" && isDealerTurn && !myPlayer?.isStanding && (
            <>
              <button onClick={handleHit} style={styles.btnBid}>要牌</button>
              <button onClick={() => handleStand(false)} style={styles.btnBid}>停牌</button>
            </>
          )}
          {phase === "wheel" && isDealer && drawSubPhase === "choose" && (
            <>
              <button onClick={() => chooseDrawRule("big")} style={{ ...styles.btnBid, background: 'rgba(214,140,170,0.2)', border: '1px solid #f0a8c4', color: '#f0a8c4', fontSize: '13px', padding: '6px 14px' }}>👑 大庄</button>
              <button onClick={() => chooseDrawRule("small")} style={{ ...styles.btnBid, background: 'rgba(16,185,129,0.2)', border: '1px solid #10b981', color: '#10b981', fontSize: '13px', padding: '6px 14px' }}>🌱 小庄</button>
            </>
          )}
          {phase === "wheel" && drawSubPhase === "choose" && !isDealer && (
            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '13px' }}>⏳ 等待庄家选大庄/小庄...</span>
          )}
          {phase === "wheel" && drawSubPhase === "reveal" && (
            <span style={{ color: '#f0a8c4', fontSize: '13px' }}>
              🃏 亮牌倒计时 {drawCountdown}s
            </span>
          )}

          {phase === "waiting_for_dealer" && dealerId === playerName && (
            <button onClick={enterDrawPhase} style={styles.btnStart}>🃏 开始抽牌定庄</button>
          )}
          {phase === "waiting_for_dealer" && dealerId !== playerName && (
            <span style={{ color: "rgba(255,255,255,0.5)", fontSize: "13px" }}>⏳ 等待庄家抽牌定庄...</span>
          )}

          {(gameOver && phase !== "wheel" && phase !== "waiting_for_dealer") && (
            <>
              {isDealer ? (
                <button onClick={enterDrawPhase} style={styles.btnStart}>
                  🎴 抽牌选庄
                </button>
              ) : (
                <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '13px' }}>
                  ⏳ 等待庄家抽牌选庄...
                </span>
              )}
              <button onClick={resetGame} style={styles.btnReset}>🔄 重置</button>
            </>
          )}
          {errorMsg && <div style={{ color: "#f87171", fontSize: 13, marginTop: 8 }}>{errorMsg}</div>}
        </div>

        {myPlayer && myPlayer.cardCount > 0 && !gameOver && (
          <div style={styles.myCardsArea}>
            <div style={styles.myCardsLabel}>你的手牌（点击查看）</div>
            <div style={styles.myCardsContainer} onClick={() => setShowMyCards(!showMyCards)}>
              {showMyCards ? (
                <div style={styles.myCardsRow}>
                  {myPlayer.cards && myPlayer.cards.map((card: any, idx: number) => (
                    <PokerCard key={idx} card={card} hidden={false} size="medium" />
                  ))}
                  <span style={{ fontSize: '14px', color: '#aaa', marginLeft: '6px' }}>点数: {calculateHand(myPlayer.cards)}</span>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: '4px' }}>
                  {myPlayer.cards && myPlayer.cards.map((_: any, idx: number) => (
                    <PokerCard key={idx} hidden={true} size="medium" />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {wheelVisible && (
        <div style={styles.wheelOverlay}>
          <div style={styles.wheelContainer}>
            <h2 style={styles.wheelTitle}>🎴 抽牌选庄</h2>

            {drawSubPhase === "choose" && (
              <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.7)', fontSize: '15px', padding: '20px' }}>
                {isDealer ? (
                  <div>
                    <div style={{ marginBottom: '14px', color: '#f0a8c4' }}>请选择庄家规则：</div>
                    <button onClick={() => chooseDrawRule("big")} style={{ ...styles.btnBid, background: 'rgba(214,140,170,0.15)', border: '1px solid #f0a8c4', color: '#f0a8c4', fontSize: '14px', padding: '8px 18px', marginRight: '10px' }}>👑 大庄（点数大者当庄）</button>
                    <button onClick={() => chooseDrawRule("small")} style={{ ...styles.btnBid, background: 'rgba(16,185,129,0.15)', border: '1px solid #10b981', color: '#10b981', fontSize: '14px', padding: '8px 18px' }}>🌱 小庄（点数小者当庄）</button>
                  </div>
                ) : (
                  <div style={{ animation: 'pulse 2s ease-in-out infinite' }}>⏳ 等待庄家 {dealerId} 选择...</div>
                )}
              </div>
            )}

            {drawSubPhase === "reveal" && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ marginBottom: '10px', fontSize: '13px', color: '#c7d2fe', letterSpacing: '1px' }}>
                  {drawRule === "big" ? '👑 大庄模式' : '🌱 小庄模式'} — {drawCountdown > 0 ? `${drawCountdown}秒后自动亮牌` : '自动亮牌中...'}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', justifyContent: 'center', marginBottom: '12px' }}>
                  {drawCards.map((d) => {
                    const isMe = d.name === playerName;
                    const isRevealed = drawRevealed.has(d.name);
                    const rankDisplay = isRevealed ? d.card.rank : "?";
                    const isRed = d.card.suit === '♥' || d.card.suit === '♦';
                    return (
                      <div key={d.name} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                        <div style={{ fontSize: '12px', color: isMe ? '#f0a8c4' : 'rgba(255,255,255,0.6)', marginBottom: '2px' }}>{d.name}{isMe ? ' (你)' : ''}</div>
                        {isRevealed ? (
                          <div style={{ width: 44, height: 60, borderRadius: 6, background: '#ffffff', border: '1.5px solid rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }}>
                            <span style={{ fontSize: '13px', fontWeight: 700, color: isRed ? '#A32D2D' : '#2C2C2A' }}>{rankDisplay}</span>
                            <span style={{ fontSize: '16px', color: isRed ? '#A32D2D' : '#2C2C2A' }}>{d.card.suit}</span>
                          </div>
                        ) : (
                          <div style={{ width: 44, height: 60, borderRadius: 6, background: 'linear-gradient(135deg, #3a1030, #1a0512)', border: '1.5px solid rgba(214,140,170,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <span style={{ fontSize: '18px', opacity: 0.4 }}>🃏</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {!drawRevealed.has(playerName) && drawCountdown > 0 && (
                  <button onClick={revealOwnCard} style={{ ...styles.btnBid, background: 'rgba(214,140,170,0.2)', border: '1px solid #f0a8c4', color: '#f0a8c4', fontSize: '13px', padding: '6px 16px' }}>🃏 亮牌</button>
                )}
                {drawRevealed.has(playerName) && (
                  <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>✅ 已亮牌</div>
                )}
              </div>
            )}

            {drawSubPhase === "done" && drawWinner && (
              <div style={{ textAlign: 'center', padding: '16px' }}>
                <div style={{ fontSize: '28px', marginBottom: '8px' }}>👑</div>
                <div style={{ color: '#f0a8c4', fontSize: '20px', fontWeight: 'bold', textShadow: '0 0 12px rgba(214,140,170,0.5)', animation: 'pulse 1s ease-in-out infinite' }}>
                  {drawWinner} 成为新庄家！
                </div>
                <div style={{ marginTop: '8px', fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>即将开始新一局...</div>
              </div>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog />
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
    background: "radial-gradient(ellipse at 30% 12%, #2a0820 0%, #1a0512 48%, #0c0308 100%)",
    display: "flex", justifyContent: "center", alignItems: "flex-start", padding: "8px 8px 76px 8px",
    fontFamily: "system-ui, sans-serif", position: "relative", overflowX: "hidden", overflowY: "auto",
  },
  glowOrb: {
    position: "absolute", top: "-20%", right: "-10%", width: "500px", height: "500px",
    background: "radial-gradient(circle, rgba(200,80,130,0.20), transparent 70%)",
    borderRadius: "50%", pointerEvents: "none" as const, animation: "pulse 4s ease-in-out infinite",
  },
  glowOrb2: {
    position: "absolute", bottom: "-30%", left: "-10%", width: "400px", height: "400px",
    background: "radial-gradient(circle, rgba(220,170,120,0.12), transparent 70%)",
    borderRadius: "50%", pointerEvents: "none" as const, animation: "pulse 5s ease-in-out infinite reverse",
  },
  card: {
    background: "linear-gradient(160deg, rgba(60,18,46,0.95), rgba(28,8,22,0.97))",
    backdropFilter: "blur(30px)", borderRadius: "28px",
    padding: "32px 24px", maxWidth: "400px", width: "100%",
    border: "1px solid rgba(214,140,170,0.35)",
    boxShadow: "0 30px 80px rgba(0,0,0,0.6), 0 0 50px rgba(180,60,110,0.15)",
    position: "relative", zIndex: 1,
  },
  logo: { fontSize: "48px", textAlign: "center" as const, marginBottom: "8px" },
  title: {
    textAlign: "center" as const, color: "#fff", fontSize: "32px", fontWeight: "800",
    marginBottom: "4px", background: "linear-gradient(135deg, #f3b0c8, #d4779a)",
    WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
  },
  subtitle: { textAlign: "center" as const, color: "rgba(235,195,215,0.5)", fontSize: "13px", marginBottom: "24px" },
  input: {
    width: "100%", padding: "12px 16px", marginBottom: "10px", borderRadius: "12px",
    border: "1px solid rgba(214,140,170,0.22)", background: "rgba(255,255,255,0.05)",
    color: "#fff", fontSize: "15px", outline: "none", transition: "all 0.3s",
    boxSizing: "border-box" as const,
  },
  btnGroup: { display: "flex", gap: "10px", marginTop: "4px" },
  btnPrimary: {
    flex: 1, padding: "12px", borderRadius: "12px", border: "none",
    background: "linear-gradient(135deg, #c2416c, #881337)", color: "#fff",
    fontSize: "15px", fontWeight: "600", cursor: "pointer", boxShadow: "0 4px 20px rgba(194,65,108,0.35)",
  },
  btnSecondary: {
    flex: 1, padding: "12px", borderRadius: "12px", border: "1px solid rgba(214,140,170,0.3)",
    background: "rgba(255,255,255,0.04)", color: "#f3d4e0", fontSize: "15px", fontWeight: "600", cursor: "pointer",
  },
  tableContainer: {
    position: "relative", zIndex: 1, width: "100%", maxWidth: "500px",
    background: "linear-gradient(160deg, rgba(46,12,34,0.7), rgba(20,6,16,0.8))",
    backdropFilter: "blur(30px)", borderRadius: "24px",
    padding: "12px 10px", paddingBottom: "88px", border: "1px solid rgba(214,140,170,0.18)",
    boxShadow: "0 30px 80px rgba(0,0,0,0.5), 0 0 30px rgba(180,60,110,0.1)",
  },
  table: {
    position: "relative", width: "100%", aspectRatio: "3/4",
    background: "linear-gradient(180deg, #3a1230 0%, #1a0512 100%)",
    borderRadius: "18px", border: "2px solid rgba(214,140,170,0.35)",
    boxShadow: "inset 0 0 40px rgba(0,0,0,0.5), 0 0 30px rgba(180,60,110,0.12)", marginBottom: "16px", overflow: "visible",
  },
  roomInfo: {
    order: -1,
    width: "100%",
    color: "rgba(235,195,215,0.7)", fontSize: "12px",
    display: "flex", justifyContent: "space-between", alignItems: "center",
    background: "rgba(20,4,14,0.5)", padding: "6px 12px", borderRadius: "14px",
    marginBottom: "8px",
  },
  statusBar: {
    background: "rgba(255,255,255,0.05)", borderRadius: "12px", padding: "8px 12px",
    textAlign: "center" as const, marginBottom: "10px", minHeight: "36px",
    display: "flex", alignItems: "center", justifyContent: "center",
    border: "1px solid rgba(214,140,170,0.12)", fontSize: "13px",
  },
  statusText: { color: "rgba(235,195,215,0.6)", fontSize: "13px" },
  resultText: { color: "#f0a8c4", fontSize: "15px", fontWeight: "600", whiteSpace: "pre-wrap" as const, textAlign: "center" as const },
  actionBar: {
    display: "flex", flexWrap: "wrap" as const, gap: "8px", justifyContent: "center", marginTop: "8px",
    alignItems: "center",
  },
  btnBid: {
    padding: "8px 16px", borderRadius: "10px", border: "1px solid rgba(214,140,170,0.3)",
    background: "rgba(255,255,255,0.08)", color: "#f3d4e0", fontSize: "14px", fontWeight: "600", cursor: "pointer",
  },
  btnReady: {
    padding: "6px 16px", borderRadius: "16px", border: "none", background: "#e879a8",
    color: "#2a0512", fontSize: "13px", fontWeight: "600", cursor: "pointer",
  },
  btnNotReady: {
    padding: "6px 16px", borderRadius: "16px", border: "1px solid rgba(214,140,170,0.25)",
    background: "rgba(255,255,255,0.05)", color: "#f3d4e0", fontSize: "13px", fontWeight: "600", cursor: "pointer",
  },
  btnStart: {
    padding: "8px 24px", borderRadius: "10px", border: "none",
    background: "linear-gradient(135deg, #e879a8, #be185d)", color: "#fff",
    fontSize: "14px", fontWeight: "600", cursor: "pointer", boxShadow: "0 4px 16px rgba(232,121,168,0.25)",
  },
  btnReset: {
    padding: "8px 24px", borderRadius: "10px", border: "none",
    background: "linear-gradient(135deg, #e0a96d, #b9742f)", color: "#2a0512",
    fontSize: "14px", fontWeight: "600", cursor: "pointer", boxShadow: "0 4px 16px rgba(224,169,109,0.2)",
  },
  myCardsArea: {
    position: "fixed" as const, left: "50%", transform: "translateX(-50%)",
    bottom: 0, width: "100%", maxWidth: "500px", zIndex: 50,
    background: "rgba(20,4,14,0.94)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
    borderTop: "1px solid rgba(214,140,170,0.3)", boxShadow: "0 -6px 24px rgba(0,0,0,0.45)",
    padding: "8px 12px", paddingBottom: "calc(8px + env(safe-area-inset-bottom))",
    textAlign: "center" as const,
  },
  myCardsLabel: { fontSize: "12px", color: "rgba(235,195,215,0.5)", marginBottom: "4px" },
  myCardsContainer: { cursor: "pointer", display: "flex", justifyContent: "center", alignItems: "center", minHeight: "40px" },
  myCardsRow: { display: "flex", gap: "4px", alignItems: "center", flexWrap: "wrap" as const, justifyContent: "center" },
  myCard: { fontSize: "20px", padding: "2px 6px", background: "rgba(255,255,255,0.08)", borderRadius: "4px" },

  wheelOverlay: {
    position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
    backgroundColor: 'rgba(15,3,11,0.78)',
    display: 'flex', justifyContent: 'center', alignItems: 'center',
    zIndex: 999,
  },
  wheelContainer: {
    background: 'linear-gradient(145deg, #2a0f24, #1a0512)',
    borderRadius: '32px', padding: '24px',
    maxWidth: '420px', width: '90%',
    boxShadow: '0 0 80px rgba(180,60,110,0.4), 0 0 40px rgba(220,170,120,0.15), 0 20px 60px rgba(0,0,0,0.8)',
    border: '1px solid rgba(214,140,170,0.4)',
    textAlign: 'center',
  },
  wheelTitle: { color: '#fff', fontSize: '26px', marginBottom: '20px', letterSpacing: '2px', textShadow: '0 0 20px rgba(214,140,170,0.5)' },
  wheelWrapper: {
    position: 'relative', width: '300px', height: '300px',
    margin: '0 auto 20px',
  },
  wheel: {
    width: '100%', height: '100%', borderRadius: '50%',
    overflow: 'hidden',
    border: '3px solid rgba(214,140,170,0.6)',
    boxShadow: '0 0 50px rgba(214,140,170,0.25), 0 0 30px rgba(180,60,110,0.2), inset 0 0 40px rgba(0,0,0,0.4)',
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
    position: 'absolute',
    top: '6px',
    left: '4px',
    fontWeight: 'bold',
    transform: 'rotate(-90deg)',
    textShadow: '0 1px 4px rgba(0,0,0,0.8)',
    letterSpacing: '0.5px',
    pointerEvents: 'none',
    whiteSpace: 'nowrap',
    overflow: 'visible',
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