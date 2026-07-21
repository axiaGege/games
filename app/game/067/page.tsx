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

// 单个玩家对“叫的点数 V”的实有个数（含围铱+1、纯豹+2 加成）
const countForValue = (dice: number[], V: number, sealed: boolean): number => {
  if (!dice || dice.length === 0) return 0;
  // 顺子（五颗无重复）：整手归零，不参与数“叫的点数”
  if (isStraight(dice)) return 0;
  // 纯豹：5 颗全相同 → 7 个（仅当 V 等于该点数时加成，否则 1 仍可按百搭计）
  const allSame = dice.every(d => d === dice[0]);
  if (allSame && V === dice[0]) return 7;
  // 围铱：含 1 且其余只有一种点数 → 6 个（仅当 V 等于该点数时加成）
  const ones = dice.filter(d => d === 1).length;
  const nonOneVals = Array.from(new Set(dice.filter(d => d !== 1)));
  if (!sealed && ones > 0 && nonOneVals.length === 1 && V === nonOneVals[0]) return 6;
  // 普通：真实点数 + 未封印时的百搭 1
  let c = 0;
  for (const d of dice) {
    if (d === V) c++;
    else if (d === 1 && !sealed) c++;
  }
  return c;
};

// 计算067规则（修正封印1后围骰不加成）—— 此函数未使用，可保留或删除
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

// 修复 TypeScript 类型错误
const parsePlayers = (raw: any): any[] => {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    if (typeof parsed === 'object') {
      const arr = Object.values(parsed) as any[];
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
  const [showReveal, setShowReveal] = useState(false);
  const revealDismissedRef = useRef(false); // 摊牌弹窗：玩家点✕关闭后，本局内不再被广播/对账重新弹出
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
  const [selectedTargets, setSelectedTargets] = useState<string[]>([]);
  const [nextStarter, setNextStarter] = useState<string | null>(null);
  const [mySeatId, setMySeatId] = useState<number | null>(null);
  const [hasRolledLocal, setHasRolledLocal] = useState(false);
  const [disconnected, setDisconnected] = useState(false);
  const [rolling, setRolling] = useState(false);
  const [rollingDice, setRollingDice] = useState<number[]>([]);
  const rollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const gVersionRef = useRef(0); // 同步版本号单调闸：每条操作消息编号递增，接收端丢弃过期旧消息
  const rollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 叫牌面板
  const [bidPage, setBidPage] = useState(0);
  const [selectedCount, setSelectedCount] = useState<number | null>(null);
  const [selectedValue, setSelectedValue] = useState<number | null>(null);
  // 快捷加叫
  const [lastBidDisplay, setLastBidDisplay] = useState<{ count: number; value: number } | null>(null);
  // 开牌方（点"开"的人）名字，用于摊牌浮层正确显示"谁喝"
  const [rvOpenerName, setRvOpenerName] = useState<string>("");
  const [rvIsSnapOpen, setRvIsSnapOpen] = useState<boolean>(false);
  // 顺时针座位顺序：上排左→右(0..5)，下到右角(11)，下排右→左(11..6)，回到左上角(0)
  const CLOCKWISE_SEAT_ORDER = [0, 1, 2, 3, 4, 5, 11, 10, 9, 8, 7, 6];
  const seatOrderIndex = (s: number) => { const i = CLOCKWISE_SEAT_ORDER.indexOf(s); return i < 0 ? 99 : i; };

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

  // ==================== Supabase 订阅（同步 diceShaking） ====================
  useEffect(() => {
    if (!roomId) return;
    console.log('🔄 订阅房间:', roomId);
    const channel = supabase
      .channel(`room:${roomId}`, { config: { broadcast: { ack: true } } })
      .on('broadcast', { event: 'gameState' }, (payload) => {
        const state = payload.payload;
        // 版本号单调闸：迟到/乱序的旧消息整条丢弃，绝不被旧进度覆盖当前状态
        if (state.version != null && state.version < gVersionRef.current) {
          console.log('📩 丢弃过期消息 v=', state.version, '< 本地', gVersionRef.current);
          return;
        }
        if (state.version != null) gVersionRef.current = Math.max(gVersionRef.current, state.version);
        applyRemoteState(state);
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

  // ============ 自动重连：刷新页面后自动回到原房间，无需重新输密码 ============
  useEffect(() => {
    try {
      const savedName = localStorage.getItem('067_name');
      const savedPass = localStorage.getItem('067_pass');
      if (savedName && savedPass) {
        joinRoom(savedName, savedPass);
      }
    } catch (_) {}
    // 仅在组件挂载时执行一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ============ 远端状态应用（广播接收 + 定时对账共用，逻辑只写一处） ============
  const applyRemoteState = (state: any) => {
    const parsedPlayers = parsePlayers(state.players);
    setPlayers(parsedPlayers);
    setGameStarted(state.gameStarted || false);
    setGameOver(state.gameOver || false);
    if (state.gameOver) {
      // 玩家本局已主动关掉摊牌弹窗，则不再被广播/定时对账强制重新弹出
      if (!revealDismissedRef.current) setShowReveal(true);
      setIsLidOpen(false);
    } else {
      setShowReveal(false);
      revealDismissedRef.current = false; // 新一局开始，重置标记，下一局摊牌照常弹出
    }
    setRvOpenerName(state.opener || "");
    setRvIsSnapOpen(state.isSnapOpen || false);
    setResult(state.result || "");
    setCurrentPlayer(state.currentPlayer || "");
    setLastBid(state.lastBid || null);
    // 对局进行中(rolling/bidding)时，拒绝被迟到/错误的 "waiting" 广播拉回准备阶段；
    // 仅"再来一局"(resetGame→waiting) 或 全员离开 才允许回到 waiting。
    setPhase((prevPhase) => {
      if ((prevPhase === "rolling" || prevPhase === "bidding") && state.phase === "waiting") {
        return prevPhase;
      }
      return state.phase || "waiting";
    });
    setHasRolled(state.hasRolled || false);
    setOneSealed(state.oneSealed || false);
    setBidHistory(state.bidHistory || []);
    setWarning(state.warning || "");
    setCupOpened(state.cupOpened || false);
    setSelectedTargets(state.selectedTargets || []);
    setNextStarter(state.nextStarter || null);
    setDiceShaking(state.diceShaking || false);
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
  };

  // ============ 定时对账：每3秒从数据库账本核对，弥补广播丢失，绝不永久掉队 ============
  useEffect(() => {
    if (!roomId) return;
    const t = setInterval(async () => {
      try {
        const { data } = await supabase
          .from("rooms")
          .select("players, resultdetails")
          .eq("id", roomId)
          .maybeSingle();
        if (!data) return;
        const saved = data.resultdetails ? JSON.parse(data.resultdetails) : null;
        const remoteVersion = saved?.version ?? 0;
        // 账本版本不旧于本地才应用，避免用更旧的数据把本地进度覆盖回去
        if (remoteVersion < gVersionRef.current) return;
        if (remoteVersion > gVersionRef.current) gVersionRef.current = remoteVersion;
        applyRemoteState({ ...saved, players: data.players });
      } catch (_) {}
    }, 3000);
    return () => clearInterval(t);
  }, [roomId]);

  // ============ 修改1: broadcastState 接收 roomId 参数 ============
  const broadcastState = async (roomId: string, state: any) => {
    // 版本号单调闸：每次操作编号+1，接收端凭此丢弃迟到/乱序的旧消息，避免进度被旧数据覆盖
    const v = gVersionRef.current + 1;
    gVersionRef.current = v;
    const st = { ...state, version: v };
    try {
      console.log('📤 发送广播 v=', v);
      const result = await supabase.channel(`room:${roomId}`).send({
        type: 'broadcast',
        event: 'gameState',
        payload: st,
      });
      console.log('📤 广播结果:', result);
      setDisconnected(false);
    } catch (error) {
      console.error('❌ 广播失败:', error);
      setDisconnected(true);
      setErrorMsg('⚠️ 连接断开，请检查网络后重试');
    }
    // 双通道同步：实时广播之外，同时把整局状态落库到 rooms 表的 resultdetails 字段。
    // 这样断网/刷新重连后能从数据库把进行中的对局读回来续上（沿用 chosen/blackjack 的做法）。
    try {
      const { players, ...rest } = st;
      await supabase.from("rooms").update({
        players,
        resultdetails: JSON.stringify(rest),
      }).eq("id", roomId);
    } catch (e) {
      console.error('❌ 数据库同步失败:', e);
    }
  };

  const leaveRoom = async () => {
    if (!roomId) return;
    const updatedPlayers = players.filter(p => p.name !== playerName);
    // 关键修复：离开房间时，读取房间【真实进行中的对局状态】，仅把离开者从名单移除，
    // 绝不再把整局重置为 waiting（否则正在进行的对局会被打回准备阶段）。
    let saved = null;
    try {
      const { data: rd } = await supabase.from("rooms").select("resultdetails").eq("id", roomId).maybeSingle();
      if (rd?.resultdetails) saved = JSON.parse(rd.resultdetails);
    } catch (_) {}
    const roomEmpty = updatedPlayers.length === 0;
    const leavingCurrent = saved?.currentPlayer === playerName;
    await supabase.from("rooms").update({ players: updatedPlayers }).eq("id", roomId);
    await broadcastState(roomId, {
      players: updatedPlayers,
      currentPlayer: leavingCurrent ? "" : (saved?.currentPlayer || (roomEmpty ? "" : currentPlayer)),
      gameStarted: saved?.gameStarted ?? gameStarted,
      gameOver: saved?.gameOver ?? gameOver,
      result: saved?.result || "",
      lastBid: saved?.lastBid || null,
      phase: saved?.phase || (roomEmpty ? "waiting" : phase),
      hasRolled: saved?.hasRolled || false,
      oneSealed: saved?.oneSealed || false,
      bidHistory: saved?.bidHistory || [],
      warning: saved?.warning || "",
      cupOpened: saved?.cupOpened || false,
      selectedTargets: saved?.selectedTargets || [],
      nextStarter: saved?.nextStarter || null,
      diceShaking: saved?.diceShaking || false,
    });
    setJoined(false);
    setRoomId("");
    try { localStorage.removeItem('067_name'); localStorage.removeItem('067_pass'); } catch (_) {}
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
    setSelectedTargets([]);
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
    try { localStorage.setItem('067_name', playerName.trim()); localStorage.setItem('067_pass', roomPassword.trim()); } catch (_) {}
    await broadcastState(data.id, {
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
      selectedTargets: [],
      nextStarter: null,
      diceShaking: false,
    });
  };

  const joinRoom = async (overrideName?: string, overridePass?: string) => {
    const name = (overrideName ?? playerName).trim();
    const pass = (overridePass ?? roomPassword).trim();
    if (!name) { setErrorMsg("请输入名字"); return; }
    if (!pass) { setErrorMsg("请输入房间密码"); return; }
    setErrorMsg("");
    setPlayerName(name);

    console.log('📥 开始加入房间，密码:', pass);

    const { data, error } = await supabase
      .from("rooms")
      .select()
      .eq("password", pass)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      console.error('❌ 查询房间失败:', error);
      setErrorMsg("密码错误，未找到对应房间");
      try { localStorage.removeItem('067_name'); localStorage.removeItem('067_pass'); } catch (_) {}
      return;
    }

    console.log('📥 查询到的房间数据:', data);

    const currentPlayers = parsePlayers(data.players);
    console.log('📥 解析后的 currentPlayers:', currentPlayers);

    if (currentPlayers.length >= 12) {
      setErrorMsg("房间已满（最多12人）");
      return;
    }

    // 玩家已存在时，同步 players 状态
    if (currentPlayers.some((p: any) => p.name === name)) {
      setRoomId(data.id);
      setPlayers(currentPlayers);
      setJoined(true);
      // 双通道恢复：从数据库读出进行中的对局状态，断网/刷新后接回原局（与订阅回调恢复逻辑一致）
      try {
        const saved = data.resultdetails ? JSON.parse(data.resultdetails) : null;
        if (saved) {
          setGameStarted(saved.gameStarted || false);
          setGameOver(saved.gameOver || false);
          if (saved.gameOver) { setShowReveal(true); setIsLidOpen(false); } else setShowReveal(false);
          setRvOpenerName(saved.opener || "");
          setRvIsSnapOpen(saved.isSnapOpen || false);
          setResult(saved.result || "");
          setCurrentPlayer(saved.currentPlayer || "");
          setLastBid(saved.lastBid || null);
          setPhase(saved.phase || "waiting");
          setHasRolled(saved.hasRolled || false);
          setOneSealed(saved.oneSealed || false);
          setBidHistory(saved.bidHistory || []);
          setWarning(saved.warning || "");
          setCupOpened(saved.cupOpened || false);
          setSelectedTargets(saved.selectedTargets || []);
          setNextStarter(saved.nextStarter || null);
          setDiceShaking(saved.diceShaking || false);
          if (saved.lastBid) setLastBidDisplay({ count: saved.lastBid.count, value: saved.lastBid.value });
          else setLastBidDisplay(null);
          if (saved.phase === "waiting" || saved.phase === "ended") { setSelectedCount(null); setSelectedValue(null); }
        }
        gVersionRef.current = saved?.version || 0; // 重连后把本地版本号对齐到账本，避免后续消息误判过期
      } catch (e) { console.error('❌ 恢复对局状态失败:', e); }
      try { localStorage.setItem('067_name', name); localStorage.setItem('067_pass', pass); } catch (_) {}
      return;
    }

    const occupiedSeats = currentPlayers.map((p: any) => p.seatId).filter((id: number) => id !== undefined);
    let seatId = 0;
    for (let i = 0; i < 12; i++) {
      if (!occupiedSeats.includes(i)) { seatId = i; break; }
    }

    const newPlayer = { name, dice: [], ready: false, seatId };
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
    try { localStorage.setItem('067_name', name); localStorage.setItem('067_pass', pass); } catch (_) {}
    // 关键修复：新人进房时，从房间数据库读取【真实进行中的对局状态】，原样广播，
    // 绝不再写死 phase:"waiting"（否则会把正在进行的对局打回准备阶段）。
    const saved = data.resultdetails ? JSON.parse(data.resultdetails) : null;
    gVersionRef.current = saved?.version || 0; // 进房分支也对齐版本号：重进玩家本地计数器从0起步，发出低版本会被在场者当过期丢弃；先对齐到账本再+1发出，确保被接收
    await broadcastState(data.id, {
      players: updatedPlayers,
      currentPlayer: saved?.currentPlayer || "",
      gameStarted: saved?.gameStarted || false,
      gameOver: saved?.gameOver || false,
      result: saved?.result || "",
      lastBid: saved?.lastBid || null,
      phase: saved?.phase || "waiting",
      hasRolled: saved?.hasRolled || false,
      oneSealed: saved?.oneSealed || false,
      bidHistory: saved?.bidHistory || [],
      warning: saved?.warning || "",
      cupOpened: saved?.cupOpened || false,
      selectedTargets: saved?.selectedTargets || [],
      nextStarter: saved?.nextStarter || null,
      diceShaking: saved?.diceShaking || false,
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
    await broadcastState(roomId, {
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
      selectedTargets,
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
    
    await broadcastState(roomId, {
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
      selectedTargets: [],
      nextStarter,
      diceShaking: true,
    });
  };

  // ============ 修改2: handleRollDice 广播时 gameStarted 保留 true ============
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
    // 自己骰子翻滚动画：快速翻滚约 0.7s 后定格为真实值
    if (rollTimerRef.current) clearInterval(rollTimerRef.current);
    if (rollTimeoutRef.current) clearTimeout(rollTimeoutRef.current);
    setRolling(true);
    setRollingDice(rollDice());
    rollTimerRef.current = setInterval(() => setRollingDice(rollDice()), 70);
    rollTimeoutRef.current = setTimeout(() => {
      if (rollTimerRef.current) { clearInterval(rollTimerRef.current); rollTimerRef.current = null; }
      setRolling(false);
    }, 700);

    // 广播时保留 gameStarted = true (此时游戏已开始)
    await broadcastState(roomId, {
      players: updatedPlayers,
      currentPlayer: "",
      gameStarted: true,          // 修改: 改为 true
      gameOver: false,
      result: "",
      lastBid: null,
      phase: "rolling",
      hasRolled: false,
      oneSealed: false,
      bidHistory: [],
      warning: "",
      cupOpened,
      selectedTargets,
      nextStarter,
      diceShaking: true,
    });

    const rolledCount = updatedPlayers.filter(p => p.dice && p.dice.length > 0).length;
    if (rolledCount === updatedPlayers.length && updatedPlayers.length >= 2) {
      const sortedForStart = [...updatedPlayers].sort((a: any, b: any) => seatOrderIndex(a.seatId) - seatOrderIndex(b.seatId));
      const firstPlayer = nextStarter || sortedForStart[0].name;
      setNextStarter(null);
      setCurrentPlayer(firstPlayer);
      setGameStarted(true);
      setPhase("bidding");
      setHasRolled(true);
      setDiceShaking(false);
      setErrorMsg("");
      
      await broadcastState(roomId, {
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
        selectedTargets: [],
        nextStarter: null,
        diceShaking: false,
      });
    }
  };

  // 快捷加叫
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
    makeBidDirect(newCount, lastBidDisplay.value);
  };

  // ==================== 核心修改：删除封印1后禁止叫1的判断 ====================
  const makeBidDirect = async (count: number, value: number) => {
    // 已删除：if (oneSealed && value === 1) { ... }
    // 现在允许封印1后继续叫1
    if (lastBid) {
      if (count < lastBid.count || (count === lastBid.count && value <= lastBid.value)) {
        setErrorMsg(`必须比 ${lastBid.count}个${lastBid.value} 更大`);
        return;
      }
    }
    setErrorMsg("");

    let newOneSealed = oneSealed;
    if (value === 1) {
      newOneSealed = true;
    }

    const newBid = { player: playerName, count, value };
    setLastBid(newBid);
    const newHistory = [...bidHistory, `${playerName} 叫了 ${count}个${value}`];
    setBidHistory(newHistory);

    const sortedPlayers = [...players].sort((a: any, b: any) => seatOrderIndex(a.seatId) - seatOrderIndex(b.seatId));
    const playerNames = sortedPlayers.map((p) => p.name);
    const idx = playerNames.indexOf(currentPlayer);
    const nextIdx = (idx + 1) % playerNames.length;
    setCurrentPlayer(playerNames[nextIdx]);

    setSelectedCount(null);
    setSelectedValue(null);

    // ============ 修改3: 本地更新 oneSealed ============
    setOneSealed(newOneSealed);

    await broadcastState(roomId, {
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
      selectedTargets,
      nextStarter,
      diceShaking,
    });
  };

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
    await makeBidDirect(selectedCount, selectedValue);
  };

  // ==================== 开骰（最终版顺子规则） ====================

  // 抢开/开骰 支持多选：点击玩家名在“被开名单”里加入/移除
  const toggleTarget = (name: string) => {
    setSelectedTargets(prev => prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]);
  };
  const openDice = async (targetPlayers?: string[], isSnapOpen: boolean = false) => {
    if (phase !== "bidding") {
      setErrorMsg("当前不是叫牌阶段");
      return;
    }
    if (!lastBid) {
      setErrorMsg("没人叫牌，无法开");
      return;
    }

    // 支持多选：勾中多个人一起开（输赢仍数全桌，与单选完全一致）；什么都不勾默认开上一个叫牌者
    const targets = (targetPlayers && targetPlayers.length > 0) ? targetPlayers : [lastBid.player];
    for (const t of targets) {
      const hasCalled = bidHistory.some(entry => entry.includes(t));
      if (!hasCalled) {
        setErrorMsg(`${t} 本轮尚未叫牌，不能开`);
        return;
      }
      const td = players.find(p => p.name === t);
      if (!td || !td.dice || td.dice.length === 0) {
        setErrorMsg(`${t} 没有骰子`);
        return;
      }
    }

    setErrorMsg("");
    setSelectedTargets(targets); // 保留被开者名单，供摊牌弹窗高亮

    // 被开者中任一是顺子 即算“对方顺子”，用于双方顺子特殊规则
    const anyStraight = targets.some(t => {
      const td = players.find(p => p.name === t);
      return td ? isStraight(td.dice) : false;
    });
    const caller = playerName;
    const bidder = lastBid.player;
    const calledCount = lastBid.count;
    const callerData = players.find(p => p.name === caller);
    const callerIsStraight = callerData ? isStraight(callerData.dice) : false;

    let totalCount = 0;
    let winner = "";
    let loser = "";

    // 情况1：被开者中有顺子 且 开牌者也是顺子 → 开牌者输（特殊规则保留）
    if (anyStraight && callerIsStraight) {
      loser = caller;
      winner = bidder;
    }
    // 通用：遍历所有玩家，各自按规则算有效个数（顺子手自动归零、豹子加成、封印1），求和判定；任意人数都适用
    else {
      let total = 0;
      for (const p of players) {
        if (p.dice && p.dice.length > 0) {
          total += countForValue(p.dice, lastBid.value, oneSealed);
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
    setIsLidOpen(false);
    setRvOpenerName(caller);
    setRvIsSnapOpen(isSnapOpen);
    setShowReveal(true);
    setPhase("ended");
    let resultMsg = "";
    const cupLabel = isSnapOpen ? '（抢开×2杯）' : '（顺开×1杯）';
    if (anyStraight && callerIsStraight) {
      resultMsg = `🍺 ${loser} 输了！（双方都是顺子，谁开谁喝）`;
    } else {
      resultMsg = `🍺 ${loser} 输了！${bidder}叫了 ${calledCount}个${lastBid.value}，全场实际有 ${totalCount} 个${lastBid.value}`;
    }
    resultMsg += cupLabel;
    setResult(resultMsg);

    if (isSnapOpen) {
      setNextStarter(caller);
    } else {
      setNextStarter(loser);
    }

    await broadcastState(roomId, {
      players,
      currentPlayer,
      gameStarted,
      gameOver: true,
      result: resultMsg,
      lastBid,
      opener: caller,
      isSnapOpen,
      phase: "ended",
      hasRolled,
      oneSealed,
      bidHistory,
      warning: "",
      cupOpened,
      selectedTargets: targets,
      nextStarter: isSnapOpen ? caller : loser,
      diceShaking: false,
    });
  };

  const resetGame = async () => {
    const resetPlayers = players.map(p => ({ ...p, dice: [], ready: (p.seatId === 0 || p.name === nextStarter) ? true : false }));
    setPlayers(resetPlayers);
    setGameStarted(false);
    setGameOver(false);
    setShowReveal(false);
    setRvOpenerName("");
    setRvIsSnapOpen(false);
    setResult("");
    setLastBid(null);
    setCurrentPlayer("");
    setPhase("waiting");
    setHasRolled(false);
    setOneSealed(false);
    setBidHistory([]);
    setWarning("");
    setSelectedTargets([]);
    setIsLidOpen(false);
    setCupOpened(false);
    setHasRolledLocal(false);
    setMyDice([]);
    setSelectedCount(null);
    setSelectedValue(null);
    setDiceShaking(false);
    setLastBidDisplay(null);

    await supabase.from("rooms").update({ players: resetPlayers }).eq("id", roomId);
    
    await broadcastState(roomId, {
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
      selectedTargets: [],
      nextStarter: nextStarter,
      diceShaking: false,
    });
  };

  // ============ 修改: 再来一局直接开下一局（跳过“全员准备”门槛） ============
  // 第一局仍走 startGame（要求全员准备）；只有“再来一局”走这里——
  // 重置手牌/状态后立刻进入摇骰阶段，不再等任何人点准备，避免每局都卡在准备。
  const playAgain = async () => {
    const resetPlayers = players.map(p => ({ ...p, dice: [], ready: (p.seatId === 0 || p.name === nextStarter) ? true : false }));
    setPlayers(resetPlayers);
    setGameStarted(true);
    setGameOver(false);
    setShowReveal(false);
    setRvOpenerName("");
    setRvIsSnapOpen(false);
    setResult("");
    setLastBid(null);
    setCurrentPlayer("");
    setPhase("rolling");
    setHasRolled(false);
    setOneSealed(false);
    setBidHistory([]);
    setWarning("");
    setSelectedTargets([]);
    setIsLidOpen(false);
    setCupOpened(false);
    setHasRolledLocal(false);
    setMyDice([]);
    setSelectedCount(null);
    setSelectedValue(null);
    setDiceShaking(true);
    setLastBidDisplay(null);
    setErrorMsg("🎲 请所有玩家点击「摇骰」按钮！");

    await supabase.from("rooms").update({ players: resetPlayers }).eq("id", roomId);

    await broadcastState(roomId, {
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
      selectedTargets: [],
      nextStarter: nextStarter,
      diceShaking: true,
    });
  };

  const handleLidOpen = async () => {
    setIsLidOpen(true);
    if (myDice.length > 0 && !cupOpened) {
      setCupOpened(true);
      await broadcastState(roomId, {
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
        selectedTargets,
        nextStarter,
        diceShaking,
      });
    }
  };

  const handleLidClose = () => {
    setIsLidOpen(false);
  };

  // 手机端：直接点骰盅本身来开/关，省掉两个按钮
  const handleLidToggle = () => {
    if (diceShaking) return; // 摇骰阶段不可开
    if (isLidOpen) handleLidClose();
    else handleLidOpen();
  };

  // ==================== 座位渲染（椭圆桌） ====================
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
      const isTarget = selectedTargets.includes(player?.name);

      return (
        <div
          key={seat.seatId}
          style={{
            position: 'absolute',
            left: `${seat.left}%`,
            top: seat.row === 'top' ? '3%' : '87%',
            transform: 'translateX(-50%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            width: '52px',
            height: '52px',
            background: isActive ? 'rgba(34,211,238,0.22)' : (isTarget ? 'rgba(236,72,153,0.18)' : (player ? 'rgba(34,211,238,0.1)' : 'rgba(255,255,255,0.05)')),
            borderRadius: '50%',
            border: isActive ? '3px solid #22d3ee' : (isTarget ? '2px solid #ec4899' : (player ? '2px solid rgba(34,211,238,0.35)' : '2px dashed rgba(255,255,255,0.2)')),
            boxShadow: isActive ? '0 0 22px rgba(34,211,238,0.6)' : (isReady ? '0 0 10px rgba(34,211,238,0.3)' : 'none'),
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

  // 摊牌浮层数据：开牌后展示全场骰子，供所有人自己数"够不够"
  const rvBidVal = lastBid?.value;
  const rvBidCnt = lastBid?.count;
  const rvWildOn = !oneSealed;
  const rvBidder = players.find(p => p.name === lastBid?.player);
  const rvCaller = players.find(p => p.name === playerName);
  const rvAnyStraight = (rvBidder ? isStraight(rvBidder.dice) : false) || (rvCaller ? isStraight(rvCaller.dice) : false);
  let rvTotal = 0;
  if (lastBid) {
    players.forEach(p => {
      if (p.dice && p.dice.length > 0) {
        rvTotal += countForValue(p.dice, lastBid.value, oneSealed);
      }
    });
  }

  // 结论行配色：自己是否为输家（要喝的人）
  const iAmDrinker = rvTotal >= (rvBidCnt ?? 0)
    ? rvOpenerName === playerName
    : (lastBid?.player === playerName);
  const drinkerName = rvTotal >= (rvBidCnt ?? 0) ? rvOpenerName : (lastBid?.player ?? '');
  const rvCups = rvIsSnapOpen ? 2 : 1;

  if (!joined) {
    return (
      <div style={styles.container}>
        <div style={styles.glowOrb}></div>
        <div style={styles.glowOrb2}></div>
        <div style={styles.card}>
          <div style={styles.slotMachine}>
            <div style={styles.slotReel}>
              <div style={styles.slotReelInner}>
                <span style={styles.slotSymbol}>🍒</span>
                <span style={styles.slotSymbol}>7️⃣</span>
                <span style={styles.slotSymbol}>💎</span>
                <span style={styles.slotSymbol}>🎲</span>
                <span style={styles.slotSymbol}>⭐</span>
                <span style={styles.slotSymbol}>🍒</span>
              </div>
            </div>
            <div style={styles.slotReel}>
              <div style={styles.slotReelInner2}>
                <span style={styles.slotSymbol}>🔔</span>
                <span style={styles.slotSymbol}>🍋</span>
                <span style={styles.slotSymbol}>🎲</span>
                <span style={styles.slotSymbol}>💎</span>
                <span style={styles.slotSymbol}>7️⃣</span>
                <span style={styles.slotSymbol}>🔔</span>
              </div>
            </div>
            <div style={styles.slotReel}>
              <div style={styles.slotReelInner3}>
                <span style={styles.slotSymbol}>⭐</span>
                <span style={styles.slotSymbol}>🍒</span>
                <span style={styles.slotSymbol}>🔔</span>
                <span style={styles.slotSymbol}>🍋</span>
                <span style={styles.slotSymbol}>🎲</span>
                <span style={styles.slotSymbol}>⭐</span>
              </div>
            </div>
          </div>
          <h1 style={styles.title}>零六七</h1>
          <p style={styles.subtitle}>🎲 八个一 我劈！</p>
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
            <button onClick={() => joinRoom()} style={styles.btnSecondary}>🔗 加入房间</button>
          </div>
          {errorMsg && <div style={{ color: "#f87171", marginTop: 12, fontSize: 14 }}>{errorMsg}</div>}
          {disconnected && <div style={{ color: "#f87171", marginTop: 8, fontSize: 14 }}>⚠️ 网络连接断开，请检查网络</div>}
        </div>
        <style>{`
          @keyframes slotSpin {
            0% { transform: translateY(0); }
            100% { transform: translateY(-240px); }
          }
        `}</style>
      </div>
    );
  }

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
                {isLidOpen && myDice.length > 0 ? (
                  <div style={styles.diceRow}>
                    {myDice.map((val, idx) => (
                      <div key={idx} className="fade-in"><DiceSVG value={val} size={34} /></div>
                    ))}
                  </div>
                ) : myDice.length === 0 ? (
                  <span style={{ fontSize: '28px', color: 'rgba(255,255,255,0.2)' }}>🎲</span>
                ) : null}
              </div>

              <div
                className="cup-glass"
                onClick={handleLidToggle}
                style={{
                  ...styles.diceLid,
                  transform: isLidOpen
                    ? 'translate(-50%, -50%) translateY(-64px) rotateX(-12deg) scale(0.92)'
                    : 'translate(-50%, -50%)',
                  opacity: isLidOpen ? 0.35 : 1,
                  transition: 'transform 0.55s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.4s ease, box-shadow 0.3s ease',
                  animation: rolling ? 'cupShake 0.5s ease-in-out infinite' : 'none',
                }}
              >
                <div style={styles.lidGloss} />
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
                <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px' }}>
                  {isLidOpen ? '👆 点骰盅盖回' : (myDice.length > 0 ? '👆 点骰盅查看' : '摇骰后可点骰盅查看')}
                </span>
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
                    if (val > 0) label = `💫 豹子 (6个${val})`;
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

        <div
          className={gameStarted && !gameOver && phase === "bidding" && currentPlayer === playerName ? "turn-highlight" : ""}
          style={styles.statusBar}
        >
          {!gameStarted && phase !== "rolling" ? (
            <span style={styles.statusText}>
              ⏳ 等待开始 {players.length >= 2 ? `（${(nextStarter || '房主')}点击"开始游戏"）` : '（至少2人）'}
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
              {players.length >= 2 && playerName === (nextStarter || players.find(p => p.seatId === 0)?.name) && (
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
                  <div style={styles.bidPanel}>
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
                    <div style={styles.bidValueRow}>
                      {values.map(v => (
                        <button
                          key={v}
                          onClick={() => setSelectedValue(v)}
                          style={{
                            ...styles.bidNumBtn,
                            background: selectedValue === v ? '#22d3ee' : 'rgba(255,255,255,0.08)',
                            border: selectedValue === v ? '2px solid #22d3ee' : '1px solid rgba(255,255,255,0.1)',
                            opacity: 1,
                            cursor: 'pointer',
                          }}
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                    <div style={styles.bidCountRow}>
                      {bidPages[bidPage].map(num => (
                        <button
                          key={num}
                          onClick={() => setSelectedCount(num)}
                          style={{
                            ...styles.bidNumBtn,
                            background: selectedCount === num ? '#22d3ee' : 'rgba(255,255,255,0.08)',
                            border: selectedCount === num ? '2px solid #22d3ee' : '1px solid rgba(255,255,255,0.1)',
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
                  <div style={styles.actionDivider}>— 或者 —</div>
                  <div style={styles.targetSelector}>
                    <span style={{ color: '#ccc', marginRight: '4px', fontSize: '13px' }}>开谁（可多选）：</span>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', flex: '1 1 auto' }}>
                      {players.filter(p => p.name !== playerName).map(p => {
                        const on = selectedTargets.includes(p.name);
                        return (
                          <button key={p.name} onClick={() => toggleTarget(p.name)} style={{
                            padding: '4px 10px', borderRadius: '14px', fontSize: '12px', cursor: 'pointer',
                            background: on ? 'rgba(236,72,153,0.85)' : 'rgba(255,255,255,0.08)',
                            border: on ? '1px solid #ec4899' : '1px solid rgba(255,255,255,0.15)',
                            color: on ? '#fff' : '#ccc',
                          }}>{p.name}</button>
                        );
                      })}
                    </div>
                    <button onClick={() => openDice(selectedTargets, false)} style={styles.btnOpen}>🔓 开骰</button>
                  </div>
                </>
              ) : (
                <div style={styles.waitBox}>
                  <span style={styles.waitText}>⏳ 等待 {currentPlayer} 操作</span>
                  <div style={styles.targetSelector}>
                    <span style={{ color: '#ccc', marginRight: '4px', fontSize: '13px' }}>抢开谁（可多选）：</span>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', flex: '1 1 auto' }}>
                      {players.filter(p => p.name !== playerName).map(p => {
                        const on = selectedTargets.includes(p.name);
                        return (
                          <button key={p.name} onClick={() => toggleTarget(p.name)} style={{
                            padding: '4px 10px', borderRadius: '14px', fontSize: '12px', cursor: 'pointer',
                            background: on ? 'rgba(236,72,153,0.85)' : 'rgba(255,255,255,0.08)',
                            border: on ? '1px solid #ec4899' : '1px solid rgba(255,255,255,0.15)',
                            color: on ? '#fff' : '#ccc',
                          }}>{p.name}</button>
                        );
                      })}
                    </div>
                    <button onClick={() => openDice(selectedTargets, true)} style={styles.btnOpenSmall}>⚡ 抢开</button>
                  </div>
                </div>
              )}
            </>
          )}
          {gameOver && (
            <button onClick={playAgain} style={styles.btnReset}>🔄 再来一局</button>
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

      {showReveal && gameOver && lastBid && (
        <div onClick={() => { setShowReveal(false); revealDismissedRef.current = true; }} style={{ position:'fixed', inset:0, zIndex:1000, background:'rgba(0,0,0,0.72)', backdropFilter:'blur(4px)', WebkitBackdropFilter:'blur(4px)', display:'flex', alignItems:'center', justifyContent:'center', padding:'16px' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width:'100%', maxWidth:'420px', maxHeight:'82vh', background:'linear-gradient(160deg,#1c1430,#120c20)', border:'1px solid rgba(34,211,238,0.4)', borderRadius:'20px', padding:'18px 16px', display:'flex', flexDirection:'column', boxShadow:'0 20px 60px rgba(0,0,0,0.6)', animation:'fadeIn 0.3s ease' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'6px' }}>
              <div style={{ color:'#22d3ee', fontSize:'16px', fontWeight:'bold' }}>🎴 摊牌 · 自己数数够不够</div>
              <button onClick={() => { setShowReveal(false); revealDismissedRef.current = true; }} style={{ background:'transparent', border:'none', color:'#aaa', fontSize:'22px', cursor:'pointer', lineHeight:1, padding:'0 4px' }}>✕</button>
            </div>
            <div style={{ textAlign:'center', color:'rgba(255,255,255,0.5)', fontSize:'11px', marginBottom:'10px' }}>
              金框 = 叫的 {rvBidVal} 点　青框 = 百搭1️⃣（{rvWildOn ? '算入' : '已封印不算'}）
            </div>
            <div style={{ overflowY:'auto', flex:'1 1 auto', display:'flex', flexDirection:'column', gap:'8px', paddingRight:'2px' }}>
              {players.filter(p => p.dice && p.dice.length > 0).map((p, i) => {
                const opened = selectedTargets.includes(p.name);
                return (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:'8px', justifyContent:'center', flexWrap:'wrap', padding:'4px 6px', borderRadius:'12px', background: opened ? 'rgba(236,72,153,0.16)' : 'transparent', border: opened ? '1px solid rgba(236,72,153,0.6)' : '1px solid transparent' }}>
                  <span style={{ minWidth:'52px', textAlign:'right', fontSize:'13px', color: p.name === playerName ? '#22d3ee' : '#ddd', fontWeight: p.name === playerName ? 'bold' : 'normal' }}>
                    {p.name === playerName ? '你' : p.name}
                    {opened ? ' 🔍被开' : ''}
                    {isStraight(p.dice) ? ' 🎯顺子归零' : ''}
                  </span>
                  <div style={{ display:'flex', gap:'4px' }}>
                    {p.dice.map((d: number, di: number) => {
                      const isMatch = d === rvBidVal;
                      const isWild = d === 1 && rvWildOn && !isStraight(p.dice);
                      return (
                        <span key={di} style={{ display:'inline-block', padding:'3px', borderRadius:'9px', border: isMatch ? '2px solid #fbbf24' : isWild ? '2px solid #22d3ee' : (opened ? '2px solid rgba(236,72,153,0.5)' : '2px solid transparent'), boxShadow: isMatch ? '0 0 10px rgba(251,191,36,0.5)' : isWild ? '0 0 8px rgba(34,211,238,0.4)' : (opened ? '0 0 8px rgba(236,72,153,0.4)' : 'none') }}>
                          <DiceSVG value={d} size={27} />
                        </span>
                      );
                    })}
                  </div>
                </div>
              );})}

            </div>
            <div style={{ textAlign:'center', marginTop:'12px', fontSize:'14px', color:'#fff', borderTop:'1px solid rgba(255,255,255,0.1)', paddingTop:'10px' }}>
              全场共 <strong style={{ color:'#fbbf24', fontSize:'18px' }}>{rvTotal}</strong> 个 {rvBidVal}
              {!rvAnyStraight ? (
                <span>　|　叫 {rvBidCnt ?? 0} 个 → <strong style={{ color: iAmDrinker ? '#f87171' : '#22d3ee' }}>{iAmDrinker ? `❌ 自己喝酒 ×${rvCups}杯` : `✅ ${drinkerName} 喝酒 ×${rvCups}杯`}</strong></span>
              ) : (
                <span style={{ color:'rgba(255,255,255,0.5)', fontSize:'12px' }}>　（有人是顺子，按规则判，见上方结论 · {rvIsSnapOpen ? '抢开×2杯' : '顺开×1杯'}）</span>
              )}
            </div>
          </div>
        </div>
      )}

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

// ==================== 样式（无重复属性） ====================
const styles: any = {
  container: {
    minHeight: "100dvh",
    background: "radial-gradient(ellipse at 20% 50%, #1a0a2e 0%, #0f0f1a 50%, #0a0a12 100%)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    padding: "0",
    fontFamily: "system-ui, sans-serif",
    position: "relative",
    overflow: "hidden",
  },
  glowOrb: {
    position: "absolute",
    top: "-20%", right: "-10%",
    width: "500px", height: "500px",
    background: "radial-gradient(circle, rgba(236,72,153,0.22), transparent 70%)",
    borderRadius: "50%",
    pointerEvents: "none" as const,
    animation: "pulse 4s ease-in-out infinite",
  },
  glowOrb2: {
    position: "absolute",
    bottom: "-30%", left: "-10%",
    width: "400px", height: "400px",
    background: "radial-gradient(circle, rgba(34,211,238,0.16), transparent 70%)",
    borderRadius: "50%",
    pointerEvents: "none" as const,
    animation: "pulse 5s ease-in-out infinite reverse",
  },
  card: {
    background: "rgba(20,8,30,0.55)",
    backdropFilter: "blur(30px)",
    borderRadius: "28px",
    padding: "30px 24px 34px",
    maxWidth: "400px",
    width: "100%",
    border: "1px solid rgba(236,72,153,0.45)",
    boxShadow: "0 30px 80px rgba(0,0,0,0.6), 0 0 50px rgba(236,72,153,0.25)",
    position: "relative",
    zIndex: 1,
  },
  logo: { fontSize: "48px", textAlign: "center" as const, marginBottom: "8px" },
  title: {
    textAlign: "center" as const,
    color: "#fff",
    fontSize: "40px",
    fontWeight: "900",
    letterSpacing: "2px",
    marginBottom: "6px",
    textShadow: "0 0 10px rgba(236,72,153,1), 0 0 22px rgba(236,72,153,0.85), 0 0 40px rgba(168,85,247,0.6), 0 0 64px rgba(236,72,153,0.4)",
  },
  subtitle: { textAlign: "center" as const, color: "#f9a8d4", fontSize: "14px", marginBottom: "22px", letterSpacing: "1px", textShadow: "0 0 8px rgba(236,72,153,0.6)" },
  input: {
    width: "100%",
    padding: "12px 16px",
    marginBottom: "10px",
    borderRadius: "12px",
    border: "1px solid rgba(236,72,153,0.35)",
    background: "rgba(0,0,0,0.35)",
    color: "#fff",
    fontSize: "15px",
    outline: "none",
    transition: "all 0.3s",
    boxSizing: "border-box" as const,
    boxShadow: "inset 0 0 12px rgba(236,72,153,0.12)",
  },
  btnGroup: { display: "flex", gap: "10px", marginTop: "4px" },
  btnPrimary: {
    flex: 1,
    padding: "14px",
    borderRadius: "14px",
    border: "none",
    background: "linear-gradient(135deg, #ec4899, #a855f7)",
    color: "#fff",
    fontSize: "16px",
    fontWeight: "800",
    cursor: "pointer",
    boxShadow: "0 4px 24px rgba(236,72,153,0.6), 0 0 12px rgba(168,85,247,0.5)",
    textShadow: "0 0 8px rgba(255,255,255,0.5)",
  },
  btnSecondary: {
    flex: 1,
    padding: "14px",
    borderRadius: "14px",
    border: "1.5px solid rgba(34,211,238,0.6)",
    background: "rgba(34,211,238,0.08)",
    color: "#67e8f9",
    fontSize: "15px",
    fontWeight: "700",
    cursor: "pointer",
    boxShadow: "0 0 14px rgba(34,211,238,0.25)",
  },
  slotMachine: {
    display: "flex",
    justifyContent: "center",
    gap: "8px",
    margin: "0 auto 16px",
    padding: "10px 14px",
    borderRadius: "16px",
    background: "rgba(0,0,0,0.45)",
    border: "2px solid rgba(236,72,153,0.55)",
    boxShadow: "0 0 24px rgba(236,72,153,0.35), inset 0 0 18px rgba(168,85,247,0.2)",
    width: "fit-content",
  },
  slotReel: {
    width: "44px",
    height: "48px",
    overflow: "hidden",
    borderRadius: "10px",
    border: "2px solid rgba(251,191,36,0.7)",
    background: "linear-gradient(180deg, rgba(40,10,50,0.9), rgba(10,5,20,0.9))",
    position: "relative",
    boxShadow: "inset 0 6px 10px rgba(0,0,0,0.6), inset 0 -6px 10px rgba(0,0,0,0.6)",
  },
  slotReelInner: { display: "flex", flexDirection: "column", animation: "slotSpin 1.1s linear infinite" },
  slotReelInner2: { display: "flex", flexDirection: "column", animation: "slotSpin 1.45s linear infinite" },
  slotReelInner3: { display: "flex", flexDirection: "column", animation: "slotSpin 0.85s linear infinite" },
  slotSymbol: {
    height: "48px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "26px",
    lineHeight: "48px",
  },
  tableContainer: {
    position: "relative",
    zIndex: 1,
    width: "100%",
    maxWidth: "100%",
    height: "100dvh",
    boxSizing: "border-box" as const,
    display: "flex",
    flexDirection: "column" as const,
    background: "rgba(255,255,255,0.04)",
    backdropFilter: "blur(30px)",
    borderRadius: "0",
    padding: "10px 8px",
    border: "none",
    boxShadow: "none",
    overflowY: "auto",
  },
  table: {
    position: "relative",
    width: "100%",
    flex: 1,
    minHeight: 0,
    background: "linear-gradient(180deg, #2a1840 0%, #160d2b 100%)",
    borderRadius: "18px",
    border: "2px solid rgba(34,211,238,0.45)",
    boxShadow: "inset 0 0 40px rgba(0,0,0,0.4), 0 0 26px rgba(34,211,238,0.18)",
    marginBottom: "8px",
    overflow: "hidden",
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
    width: '172px',
    height: '172px',
    background: 'radial-gradient(ellipse at 50% 36%, #2a1745 0%, #160d2b 68%, #0f0820 100%)',
    borderRadius: '50%',
    border: '2px solid rgba(34,211,238,0.4)',
    boxShadow: '0 0 30px rgba(34,211,238,0.3), inset 0 -12px 30px rgba(0,0,0,0.6)',
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
    padding: '12px',
    boxSizing: 'border-box' as const,
  },
  diceRow: {
    display: 'flex',
    gap: '6px',
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
    top: '50%',
    left: '50%',
    width: '152px',
    height: '152px',
    transform: 'translate(-50%, -50%)',
    borderRadius: '50% 50% 46% 46% / 60% 60% 40% 40%',
    background: 'linear-gradient(155deg, rgba(255,255,255,0.22) 0%, rgba(167,139,250,0.55) 38%, rgba(109,40,217,0.95) 100%)',
    border: '2px solid rgba(196,181,253,0.6)',
    boxShadow: '0 0 26px rgba(167,139,250,0.55), inset 0 4px 14px rgba(255,255,255,0.35), inset 0 -20px 36px rgba(0,0,0,0.55)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
    transformOrigin: 'center bottom',
    transition: 'transform 0.55s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.4s ease, box-shadow 0.3s ease',
    cursor: 'pointer',
  },
  lidGloss: {
    position: 'absolute',
    top: '14%',
    left: '24%',
    width: '38%',
    height: '24%',
    background: 'radial-gradient(ellipse at 50% 50%, rgba(255,255,255,0.5), rgba(255,255,255,0) 70%)',
    borderRadius: '50%',
    pointerEvents: 'none',
  },
  lidInner: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    gap: '2px',
    zIndex: 1,
  },
  lidHandle: {
    fontSize: '34px',
    filter: 'drop-shadow(0 0 8px rgba(255,255,255,0.7))',
  },
  lidLabel: {
    fontSize: '10px',
    color: 'rgba(255,255,255,0.75)',
    letterSpacing: '3px',
    textShadow: '0 1px 3px rgba(0,0,0,0.5)',
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
    // 伪类需用 CSS 类实现，这里保留原有写法但不生效，可忽略
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
    background: 'linear-gradient(135deg, #22d3ee, #0ea5e9)',
    color: '#0f0f1a',
    fontSize: '14px',
    fontWeight: '700',
    cursor: 'pointer',
    boxShadow: '0 4px 16px rgba(34,211,238,0.5)',
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
  // 叫牌 与 开骰 之间的分隔线，明示两者是“二选一”的互斥操作
  actionDivider: {
    textAlign: "center",
    color: "rgba(255,255,255,0.4)",
    fontSize: "12px",
    margin: "8px 0 4px",
    letterSpacing: "4px",
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
  // 开骰/抢开 设为“次按钮”：红边半透明，与实心蓝“叫牌”形成主次区分，避免误点
  btnOpen: {
    padding: "8px 24px",
    borderRadius: "10px",
    border: "2px solid #f43f5e",
    background: "rgba(244,63,94,0.12)",
    color: "#fda4af",
    fontSize: "14px",
    fontWeight: "600",
    cursor: "pointer",
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
    @keyframes diceRoll {
      0% { transform: rotate(0deg) scale(1); filter: blur(0); }
      25% { transform: rotate(90deg) scale(1.12); filter: blur(1.5px); }
      50% { transform: rotate(200deg) scale(0.92); filter: blur(2.5px); }
      75% { transform: rotate(300deg) scale(1.06); filter: blur(1.5px); }
      100% { transform: rotate(360deg) scale(1); filter: blur(0); }
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes turnPulse {
      0%, 100% { border-color: rgba(251,191,36,0.5); box-shadow: 0 0 10px rgba(251,191,36,0.2); }
      50% { border-color: #fbbf24; box-shadow: 0 0 22px rgba(251,191,36,0.55); }
    }
    @keyframes cupShake {
      0%, 100% { transform: translate(-50%, -50%) rotate(0deg); }
      20% { transform: translate(-50%, -52%) rotate(-6deg); }
      40% { transform: translate(-50%, -47%) rotate(6deg); }
      60% { transform: translate(-50%, -51%) rotate(-4deg); }
      80% { transform: translate(-50%, -49%) rotate(4deg); }
    }
    .dice-roll-anim { animation: diceRoll 0.7s cubic-bezier(0.4, 0, 0.2, 1); }
    .fade-in { animation: fadeIn 0.35s ease; }
    .turn-highlight { animation: turnPulse 1.2s ease-in-out infinite; }
    .cup-glass { cursor: pointer; }
    .cup-glass:active { filter: brightness(1.12); }
    button { transition: transform 0.12s ease, filter 0.12s ease; }
    button:active { transform: scale(0.95); filter: brightness(1.12); }
  `;
  document.head.appendChild(style);
}