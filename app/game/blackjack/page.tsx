"use client";

import { useState, useEffect, useRef } from "react";
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

const shuffleDeck = (deck: any[]) => {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
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
// 加入 status 字段默认值
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

// ==================== 🃏 扑克牌组件（仅用于「你的手牌」区域） ====================
const PokerCard = ({ card, hidden, size = 'medium' }: { card?: any; hidden?: boolean; size?: 'small' | 'medium' | 'large' }) => {
  const sizeMap = {
    small: { width: 22, height: 32, fontSize: 9, symbolSize: 14 },
    medium: { width: 28, height: 40, fontSize: 11, symbolSize: 18 },
    large: { width: 36, height: 50, fontSize: 14, symbolSize: 24 },
  };
  const s = sizeMap[size] || sizeMap.medium;

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
        <div style={{
          position: 'absolute',
          inset: 3,
          borderRadius: 2,
          border: '1px solid rgba(255,255,255,0.08)',
        }} />
        <span style={{ fontSize: s.symbolSize, opacity: 0.3, color: '#fff', textShadow: '0 1px 3px rgba(0,0,0,0.3)' }}>🃏</span>
        <span style={{ position: 'absolute', top: 2, left: 3, fontSize: 5, color: 'rgba(255,255,255,0.15)' }}>♠</span>
        <span style={{ position: 'absolute', bottom: 2, right: 3, fontSize: 5, color: 'rgba(255,255,255,0.15)', transform: 'rotate(180deg)' }}>♠</span>
      </div>
    );
  }

  if (!card) return null;
  const isRed = card.suit === '♥' || card.suit === '♦';
  const color = isRed ? '#e53935' : '#1a1a1a';
  const rankDisplay = card.rank === '10' ? '10' : card.rank;

  return (
    <div style={{
      width: s.width,
      height: s.height,
      borderRadius: 4,
      background: '#ffffff',
      border: '1.5px solid rgba(0,0,0,0.12)',
      boxShadow: '0 2px 8px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.8)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
      flexShrink: 0,
      fontFamily: '"Segoe UI", "Helvetica Neue", "Apple Color Emoji", system-ui, sans-serif',
    }}>
      <div style={{
        position: 'absolute',
        top: 2,
        left: 3,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        lineHeight: 1,
        fontSize: s.fontSize,
        fontWeight: 700,
        color: color,
      }}>
        <span>{rankDisplay}</span>
        <span style={{ fontSize: s.fontSize * 0.7 }}>{card.suit}</span>
      </div>
      <span style={{
        fontSize: s.symbolSize,
        color: color,
        opacity: 0.9,
        textShadow: '0 1px 2px rgba(0,0,0,0.05)',
      }}>
        {card.suit}
      </span>
      <div style={{
        position: 'absolute',
        bottom: 2,
        right: 3,
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
    </div>
  );
};
export default function BlackjackPage() {
  const [playerName, setPlayerName] = useState("");
  const [roomPassword, setRoomPassword] = useState("");
  const [joined, setJoined] = useState(false);
  const [roomId, setRoomId] = useState("");

  const [players, setPlayers] = useState<any[]>([]);
  const [phase, setPhase] = useState<"waiting" | "dealing" | "player_turn" | "dealer_turn" | "settlement" | "wheel">("waiting");
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
  const [wheelVisible, setWheelVisible] = useState(false);
  const [wheelRotation, setWheelRotation] = useState(0);
  const [wheelSelected, setWheelSelected] = useState<string | null>(null);
  const [wheelSpinning, setWheelSpinning] = useState(false);
  const [wheelSegments, setWheelSegments] = useState<string[]>([]);
  const channelRef = useRef<any>(null);
  const playersRef = useRef<any[]>([]);
  const isSettlingRef = useRef(false);

  // 同步 players 到 ref，解决闭包问题
  useEffect(() => {
    playersRef.current = players;
  }, [players]);

  // ==================== 辅助函数 ====================
  // 广播 + 数据库同步（列名小写）
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
  const allReady = players.length >= 2 && players.every(p => readyPlayers.includes(p.name));
  const currentPlayer = players[currentPlayerIndex] || null;

  // ==================== Supabase 订阅（广播监听） ====================
  useEffect(() => {
    if (!roomId) return;
    console.log('🔄 订阅房间:', roomId);
    const channel = supabase
      .channel(`blackjack:${roomId}`, { config: { broadcast: { ack: true } } })
      .on('broadcast', { event: 'gameState' }, (payload) => {
        const state = payload.payload;
        const parsedPlayers = parsePlayers(state.players);

        // ---- 合并 players ----
        setPlayers(prev => {
          if (isSettlingRef.current) return prev;  // 结算中，忽略旧广播覆盖
          const localMe = prev.find(p => p.name === playerName);
          const remoteMe = parsedPlayers.find(p => p.name === playerName);
          if (localMe && remoteMe) {
            // 发牌阶段直接使用广播数据，避免竞态
            const isDealing = state.phase === "dealing";
            if (isDealing) return parsedPlayers;
            const hasLocalCards = localMe.cards && localMe.cards.length > 0;
            return parsedPlayers.map(p => {
              if (p.name === playerName) {
                return {
                  ...p,
                  cards: hasLocalCards ? localMe.cards : (p.cards || []),
                  cardCount: hasLocalCards ? localMe.cardCount : (p.cardCount || 0),
                  bustType: hasLocalCards ? (localMe.bustType || 'none') : (p.bustType || 'none'),
                  isStanding: hasLocalCards ? (localMe.isStanding || false) : (p.isStanding || false),
                  isBust: hasLocalCards ? (localMe.isBust || false) : (p.isBust || false),
                  isBlackjack: hasLocalCards ? (localMe.isBlackjack || false) : (p.isBlackjack || false),
                  isFiveCard: hasLocalCards ? (localMe.isFiveCard || false) : (p.isFiveCard || false),
                  status: hasLocalCards ? (localMe.status || 'playing') : (p.status || 'playing'),
                };
              }
              // 其他玩家：直接使用广播数据
              const prevPlayer = prev.find(pp => pp.name === p.name);
              const isNewPlayer = !prevPlayer;
              return {
                ...p,
                cards: p.cards || [],
                cardCount: p.cards?.length || p.cardCount || 0,
                isFiveCard: p.isFiveCard || (p.cards?.length === 5 && calculateHand(p.cards) <= 21),
                status: isNewPlayer ? 'watching' : (p.status || 'playing'),
              };
            });
          }
          return parsedPlayers;
        });

        // ---- 保护 phase ----
        setPhase(prevPhase => {
          // dealing/player_turn/dealer_turn 优先
          if (state.phase === "dealing" || state.phase === "player_turn" || state.phase === "dealer_turn") {
            return state.phase;
          }
          // settlement/wheel/waiting 正常更新
          return state.phase || "waiting";
        });

        // ---- 新一局开始（dealing），所有客户端统一重置本地手牌状态 ----
        if (state.phase === "dealing") {
          setShowMyCards(false);
          setMyCards([]);
          setMyCardCount(0);
          setMyBustType('none');
        }

        // ---- 保护 gameOver ----
        setGameOver(prevGameOver => {
          if (state.phase === "dealing" || state.phase === "player_turn") {
            return false;
          }
          if (state.phase === "settlement" || state.phase === "wheel") {
            return state.gameOver || false;
          }
          return prevGameOver;
        });

        setDealerId(state.dealerId || null);
        setCurrentPlayerIndex(state.currentPlayerIndex || 0);
        setResult(state.result || "");
        setResultDetails(state.resultDetails || []);
        setReadyPlayers(state.readyPlayers || []);
        setSettlementStep(state.settlementStep || 0);
        setSeed(state.seed || null);
        setDeckOffset(state.deckOffset || 0);
        setWheelVisible(state.wheelVisible || false);
        setWheelSelected(state.wheelSelected || null);
        setWheelSegments(state.wheelSegments || []);

        if (state.seed === null) {
          setLocalDeck([]);
          setDeckOffset(0);
        } else if (state.seed && localDeck.length === 0) {
          setLocalDeck(createDeckWithSeed(state.seed));
        }

        const me = parsedPlayers.find(p => p.name === playerName);
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
      setErrorMsg("这个密码已被使用，请换一个");
      return;
    }

    const newPlayer = { name: playerName.trim(), cards: [], cardCount: 0, isStanding: false, isBust: false, isBlackjack: false, isFiveCard: false, seatId: 0, isDealer: false, bustType: 'none', status: 'playing' };
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

    const currentPlayers = parsePlayers(roomData.players);
    if (currentPlayers.length >= 12) {
      setErrorMsg("房间已满（最多12人）");
      return;
    }
    if (currentPlayers.some((p: any) => p.name === playerName.trim())) {
      setRoomId(roomData.id);
      setJoined(true);
      setPlayers(currentPlayers);
      setPhase(roomData.phase || "waiting");
      setDealerId(roomData.dealerid || null);
      setGameOver(roomData.gameover || false);
      setCurrentPlayerIndex(roomData.currentplayerindex || 0);
      setSeed(roomData.seed || null);
      setReadyPlayers(roomData.readyplayers || []);
      setResult(roomData.result || "");
      setResultDetails(roomData.resultdetails || []);
      setSettlementStep(roomData.settlementstep || 0);
      setDeckOffset(roomData.deckoffset || 0);
      setWheelVisible(roomData.wheelvisible || false);
      setWheelSelected(roomData.wheelselected || null);
      setWheelSegments(roomData.wheelsegments || []);
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
      isStanding: false,
      isBust: false,
      isBlackjack: false,
      isFiveCard: false,
      seatId,
      isDealer: false,
      bustType: 'none',
      status: 'watching',
    };
    const updatedPlayers = [...currentPlayers, newPlayer];

    await supabase.from("rooms").update({
      players: updatedPlayers,
      readyplayers: roomData.readyplayers || [],
    }).eq("id", roomData.id);

    setRoomId(roomData.id);
    setJoined(true);
    setPlayers(updatedPlayers);
    setReadyPlayers(roomData.readyplayers || []);

    setPhase(roomData.phase || "waiting");
    setDealerId(roomData.dealerid || null);
    setGameOver(roomData.gameover || false);
    setCurrentPlayerIndex(roomData.currentplayerindex || 0);
    setSeed(roomData.seed || null);
    setResult(roomData.result || "");
    setResultDetails(roomData.resultdetails || []);
    setSettlementStep(roomData.settlementstep || 0);
    setDeckOffset(roomData.deckoffset || 0);
    setWheelVisible(roomData.wheelvisible || false);
    setWheelSelected(roomData.wheelselected || null);
    setWheelSegments(roomData.wheelsegments || []);

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
    });
  };

  const leaveRoom = async () => {
    if (!roomId) return;
    const updatedPlayers = players.filter(p => p.name !== playerName);
    await supabase.from("rooms").update({
      players: updatedPlayers,
      readyplayers: readyPlayers.filter(p => p !== playerName),
    }).eq("id", roomId);
    await broadcastAndSyncDB({
      players: updatedPlayers,
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
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }
  };

  const toggleReady = async () => {
    if (phase !== "waiting") {
      setErrorMsg("游戏已开始，不能准备");
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
    });
  };

  // ==================== 开始游戏 ====================
  const startGame = async () => {
    if (phase !== "waiting") return;
    if (players.length < 2) { setErrorMsg("至少2人才能开始"); return; }
    if (!allReady) { setErrorMsg("还有玩家未准备"); return; }

    const firstDealer = players[0].name;
    const resetPlayers = players.map(p => ({
      ...p,
      cards: [],
      cardCount: 0,
      isStanding: false,
      isBust: false,
      isBlackjack: false,
      isFiveCard: false,
      bustType: 'none',
      isDealer: p.name === firstDealer,
      status: 'playing',
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
      setPhase("settlement");
      const resultMsg = `庄家黑杰克！所有玩家各喝 2 杯！`;
      setResult(resultMsg);
      const details = newPlayers.filter(p => p.name !== dealerName).map(p => ({
        name: p.name,
        cards: p.cards,
        result: '庄家黑杰克，喝2杯',
        penalty: 2,
      }));
      setResultDetails(details);
      await broadcastAndSyncDB({
        players: newPlayers,
        phase: "settlement",
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

    // 广播后双重重置，防止被旧广播覆盖
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
    if (phase !== "player_turn") return;
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
    let offset = deckOffset;
    if (deck.length === 0 || offset >= 52) {
      const newSeed = Math.floor(Math.random() * 1000000);
      deck = createDeckWithSeed(newSeed);
      offset = 0;
      setSeed(newSeed);
      setLocalDeck(deck);
      setDeckOffset(0);
      await broadcastAndSyncDB({
        players: pNow,
        phase,
        dealerId,
        currentPlayerIndex,
        gameOver,
        result,
        resultDetails,
        readyPlayers,
        settlementStep: 0,
        seed: newSeed,
        deckOffset: 0,
        wheelVisible,
        wheelSelected,
        wheelSegments,
      });
    }

    const card = deck[offset];
    offset++;
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

      // 5张牌（五小龙/爆牌）自动推进回合
      await handleStand(true);
      return;
    }

    await broadcastAndSyncDB({
      players: updatedPlayers,
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

    if (phase !== "player_turn") return;

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

      // allDone 只统计 status === 'playing' 的玩家
      const allDoneNow = updatedPlayers
        .filter((p: any) => p.status === 'playing')
        .every((p: any) => p.isStanding || p.isBust || p.cardCount === 5);
      finalPlayers = updatedPlayers;
      allDone = allDoneNow;
      console.log('📊 allDone:', allDoneNow);
      console.log('🔍 调试:', updatedPlayers.map((p: any) => ({
        name: p.name,
        cards: p.cards?.length,
        isStanding: p.isStanding,
        isBust: p.isBust,
        cardCount: p.cardCount,
        status: p.status
      })));

      return updatedPlayers;
    });

    await new Promise(resolve => setTimeout(resolve, 100));

    if (allDone) {
      console.log('✅ 所有人都已完成，直接结算');
      await settleGame(finalPlayers);
      return;
    }

    // 推进时跳过 status === 'watching' 的玩家
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

  // 认爆1杯
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

    // 不广播，由 handleStand 统一广播
    await handleStand(true);
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
    let offset = deckOffset;
    if (deck.length === 0 || offset >= 52) {
      const newSeed = Math.floor(Math.random() * 1000000);
      deck = createDeckWithSeed(newSeed);
      offset = 0;
      setSeed(newSeed);
      setLocalDeck(deck);
      setDeckOffset(0);
      await broadcastAndSyncDB({
        players: pNow,
        phase,
        dealerId,
        currentPlayerIndex,
        gameOver,
        result,
        resultDetails,
        readyPlayers,
        settlementStep: 0,
        seed: newSeed,
        deckOffset: 0,
        wheelVisible,
        wheelSelected,
        wheelSegments,
      });
    }

    const card = deck[offset];
    offset++;
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

      // 🔥 直接传入数据给结算，不依赖 players 状态
      await settleGame(updatedPlayersWithStand);
      return;
    }

    await broadcastAndSyncDB({
      players: updatedPlayers,
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
  // 🔥 修复：接受 overridePlayers 参数，内部使用 ps，广播时用 ps
  const settleGame = async (overridePlayers?: any[]) => {
    isSettlingRef.current = true;
    try {
    console.log('📊 settleGame 被调用, dealerId:', dealerId, 'players count:', players.length);
    console.log('📊 players:', players.map(p => ({ name: p.name, cardCount: p.cardCount, hasCards: !!p.cards, cardsLen: p.cards?.length, status: p.status })));

    // 🔥 优先使用传入的数据，避免依赖 players 状态
    const ps = overridePlayers && overridePlayers.length > 0 ? overridePlayers : players;
    console.log('📊 settleGame 使用 ps 数量:', ps.length);
    console.log('📊 ps 每个玩家牌数:', ps.map((p: any) => ({ name: p.name, cardCount: p.cardCount, cardsLen: p.cards?.length, status: p.status })));

    // ---- 补全 dealerId ----
    let effectiveDealerId = dealerId;
    if (!effectiveDealerId) {
      const found = ps.find((p: any) => p.isDealer);
      effectiveDealerId = found ? found.name : (ps.length > 0 ? ps[0].name : null);
      if (effectiveDealerId) {
        console.warn('⚠️ dealerId 自动补全为:', effectiveDealerId);
        setDealerId(effectiveDealerId);
      } else {
        console.error('❌ 无法找到庄家，强制结束');
        setPhase("settlement");
        setGameOver(true);
        setResult("游戏结束（无庄家）");
        await broadcastAndSyncDB({
          players: ps,
          phase: "settlement",
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

    // ---- 找到庄家 ----
    const dealer = ps.find((p: any) => p.name === effectiveDealerId);
    if (!dealer) {
      console.warn('⚠️ 找不到庄家玩家，强制结束');
      setPhase("settlement");
      setGameOver(true);
      setResult("游戏结束（庄家已离开）");
      await broadcastAndSyncDB({
        players: ps,
        phase: "settlement",
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

    setPhase("settlement");
    setGameOver(true);

    // ---- 生成结算结果 ----
    const results: any[] = [];
    const activePlayers = ps.filter((p: any) => p.status === 'playing');

    // 🔥 先判断双方是否都是五小龙（平局）
    const isDealerFive = isFiveCardCharlie(dealer.cards);
    const activeNonDealerPlayers = activePlayers.filter((p: any) => p.name !== effectiveDealerId);

    for (const player of activeNonDealerPlayers) {
      if (player.cardCount === 0 || !player.cards || player.cards.length === 0) continue;

      const isPlayerFive = isFiveCardCharlie(player.cards);

      // 双方都五小龙 → 平局
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
        results.push({ name: player.name, cards: player.cards, result: '赢', penalty: 1, who: 'dealer' });
      } else if (cmp === -1) {
        results.push({ name: player.name, cards: player.cards, result: '输', penalty: 1, who: player.name });
      } else {
        results.push({ name: player.name, cards: player.cards, result: '平局', penalty: 0, who: 'none' });
      }
    }

    setResultDetails(results);

    // ---- 生成总结文字 ----
    let playerResults: string[] = [];
    let maxDealerPenalty = 0;
    let maxDealerName = "";
    let hasDealerPenalty = false;

    for (const r of results) {
      if (r.who === 'dealer') {
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
    } else {
      summary = summary.trim();
    }

    if (!summary) {
      summary = "游戏结束（无结算结果）";
    }
    setResult(summary);

    console.log('✅ 结算结果:', summary);

    // 🔥 关键修复：广播时使用 ps（传入的数据），而不是 players
    await broadcastAndSyncDB({
      players: ps,
      phase: "settlement",
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

    // 强制确保状态不被覆盖
    setPhase("settlement");
    setGameOver(true);
    setPlayers(ps);  // 🔥 强制同步最新数据
    console.log('✅ 结算完成');
    } finally {
      isSettlingRef.current = false;
    }
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
      result,
      resultDetails,
      readyPlayers,
      settlementStep: 0,
      seed,
      deckOffset,
      wheelVisible: true,
      wheelSelected: null,
      wheelSegments: names,
    });
  };

  const spinWheel = async () => {
    if (wheelSpinning) return;
    setWheelSpinning(true);
    setWheelSelected(null);

    const names = wheelSegments;
    const totalSegments = names.length;
    const winIndex = Math.floor(Math.random() * totalSegments);
    const segmentAngle = 360 / totalSegments;
    const targetAngle = 360 * (5 + Math.random() * 3) + (360 - winIndex * segmentAngle - segmentAngle / 2);
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
        result,
        resultDetails,
        readyPlayers,
        settlementStep: 0,
        seed,
        deckOffset,
        wheelVisible: true,
        wheelSelected: winner,
        wheelSegments: names,
      });
      setTimeout(() => {
        startNextRound(winner);
      }, 1500);
    }, 3000 + Math.random() * 1000);
  };

  // ==================== 下一局 ====================
  const startNextRound = async (newDealerName: string) => {
    console.log('🔄 开始新一局，庄家:', newDealerName);

    setWheelVisible(false);
    setWheelSelected(null);
    setWheelSegments([]);
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

    const resetPlayers = players.map(p => ({
      ...p,
      cards: [],
      cardCount: 0,
      isStanding: false,
      isBust: false,
      isBlackjack: false,
      isFiveCard: false,
      bustType: 'none',
      isDealer: p.name === newDealerName,
      status: p.status === 'watching' ? 'watching' : 'playing',
    }));

    setPlayers(resetPlayers);
    setDealerId(newDealerName);
    setIsDealer(playerName === newDealerName);

    const newSeed = Math.floor(Math.random() * 1000000);
    setSeed(newSeed);
    setLocalDeck(createDeckWithSeed(newSeed));
    setDeckOffset(0);

    await broadcastAndSyncDB({
      players: resetPlayers,
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

    const newSeed = Math.floor(Math.random() * 1000000);
    const newDeck = createDeckWithSeed(newSeed);
    setSeed(newSeed);
    setLocalDeck(newDeck);
    setDeckOffset(0);

    const resetPlayers = players.map(p => ({
      ...p,
      cards: [],
      cardCount: 0,
      isStanding: false,
      isBust: false,
      isBlackjack: false,
      isFiveCard: false,
      isDealer: false,
      bustType: 'none',
      status: 'playing',
    }));
    setPlayers(resetPlayers);

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
      const isActive = phase === "player_turn" && player?.name === currentPlayer?.name && !gameOver;
      const hasCards = player && player.cardCount > 0;
      const isStanding = player?.isStanding || false;
      const isBust = player?.isBust || false;
      const isFive = player?.isFiveCard || false;
      const isBlackjackFlag = player?.isBlackjack || false;
      const isReady = readyPlayers.includes(player?.name || "");
      const displayName = player ? (player.name.length > 4 ? player.name.slice(0, 4) + '..' : player.name) : '';

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
          width: '60px',
          minHeight: '50px',
          background: isActive ? 'rgba(251,191,36,0.2)' : (isDealerFlag ? 'rgba(251,191,36,0.1)' : (player ? 'rgba(255,255,255,0.04)' : 'transparent')),
          borderRadius: '10px',
          border: isActive ? '2px solid #fbbf24' : (isDealerFlag ? '2px solid #fbbf24' : (player ? '1px solid rgba(255,255,255,0.06)' : 'none')),
          boxShadow: isActive ? '0 0 20px rgba(251,191,36,0.3)' : (isDealerFlag ? '0 0 15px rgba(251,191,36,0.15)' : 'none'),
          padding: '2px 4px',
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
                color: isMe ? '#fbbf24' : '#ddd',
                maxWidth: '100%',
                textAlign: 'center' as const,
                lineHeight: 1.2,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1px', flexWrap: 'wrap' as const, justifyContent: 'center' }}>
                  {isDealerFlag && <span style={{ fontSize: '12px', color: '#fbbf24' }}>👑</span>}
                  <span>{isMe ? '你' : displayName}</span>
                  {player?.status === 'watching' && <span style={{ fontSize: '8px', color: '#888' }}>（观战）</span>}
                </div>
                <div style={{ display: 'flex', gap: '1px', fontSize: '9px', flexWrap: 'wrap' as const, justifyContent: 'center' }}>
                  {isReady && phase === "waiting" && <span style={{ color: '#22d3ee' }}>✅</span>}
                  {isStanding && phase !== "settlement" && <span style={{ color: '#22d3ee' }}>✅</span>}
                  {isBust && phase === "settlement" && <span style={{ color: '#ef4444' }}>💥</span>}
                  {isFive && phase === "settlement" && <span style={{ color: '#fbbf24' }}>🐉</span>}
                  {isBlackjackFlag && phase === "settlement" && <span style={{ color: '#fbbf24' }}>♠</span>}
                  {hasCards && <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: '8px' }}>{player.cardCount}张</span>}
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
      <div style={styles.glowOrb}></div>
      <div style={styles.glowOrb2}></div>

      <div style={styles.tableContainer} className="table-container">
        <div style={styles.table}>
          {renderSeats()}

          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'flex-start',
            width: '85%',
            maxHeight: '65%',
            background: 'rgba(0,0,0,0.4)',
            borderRadius: '12px',
            padding: '6px 10px',
            zIndex: 1,
            pointerEvents: 'none' as const,
            overflowY: 'auto' as const,
            scrollbarWidth: 'thin' as const,
          }}>
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '2px',
              width: '100%',
            }}>
              {dealerId ? (() => {
                const dealer = players.find(p => p.name === dealerId);
                if (!dealer) return null;
                const otherPlayers = players.filter(p => p.name !== dealerId);
                const allPlayers = [dealer, ...otherPlayers];
                return allPlayers.map((p, idx) => {
                  const isDealer = p.name === dealerId;
                  const isMe = p.name === playerName;
                  const hasCards = p.cards && p.cards.length > 0;
                  const isSettlement = phase === "settlement";
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
                        background: isMe ? 'rgba(251,191,36,0.08)' : 'transparent',
                      }}>
                        <span style={{
                          fontSize: '11px',
                          fontWeight: isMe ? 'bold' : 'normal',
                          color: isMe ? '#fbbf24' : '#ddd',
                          minWidth: '40px',
                          textAlign: 'right' as const,
                          whiteSpace: 'nowrap' as const,
                        }}>
                          {isMe ? '你' : displayName}
                          {isDealer && <span style={{ color: '#fbbf24', fontSize: '10px', marginLeft: '1px' }}>（庄家）</span>}
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
                                    fontSize: '15px',
                                    fontWeight: 'bold',
                                    color: 'rgba(255,255,255,0.15)',
                                    background: 'rgba(255,255,255,0.04)',
                                    borderRadius: '3px',
                                    padding: '0 3px',
                                    minWidth: '18px',
                                    textAlign: 'center',
                                  }}>🂠</span>
                                );
                              } else {
                                const isRed = card.suit === '♥' || card.suit === '♦';
                                const color = isRed ? '#ff6b6b' : '#d308ee';
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
                          {p.isStanding && !isSettlement && <span style={{ color: '#22d3ee' }}>✅</span>}
                          {p.isBust && isSettlement && <span style={{ color: '#ef4444' }}>💥</span>}
                          {p.isFiveCard && isSettlement && <span style={{ color: '#fbbf24' }}>🐉</span>}
                          {p.isBlackjack && isSettlement && <span style={{ color: '#fbbf24' }}>♠</span>}
                        </div>
                      </div>
                    </div>
                  );
                });
              })() : (
                players.map((p, idx) => {
                  const isMe = p.name === playerName;
                  const hasCards = p.cards && p.cards.length > 0;
                  const isSettlement = phase === "settlement";
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
                        background: isMe ? 'rgba(251,191,36,0.08)' : 'transparent',
                      }}>
                        <span style={{
                          fontSize: '11px',
                          fontWeight: isMe ? 'bold' : 'normal',
                          color: isMe ? '#fbbf24' : '#ddd',
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
                                    fontSize: '15px',
                                    fontWeight: 'bold',
                                    color: 'rgba(255,255,255,0.15)',
                                    background: 'rgba(255,255,255,0.04)',
                                    borderRadius: '3px',
                                    padding: '0 3px',
                                    minWidth: '18px',
                                    textAlign: 'center',
                                  }}>🂠</span>
                                );
                              } else {
                                const isRed = card.suit === '♥' || card.suit === '♦';
                                const color = isRed ? '#e53935' : '#1a1a1a';
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
                          {p.isStanding && !isSettlement && <span style={{ color: '#22d3ee' }}>✅</span>}
                          {p.isBust && !isSettlement && <span style={{ color: '#ef4444' }}>💥</span>}
                          {p.isFiveCard && !isSettlement && <span style={{ color: '#fbbf24' }}>🐉</span>}
                          {p.isBlackjack && !isSettlement && <span style={{ color: '#fbbf24' }}>♠</span>}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div style={styles.roomInfo}>
            <span style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <span>👥 {players.length}/12</span>
              {dealerId && <span>👑 {dealerId}</span>}
              {phase === "player_turn" && currentPlayer && <span style={{ color: '#fbbf24', fontSize: '12px' }}>🎯 {currentPlayer.name}</span>}
            </span>
            <button onClick={leaveRoom} style={{ background: 'rgba(239,68,68,0.2)', border: '1px solid #ef4444', color: '#f87171', padding: '2px 10px', borderRadius: '12px', fontSize: '12px', cursor: 'pointer', marginLeft: 'auto' }}>🚪 离开</button>
          </div>
        </div>

        <div style={styles.statusBar}>
          {phase === "waiting" && <span style={styles.statusText}>⏳ 等待开始 {players.length >= 2 ? `（${readyPlayers.length}/${players.length} 已准备）` : '（至少2人）'}</span>}
          {phase === "dealing" && <span style={styles.statusText}>🃏 发牌中...</span>}
          {phase === "player_turn" && !gameOver && <span style={styles.statusText}>🎯 {currentPlayer?.name} 的回合 {currentPlayer?.isStanding ? '（停牌）' : ''}</span>}
          {phase === "dealer_turn" && !gameOver && <span style={styles.statusText}>👑 庄家回合</span>}
          {phase === "settlement" && <span style={styles.statusText}>📊 结算完成</span>}
          {phase === "wheel" && <span style={styles.statusText}>🎡 抽庄中...</span>}
          {gameOver && phase !== "wheel" && <span style={styles.resultText}>{result || '游戏结束'}</span>}
        </div>

        <div style={styles.actionBar}>
          {phase === "waiting" && (
            <>
              <button onClick={toggleReady} style={readyPlayers.includes(playerName) ? styles.btnReady : styles.btnNotReady}>
                {readyPlayers.includes(playerName) ? '✅ 已准备' : '⏳ 准备'}
              </button>
              {players.length >= 2 && allReady && players.find(p => p.name === playerName)?.seatId === 0 && (
                <button onClick={startGame} style={styles.btnStart}>🚀 开始游戏</button>
              )}
            </>
          )}
          {phase === "player_turn" && isMyTurn && (
            <>
              <button onClick={handleHit} style={styles.btnBid}>要牌</button>
              <button onClick={() => handleStand(false)} style={styles.btnBid}>停牌</button>
              {myPlayer?.isBust && !myPlayer?.isStanding && (myPlayer.cardCount === 3 || myPlayer.cardCount === 4) && (
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
              <button onClick={handleDealerHit} style={styles.btnBid}>要牌</button>
              <button onClick={() => handleDealerStand(false)} style={styles.btnBid}>停牌</button>
            </>
          )}
          {phase === "wheel" && isDealer && !wheelSpinning && (
            <button onClick={spinWheel} style={styles.btnStart}>🎯 开始抽庄</button>
          )}
          {phase === "wheel" && wheelSpinning && <span style={{ color: '#fbbf24', fontSize: '14px' }}>转盘中...</span>}

          {gameOver && phase !== "wheel" && (
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
                      backgroundColor: idx % 2 === 0 ? '#8b5cf6' : '#6d28d9',
                    }}>
                      <span style={styles.wheelSegmentText}>{name}</span>
                    </div>
                  );
                })}
              </div>
              <div style={styles.wheelPointer}>▼</div>
            </div>
            {wheelSelected && <div style={styles.wheelResult}>👑 {wheelSelected} 成为新庄家！</div>}
            {!wheelSelected && !wheelSpinning && isDealer && (
              <button onClick={spinWheel} style={styles.btnStart}>🎯 开始抽庄</button>
            )}
            {wheelSpinning && <div style={styles.wheelSpinningText}>🎲 转盘中...</div>}
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
    background: "radial-gradient(ellipse at 20% 50%, #1a0a2e 0%, #0f0f1a 50%, #0a0a12 100%)",
    display: "flex", justifyContent: "center", alignItems: "center", padding: "8px",
    fontFamily: "system-ui, sans-serif", position: "relative", overflow: "hidden",
  },
  glowOrb: {
    position: "absolute", top: "-20%", right: "-10%", width: "500px", height: "500px",
    background: "radial-gradient(circle, rgba(139,92,246,0.15), transparent 70%)",
    borderRadius: "50%", pointerEvents: "none" as const, animation: "pulse 4s ease-in-out infinite",
  },
  glowOrb2: {
    position: "absolute", bottom: "-30%", left: "-10%", width: "400px", height: "400px",
    background: "radial-gradient(circle, rgba(251,191,36,0.08), transparent 70%)",
    borderRadius: "50%", pointerEvents: "none" as const, animation: "pulse 5s ease-in-out infinite reverse",
  },
  card: {
    background: "rgba(255,255,255,0.04)", backdropFilter: "blur(30px)", borderRadius: "28px",
    padding: "32px 24px", maxWidth: "400px", width: "100%",
    border: "1px solid rgba(255,255,255,0.06)", boxShadow: "0 30px 80px rgba(0,0,0,0.6)",
    position: "relative", zIndex: 1,
  },
  logo: { fontSize: "48px", textAlign: "center" as const, marginBottom: "8px" },
  title: {
    textAlign: "center" as const, color: "#fff", fontSize: "32px", fontWeight: "800",
    marginBottom: "4px", background: "linear-gradient(135deg, #fbbf24, #f59e0b)",
    WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
  },
  subtitle: { textAlign: "center" as const, color: "rgba(255,255,255,0.4)", fontSize: "13px", marginBottom: "24px" },
  input: {
    width: "100%", padding: "12px 16px", marginBottom: "10px", borderRadius: "12px",
    border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.04)",
    color: "#fff", fontSize: "15px", outline: "none", transition: "all 0.3s",
    boxSizing: "border-box" as const,
  },
  btnGroup: { display: "flex", gap: "10px", marginTop: "4px" },
  btnPrimary: {
    flex: 1, padding: "12px", borderRadius: "12px", border: "none",
    background: "linear-gradient(135deg, #8b5cf6, #6d28d9)", color: "#fff",
    fontSize: "15px", fontWeight: "600", cursor: "pointer", boxShadow: "0 4px 20px rgba(139,92,246,0.3)",
  },
  btnSecondary: {
    flex: 1, padding: "12px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.04)", color: "#fff", fontSize: "15px", fontWeight: "600", cursor: "pointer",
  },
  tableContainer: {
    position: "relative", zIndex: 1, width: "100%", maxWidth: "500px",
    background: "rgba(255,255,255,0.04)", backdropFilter: "blur(30px)", borderRadius: "24px",
    padding: "12px 10px", border: "1px solid rgba(255,255,255,0.06)",
    boxShadow: "0 30px 80px rgba(0,0,0,0.5)",
  },
  table: {
    position: "relative", width: "100%", aspectRatio: "16/9",
    background: "linear-gradient(180deg, #2a1f3d 0%, #1a1329 100%)",
    borderRadius: "18px", border: "2px solid rgba(139,92,246,0.2)",
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
    background: "rgba(255,255,255,0.1)", color: "#fff", fontSize: "14px", fontWeight: "600", cursor: "pointer",
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
    background: "linear-gradient(135deg, #22d3ee, #0891b2)", color: "#fff",
    fontSize: "14px", fontWeight: "600", cursor: "pointer", boxShadow: "0 4px 16px rgba(34,211,238,0.25)",
  },
  btnReset: {
    padding: "8px 24px", borderRadius: "10px", border: "none",
    background: "linear-gradient(135deg, #fbbf24, #f59e0b)", color: "#0f0f1a",
    fontSize: "14px", fontWeight: "600", cursor: "pointer", boxShadow: "0 4px 16px rgba(251,191,36,0.2)",
  },
  myCardsArea: {
    marginTop: "10px", padding: "8px 12px", background: "rgba(0,0,0,0.3)",
    borderRadius: "10px", textAlign: "center" as const,
  },
  myCardsLabel: { fontSize: "12px", color: "rgba(255,255,255,0.5)", marginBottom: "4px" },
  myCardsContainer: { cursor: "pointer", display: "flex", justifyContent: "center", alignItems: "center", minHeight: "40px" },
  myCardsRow: { display: "flex", gap: "4px", alignItems: "center", flexWrap: "wrap" as const, justifyContent: "center" },
  myCard: { fontSize: "20px", padding: "2px 6px", background: "rgba(255,255,255,0.08)", borderRadius: "4px" },

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
    border: '4px solid #8b5cf6',
    boxShadow: '0 0 30px rgba(139,92,246,0.3)',
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