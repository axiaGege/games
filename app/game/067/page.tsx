"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";

// ==================== 工具函数 ====================
const rollDice = () => Array.from({ length: 5 }, () => Math.floor(Math.random() * 6) + 1);

// 骰子 SVG，41px，1和4红色，其余蓝色
const DiceSVG = ({ value, size = 41 }: { value: number; size?: number }) => {
  const dotPositions: Record<number, [number, number][]> = {
    1: [[50, 50]],
    2: [[30, 30], [70, 70]],
    3: [[30, 30], [50, 50], [70, 70]],
    4: [[30, 30], [70, 30], [30, 70], [70, 70]],
    5: [[30, 30], [70, 30], [50, 50], [30, 70], [70, 70]],
    6: [[30, 30], [70, 30], [30, 50], [70, 50], [30, 70], [70, 70]],
  };
  const dots = dotPositions[value] || [];
  const dotColor = (value === 1 || value === 4) ? "#e53e3e" : "#3182ce";

  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      <rect x="2" y="2" width="96" height="96" rx="12" fill="white" stroke="#ccc" strokeWidth="2" />
      {dots.map((pos, idx) => (
        <circle key={idx} cx={pos[0]} cy={pos[1]} r="8" fill={dotColor} />
      ))}
    </svg>
  );
};

const isStraight = (dice: number[]): boolean => {
  const sorted = [...dice].sort();
  return sorted.every((v, i) => i === 0 || v !== sorted[i - 1]);
};

// ✅ 修复 calc067：封印1后围骰不再加成
const calc067 = (dice: number[], targetValue: number, oneSealed: boolean) => {
  if (isStraight(dice)) {
    return { count: 0, value: targetValue, isStraight: true };
  }
  const counts = Array(7).fill(0);
  for (const d of dice) counts[d]++;
  // 纯豹
  for (let v = 1; v <= 6; v++) {
    if (counts[v] === 5) {
      return { count: 7, value: v, isStraight: false };
    }
  }
  // 含1豹子（围骰）：只有未封印1时才有效
  const ones = counts[1];
  if (!oneSealed && ones > 0) {
    const nonOneValues: number[] = [];
    for (let v = 2; v <= 6; v++) {
      if (counts[v] > 0) nonOneValues.push(v);
    }
    if (nonOneValues.length === 1) {
      const val = nonOneValues[0];
      return { count: 6, value: val, isStraight: false };
    }
  }
  // 普通计算
  let total = 0;
  if (!oneSealed) {
    total = counts[targetValue] + counts[1];
  } else {
    total = counts[targetValue];
  }
  return { count: total, value: targetValue, isStraight: false };
};

const parsePlayers = (raw: any): any[] => {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    if (typeof parsed === 'object') {
      const arr = Object.values(parsed);
      if (arr.length > 0 && arr[0]?.name) return arr;
    }
  } catch {
    try {
      const matches = raw.match(/"name":"([^"]+)"/g);
      if (matches) {
        return matches.map((m: string) => {
          const name = m.match(/"name":"([^"]+)"/)?.[1] || '未知';
          return { name, dice: [], ready: false, seatId: 0 };
        });
      }
    } catch {}
  }
  return [];
};

// ==================== 主组件 ====================
export default function GamePage() {
  const [playerName, setPlayerName] = useState("");
  const [roomPassword, setRoomPassword] = useState("");
  const [joined, setJoined] = useState(false);
  const [roomId, setRoomId] = useState("");

  const [players, setPlayers] = useState<any[]>([]);
  const [gameStarted, setGameStarted] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [result, setResult] = useState("");
  const [currentPlayer, setCurrentPlayer] = useState("");
  const [lastBid, setLastBid] = useState<{ player: string; count: number; value: number } | null>(null);
  const [phase, setPhase] = useState<"waiting" | "rolling" | "bidding" | "ended">("waiting");
  const [hasRolled, setHasRolled] = useState(false);
  const [myDice, setMyDice] = useState<number[]>([]);
  const [diceShaking, setDiceShaking] = useState(false);
  const [isLidOpen, setIsLidOpen] = useState(false);
  const [cupOpened, setCupOpened] = useState(false);
  const [oneSealed, setOneSealed] = useState(false);
  const [bidHistory, setBidHistory] = useState<string[]>([]);
  const [warning, setWarning] = useState("");
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
  const [nextStarter, setNextStarter] = useState<string | null>(null);
  const [mySeatId, setMySeatId] = useState<number | null>(null);
  const [hasRolledLocal, setHasRolledLocal] = useState(false);
  const [disconnected, setDisconnected] = useState(false);

  // 叫牌面板
  const [bidPage, setBidPage] = useState(0);
  const [selectedCount, setSelectedCount] = useState<number | null>(null);
  const [selectedValue, setSelectedValue] = useState<number | null>(null);
  // 快捷加叫
  const [lastBidDisplay, setLastBidDisplay] = useState<{ count: number; value: number } | null>(null);

  const [errorMsg, setErrorMsg] = useState("");
  const audioCtxRef = useRef<AudioContext | null>(null);
  const channelRef = useRef<any>(null);

  const bidPages = [
    [1,2,3,4,5,6,7],
    [8,9,10,11,12,13,14],
    [15,16,17,18,19,20]
  ];
  const values = [1,2,3,4,5,6];
  const quickAdds = [1,2,3,4];

  const playShakeSound = () => {
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      for (let i = 0; i < 12; i++) {
        setTimeout(() => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.frequency.value = 800 + Math.random() * 400;
          osc.type = "square";
          gain.gain.value = 0.05 + Math.random() * 0.05;
          osc.start();
          osc.stop(ctx.currentTime + 0.03);
        }, i * 60);
      }
    } catch (e) {}
  };

  // ==================== Supabase 订阅 ====================
  useEffect(() => {
    if (!roomId) return;
    console.log('🔄 订阅房间:', roomId);
    const channel = supabase
      .channel(`room:${roomId}`, { config: { broadcast: { ack: true } } })
      .on('broadcast', { event: 'gameState' }, (payload) => {
        console.log('📩 收到广播:', payload);
        const state = payload.payload;
        const parsedPlayers = parsePlayers(state.players);
        setPlayers(parsedPlayers);
        setGameStarted(state.gameStarted || false);
        setGameOver(state.gameOver || false);
        setResult(state.result || "");
        setCurrentPlayer(state.currentPlayer || "");
        setLastBid(state.lastBid || null);
        setPhase(state.phase || "waiting");
        setHasRolled(state.hasRolled || false);
        setOneSealed(state.oneSealed || false);
        setBidHistory(state.bidHistory || []);
        setWarning(state.warning || "");
        setCupOpened(state.cupOpened || false);
        setSelectedTarget(state.selectedTarget || null);
        setNextStarter(state.nextStarter || null);
        setDiceShaking(state.diceShaking || false);
        // 更新上家叫牌显示
        if (state.lastBid) {
          setLastBidDisplay({ count: state.lastBid.count, value: state.lastBid.value });
        } else {
          setLastBidDisplay(null);
        }
        if (state.phase === "waiting" || state.phase === "ended") {
          setSelectedCount(null);
          setSelectedValue(null);
        }
        const me = parsedPlayers.find((p: any) => p.name === playerName);
        if (me) {
          setMyDice(me.dice || []);
          setMySeatId(me.seatId !== undefined ? me.seatId : null);
          setHasRolledLocal(me.dice && me.dice.length > 0);
        }
        setDisconnected(false);
      })
      .subscribe((status) => {
        console.log('📡 订阅状态:', status);
        if (status === 'SUBSCRIBED') setDisconnected(false);
      });

    channelRef.current = channel;
    return () => {
      console.log('🔌 取消订阅');
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, [roomId, playerName]);

  const broadcastState = async (state: any) => {
    try {
      console.log('📤 发送广播:', state);
      const result = await supabase.channel(`room:${roomId}`).send({
        type: 'broadcast',
        event: 'gameState',
        payload: state,
      });
      console.log('📤 广播结果:', result);
      setDisconnected(false);
    } catch (error) {
      console.error('❌ 广播失败:', error);
      setDisconnected(true);
      setErrorMsg('⚠️ 连接断开，请检查网络后重试');
    }
  };

  const leaveRoom = async () => {
    if (!roomId) return;
    const updatedPlayers = players.filter(p => p.name !== playerName);
    await supabase.from("rooms").update({ players: updatedPlayers }).eq("id", roomId);
    await broadcastState({
      players: updatedPlayers,
      currentPlayer: "",
      gameStarted: false,
      gameOver: false,
      result: "",
      lastBid: null,
      phase: "waiting",
      hasRolled: false,
      oneSealed: false,
      bidHistory: [],
      warning: "",
      cupOpened: false,
      selectedTarget: null,
      nextStarter: null,
      diceShaking: false,
    });
    setJoined(false);
    setRoomId("");
    setPlayers([]);
    setGameStarted(false);
    setGameOver(false);
    setResult("");
    setCurrentPlayer("");
    setLastBid(null);
    setPhase("waiting");
    setHasRolled(false);
    setMyDice([]);
    setDiceShaking(false);
    setIsLidOpen(false);
    setCupOpened(false);
    setOneSealed(false);
    setBidHistory([]);
    setWarning("");
    setSelectedTarget(null);
    setNextStarter(null);
    setMySeatId(null);
    setHasRolledLocal(false);
    setDisconnected(false);
    setErrorMsg("");
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
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
      setErrorMsg("这个密码已被使用，请换一个");
      return;
    }

    const newPlayer = { name: playerName.trim(), dice: [], ready: true, seatId: 0 };
    const { data, error } = await supabase
      .from("rooms")
      .insert({
        game_type: "dice067",
        password: roomPassword.trim(),
        players: [newPlayer],
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
    await broadcastState({
      players: parsedPlayers,
      currentPlayer: "",
      gameStarted: false,
      gameOver: false,
      result: "",
      lastBid: null,
      phase: "waiting",
      hasRolled: false,
      oneSealed: false,
      bidHistory: [],
      warning: "",
      cupOpened: false,
      selectedTarget: null,
      nextStarter: null,
      diceShaking: false,
    });
  };

  const joinRoom = async () => {
    if (!playerName.trim()) { setErrorMsg("请输入名字"); return; }
    if (!roomPassword.trim()) { setErrorMsg("请输入房间密码"); return; }
    setErrorMsg("");

    console.log('📥 开始加入房间，密码:', roomPassword.trim());

    const { data, error } = await supabase
      .from("rooms")
      .select()
      .eq("password", roomPassword.trim())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      console.error('❌ 查询房间失败:', error);
      setErrorMsg("密码错误，未找到对应房间");
      return;
    }

    console.log('📥 查询到的房间数据:', data);

    const currentPlayers = parsePlayers(data.players);
    console.log('📥 解析后的 currentPlayers:', currentPlayers);

    if (currentPlayers.length >= 12) {
      setErrorMsg("房间已满（最多12人）");
      return;
    }

    if (currentPlayers.some((p: any) => p.name === playerName.trim())) {
      setRoomId(data.id);
      setJoined(true);
      return;
    }

    const occupiedSeats = currentPlayers.map((p: any) => p.seatId).filter((id: number) => id !== undefined);
    let seatId = 0;
    for (let i = 0; i < 12; i++) {
      if (!occupiedSeats.includes(i)) { seatId = i; break; }
    }

    const newPlayer = { name: playerName.trim(), dice: [], ready: false, seatId };
    const updatedPlayers = [...currentPlayers, newPlayer];
    console.log('📤 准备更新的 players:', updatedPlayers);

    const { error: updateError } = await supabase
      .from("rooms")
      .update({ players: updatedPlayers })
      .eq("id", data.id);

    if (updateError) {
      console.error('❌ 更新房间失败:', updateError);
      setErrorMsg("加入失败: " + updateError.message);
      return;
    }

    console.log('✅ 更新成功，准备广播');
    setRoomId(data.id);
    setJoined(true);
    setPlayers(updatedPlayers);
    await broadcastState({
      players: updatedPlayers,
      currentPlayer: "",
      gameStarted: false,
      gameOver: false,
      result: "",
      lastBid: null,
      phase: "waiting",
      hasRolled: false,
      oneSealed: false,
      bidHistory: [],
      warning: "",
      cupOpened: false,
      selectedTarget: null,
      nextStarter: null,
      diceShaking: false,
    });
  };

  const toggleReady = async () => {
    console.log('🔄 toggleReady 被点击');
    console.log('   playerName:', playerName);
    console.log('   players:', players);
    console.log('   roomId:', roomId);

    if (gameStarted) {
      setErrorMsg("游戏已开始，不能准备");
      console.warn('游戏已开始，不能准备');
      return;
    }

    const me = players.find(p => p.name === playerName);
    if (!me) {
      console.error('❌ 未找到玩家:', playerName, '在 players 列表中:', players);
      setErrorMsg("未找到你的信息，请刷新页面重试");
      return;
    }

    console.log('找到玩家:', me);

    if (me.seatId === 0) {
      setErrorMsg("房主无需准备");
      console.warn('房主无需准备');
      return;
    }

    const newReady = !me.ready;
    console.log('🔄 准备状态切换:', me.ready, '->', newReady);

    const updatedPlayers = players.map(p =>
      p.name === playerName ? { ...p, ready: newReady } : p
    );

    setPlayers(updatedPlayers);
    await supabase.from("rooms").update({ players: updatedPlayers }).eq("id", roomId);
    await broadcastState({
      players: updatedPlayers,
      currentPlayer,
      gameStarted,
      gameOver,
      result,
      lastBid,
      phase,
      hasRolled,
      oneSealed,
      bidHistory,
      warning,
      cupOpened,
      selectedTarget,
      nextStarter,
      diceShaking,
    });

    console.log('✅ 准备状态更新完成');
    setErrorMsg("");
  };

  const startGame = async () => {
    if (players.length < 2) { setErrorMsg("至少2人"); return; }
    
    setHasRolled(false);
    setHasRolledLocal(false);
    setCupOpened(false);
    setMyDice([]);
    setIsLidOpen(false);
    
    const allReady = players.every(p => p.seatId === 0 || p.ready === true);
    if (!allReady) {
      setErrorMsg("还有玩家未准备");
      return;
    }

    const resetPlayers = players.map(p => ({
      ...p,
      dice: [],
      ready: p.seatId === 0 ? true : false
    }));
    setPlayers(resetPlayers);
    setDiceShaking(true);
    setPhase("rolling");
    setErrorMsg("🎲 请所有玩家点击「摇骰」按钮！");
    
    await broadcastState({
      players: resetPlayers,
      currentPlayer: "",
      gameStarted: true,
      gameOver: false,
      result: "",
      lastBid: null,
      phase: "rolling",
      hasRolled: false,
      oneSealed: false,
      bidHistory: [],
      warning: "",
      cupOpened: false,
      selectedTarget: null,
      nextStarter,
      diceShaking: true,
    });
  };

  const handleRollDice = async () => {
    if (phase !== "rolling") {
      setErrorMsg("当前不是摇骰阶段");
      return;
    }
    if (players.find(p => p.name === playerName)?.dice?.length > 0) {
      setErrorMsg("你已经摇过骰子了");
      return;
    }
    if (cupOpened) {
      setErrorMsg("已查看过骰子，不能摇骰！");
      return;
    }

    const myDice = rollDice();
    const updatedPlayers = players.map(p =>
      p.name === playerName ? { ...p, dice: myDice } : p
    );
    setPlayers(updatedPlayers);
    setMyDice(myDice);
    setHasRolledLocal(true);
    playShakeSound();
    if (navigator.vibrate) navigator.vibrate(100);

    await broadcastState({
      players: updatedPlayers,
      currentPlayer: "",
      gameStarted: false,
      gameOver: false,
      result: "",
      lastBid: null,
      phase: "rolling",
      hasRolled: false,
      oneSealed: false,
      bidHistory: [],
      warning: "",
      cupOpened,
      selectedTarget,
      nextStarter,
      diceShaking: true,
    });

    const rolledCount = updatedPlayers.filter(p => p.dice && p.dice.length > 0).length;
    if (rolledCount === updatedPlayers.length && updatedPlayers.length >= 2) {
      const firstPlayer = nextStarter || updatedPlayers[0].name;
      setNextStarter(null);
      setCurrentPlayer(firstPlayer);
      setGameStarted(true);
      setPhase("bidding");
      setHasRolled(true);
      setDiceShaking(false);
      setErrorMsg("");
      
      await broadcastState({
        players: updatedPlayers,
        currentPlayer: firstPlayer,
        gameStarted: true,
        gameOver: false,
        result: "",
        lastBid: null,
        phase: "bidding",
        hasRolled: true,
        oneSealed: false,
        bidHistory: [],
        warning: "",
        cupOpened: false,
        selectedTarget: null,
        nextStarter: null,
        diceShaking: false,
      });
    }
  };

  // ==================== 快捷加叫功能 ====================
  const handleQuickBid = (add: number) => {
    if (!lastBidDisplay) {
      setErrorMsg("还没有上家叫牌");
      return;
    }
    if (currentPlayer !== playerName) {
      setErrorMsg("还没轮到你");
      return;
    }
    if (phase !== "bidding") {
      setErrorMsg("当前不是叫牌阶段");
      return;
    }
    const newCount = lastBidDisplay.count + add;
    if (newCount > 20) {
      setErrorMsg("超过最大数量20");
      return;
    }
    // 直接调用叫牌
    makeBidDirect(newCount, lastBidDisplay.value);
  };

  // 直接叫牌（供快捷加叫使用）
  const makeBidDirect = async (count: number, value: number) => {
    if (oneSealed && value === 1) {
      setErrorMsg("1已被封印，不能再叫1");
      return;
    }
    // 校验是否比上家大（已经由调用方保证）
    setErrorMsg("");

    let newOneSealed = oneSealed;
    if (value === 1) {
      newOneSealed = true;
    }

    const newBid = { player: playerName, count, value };
    setLastBid(newBid);
    const newHistory = [...bidHistory, `${playerName} 叫了 ${count}个${value}`];
    setBidHistory(newHistory);

    const playerNames = players.map((p) => p.name);
    const idx = playerNames.indexOf(currentPlayer);
    const nextIdx = (idx + 1) % playerNames.length;
    setCurrentPlayer(playerNames[nextIdx]);

    setSelectedCount(null);
    setSelectedValue(null);

    await broadcastState({
      players,
      currentPlayer: playerNames[nextIdx],
      gameStarted,
      gameOver,
      result,
      lastBid: newBid,
      phase,
      hasRolled,
      oneSealed: newOneSealed,
      bidHistory: newHistory,
      warning: "",
      cupOpened,
      selectedTarget,
      nextStarter,
      diceShaking,
    });
  };

  // ==================== 叫牌 ====================
  const handleCallBid = async () => {
    if (selectedCount === null || selectedValue === null) {
      setErrorMsg("请先选择数量和点数");
      return;
    }
    if (currentPlayer !== playerName) {
      setErrorMsg("还没轮到你");
      return;
    }
    if (phase !== "bidding") {
      setErrorMsg("当前不是叫牌阶段");
      return;
    }
    if (lastBid) {
      if (selectedCount < lastBid.count || (selectedCount === lastBid.count && selectedValue <= lastBid.value)) {
        setErrorMsg(`必须比 ${lastBid.count}个${lastBid.value} 更大`);
        return;
      }
    }
    // 调用直接叫牌
    await makeBidDirect(selectedCount, selectedValue);
  };

  // ==================== 开骰 ====================
  const openDice = async (targetPlayer?: string, isSnapOpen: boolean = false) => {
    if (phase !== "bidding") {
      setErrorMsg("当前不是叫牌阶段");
      return;
    }
    if (!lastBid) {
      setErrorMsg("没人叫牌，无法开");
      return;
    }

    const target = targetPlayer || selectedTarget || lastBid.player;
    if (!target) {
      setErrorMsg("请选择要开的玩家");
      return;
    }

    const hasCalled = bidHistory.some(entry => entry.includes(target));
    if (!hasCalled) {
      setErrorMsg(`${target} 本轮尚未叫牌，不能开`);
      return;
    }

    const targetData = players.find(p => p.name === target);
    if (!targetData || !targetData.dice || targetData.dice.length === 0) {
      setErrorMsg("目标玩家没有骰子");
      return;
    }

    setErrorMsg("");
    setSelectedTarget(null);

    const targetIsStraight = isStraight(targetData.dice);
    const caller = playerName;
    const bidder = lastBid.player;
    const calledCount = lastBid.count;
    const callerData = players.find(p => p.name === caller);
    const callerIsStraight = callerData ? isStraight(callerData.dice) : false;

    let totalCount = 0;
    let winner = "";
    let loser = "";

    // 情况1：双方都是顺子 → 开牌者输
    if (targetIsStraight && callerIsStraight) {
      loser = caller;
      winner = bidder;
    } 
    // 情况2：被开者是顺子，开牌者不是顺子 → 只统计开牌者
    else if (targetIsStraight) {
      // 统计开牌者自己的骰子（直接计算）
      if (callerData && callerData.dice && callerData.dice.length > 0) {
        const counts = Array(7).fill(0);
        for (const d of callerData.dice) counts[d]++;
        let count = counts[lastBid.value] + (oneSealed ? 0 : counts[1]);
        totalCount = count;
      }
      if (totalCount >= calledCount) {
        winner = bidder;
        loser = caller;
      } else {
        winner = caller;
        loser = bidder;
      }
    }
    // 情况3：被开者不是顺子 → 统计所有玩家（直接用面值统计，不用 calc067）
    else {
      let total = 0;
      for (const p of players) {
        if (p.dice && p.dice.length > 0) {
          const counts = Array(7).fill(0);
          for (const d of p.dice) counts[d]++;
          // 直接统计面值，不应用豹子加成
          let count = counts[lastBid.value] + (oneSealed ? 0 : counts[1]);
          total += count;
        }
      }
      totalCount = total;
      if (totalCount >= calledCount) {
        winner = bidder;
        loser = caller;
      } else {
        winner = caller;
        loser = bidder;
      }
    }

    setGameOver(true);
    setPhase("ended");
    let resultMsg = "";
    if (targetIsStraight && callerIsStraight) {
      resultMsg = `🍺 ${loser} 输了！（双方都是顺子，谁开谁喝）`;
    } else if (targetIsStraight) {
      resultMsg = `🍺 ${loser} 输了！${bidder}叫了 ${calledCount}个${lastBid.value}，${caller}的骰子实际有 ${totalCount} 个${lastBid.value}`;
    } else {
      resultMsg = `🍺 ${loser} 输了！${bidder}叫了 ${calledCount}个${lastBid.value}，全场实际有 ${totalCount} 个${lastBid.value}`;
    }
    setResult(resultMsg);

    if (isSnapOpen) {
      setNextStarter(caller);
    } else {
      setNextStarter(loser);
    }

    await broadcastState({
      players,
      currentPlayer,
      gameStarted,
      gameOver: true,
      result: resultMsg,
      lastBid,
      phase: "ended",
      hasRolled,
      oneSealed,
      bidHistory,
      warning: "",
      cupOpened,
      selectedTarget: null,
      nextStarter: isSnapOpen ? caller : loser,
      diceShaking: false,
    });
  };

  const resetGame = async () => {
    const resetPlayers = players.map(p => ({ ...p, dice: [], ready: p.seatId === 0 ? true : false }));
    setPlayers(resetPlayers);
    setGameStarted(false);
    setGameOver(false);
    setResult("");
    setLastBid(null);
    setCurrentPlayer("");
    setPhase("waiting");
    setHasRolled(false);
    setOneSealed(false);
    setBidHistory([]);
    setWarning("");
    setSelectedTarget(null);
    setIsLidOpen(false);
    setCupOpened(false);
    setHasRolledLocal(false);
    setMyDice([]);
    setSelectedCount(null);
    setSelectedValue(null);
    setDiceShaking(false);
    setLastBidDisplay(null);
    
    await supabase.from("rooms").update({ players: resetPlayers }).eq("id", roomId);
    
    await broadcastState({
      players: resetPlayers,
      currentPlayer: "",
      gameStarted: false,
      gameOver: false,
      result: "",
      lastBid: null,
      phase: "waiting",
      hasRolled: false,
      oneSealed: false,
      bidHistory: [],
      warning: "",
      cupOpened: false,
      selectedTarget: null,
      nextStarter,
      diceShaking: false,
    });
  };

  const handleLidOpen = async () => {
    setIsLidOpen(true);
    if (myDice.length > 0 && !cupOpened) {
      setCupOpened(true);
      await broadcastState({
        players,
        currentPlayer,
        gameStarted,
        gameOver,
        result,
        lastBid,
        phase,
        hasRolled,
        oneSealed,
        bidHistory,
        warning,
        cupOpened: true,
        selectedTarget,
        nextStarter,
        diceShaking,
      });
    }
  };

  const handleLidClose = () => {
    setIsLidOpen(false);
  };

  // ==================== 座位渲染（调整大小和间距） ====================
  const renderSeats = () => {
    const topSeats = [];
    for (let i = 0; i < 6; i++) {
      const left = 5 + i * 16;
      topSeats.push({ seatId: i, row: 'top', left });
    }
    const bottomSeats = [];
    for (let i = 0; i < 6; i++) {
      const left = 5 + i * 16;
      bottomSeats.push({ seatId: i + 6, row: 'bottom', left });
    }
    const allSeats = [...topSeats, ...bottomSeats];

    return allSeats.map((seat) => {
      const player = players.find(p => p.seatId === seat.seatId) || null;
      const isMe = player?.name === playerName;
      const isActive = player?.name === currentPlayer && gameStarted && !gameOver;
      const isReady = player?.ready || false;
      const isHost = player?.seatId === 0;
      const isTarget = player?.name === selectedTarget;

      return (
        <div
          key={seat.seatId}
          style={{
            position: 'absolute',
            left: `${seat.left}%`,
            top: seat.row === 'top' ? '4%' : '56%',
            transform: 'translateX(-50%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            width: '60px',
            height: '60px',
            background: isActive ? 'rgba(251,191,36,0.25)' : (isTarget ? 'rgba(251,191,36,0.15)' : (player ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.05)')),
            borderRadius: '50%',
            border: isActive ? '3px solid #fbbf24' : (isTarget ? '2px solid #fbbf24' : (player ? '2px solid #8b5cf6' : '2px dashed rgba(255,255,255,0.2)')),
            boxShadow: isActive ? '0 0 20px rgba(251,191,36,0.5)' : (isReady ? '0 0 10px rgba(34,211,238,0.3)' : 'none'),
            transition: 'all 0.3s',
            cursor: 'default',
            fontSize: '11px',
            color: '#ddd',
            textAlign: 'center',
          }}
        >
          {player ? (
            <>
              <span style={{ fontSize: '24px' }}>👤</span>
              <span style={{ fontSize: '11px', color: isMe ? '#fbbf24' : '#ddd', marginTop: '2px', maxWidth: '56px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {isMe ? `你` : player.name}
              </span>
              {isHost && <span style={{ fontSize: '12px', color: '#fbbf24', marginTop: '1px' }}>👑</span>}
              {isReady && <span style={{ fontSize: '10px', color: '#22d3ee', marginLeft: '2px' }}>✅</span>}
              {cupOpened && player.dice && player.dice.length > 0 && (
                <span style={{ fontSize: '10px', color: '#fbbf24', marginLeft: '2px' }}>👁️</span>
              )}
            </>
          ) : (
            <span style={{ fontSize: '28px', color: 'rgba(255,255,255,0.2)' }}>+</span>
          )}
        </div>
      );
    });
  };

  if (!joined) {
    return (
      <div style={styles.container}>
        <div style={styles.glowOrb}></div>
        <div style={styles.glowOrb2}></div>
        <div style={styles.card}>
          <div style={styles.logo}>🎲</div>
          <h1 style={styles.title}>零六七</h1>
          <p style={styles.subtitle}>酒桌吹牛 · 经典骰子</p>
          <input
            placeholder="👤 输入你的名字"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            style={styles.input}
          />
          <input
            placeholder="🔐 房间密码（设置或加入）"
            value={roomPassword}
            onChange={(e) => setRoomPassword(e.target.value)}
            style={styles.input}
          />
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
  return (
    <div style={styles.container}>
      <div style={styles.glowOrb}></div>
      <div style={styles.glowOrb2}></div>

      <div style={styles.tableContainer} className="table-container">
        <div style={styles.table}>
          {renderSeats()}

          <div style={styles.diceCenter}>
            <div style={styles.diceBase}>
              <div style={styles.diceDisplay}>
                {diceShaking ? (
                  <div style={styles.diceRow}>
                    {[1,2,3,4,5].map((_, idx) => (
                      <span key={idx} style={{ ...styles.diceShaking, animationDelay: `${idx * 0.1}s` }}>
                        🎲
                      </span>
                    ))}
                  </div>
                ) : isLidOpen && myDice.length > 0 ? (
                  <div style={styles.diceRow}>
                    {myDice.map((val, idx) => (
                      <DiceSVG key={idx} value={val} size={41} />
                    ))}
                  </div>
                ) : myDice.length > 0 && !isLidOpen ? (
                  <div style={styles.diceRow}>
                    {myDice.map((_, idx) => (
                      <span key={idx} style={{ fontSize: '36px', color: '#888' }}>❓</span>
                    ))}
                  </div>
                ) : (
                  <span style={{ fontSize: '28px', color: 'rgba(255,255,255,0.2)' }}>🎲</span>
                )}
              </div>

              <div
                style={{
                  ...styles.diceLid,
                  transform: isLidOpen ? 'translateY(-60px) rotateX(-10deg) scale(0.9)' : 'translateY(0) rotateX(0) scale(1)',
                  opacity: isLidOpen ? 0.5 : 1,
                  transition: 'transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.4s ease',
                }}
              >
                <div style={styles.lidInner}>
                  <span style={styles.lidHandle}>🎲</span>
                  <span style={styles.lidLabel}>骰盅</span>
                </div>
              </div>
            </div>

            <div style={styles.lidControls}>
              {!gameStarted ? (
                <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '13px' }}>等待开始...</span>
              ) : diceShaking ? (
                <span style={{ color: '#fbbf24', fontSize: '15px' }}>🎲 摇骰中...</span>
              ) : (
                <>
                  <button onClick={handleLidOpen} style={styles.lidBtn}>👆 开盅</button>
                  <button onClick={handleLidClose} style={styles.lidBtn}>👇 关盅</button>
                </>
              )}
            </div>

            {isLidOpen && myDice.length > 0 && (
              <div style={styles.diceStats}>
                {(() => {
                  const hasStraight = isStraight(myDice);
                  const counts = Array(7).fill(0);
                  for (const d of myDice) counts[d]++;
                  const ones = counts[1];
                  const maxCount = Math.max(...counts);
                  const maxVal = counts.indexOf(maxCount);
                  let label = '';
                  if (hasStraight) label = '🌈 顺子 (0)';
                  else if (maxCount === 5) label = `🔥 纯豹 (7个${maxVal})`;
                  else if (!oneSealed && ones > 0 && counts.slice(2).filter(c => c > 0).length === 1) {
                    const val = counts.indexOf(Math.max(...counts.slice(2)));
                    if (val > 0) label = `💫 围骰 (6个${val})`;
                  }
                  if (!label) label = `${myDice.length}颗骰子`;
                  return <span style={{ color: '#fbbf24', fontSize: '14px' }}>{label}</span>;
                })()}
              </div>
            )}

            {cupOpened && (
              <div style={{ color: '#ef4444', fontSize: '13px', marginTop: '4px' }}>
                ⚠️ 已查看，本局不能再摇骰
              </div>
            )}
          </div>

          {/* 顶部信息栏重新布局 */}
          <div style={styles.roomInfo}>
            <span style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <span>🏠 {roomId.slice(0, 8)}</span>
              <span>👥 {players.length}/12</span>
            </span>
            <button
              onClick={leaveRoom}
              style={{
                background: 'rgba(239,68,68,0.2)',
                border: '1px solid #ef4444',
                color: '#f87171',
                padding: '2px 10px',
                borderRadius: '12px',
                fontSize: '12px',
                cursor: 'pointer',
                marginLeft: 'auto',
              }}
            >
              🚪 离开
            </button>
          </div>
        </div>

        <div style={styles.statusBar}>
          {!gameStarted && phase !== "rolling" ? (
            <span style={styles.statusText}>
              ⏳ 等待开始 {players.length >= 2 ? '（房主点击"开始游戏"）' : '（至少2人）'}
            </span>
          ) : gameOver ? (
            <span style={styles.resultText}>{result}</span>
          ) : phase === "rolling" ? (
            <span style={styles.statusText}>
              🎲 摇骰中... ({players.filter(p => p.dice && p.dice.length > 0).length}/{players.length} 已摇)
            </span>
          ) : (
            <span style={styles.statusText}>
              🎯 {currentPlayer} 的回合 {oneSealed && '🔒 1已封印'}
            </span>
          )}
        </div>

        {!gameStarted && phase !== "rolling" && (
          <div style={styles.readySummary}>
            ✅ 已准备：{players.filter(p => p.ready).length}/{players.length} 人
            {players.filter(p => p.ready).length > 0 && (
              <span style={{ marginLeft: '8px', color: 'rgba(255,255,255,0.5)', fontSize: '12px' }}>
                （{players.filter(p => p.ready).map(p => p.name).join('、')}）
              </span>
            )}
          </div>
        )}

        {phase === "rolling" && (
          <div style={{ textAlign: 'center', marginBottom: '12px', fontSize: '13px', color: 'rgba(255,255,255,0.6)' }}>
            未摇骰: {players.filter(p => !p.dice || p.dice.length === 0).map(p => p.name).join('、') || '全部已摇'}
          </div>
        )}

        {warning && (
          <div style={styles.warningBanner}>
            ⚠️ {warning}
          </div>
        )}

        {bidHistory.length > 0 && (
          <div style={styles.historyContainer}>
            <div style={styles.historyTitle}>📜 叫牌记录</div>
            {bidHistory.slice(-5).reverse().map((log, idx) => (
              <div key={idx} style={styles.historyEntry}>{log}</div>
            ))}
          </div>
        )}

        <div style={styles.actionBar}>
          {phase === "waiting" && !gameStarted && (
            <>
              {players.find(p => p.name === playerName)?.seatId === 0 ? (
                <span style={{ color: '#888', fontSize: '14px' }}>👑 房主（已准备）</span>
              ) : (
                <button onClick={toggleReady} style={players.find(p => p.name === playerName)?.ready ? styles.btnReady : styles.btnNotReady}>
                  {players.find(p => p.name === playerName)?.ready ? '✅ 已准备' : '⏳ 准备'}
                </button>
              )}
              {players.length >= 2 && players.find(p => p.name === playerName)?.seatId === 0 && (
                <button onClick={startGame} style={styles.btnStart} disabled={diceShaking}>
                  {diceShaking ? '摇骰中...' : '🚀 开始游戏'}
                </button>
              )}
            </>
          )}
          {phase === "rolling" && (
            <button 
              onClick={handleRollDice} 
              style={hasRolledLocal ? styles.btnReady : styles.btnStart}
              disabled={hasRolledLocal || cupOpened}
            >
              {hasRolledLocal ? '✅ 已摇骰' : (cupOpened ? '🔒 骰盅已开' : '🎲 摇骰')}
            </button>
          )}
          {gameStarted && !gameOver && phase === "bidding" && (
            <>
              {currentPlayer === playerName ? (
                <>
                  {/* 叫牌面板 */}
                  <div style={styles.bidPanel}>
                    {/* 快捷加叫行 */}
                    {lastBidDisplay && (
                      <div style={styles.quickAddRow}>
                        <span style={{ color: '#aaa', fontSize: '13px', marginRight: '6px' }}>上家: {lastBidDisplay.count}个{lastBidDisplay.value}</span>
                        {quickAdds.map(add => (
                          <button
                            key={add}
                            onClick={() => handleQuickBid(add)}
                            style={styles.quickAddBtn}
                          >
                            +{add}
                          </button>
                        ))}
                      </div>
                    )}
                    {/* 点数行 */}
                    <div style={styles.bidValueRow}>
                      {values.map(v => (
                        <button
                          key={v}
                          onClick={() => setSelectedValue(v)}
                          style={{
                            ...styles.bidNumBtn,
                            background: selectedValue === v ? '#fbbf24' : 'rgba(255,255,255,0.08)',
                            border: selectedValue === v ? '2px solid #fbbf24' : '1px solid rgba(255,255,255,0.1)',
                            opacity: 1,
                            cursor: 'pointer',
                          }}
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                    {/* 数量行 */}
                    <div style={styles.bidCountRow}>
                      {bidPages[bidPage].map(num => (
                        <button
                          key={num}
                          onClick={() => setSelectedCount(num)}
                          style={{
                            ...styles.bidNumBtn,
                            background: selectedCount === num ? '#8b5cf6' : 'rgba(255,255,255,0.08)',
                            border: selectedCount === num ? '2px solid #8b5cf6' : '1px solid rgba(255,255,255,0.1)',
                          }}
                        >
                          {num}个
                        </button>
                      ))}
                    </div>
                    <div style={styles.bidNav}>
                      <button onClick={() => setBidPage(Math.max(0, bidPage-1))} style={styles.bidNavBtn}>◀</button>
                      <span style={{ color: '#aaa', fontSize: '13px' }}>{bidPage+1}/3</span>
                      <button onClick={() => setBidPage(Math.min(2, bidPage+1))} style={styles.bidNavBtn}>▶</button>
                      <button onClick={handleCallBid} style={styles.bidCallBtn}>叫牌</button>
                    </div>
                    {selectedCount !== null && selectedValue !== null && (
                      <div style={styles.bidPreview}>
                        当前选择: <strong>{selectedCount}个{selectedValue}</strong>
                      </div>
                    )}
                  </div>
                  <div style={styles.targetSelector}>
                    <span style={{ color: '#ccc', marginRight: '8px', fontSize: '14px' }}>开谁：</span>
                    <select
                      value={selectedTarget || ''}
                      onChange={(e) => {
                        const val = e.target.value || null;
                        setSelectedTarget(val);
                        broadcastState({
                          players,
                          currentPlayer,
                          gameStarted,
                          gameOver,
                          result,
                          lastBid,
                          phase,
                          hasRolled,
                          oneSealed,
                          bidHistory,
                          warning,
                          cupOpened,
                          selectedTarget: val,
                          nextStarter,
                          diceShaking,
                        });
                      }}
                      style={styles.targetSelect}
                    >
                      <option value="">默认（上一个叫牌者）</option>
                      {players.filter(p => p.name !== playerName).map(p => (
                        <option key={p.name} value={p.name}>{p.name}</option>
                      ))}
                    </select>
                    <button onClick={() => openDice(undefined, false)} style={styles.btnOpen}>🔓 开骰</button>
                  </div>
                </>
              ) : (
                <div style={styles.waitBox}>
                  <span style={styles.waitText}>⏳ 等待 {currentPlayer} 操作</span>
                  <div style={styles.targetSelector}>
                    <span style={{ color: '#ccc', marginRight: '8px', fontSize: '14px' }}>抢开谁：</span>
                    <select
                      value={selectedTarget || ''}
                      onChange={(e) => {
                        const val = e.target.value || null;
                        setSelectedTarget(val);
                        broadcastState({
                          players,
                          currentPlayer,
                          gameStarted,
                          gameOver,
                          result,
                          lastBid,
                          phase,
                          hasRolled,
                          oneSealed,
                          bidHistory,
                          warning,
                          cupOpened,
                          selectedTarget: val,
                          nextStarter,
                          diceShaking,
                        });
                      }}
                      style={styles.targetSelect}
                    >
                      <option value="">选择目标</option>
                      {players.filter(p => p.name !== playerName).map(p => (
                        <option key={p.name} value={p.name}>{p.name}</option>
                      ))}
                    </select>
                    <button onClick={() => openDice(selectedTarget || undefined, true)} style={styles.btnOpenSmall}>⚡ 抢开</button>
                  </div>
                </div>
              )}
            </>
          )}
          {gameOver && (
            <button onClick={resetGame} style={styles.btnReset}>🔄 再来一局</button>
          )}
          {errorMsg && <div style={{ color: "#f87171", fontSize: 13, marginTop: 8 }}>{errorMsg}</div>}
          {disconnected && <div style={{ color: "#f87171", fontSize: 13, marginTop: 4 }}>⚠️ 网络连接断开，部分操作可能无法同步</div>}
        </div>

        {lastBid && !gameOver && phase === "bidding" && (
          <div style={styles.bidInfo}>
            📢 {lastBid.player} 叫了 {lastBid.count} 个 {lastBid.value} {oneSealed && '🔒 1已封印'}
          </div>
        )}
      </div>

      <style>{`
        .table-container.shake-warning {
          animation: shakeRed 0.5s ease-in-out 3;
          border: 3px solid #ef4444 !important;
        }
        @keyframes shakeRed {
          0%, 100% { transform: translateX(0); border-color: #ef4444; }
          25% { transform: translateX(-10px); }
          75% { transform: translateX(10px); }
        }
        @keyframes shake {
          0% { transform: rotate(0deg) scale(1); }
          25% { transform: rotate(10deg) scale(1.1); }
          50% { transform: rotate(-10deg) scale(0.9); }
          75% { transform: rotate(5deg) scale(1.05); }
          100% { transform: rotate(0deg) scale(1); }
        }
        @keyframes pulseWarning {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}

// ==================== 样式（布局优化） ====================
const styles: any = {
  container: {
    minHeight: "100vh",
    background: "radial-gradient(ellipse at 20% 50%, #1a0a2e 0%, #0f0f1a 50%, #0a0a12 100%)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    padding: "8px",
    fontFamily: "system-ui, sans-serif",
    position: "relative",
    overflow: "hidden",
  },
  glowOrb: {
    position: "absolute",
    top: "-20%", right: "-10%",
    width: "500px", height: "500px",
    background: "radial-gradient(circle, rgba(139,92,246,0.15), transparent 70%)",
    borderRadius: "50%",
    pointerEvents: "none" as const,
    animation: "pulse 4s ease-in-out infinite",
  },
  glowOrb2: {
    position: "absolute",
    bottom: "-30%", left: "-10%",
    width: "400px", height: "400px",
    background: "radial-gradient(circle, rgba(251,191,36,0.08), transparent 70%)",
    borderRadius: "50%",
    pointerEvents: "none" as const,
    animation: "pulse 5s ease-in-out infinite reverse",
  },
  card: {
    background: "rgba(255,255,255,0.04)",
    backdropFilter: "blur(30px)",
    borderRadius: "28px",
    padding: "32px 24px",
    maxWidth: "400px",
    width: "100%",
    border: "1px solid rgba(255,255,255,0.06)",
    boxShadow: "0 30px 80px rgba(0,0,0,0.6)",
    position: "relative",
    zIndex: 1,
  },
  logo: { fontSize: "48px", textAlign: "center" as const, marginBottom: "8px" },
  title: {
    textAlign: "center" as const,
    color: "#fff",
    fontSize: "32px",
    fontWeight: "800",
    marginBottom: "4px",
    background: "linear-gradient(135deg, #fbbf24, #f59e0b)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
  },
  subtitle: { textAlign: "center" as const, color: "rgba(255,255,255,0.4)", fontSize: "13px", marginBottom: "24px" },
  input: {
    width: "100%",
    padding: "12px 16px",
    marginBottom: "10px",
    borderRadius: "12px",
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.04)",
    color: "#fff",
    fontSize: "15px",
    outline: "none",
    transition: "all 0.3s",
    boxSizing: "border-box" as const,
  },
  btnGroup: { display: "flex", gap: "10px", marginTop: "4px" },
  btnPrimary: {
    flex: 1,
    padding: "12px",
    borderRadius: "12px",
    border: "none",
    background: "linear-gradient(135deg, #8b5cf6, #6d28d9)",
    color: "#fff",
    fontSize: "15px",
    fontWeight: "600",
    cursor: "pointer",
    boxShadow: "0 4px 20px rgba(139,92,246,0.3)",
  },
  btnSecondary: {
    flex: 1,
    padding: "12px",
    borderRadius: "12px",
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.04)",
    color: "#fff",
    fontSize: "15px",
    fontWeight: "600",
    cursor: "pointer",
  },
  tableContainer: {
    position: "relative",
    zIndex: 1,
    width: "100%",
    maxWidth: "500px",
    background: "rgba(255,255,255,0.04)",
    backdropFilter: "blur(30px)",
    borderRadius: "24px",
    padding: "12px 10px",
    border: "1px solid rgba(255,255,255,0.06)",
    boxShadow: "0 30px 80px rgba(0,0,0,0.5)",
  },
  table: {
    position: "relative",
    width: "100%",
    aspectRatio: "16/9",
    background: "linear-gradient(180deg, #2a1f3d 0%, #1a1329 100%)",
    borderRadius: "18px",
    border: "2px solid rgba(139,92,246,0.2)",
    boxShadow: "inset 0 0 40px rgba(0,0,0,0.5)",
    marginBottom: "16px",
    overflow: "visible",
  },
  roomInfo: {
    position: "absolute",
    top: "6px",
    right: "10px",
    left: "10px",
    color: "rgba(255,255,255,0.5)",
    fontSize: "11px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    background: "rgba(0,0,0,0.3)",
    padding: "4px 10px",
    borderRadius: "14px",
    zIndex: 3,
  },
  diceCenter: {
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  },
  diceBase: {
    position: 'relative',
    width: '160px',
    height: '160px',
    background: 'radial-gradient(ellipse at 40% 40%, #4a3a5a, #1a0a2a)',
    borderRadius: '50%',
    border: '3px solid rgba(139,92,246,0.2)',
    boxShadow: 'inset 0 -10px 30px rgba(0,0,0,0.6), 0 10px 40px rgba(0,0,0,0.4)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto',
  },
  diceDisplay: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    zIndex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: '100%',
    padding: '15px',
    boxSizing: 'border-box' as const,
  },
  diceRow: {
    display: 'flex',
    gap: '8px',
    justifyContent: 'center',
    alignItems: 'center',
    flexWrap: 'wrap' as const,
  },
  diceShaking: {
    fontSize: '34px',
    display: 'inline-block',
    animation: 'shake 0.15s infinite alternate',
    opacity: 0.7,
  },
  diceLid: {
    position: 'absolute',
    top: '-5px',
    left: '-5px',
    right: '-5px',
    bottom: '-5px',
    borderRadius: '50%',
    background: 'radial-gradient(ellipse at 30% 20%, #6a5a7a, #2a1a3a)',
    border: '2px solid rgba(139,92,246,0.2)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 0,
    transformOrigin: 'bottom center',
    transition: 'transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.4s ease',
    cursor: 'pointer',
    clipPath: 'polygon(20% 0%, 80% 0%, 95% 90%, 5% 90%)',
    borderRadius: '50% 50% 40% 40% / 100% 100% 30% 30%',
    boxShadow: '0 8px 30px rgba(0,0,0,0.6), inset 0 -20px 30px rgba(0,0,0,0.4), inset 0 10px 20px rgba(255,255,255,0.1)',
  },
  lidInner: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: '-10px',
  },
  lidHandle: {
    fontSize: '30px',
    opacity: 0.5,
  },
  lidLabel: {
    fontSize: '10px',
    color: 'rgba(255,255,255,0.2)',
    marginTop: '2px',
    letterSpacing: '2px',
  },
  diceStats: {
    marginTop: '6px',
    padding: '4px 12px',
    background: 'rgba(0,0,0,0.4)',
    borderRadius: '10px',
    fontSize: '13px',
    color: '#fbbf24',
    textAlign: 'center' as const,
  },
  lidControls: {
    display: 'flex',
    gap: '10px',
    marginTop: '8px',
    justifyContent: 'center',
  },
  lidBtn: {
    padding: '4px 14px',
    borderRadius: '16px',
    border: 'none',
    background: 'rgba(255,255,255,0.1)',
    color: '#fff',
    fontSize: '12px',
    cursor: 'pointer',
    backdropFilter: "blur(4px)",
    transition: 'all 0.2s',
    border: '1px solid rgba(255,255,255,0.1)',
    '&:hover': {
      background: 'rgba(255,255,255,0.2)',
    },
  },
  statusBar: {
    background: "rgba(255,255,255,0.04)",
    borderRadius: "12px",
    padding: "8px 12px",
    textAlign: "center" as const,
    marginBottom: "10px",
    minHeight: "36px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: "1px solid rgba(255,255,255,0.04)",
    fontSize: "13px",
  },
  statusText: { color: "rgba(255,255,255,0.6)", fontSize: "13px" },
  resultText: { color: "#fbbf24", fontSize: "15px", fontWeight: "600" },
  readySummary: {
    background: "rgba(34,211,238,0.05)",
    borderRadius: "8px",
    padding: "4px 10px",
    marginBottom: "10px",
    textAlign: "center" as const,
    color: "rgba(255,255,255,0.7)",
    fontSize: "12px",
  },
  warningBanner: {
    background: "rgba(239,68,68,0.15)",
    border: "1px solid #ef4444",
    borderRadius: "8px",
    padding: "4px 10px",
    marginBottom: "8px",
    textAlign: "center" as const,
    color: "#f87171",
    fontSize: "12px",
    fontWeight: "600",
    animation: "pulseWarning 1s ease-in-out infinite",
  },
  historyContainer: {
    background: "rgba(0,0,0,0.3)",
    borderRadius: "8px",
    padding: "4px 8px",
    marginBottom: "8px",
    maxHeight: "60px",
    overflowY: "auto",
    fontSize: "11px",
    color: "rgba(255,255,255,0.6)",
  },
  historyTitle: { fontWeight: "bold", color: "rgba(255,255,255,0.8)", marginBottom: "2px", fontSize: "11px" },
  historyEntry: { padding: "2px 0", borderBottom: "1px solid rgba(255,255,255,0.05)", fontSize: "10px" },
  actionBar: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "8px",
    alignItems: "center",
    marginTop: "4px",
  },
  bidPanel: {
    background: 'rgba(0,0,0,0.3)',
    borderRadius: '14px',
    padding: '8px 8px',
    marginBottom: '6px',
    width: '100%',
    maxWidth: '400px',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '6px',
  },
  quickAddRow: {
    display: 'flex',
    gap: '6px',
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    flexWrap: 'wrap' as const,
  },
  quickAddBtn: {
    padding: '2px 12px',
    borderRadius: '12px',
    border: '1px solid rgba(251,191,36,0.3)',
    background: 'rgba(251,191,36,0.1)',
    color: '#fbbf24',
    fontSize: '13px',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  bidValueRow: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '5px',
    justifyContent: 'center',
    width: '100%',
  },
  bidCountRow: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '5px',
    justifyContent: 'center',
    width: '100%',
  },
  bidNumBtn: {
    width: '36px',
    height: '36px',
    borderRadius: '8px',
    border: '1px solid rgba(255,255,255,0.1)',
    background: 'rgba(255,255,255,0.08)',
    color: '#fff',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bidNav: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
    marginTop: '2px',
  },
  bidNavBtn: {
    padding: '2px 10px',
    borderRadius: '6px',
    border: '1px solid rgba(255,255,255,0.1)',
    background: 'rgba(255,255,255,0.05)',
    color: '#fff',
    fontSize: '16px',
    cursor: 'pointer',
  },
  bidCallBtn: {
    padding: '4px 16px',
    borderRadius: '16px',
    border: 'none',
    background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)',
    color: '#fff',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    boxShadow: '0 4px 12px rgba(139,92,246,0.3)',
  },
  bidPreview: {
    color: '#fbbf24',
    fontSize: '13px',
    marginTop: '2px',
  },
  targetSelector: {
    display: "flex",
    alignItems: "center",
    gap: "4px",
    marginTop: "4px",
    flexWrap: "wrap" as const,
    justifyContent: "center",
  },
  targetSelect: {
    padding: "3px 8px",
    borderRadius: "6px",
    border: "1px solid rgba(255,255,255,0.2)",
    background: "rgba(0,0,0,0.3)",
    color: "#fff",
    fontSize: "12px",
    outline: "none",
  },
  btnOpen: {
    padding: "8px 24px",
    borderRadius: "10px",
    border: "none",
    background: "linear-gradient(135deg, #f43f5e, #e11d48)",
    color: "#fff",
    fontSize: "14px",
    fontWeight: "600",
    cursor: "pointer",
    boxShadow: "0 4px 16px rgba(244,63,94,0.3)",
  },
  btnOpenSmall: {
    padding: "3px 12px",
    borderRadius: "14px",
    border: "none",
    background: "rgba(244,63,94,0.7)",
    color: "#fff",
    fontSize: "12px",
    cursor: "pointer",
  },
  btnReady: {
    padding: "6px 16px",
    borderRadius: "16px",
    border: "none",
    background: "#22d3ee",
    color: "#0f0f1a",
    fontSize: "13px",
    fontWeight: "600",
    cursor: "pointer",
  },
  btnNotReady: {
    padding: "6px 16px",
    borderRadius: "16px",
    border: "1px solid rgba(255,255,255,0.2)",
    background: "rgba(255,255,255,0.05)",
    color: "#fff",
    fontSize: "13px",
    fontWeight: "600",
    cursor: "pointer",
  },
  btnStart: {
    padding: "8px 24px",
    borderRadius: "10px",
    border: "none",
    background: "linear-gradient(135deg, #22d3ee, #0891b2)",
    color: "#fff",
    fontSize: "14px",
    fontWeight: "600",
    cursor: "pointer",
    boxShadow: "0 4px 16px rgba(34,211,238,0.25)",
  },
  btnReset: {
    padding: "8px 24px",
    borderRadius: "10px",
    border: "none",
    background: "linear-gradient(135deg, #fbbf24, #f59e0b)",
    color: "#0f0f1a",
    fontSize: "14px",
    fontWeight: "600",
    cursor: "pointer",
    boxShadow: "0 4px 16px rgba(251,191,36,0.2)",
  },
  waitBox: { padding: "8px", textAlign: "center" as const },
  waitText: { color: "rgba(255,255,255,0.4)", fontSize: "13px" },
  bidInfo: {
    background: "rgba(251,191,36,0.06)",
    borderRadius: "8px",
    padding: "6px 10px",
    textAlign: "center" as const,
    color: "#fbbf24",
    marginTop: "8px",
    fontSize: "13px",
  },
};

if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `
    @keyframes pulse {
      0%, 100% { opacity: 0.4; transform: scale(1); }
      50% { opacity: 0.8; transform: scale(1.1); }
    }
  `;
  document.head.appendChild(style);
}