"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";

// ==================== 工具函数 ====================
const rollDice = () => Array.from({ length: 5 }, () => Math.floor(Math.random() * 6) + 1);

// 骰子 SVG，41px，1和4红色，其余蓝色
const DiceSVG = ({ value, size = 41, highlight = false }: { value: number; size?: number; highlight?: boolean }) => {
  const dotPositions: Record<number, [number, number][]> = {
    1: [[50, 50]],
    2: [[30, 30], [70, 70]],
    3: [[30, 30], [50, 50], [70, 70]],
    4: [[30, 30], [70, 30], [30, 70], [70, 70]],
    5: [[30, 30], [70, 30], [50, 50], [30, 70], [70, 70]],
    6: [[30, 30], [70, 30], [30, 50], [70, 50], [30, 70], [70, 70]],
  };
  const dots = dotPositions[value] || [];
  const dotColor = highlight ? "#92400e" : (value === 1 || value === 4) ? "#e53e3e" : "#3182ce";

  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      <defs>
        <linearGradient id={`diceGold-${value}`} x1="0" y1="0" x2="100" y2="100">
          <stop offset="0%" stopColor="#fff7ed" />
          <stop offset="50%" stopColor="#fcd34d" />
          <stop offset="100%" stopColor="#f59e0b" />
        </linearGradient>
      </defs>
      <rect
        x="2"
        y="2"
        width="96"
        height="96"
        rx="12"
        fill={highlight ? `url(#diceGold-${value})` : "white"}
        stroke={highlight ? "#f59e0b" : "#ccc"}
        strokeWidth={highlight ? 3 : 2}
        style={highlight ? { filter: "drop-shadow(0 0 5px rgba(251,191,36,0.7))" } : undefined}
      />
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

// 多抢开/单开 逐人结算：对 opened 中每个被开者，拿他自己最后一次叫牌(N个Y)，与全场实际Y数比对；
// 够→开牌者输(开牌者喝cupsPer)；不够→被开者输(被开者喝cupsPer)；双方顺子→开牌者输。返回逐人判定+杯数汇总。
type OpenVerdict = {
  name: string;
  count: number;
  value: number;
  actual: number;
  enough: boolean;
  straight: boolean;
  callerStraight: boolean;
  drinker: string;
  cups: number;
  reason: string;
};

const settleOpened = (
  opened: string[],
  players: any[],
  bidHistory: string[],
  oneSealed: boolean,
  isSnapOpen: boolean,
  callerName: string
): { verdicts: OpenVerdict[]; tally: Record<string, number>; nextStarter: string; resultMsg: string } => {
  const cupsPer = isSnapOpen ? 2 : 1;
  const callerData = players.find((p: any) => p.name === callerName);
  const callerIsStraight = callerData ? isStraight(callerData.dice) : false;
  const getBidOf = (name: string): { count: number; value: number } | null => {
    for (let i = bidHistory.length - 1; i >= 0; i--) {
      const e = bidHistory[i];
      if (e.startsWith(name + " 叫了 ")) {
        const m = e.match(/叫了 (\d+)个(\d+)$/);
        if (m) return { count: parseInt(m[1], 10), value: parseInt(m[2], 10) };
      }
    }
    return null;
  };
  const verdicts: OpenVerdict[] = [];
  let callerDrank = false;
  for (const t of opened) {
    const td: any = players.find((p: any) => p.name === t);
    if (!td || !td.dice || td.dice.length === 0) continue;
    const bid = getBidOf(t);
    if (!bid) continue;
    const tStraight = isStraight(td.dice);
    let actual = 0;
    for (const p of players) {
      if (p.dice && p.dice.length > 0) actual += countForValue(p.dice, bid.value, oneSealed);
    }
    let enough: boolean;
    let drinker: string;
    let reason: string;
    if (tStraight && callerIsStraight) {
      enough = true;
      drinker = callerName;
      reason = "双方顺子，谁开谁喝";
    } else {
      enough = actual >= bid.count;
      drinker = enough ? callerName : t;
      reason = enough ? `实际${actual}≥${bid.count}，够，开牌者喝` : `实际${actual}<${bid.count}，不够，${t}喝`;
    }
    if (drinker === callerName) callerDrank = true;
    verdicts.push({ name: t, count: bid.count, value: bid.value, actual, enough, straight: tStraight, callerStraight: callerIsStraight, drinker, cups: cupsPer, reason });
  }
  const tally: Record<string, number> = {};
  for (const v of verdicts) {
    if (v.drinker) tally[v.drinker] = (tally[v.drinker] || 0) + v.cups;
  }
  const nextStarter = callerDrank ? callerName : (opened[0] || callerName);
  const tallyStr = Object.entries(tally).map(([n, c]) => `${n}喝${c}杯`).join("，");
  const cupLabel = isSnapOpen ? "（抢开×2杯）" : "（顺开×1杯）";
  const resultMsg = `🍺 结算：${tallyStr || "无人喝"}${cupLabel}`;
  return { verdicts, tally, nextStarter, resultMsg };
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
          return { name, dice: [], ready: false, seatId: 0, status: "playing" };
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
  const [showGrabModal, setShowGrabModal] = useState(false);
  const [oneSealed, setOneSealed] = useState(false);
  const [bidHistory, setBidHistory] = useState<string[]>([]);
  const [warning, setWarning] = useState("");
  const [selectedTargets, setSelectedTargets] = useState<string[]>([]); // 开盅后广播/同步来的“被开者”名单，仅供摊牌浮层/座位高亮，绝不被本地多选改动
  const [myTargets, setMyTargets] = useState<string[]>([]); // 本地抢开浮层多选勾选，后台轮询/广播一律不动它，避免勾选被冲掉
  const [nextStarter, setNextStarter] = useState<string | null>(null);
  const [loserName, setLoserName] = useState<string>(""); // 开盅结算时记录的权威输家名字（广播同步，摊牌浮层显示"谁喝"不再各自推算）
  const playAgainLockRef = useRef(false); // 再来一局防并发锁：点过一次后短时间内禁止重复发起
  const gameOverRef = useRef(false); // 实时镜像 gameOver：openDice 防"本地状态未刷新间隙"重复开盅
  const settledOpenerRef = useRef<string>(""); // 本局已接受的结算开牌人：双抢开时先到先得，拒收第二份不同结算（只拦重复结算，绝不拦新一局信号）
  const [mySeatId, setMySeatId] = useState<number | null>(null);
  const [hasRolledLocal, setHasRolledLocal] = useState(false);
  const [disconnected, setDisconnected] = useState(false);
  const [rolling, setRolling] = useState(false);
  const [rollingDice, setRollingDice] = useState<number[]>([]);
  const rollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const gVersionRef = useRef(0); // 同步版本号单调闸：每条操作消息编号递增，接收端丢弃过期旧消息
  const playersRef = useRef<any[]>([]); // 实时镜像本地 players，供 applyRemoteState 合并时读取最新名单（避免闭包拿到旧值）
  const phaseRef = useRef<"waiting" | "rolling" | "bidding" | "ended">(phase); // 实时镜像本地阶段，供 3 秒对账判断本地是否落后于服务器（useEffect 闭包拿不到最新 phase）
  const rollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const advanceFiredRef = useRef(false); // 进叫牌哨兵防重复触发锁：本轮 rolling 只广播一次推进，离开 rolling 自动复位

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
  const [autoRollFlag, setAutoRollFlag] = useState(false); // 再来一局时各端自动摇骰的触发标记
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
      if (ctx.state === 'suspended') ctx.resume();
      const sr = ctx.sampleRate;
      const seconds = 4;
      const buf = ctx.createBuffer(1, Math.floor(sr * seconds), sr);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) {
        // 白噪声 + 起伏包络，模拟骰盅里骰子碰撞的哗啦声
        const env = 0.5 + 0.5 * Math.sin(i / sr * Math.PI * 22);
        d[i] = (Math.random() * 2 - 1) * 0.35 * env;
      }
      const src = ctx.createBufferSource(); src.buffer = buf;
      const filt = ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 1100;
      const g = ctx.createGain(); g.gain.value = 0.5;
      src.connect(filt); filt.connect(g); g.connect(ctx.destination);
      src.start();
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

  // ============ 实时镜像 players 到 ref，供同步合并读取最新值 ============
  useEffect(() => {
    playersRef.current = players;
  }, [players]);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

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

  // ============ 再来一局：各端收到 autoRoll 标记后自动摇自己那份骰子 ============
  useEffect(() => {
    if (!autoRollFlag) return;
    setAutoRollFlag(false); // 一次性触发，避免重复
    // 轻量预判：观战者不摇、已摇过不重复摇、阶段不对不摇；最终守卫由 handleRollDice 收口
    const me = players.find((p: any) => p.name === playerName);
    if (me?.status === "watching") return;
    if (me?.dice && me.dice.length > 0) return;
    if (phase !== "rolling") return;
    handleRollDice();
  }, [autoRollFlag]);

  // ============ 远端状态应用（广播接收 + 定时对账共用，逻辑只写一处） ============
  const applyRemoteState = (state: any) => {
    // 双抢开"先到先得"：本局已接受一份结算后，再收到"同样是结算、但开牌人不同"的第二份 → 整条丢弃，
    // 防两人同时抢开时各端按到达顺序后到者覆盖、不同手机结局不一致。
    // ⚠️只拦 ended 状态下的重复结算；gameOver=false 的消息(新一局/正常对局)永远放行——绝不重蹈07-21终点锁误拦新局的覆辙。
    if (state.gameOver) {
      if (gameOverRef.current && settledOpenerRef.current && state.opener && state.opener !== settledOpenerRef.current) return;
      if (state.opener) settledOpenerRef.current = state.opener;
      gameOverRef.current = true;
    } else {
      gameOverRef.current = false;
      settledOpenerRef.current = "";
    }
    const parsedPlayers = parsePlayers(state.players);
    // 按名字合并骰子（并集最全）：拒绝被陈旧广播把"已摇好的骰子"冲空。
    // 并发摇骰时，甲在收到乙骰子前就广播，会把乙记为空；若两人本地版号撞车、版本闸拦不住，
    // 整组替换(setPlayers)会抹掉乙刚摇的骰子 → 乙查看自己空、被开时提示"没有骰子"。
    // 规则：非"全员清空(新一局发牌)"时，广播有骰子用广播；广播空但本地有 → 保留本地那份。
    const allEmpty = parsedPlayers.every((p: any) => !p.dice || p.dice.length === 0);
    let mergedPlayers = parsedPlayers;
    if (!allEmpty) {
      const localPlayers = playersRef.current;
      mergedPlayers = parsedPlayers.map((inc: any) => {
        const loc = localPlayers.find((p: any) => (p.cid && inc.cid && p.cid === inc.cid) || p.name === inc.name);
        if (inc.dice && inc.dice.length > 0) return inc;
        if (loc && loc.dice && loc.dice.length > 0) return { ...inc, dice: loc.dice };
        return inc;
      });
      // 补缺：本地有骰子、但广播名单里漏掉的人（含自己），补入合并结果，
      // 避免极端竞态下本地比广播多出"已摇骰的人"被漏 → 进叫牌哨兵误判"还有人没摇"卡死。
      const incNames = new Set(parsedPlayers.map((p: any) => p.name));
      localPlayers.forEach((lp: any) => {
        if (lp.dice && lp.dice.length > 0 && !incNames.has(lp.name)) {
          mergedPlayers.push({ ...lp });
        }
      });
    }
    setPlayers(mergedPlayers);
    setGameStarted(state.gameStarted || false);
    setGameOver(state.gameOver || false);
    if (state.gameOver) {
      // 玩家本局已主动关掉摊牌弹窗，则不再被广播/定时对账强制重新弹出
      if (!revealDismissedRef.current) setShowReveal(true);
      setIsLidOpen(false);
    } else {
      setShowReveal(false);
      revealDismissedRef.current = false; // 新一局开始，重置标记，下一局摊牌照常弹出
      playAgainLockRef.current = false; // 新一局已开，释放"再来一局"并发锁
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
    setLoserName(state.loserName || "");
    setDiceShaking(state.diceShaking || false);
    if (state.autoRoll) setAutoRollFlag(true); // 其他端收到"再来一局"信号后各自自动摇
    if (state.lastBid) {
      setLastBidDisplay({ count: state.lastBid.count, value: state.lastBid.value });
    } else {
      setLastBidDisplay(null);
    }
    if (state.phase === "waiting" || state.phase === "ended") {
      setSelectedCount(null);
      setSelectedValue(null);
    }
    const myCid = (() => { try { return localStorage.getItem('067_cid') || ''; } catch { return ''; } })();
    const me = mergedPlayers.find((p: any) => (myCid && p.cid && p.cid === myCid) || p.name === playerName);
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
        // 心跳 + 幽灵清理：刷新自己的 lastSeen，剔除超过 15 分钟没动静的幽灵（自己除外）
        const myCid = (() => { try { return localStorage.getItem('067_cid') || ''; } catch { return ''; } })();
        const now = Date.now();
        let playersArr: any[] = parsePlayers(data.players);
        let changed = false;
        playersArr = playersArr.map((p: any) => {
          if ((p.cid && p.cid === myCid) || (!p.cid && p.name === playerName)) { changed = true; return { ...p, lastSeen: now }; }
          if (p.lastSeen && now - p.lastSeen > 15 * 60 * 1000) { changed = true; return null; }
          return p;
        }).filter(Boolean) as any[];
        // 账本治愈：并发落库(整字段覆盖)可能把别人已摇的骰子从账本抹掉，本地若比账本全则补写回去。
        // 只补不删(账本空、本地非空才补)，多客户端同时补也只会补齐缺口不会互相冲掉；搭现有心跳写入的便车，不新增写库频率。
        // 版本保险：仅当本地版本追上账本(≥)时才补，防止落后客户端把上一局的旧骰子塞进新一局账本。
        const savedPeek = (() => { try { return data.resultdetails ? JSON.parse(data.resultdetails) : null; } catch { return null; } })();
        const healAllowed = (savedPeek?.version ?? 0) <= gVersionRef.current;
        const localForHeal = playersRef.current;
        // 加入并发自愈：本地知道自己在房、但服务器名单没有我（被并发加入覆盖）→ 基于刚读到的服务器最新名单补回完整自己，不会丢别人
        const healMe = localForHeal.find((p: any) => (p.cid && p.cid === myCid) || (!p.cid && p.name === playerName));
        const serverHasMe = playersArr.some((p: any) => (p.cid && p.cid === myCid) || (!p.cid && p.name === playerName));
        if (healMe && !serverHasMe) {
          playersArr = [...playersArr, healMe];
          changed = true;
        }
        if (healAllowed && localForHeal.length > 0) {
          playersArr = playersArr.map((p: any) => {
            if (p.dice && p.dice.length > 0) return p;
            const loc = localForHeal.find((lp: any) => (lp.cid && p.cid && lp.cid === p.cid) || lp.name === p.name);
            if (loc && loc.dice && loc.dice.length > 0) { changed = true; return { ...p, dice: loc.dice }; }
            return p;
          });
        }
        if (changed) {
          try { await supabase.from("rooms").update({ players: playersArr }).eq("id", roomId); } catch (_) {}
        }
        const saved = data.resultdetails ? JSON.parse(data.resultdetails) : null;
        const remoteVersion = saved?.version ?? 0;
        // 阶段顺序：waiting(0) < rolling(1) < bidding(2) < ended(3)
        const PHASE_RANK: Record<string, number> = { waiting: 0, rolling: 1, bidding: 2, ended: 3 };
        const remoteRank = saved?.phase ? (PHASE_RANK[saved.phase] ?? 0) : 0;
        const localRank = phaseRef.current ? (PHASE_RANK[phaseRef.current] ?? 0) : 0;
        // 兜底自愈：本地阶段落后于服务器（如服务器已进叫牌/结算、本地还卡在摇骰）-> 无视版本号，
        // 以服务器为准强制对齐。applyRemoteState 内部仅挡 rolling/bidding->waiting 回退，往更靠前放行，不会把进行中的局拉回。
        const forceAlign = remoteRank > localRank;
        // 账本版本不旧于本地才应用，避免用更旧的数据把本地进度覆盖回去
        if (remoteVersion < gVersionRef.current && !forceAlign) return;
        if (remoteVersion > gVersionRef.current) gVersionRef.current = remoteVersion;
        applyRemoteState({ ...saved, players: changed ? playersArr : data.players });
      } catch (_) {}
    }, 3000);
    return () => clearInterval(t);
  }, [roomId]);

  // ============ 进叫牌哨兵：盯着名单/阶段变化，活跃玩家(不算观战)全摇完就推进到叫牌 ============
  // 根治两类永久卡死：①没摇的人中途退出(摇骰按钮全灰没人能再触发旧检查) ②观战者被算进人头数导致判定永不满足。
  // 摇骰/退房/幽灵清理/对账合并任何一条路径更新了名单，这里都会重新评估。
  useEffect(() => {
    if (phase !== "rolling") { advanceFiredRef.current = false; return; }
    if (!roomId) return;
    if (advanceFiredRef.current) return;
    const activePlayers = players.filter((p: any) => p.status !== "watching");
    if (activePlayers.length < 2) return;
    const rolledCount = activePlayers.filter((p: any) => p.dice && p.dice.length > 0).length;
    if (rolledCount !== activePlayers.length) return;
    // 唯一权威：只让座位序最小的活跃玩家广播推进，防止多人同时喊"进叫牌"互相覆盖
    const sortedActive = [...activePlayers].sort((a: any, b: any) => seatOrderIndex(a.seatId) - seatOrderIndex(b.seatId));
    if (sortedActive[0].name !== playerName) return;
    // 首叫玩家：上局输家优先，但必须还是活跃玩家（不在场/观战则回落到座位序最小者）
    const starterValid = nextStarter && activePlayers.some((p: any) => p.name === nextStarter);
    const firstPlayer = starterValid ? (nextStarter as string) : sortedActive[0].name;
    advanceFiredRef.current = true;
    setNextStarter(null);
    setCurrentPlayer(firstPlayer);
    setGameStarted(true);
    setPhase("bidding");
    setHasRolled(true);
    setDiceShaking(false);
    setErrorMsg("");
    broadcastState(roomId, {
      players,
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
  }, [roomId, phase, players, nextStarter, playerName]);

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

  // ============ 隐形身份证：每台设备一个永久编号，退出也不删，认人靠编号不靠名字 ============
  const getOrCreateCid = () => {
    try {
      let c = localStorage.getItem('067_cid');
      if (!c) {
        c = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : ('067_' + Math.random().toString(36).slice(2) + Date.now().toString(36));
        localStorage.setItem('067_cid', c);
      }
      return c;
    } catch (_) {
      return '067_' + Math.random().toString(36).slice(2);
    }
  };

  const leaveRoom = async () => {
    if (!roomId) return;
    const myCid = getOrCreateCid();
    // 并发加固：离开前先读服务器最新名单再把自己过滤掉写回，避免用本地过期名单覆盖（否则已离开者可能又被别人加回）
    const { data: leaveFresh, error: leaveErr } = await supabase.from("rooms").select("players").eq("id", roomId).maybeSingle();
    const basePlayers = leaveErr ? players : parsePlayers(leaveFresh?.players);
    const updatedPlayers = basePlayers.filter(p => !((p.cid && p.cid === myCid) || (!p.cid && p.name === playerName)));
    // 关键修复：离开房间时，读取房间【真实进行中的对局状态】，仅把离开者从名单移除，
    // 绝不再把整局重置为 waiting（否则正在进行的对局会被打回准备阶段）。
    let saved = null;
    try {
      const { data: rd } = await supabase.from("rooms").select("resultdetails").eq("id", roomId).maybeSingle();
      if (rd?.resultdetails) saved = JSON.parse(rd.resultdetails);
    } catch (_) {}
    const roomEmpty = updatedPlayers.length === 0;
    const leavingCurrent = saved?.currentPlayer === playerName;
    // 轮到谁叫牌时离开：直接把轮次交给下一位还能玩的人（跳过观战者），避免回合卡在空人
    let nextCurrentAfterLeave = saved?.currentPlayer || (roomEmpty ? "" : currentPlayer);
    if (leavingCurrent && !roomEmpty) {
      const sortedLeavers = [...updatedPlayers].sort((a: any, b: any) => seatOrderIndex(a.seatId) - seatOrderIndex(b.seatId));
      const activeLeavers = sortedLeavers.filter((p: any) => p.status !== "watching");
      const namesLeavers = activeLeavers.map((p: any) => p.name);
      // 离开者已不在名单，取座位序最靠前的活跃玩家接手（轮转自然继续，不卡死）
      nextCurrentAfterLeave = namesLeavers[0] || "";
    }
    await supabase.from("rooms").update({ players: updatedPlayers }).eq("id", roomId);
    await broadcastState(roomId, {
      players: updatedPlayers,
      currentPlayer: nextCurrentAfterLeave,
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
      // 离开者正是"该开局的人"(上局输家/指定开局者)时清掉指定，否则开始按钮只显示给已离场的人、全房没人能开始
      nextStarter: (saved?.nextStarter === playerName) ? null : (saved?.nextStarter || null),
      diceShaking: saved?.diceShaking || false,
    });
    setJoined(false);
    setRoomId("");
    gameOverRef.current = false; // 退房清结算标记，防下次进房残留
    settledOpenerRef.current = "";
    try { localStorage.removeItem('067_name'); localStorage.removeItem('067_pass'); /* 保留 067_cid：退出房间也不删，回头再进仍被认出 */ } catch (_) {}
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
    // ② 离开房间时清掉骰子翻滚定时器：避免摇骰动画途中离开后定时器在后台空转刷已不属于自己的界面
    if (rollTimerRef.current) { clearInterval(rollTimerRef.current); rollTimerRef.current = null; }
    if (rollTimeoutRef.current) { clearTimeout(rollTimeoutRef.current); rollTimeoutRef.current = null; }
    setIsLidOpen(false);
    setCupOpened(false);
    setOneSealed(false);
    setBidHistory([]);
    setWarning("");
    setSelectedTargets([]);
    setMyTargets([]);
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

    const newPlayer = { cid: getOrCreateCid(), lastSeen: Date.now(), name: playerName.trim(), dice: [], ready: true, seatId: 0, status: "playing" };
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
      try { localStorage.removeItem('067_name'); localStorage.removeItem('067_pass'); /* 保留 067_cid：退出房间也不删，回头再进仍被认出 */ } catch (_) {}
      return;
    }

    console.log('📥 查询到的房间数据:', data);

    let currentPlayers = parsePlayers(data.players);
    console.log('📥 解析后的 currentPlayers:', currentPlayers);

    if (currentPlayers.length >= 12) {
      setErrorMsg("房间已满（最多12人）");
      return;
    }

    const savedState = data.resultdetails ? JSON.parse(data.resultdetails) : null;
    // 进行中的一局（摇骰/叫牌阶段）中途回来的人：先当“观战”，不拉进当前局，下一局再来一局再带上他
    const midRound = !!savedState && savedState.gameStarted && (savedState.phase === "rolling" || savedState.phase === "bidding");

    const myCid = getOrCreateCid();
    // 玩家已存在（重连）：优先按编号认人，老房间无编号按名字兜底；认出后补编号、同步最新昵称
    let existingIdx = currentPlayers.findIndex((p: any) => (p.cid && p.cid === myCid) || (!p.cid && p.name === name));
    // 同名双人拦截：房里已有同名但设备编号不同的条目（换手机/清缓存重进会撞上）
    if (existingIdx < 0) {
      const sameNameIdx = currentPlayers.findIndex((p: any) => p.name === name && p.cid && p.cid !== myCid);
      if (sameNameIdx >= 0) {
        const ls = currentPlayers[sameNameIdx].lastSeen;
        // 心跳每3秒刷一次；超过30秒没心跳 = 掉线残留 → 接管旧座位（视为换设备重连，骰子/座位原样继承）
        if (!ls || Date.now() - ls > 30 * 1000) {
          existingIdx = sameNameIdx;
        } else {
          setErrorMsg("该名字已有人在用（在线中），请换一个昵称");
          return;
        }
      }
    }
    if (existingIdx >= 0) {
      currentPlayers = currentPlayers.map((p, i) => i === existingIdx ? { ...p, cid: myCid, name, lastSeen: Date.now() } : p);
    }

    // 玩家已存在时，同步 players 状态
    if (existingIdx >= 0) {
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
      // 把补上的编号/昵称/心跳落库，保证后续按编号认人稳定生效
      try { await supabase.from("rooms").update({ players: currentPlayers }).eq("id", data.id); } catch (_) {}
      return;
    }

    const occupiedSeats = currentPlayers.map((p: any) => p.seatId).filter((id: number) => id !== undefined);
    let seatId = 0;
    for (let i = 0; i < 12; i++) {
      if (!occupiedSeats.includes(i)) { seatId = i; break; }
    }

    const newPlayer = { cid: myCid, lastSeen: Date.now(), name, dice: [], ready: false, seatId, status: midRound ? "watching" : "playing" };
    // 并发加固：写入前再读一次服务器最新名单，只在“自己不在”时 append，避免两人同时加入互相覆盖
    const { data: freshRoom, error: refetchErr } = await supabase
      .from("rooms")
      .select("players")
      .eq("id", data.id)
      .maybeSingle();
    let finalPlayers: any[] = refetchErr ? [...currentPlayers, newPlayer] : parsePlayers(freshRoom?.players);
    if (!finalPlayers.find((p: any) => (p.cid && p.cid === myCid) || (!p.cid && p.name === name))) {
      finalPlayers = [...finalPlayers, newPlayer];
    }
    console.log('📤 准备更新的 players:', finalPlayers);

    const { error: updateError } = await supabase
      .from("rooms")
      .update({ players: finalPlayers })
      .eq("id", data.id);

    if (updateError) {
      console.error('❌ 更新房间失败:', updateError);
      setErrorMsg("加入失败: " + updateError.message);
      return;
    }

    console.log('✅ 更新成功，准备广播');
    setRoomId(data.id);
    setJoined(true);
    setPlayers(finalPlayers);
    try { localStorage.setItem('067_name', name); localStorage.setItem('067_pass', pass); } catch (_) {}
    // 关键修复：新人进房时，从房间数据库读取【真实进行中的对局状态】，原样广播，
    // 绝不再写死 phase:"waiting"（否则会把正在进行的对局打回准备阶段）。
    const saved = savedState;
    // 关键修复：对局进行中加入的新人，必须把服务器上【真实的对局状态】同步到自己本地。
    // 否则本地停在默认 phase="waiting"/gameStarted=false → 界面误渲染“准备”按钮，
    // 一旦点下去，toggleReady 的 gameStarted 守卫会被绕过，并把一份空白状态
    // （currentPlayer=""、lastBid=null、bidHistory=[]）以合法版本号广播+落库，直接打废整局。
    // 这段与上面【重连分支】(789-812) 是同一份逻辑；只在 midRound 时执行，
    // 房间处于等待阶段时加入的行为完全不变（本地默认值本就正确）。
    if (midRound && saved) {
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
    }
    gVersionRef.current = saved?.version || 0; // 进房分支也对齐版本号：重进玩家本地计数器从0起步，发出低版本会被在场者当过期丢弃；先对齐到账本再+1发出，确保被接收
    await broadcastState(data.id, {
      players: finalPlayers,
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

    // 兜底守卫：观战者一律不许点准备。
    // 上面的 gameStarted 守卫依赖本地状态，万一某条路径本地还没同步到“对局进行中”（如中途加入的那一瞬间），
    // 就会被绕过并广播出一份空白状态打废整局；而 players 里自己的 status 在加入时就已写库为 watching，更可靠。
    if (me.status === "watching") {
      setErrorMsg("你正在观战，下一局再加入");
      console.warn('观战者不能准备');
      return;
    }

    if (me.seatId === 0) {
      setErrorMsg("房主无需准备");
      console.warn('房主无需准备');
      return;
    }

    const newReady = !me.ready;
    console.log('🔄 准备状态切换:', me.ready, '->', newReady);

    // 并发加固：写库前读服务器最新名单，只改自己 ready 再写回，避免两人同时点准备互相覆盖
    const { data: freshRoom, error: refetchErr } = await supabase
      .from("rooms")
      .select("players")
      .eq("id", roomId)
      .maybeSingle();
    const baseList: any[] = refetchErr ? players : parsePlayers(freshRoom?.players);
    const updatedPlayers = baseList.map(p =>
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

    // 并发加固：读服务器最新名单做重置，避免开局时把刚加入的人覆盖掉
    const { data: freshRoom, error: refetchErr } = await supabase
      .from("rooms")
      .select("players")
      .eq("id", roomId)
      .maybeSingle();
    const baseList: any[] = refetchErr ? players : parsePlayers(freshRoom?.players);
    const resetPlayers = baseList.map(p => ({
      ...p,
      dice: [],
      ready: p.seatId === 0 ? true : false,
      status: "playing"
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
    const meRoll = players.find((p: any) => p.name === playerName);
    if (meRoll?.status === "watching") { setErrorMsg("你正在观战，下一局再加入"); return; }
    if (meRoll?.dice?.length > 0) {
      setErrorMsg("你已经摇过骰子了");
      return;
    }
    // 注：公平性已由两道关卡保证——①摇过的人 dice 有值(L737)不能再摇；②叫牌后 phase 切到 bidding 全员不能摇。
    // 不再用全局 cupOpened 锁人（那会让一个人查看就误锁全桌）。

    const myDice = rollDice();
    // 治本：摇骰时先读服务器最新名单，只把我的骰子塞进去再广播，
    // 避免基于本地旧名单整张覆盖、把别人刚摇的骰子冲成空（导致全员卡在摇骰阶段）。
    let rollPlayers: any[];
    try {
      const { data: latestSnap } = await supabase.from("rooms").select("players").eq("id", roomId).single();
      const latestPlayers = parsePlayers(latestSnap?.players);
      if (latestPlayers.length > 0) {
        rollPlayers = latestPlayers.map((p: any) => p.name === playerName ? { ...p, dice: myDice } : p);
        if (!latestPlayers.find((p: any) => p.name === playerName)) {
          // 极端竞态：服务器名单里还没有我，补上自己（带骰子）
          rollPlayers.push({ ...meRoll, dice: myDice });
        }
      } else {
        rollPlayers = players.map((p: any) => p.name === playerName ? { ...p, dice: myDice } : p);
      }
    } catch (e) {
      rollPlayers = players.map((p: any) => p.name === playerName ? { ...p, dice: myDice } : p);
    }
    setPlayers(rollPlayers);
    setMyDice(myDice);
    setHasRolledLocal(true);
    playShakeSound();
    if (navigator.vibrate) navigator.vibrate(100);
    // 自己骰子翻滚动画：明显翻滚约 4s 后定格为真实值（拉长更有真实摇骰感，配合骰盅声）
    if (rollTimerRef.current) clearInterval(rollTimerRef.current);
    if (rollTimeoutRef.current) clearTimeout(rollTimeoutRef.current);
    setRolling(true);
    setRollingDice(rollDice());
    rollTimerRef.current = setInterval(() => setRollingDice(rollDice()), 110);
    rollTimeoutRef.current = setTimeout(() => {
      if (rollTimerRef.current) { clearInterval(rollTimerRef.current); rollTimerRef.current = null; }
      setRolling(false);
    }, 4000);

    // 广播时保留 gameStarted = true (此时游戏已开始)
    await broadcastState(roomId, {
      players: rollPlayers,
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

    // 旧的"全员摇完→进叫牌"检查已移除：改由进叫牌哨兵 useEffect 统一评估（排除观战者、
    // 响应退房/清理等一切名单变化、只由座位序最小的活跃玩家广播推进），避免双通道抢跑。
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
    // 观战者（中途回来、还没轮到下一局的人）不能叫牌
    const me = players.find((p: any) => p.name === playerName);
    if (me?.status === "watching") { setErrorMsg("你正在观战，下一局再加入"); return; }
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
    // ① 即时刷新顶部"上家"提示：叫牌成功当场更新，不等广播绕一圈回来（避免网络慢时快捷加注用旧基数）
    setLastBidDisplay({ count, value });
    const newHistory = [...bidHistory, `${playerName} 叫了 ${count}个${value}`];
    setBidHistory(newHistory);

    // 用实时名单(playersRef)而非闭包旧快照：防止有人刚离开、界面未刷新时把轮次交给已离场的人
    const sortedPlayers = [...playersRef.current].sort((a: any, b: any) => seatOrderIndex(a.seatId) - seatOrderIndex(b.seatId));
    // 观战者不进入叫牌轮转，避免轮到空手观战者导致卡死
    const activePlayers = sortedPlayers.filter((p: any) => p.status !== "watching");
    const playerNames = activePlayers.map((p) => p.name);
    const idx = playerNames.indexOf(currentPlayer);
    const nextIdx = ((idx < 0 ? -1 : idx) + 1) % playerNames.length;
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
    setMyTargets(prev => prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]);
  };
  const openDice = async (targetPlayers?: string[], isSnapOpen: boolean = false) => {
    // 观战者（中途进来、还没轮到下一局的人）不能开骰/抢开
    const meOpen = players.find((p: any) => p.name === playerName);
    if (meOpen?.status === "watching") { setErrorMsg("你正在观战，下一局再加入"); return; }
    if (phase !== "bidding") {
      setErrorMsg("当前不是叫牌阶段");
      return;
    }
    if (!lastBid) {
      setErrorMsg("没人叫牌，无法开");
      return;
    }
    // 已结算过(本地 state 可能还没刷新到 ended，故用 ref)就拦住，防本地状态刷新间隙重复开盅/双抢开
    if (gameOverRef.current) {
      setErrorMsg("本局已经开过盅了");
      return;
    }

    // 支持多选：勾中多个人一起开（输赢仍数全桌，与单选完全一致）；什么都不勾默认开上一个叫牌者
    const targets = (targetPlayers && targetPlayers.length > 0) ? targetPlayers : [lastBid.player];
    // 不能开自己：放在 targets 算出之后，统一挡住"默认回落成自己/勾选被广播污染含自己"等所有来路
    if (targets.includes(playerName)) {
      setErrorMsg("不能开自己");
      return;
    }
    for (const t of targets) {
      // startsWith 精确匹配"名字 叫了 "，防"小明/明"这类名字包含关系误放行
      const hasCalled = bidHistory.some(entry => entry.startsWith(t + " 叫了 "));
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

    const caller = playerName;
    // 逐人结算：每个被开者拿自己那手叫牌跟全场实际比；够→开牌者喝，不够→被开者喝；双方顺子→开牌者喝
    const { verdicts, tally, nextStarter, resultMsg } = settleOpened(targets, players, bidHistory, oneSealed, isSnapOpen, caller);
    const firstDrinker = Object.keys(tally)[0] || "";

    setGameOver(true);
    gameOverRef.current = true; // 本地立刻标记已结算，不等广播绕回，堵住间隙里的第二次开盅
    settledOpenerRef.current = caller;
    setIsLidOpen(false);
    setRvOpenerName(caller);
    setRvIsSnapOpen(isSnapOpen);
    setShowReveal(true);
    setPhase("ended");
    setResult(resultMsg);
    setLoserName(firstDrinker); // 兼容旧高亮：取第一个喝酒的人（多喝酒者在摊牌浮层逐人展示）

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
      nextStarter,
      loserName: firstDrinker,
      diceShaking: false,
    });
  };

  const resetGame = async () => {
    // 并发加固：重开基于服务器最新名单，已离开的人不进下一局
    const { data: rgFresh, error: rgErr } = await supabase.from("rooms").select("players").eq("id", roomId).maybeSingle();
    const rgBase = rgErr ? players : parsePlayers(rgFresh?.players);
    const resetPlayers = rgBase.map(p => ({ ...p, dice: [], ready: (p.seatId === 0 || p.name === nextStarter) ? true : false, status: "playing" }));
    setPlayers(resetPlayers);
    setGameStarted(false);
    setGameOver(false);
    gameOverRef.current = false;
    settledOpenerRef.current = "";
    setShowReveal(false);
    setLoserName("");
    playAgainLockRef.current = false;
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
    setMyTargets([]);
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
    if (playAgainLockRef.current) return; // 防并发：已有人（或自己重复点击）发起新一局，直接忽略
    playAgainLockRef.current = true;
    gameOverRef.current = false; // 新一局：清结算标记与先到先得记录
    settledOpenerRef.current = "";
    setLoserName(""); // 清掉上一局的输家记录
    // 并发加固：新一局基于服务器最新名单生成，已离开的人不进下一局（不被本地含离场者的旧名单加回）
    const { data: paFresh, error: paErr } = await supabase.from("rooms").select("players").eq("id", roomId).maybeSingle();
    const paBase = paErr ? players : parsePlayers(paFresh?.players);
    const resetPlayers = paBase.map(p => ({ ...p, dice: [], ready: (p.seatId === 0 || p.name === nextStarter) ? true : false, status: "playing" }));
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
    setMyTargets([]);
    setIsLidOpen(false);
    setCupOpened(false);
    setHasRolledLocal(false);
    setMyDice([]);
    setSelectedCount(null);
    setSelectedValue(null);
    setDiceShaking(true);
    setAutoRollFlag(true); // 发起者本地自动摇（自己收不到自己广播）
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
      autoRoll: true,
    });
  };

  const handleLidOpen = async () => {
    setIsLidOpen(true);
    // 查看自己骰子是私人行为，不影响他人；公平性由"已摇过不可重摇"及"叫牌后阶段切换"两道关卡保证。
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
    // 固定 12 个槽位（顶部4 + 左列4 + 右列4）；按 seatId 固定映射，玩家进出座位不跳动。空位显示虚线占位卡。
    const slotDefs = [
      { id: 0, area: 'top' }, { id: 1, area: 'top' }, { id: 2, area: 'top' }, { id: 3, area: 'top' },
      { id: 4, area: 'left' }, { id: 5, area: 'left' }, { id: 6, area: 'left' }, { id: 7, area: 'left' },
      { id: 8, area: 'right' }, { id: 9, area: 'right' }, { id: 10, area: 'right' }, { id: 11, area: 'right' },
    ];
    const topSlots = slotDefs.filter(s => s.area === 'top');
    const leftSlots = slotDefs.filter(s => s.area === 'left');
    const rightSlots = slotDefs.filter(s => s.area === 'right');

    const seatCard = (seatId: number) => {
      const player = players.find(p => p.seatId === seatId) || null;
      const isMe = player?.name === playerName;
      const isActive = player?.name === currentPlayer && gameStarted && !gameOver;
      const isReady = player?.ready || false;
      const isHost = player?.seatId === 0;
      const isTarget = player ? selectedTargets.includes(player.name) : false;
      if (!player) {
        return <div key={`empty-${seatId}`} className="seat-placeholder" />;
      }
      return (
        <div
          key={seatId}
          className="seat-card"
          style={{
            background: isActive ? 'rgba(34,211,238,0.18)' : (isTarget ? 'rgba(236,72,153,0.16)' : 'rgba(255,255,255,0.05)'),
            border: isActive ? '2px solid #22d3ee' : (isTarget ? '2px solid #ec4899' : '1px solid rgba(255,255,255,0.12)'),
            boxShadow: isActive ? '0 0 16px rgba(34,211,238,0.5)' : (isReady ? '0 0 8px rgba(34,211,238,0.25)' : 'none'),
          }}
        >
          <span style={{ fontSize: '26px' }}>👤</span>
          <span style={{
            fontSize: '12px', color: isMe ? '#fbbf24' : '#ddd', marginTop: '2px',
            maxWidth: '64px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {isMe ? '你' : player.name}
          </span>
          <span style={{ fontSize: '11px', marginTop: '1px', minHeight: '14px', lineHeight: '14px' }}>
            {isHost ? '👑' : ''}{isReady ? '✅' : ''}
          </span>
        </div>
      );
    };

    return (
      <>
        <div className="seat-top-row">{topSlots.map(s => seatCard(s.id))}</div>
        <div className="seat-mid-row">
          <div className="seat-side">{leftSlots.map(s => seatCard(s.id))}</div>

          <div className={`cup-zone ${isLidOpen ? 'show-own' : ''}`}>
            <div
              className={`real-cup ${rolling ? 'shaking' : ''}`}
              onClick={handleLidToggle}
              style={{ transition: 'transform 0.5s ease' }}
            >
              <div className="cup-rim" />
              <div className="cup-opening"><span className="question">?</span></div>
              <div className="cup-body-real" />
              <div className={`cup-dice-inside ${rolling ? 'shaking' : ''}`} style={{ opacity: isLidOpen ? 1 : (rolling ? 0.95 : 0) }}>
                {rolling ? (
                  <div style={{ display:'flex', flexWrap:'wrap', gap:'3px', justifyContent:'center', width:'78px' }}>
                    {rollingDice.map((val, idx) => (
                      <div key={idx} className="dice-roll-anim"><DiceSVG value={val} size={20} /></div>
                    ))}
                  </div>
                ) : isLidOpen && myDice.length > 0 ? (
                  <div style={{
                    display:'flex', flexWrap:'wrap', gap:'3px', justifyContent:'center', width:'78px',
                    ...(isStraight(myDice) ? { border:'2px solid #fbbf24', borderRadius:'14px', padding:'4px 6px', boxShadow:'0 0 16px rgba(251,191,36,0.55)' } : {}),
                  }}>
                    {myDice.map((val, idx) => (
                      <div key={idx} className="dice-settle"><DiceSVG value={val} size={20} highlight={isStraight(myDice)} /></div>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>

            <div style={styles.lidControls}>
              {!gameStarted ? (
                <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '13px' }}>等待开始...</span>
              ) : diceShaking ? (
                <span style={{ color: '#fbbf24', fontSize: '15px' }}>🎲 摇骰中...</span>
              ) : (
                <span style={{ fontSize: '12px', color: 'transparent', minHeight: '16px' }}>{' '}</span>
              )}
            </div>

            {isLidOpen && myDice.length > 0 && (() => {
              const counts = Array(7).fill(0);
              for (const d of myDice) counts[d]++;
              const ones = counts[1];
              const maxCount = Math.max(...counts);
              const maxVal = counts.indexOf(maxCount);
              let label = '';
              if (maxCount === 5) label = `🔥 纯豹 (7个${maxVal})`;
              else if (!oneSealed && ones > 0 && counts.slice(2).filter(c => c > 0).length === 1) {
                const val = counts.indexOf(Math.max(...counts.slice(2)));
                if (val > 0) label = `💫 豹子 (6个${val})`;
              }
              return label ? (
                <div style={styles.diceStats}>
                  <span style={{ color: '#fbbf24', fontSize: '14px' }}>{label}</span>
                </div>
              ) : null;
            })()}
          </div>

          <div className="seat-side">{rightSlots.map(s => seatCard(s.id))}</div>
        </div>
      </>
    );
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

  // 摊牌浮层逐人判定：用同步来的被开名单+叫牌记录，本地确定性重算每个人的输赢（与开牌者客户端算法一致，无需新增广播字段）
  const revealSettle = selectedTargets.length > 0
    ? settleOpened(selectedTargets, players, bidHistory, oneSealed, rvIsSnapOpen, rvOpenerName || playerName)
    : null;

  // 结论行配色：自己是否为输家（要喝的人）
  // 优先用开盅结算时记录的权威输家名字（含顺子特殊规则，所有人一致）；老数据无此字段时退回本地推算兜底
  const fallbackDrinker = rvTotal >= (rvBidCnt ?? 0) ? rvOpenerName : (lastBid?.player ?? '');
  const drinkerName = loserName || fallbackDrinker;
  const iAmDrinker = drinkerName === playerName;
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
              ⏳ 等待开始 {players.length >= 2 ? `（${((nextStarter && players.some(p => p.name === nextStarter)) ? nextStarter : (players.find(p => p.seatId === 0)?.name || '房主'))}点击"开始游戏"）` : '（至少2人）'}
            </span>
          ) : gameOver ? (
            <span style={styles.resultText}>{result}</span>
          ) : phase === "rolling" ? (
            <span style={styles.statusText}>
              🎲 摇骰中... ({players.filter(p => p.dice && p.dice.length > 0).length}/{players.filter((p: any) => p.status !== "watching").length} 已摇)
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
            未摇骰: {players.filter((p: any) => (!p.dice || p.dice.length === 0) && p.status !== "watching").map(p => p.name).join('、') || '全部已摇'}
            {players.filter((p: any) => p.status === "watching").length > 0 && (
              <span style={{ marginLeft: '8px', color: '#22d3ee' }}>👁 观战: {players.filter((p: any) => p.status === "watching").map(p => p.name).join('、')}</span>
            )}
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
              {players.length >= 2 && playerName === (() => {
                // 该开局的人：指定者(上局输家)还在场用指定者；不在场兜底到0号位；0号位也空缺则落给座位号最小的在场玩家——保证任何时候都有人能开始
                const starterHere = nextStarter && players.some(p => p.name === nextStarter);
                if (starterHere) return nextStarter;
                return players.find(p => p.seatId === 0)?.name
                  || [...players].sort((a: any, b: any) => seatOrderIndex(a.seatId) - seatOrderIndex(b.seatId))[0]?.name;
              })() && (
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
              disabled={hasRolledLocal || players.find((p: any) => p.name === playerName)?.status === "watching"}
            >
              {players.find((p: any) => p.name === playerName)?.status === "watching" ? '👁 观战中' : (hasRolledLocal ? '✅ 已摇骰' : '🎲 摇骰')}
            </button>
          )}
          {gameStarted && !gameOver && phase === "bidding" && (
            <>
              {currentPlayer === playerName ? (
                <>
                  <div style={styles.bidPanel}>
                    <div style={styles.quickAddRow}>
                      {lastBidDisplay && (
                        <span style={{ color: '#aaa', fontSize: '13px', marginRight: '6px' }}>上家: {lastBidDisplay.count}个{lastBidDisplay.value}</span>
                      )}
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
                    </div>
                    <button onClick={handleCallBid} style={styles.bidCallBtn}>🔊 喊骰</button>
                    {selectedCount !== null && selectedValue !== null && (
                      <div style={styles.bidPreview}>
                        当前选择: <strong>{selectedCount}个{selectedValue}</strong>
                      </div>
                    )}
                  </div>
                  <div style={styles.actionDivider}>— 或者 —</div>
                  {(() => {
                    const w = players.find((p:any) => p.name === playerName)?.status === "watching";
                    return (
                      <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
                        <button
                          disabled={w}
                          onClick={() => openDice([], false)}
                          style={w ? { flex: 1, padding: '10px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.06)', color: '#888', fontSize: '14px', fontWeight: '600', cursor: 'not-allowed' } : { flex: 1, padding: '10px', borderRadius: '10px', border: '1.5px solid rgba(139,92,246,0.6)', background: 'rgba(139,92,246,0.08)', color: '#c4b5fd', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}
                        >{w ? '👁 观战中' : '🔓 开骰'}</button>
                        <button
                          disabled={w}
                          onClick={() => { setMyTargets([]); setShowGrabModal(true); }}
                          style={w ? { ...styles.btnOpen, flex: 1, background: 'rgba(255,255,255,0.12)', color: '#888', cursor: 'not-allowed' } : { ...styles.btnOpen, flex: 1 }}
                        >{w ? '👁 观战中' : '⚡ 抢开'}</button>
                      </div>
                    );
                  })()}
                </>
              ) : (
                <div style={styles.waitBox}>
                  <span style={styles.waitText}>⏳ 等待 {currentPlayer} 操作</span>
                  {(() => {
                    const w = players.find((p:any) => p.name === playerName)?.status === "watching";
                    return (
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          disabled={w}
                          onClick={() => openDice([], false)}
                          style={w ? { padding: '5px 14px', borderRadius: '14px', border: 'none', background: 'rgba(255,255,255,0.12)', color: '#888', fontSize: '12px', cursor: 'not-allowed' } : { padding: '5px 14px', borderRadius: '14px', border: 'none', background: 'linear-gradient(90deg,#8b5cf6,#a855f7)', color: '#fff', fontSize: '12px', cursor: 'pointer' }}
                        >{w ? '👁 观战中' : '🔓 开骰'}</button>
                        <button
                          disabled={w}
                          onClick={() => { setMyTargets([]); setShowGrabModal(true); }}
                          style={w ? { ...styles.btnOpenSmall, background: 'rgba(255,255,255,0.12)', color: '#888', cursor: 'not-allowed' } : { ...styles.btnOpenSmall }}
                        >{w ? '👁 观战中' : '⚡ 抢开'}</button>
                      </div>
                    );
                  })()}
                </div>
              )}
            </>
          )}
          {gameOver && (
            drinkerName === playerName || !drinkerName ? (
              <button onClick={playAgain} style={styles.btnReset}>🔄 再来一局</button>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
                <span style={{ color: '#aaa', fontSize: 13 }}>⏳ 等待 {drinkerName} 开启新一局</span>
                <button onClick={playAgain} style={{ padding: '4px 12px', borderRadius: '12px', fontSize: '12px', cursor: 'pointer', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.2)', color: '#ccc' }}>我来开</button>
              </div>
            )
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
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'10px' }}>
              <div style={{ flex:1, textAlign:'center', color:'#22d3ee', fontSize:'16px', fontWeight:'bold' }}>🎲 · 数数够不够</div>
              <button onClick={() => { setShowReveal(false); revealDismissedRef.current = true; }} style={{ background:'transparent', border:'none', color:'#aaa', fontSize:'22px', cursor:'pointer', lineHeight:1, padding:'0 4px' }}>✕</button>
            </div>
            <div style={{ textAlign:'center', fontSize:'13px', color:'#cbd5e1', marginBottom:'8px' }}>
              {rvIsSnapOpen ? (
                <span>⚡ <strong style={{ color:'#ec4899' }}>{rvOpenerName === playerName ? '你' : rvOpenerName}</strong> 抢开了 {selectedTargets.map(n => n === playerName ? '你' : n).join('、')}</span>
              ) : (
                <span>🔓 <strong style={{ color:'#22d3ee' }}>{rvOpenerName === playerName ? '你' : rvOpenerName}</strong> 开骰（顺开）</span>
              )}
            </div>
            {revealSettle && revealSettle.verdicts.length > 0 && (
              <div style={{ display:'flex', flexDirection:'column', gap:'4px', marginBottom:'10px', padding:'8px 10px', background:'rgba(255,255,255,0.05)', borderRadius:'12px', border:'1px solid rgba(255,255,255,0.1)' }}>
                {revealSettle.verdicts.map((v, vi) => (
                  <div key={vi} style={{ fontSize:'13px', color:'#ddd', display:'flex', justifyContent:'space-between', gap:'8px', alignItems:'center' }}>
                    <span>
                      <strong style={{ color:'#ec4899' }}>{v.name === playerName ? '你' : v.name}</strong> 喊 {v.count}个{v.value}
                      <span style={{ color:'rgba(255,255,255,0.5)' }}>（实际 {v.actual}）</span>
                      {v.enough ? <span style={{ color:'#22d3ee' }}> 够✅</span> : <span style={{ color:'#f87171' }}> 不够❌</span>}
                    </span>
                    <span style={{ color: v.drinker === playerName ? '#f87171' : (v.drinker === v.name ? '#fbbf24' : '#22d3ee'), fontWeight:'600', whiteSpace:'nowrap' }}>
                      {v.drinker === playerName ? '你' : v.drinker} ×{v.cups}杯
                    </span>
                  </div>
                ))}
                <div style={{ fontSize:'14px', color:'#fff', fontWeight:'bold', borderTop:'1px solid rgba(255,255,255,0.12)', paddingTop:'6px', marginTop:'2px' }}>
                  🍺 {Object.entries(revealSettle.tally).map(([n,c]) => `${n===playerName?'你':n}喝${c}杯`).join("，") || "无人喝"}（{rvIsSnapOpen ? '抢开×2杯' : '顺开×1杯'}）
                </div>
              </div>
            )}
            <div style={{ overflowY:'auto', flex:'1 1 auto', display:'flex', flexDirection:'column', gap:'8px', paddingRight:'2px' }}>
              {players.filter(p => p.dice && p.dice.length > 0).map((p, i) => {
                const opened = selectedTargets.includes(p.name);
                return (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:'8px', justifyContent:'center', flexWrap:'wrap', padding:'4px 6px', borderRadius:'12px', background: opened ? 'rgba(236,72,153,0.16)' : 'transparent', border: opened ? '1px solid rgba(236,72,153,0.6)' : '1px solid transparent' }}>
                  <span style={{ minWidth:'52px', textAlign:'right', fontSize:'13px', color: p.name === playerName ? '#22d3ee' : '#ddd', fontWeight: p.name === playerName ? 'bold' : 'normal' }}>
                    {p.name === playerName ? '你' : p.name}
                    {opened ? ' 🔍被开' : ''}
                  </span>
                  <div style={{ display:'flex', gap:'4px' }}>
                    {p.dice.map((d: number, di: number) => {
                      const isMatch = d === rvBidVal;
                      const isWild = d === 1 && rvWildOn && !isStraight(p.dice);
                      return (
                        <span key={di} style={{ display:'inline-block', padding:'3px', borderRadius:'9px', border: isMatch ? '2px solid #fbbf24' : isWild ? '2px solid #22d3ee' : (opened ? '2px solid rgba(236,72,153,0.5)' : '2px solid transparent'), boxShadow: isMatch ? '0 0 10px rgba(251,191,36,0.5)' : isWild ? '0 0 8px rgba(34,211,238,0.4)' : (opened ? '0 0 8px rgba(236,72,153,0.4)' : 'none') }}>
                          <DiceSVG value={d} size={27} highlight={isStraight(p.dice)} />
                        </span>
                      );
                    })}
                  </div>
                </div>
              );})}

            </div>
            <div style={{ textAlign:'center', marginTop:'12px', fontSize:'14px', color:'#fff', borderTop:'1px solid rgba(255,255,255,0.1)', paddingTop:'10px' }}>
              {revealSettle && revealSettle.verdicts.length > 0 ? (
                <span style={{ fontSize:'12px', color:'rgba(255,255,255,0.65)' }}>
                  {revealSettle.verdicts.map((v, vi) => (
                    <span key={vi} style={{ margin:'0 6px' }}>全场 <strong style={{ color:'#fbbf24' }}>{v.actual}</strong> 个{v.value}（{v.name === playerName ? '你' : v.name}喊{v.count}）</span>
                  ))}
                </span>
              ) : (
                <span>
                  全场共 <strong style={{ color:'#fbbf24', fontSize:'18px' }}>{rvTotal}</strong> 个 {rvBidVal}
                  {!rvAnyStraight ? (
                    <span>　|　{lastBid?.player} 叫 {rvBidCnt ?? 0} 个 → <strong style={{ color: iAmDrinker ? '#f87171' : '#22d3ee' }}>{iAmDrinker ? `❌ 自己喝酒 ×${rvCups}杯` : `✅ ${drinkerName} 喝酒 ×${rvCups}杯`}</strong></span>
                  ) : drinkerName ? (
                    <span>　|　按规则 → <strong style={{ color: iAmDrinker ? '#f87171' : '#22d3ee' }}>{iAmDrinker ? `❌ 自己喝酒 ×${rvCups}杯` : `✅ ${drinkerName} 喝酒 ×${rvCups}杯`}</strong>（{rvIsSnapOpen ? '抢开' : '顺开'}）</span>
                  ) : (
                    <span style={{ color:'rgba(255,255,255,0.5)', fontSize:'12px' }}>　（有人是顺子，按规则判 · {rvIsSnapOpen ? '抢开×2杯' : '顺开×1杯'}）</span>
                  )}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 抢开 / 开骰 多选浮层 */}
      {showGrabModal && (
        <div onClick={() => setShowGrabModal(false)} style={{ position:'fixed', inset:0, zIndex:1100, background:'rgba(0,0,0,0.72)', backdropFilter:'blur(4px)', WebkitBackdropFilter:'blur(4px)', display:'flex', alignItems:'center', justifyContent:'center', padding:'16px' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width:'100%', maxWidth:'420px', maxHeight:'82vh', background:'linear-gradient(160deg,#1c1430,#120c20)', border:'1px solid rgba(236,72,153,0.5)', borderRadius:'20px', padding:'18px 16px', display:'flex', flexDirection:'column', boxShadow:'0 20px 60px rgba(0,0,0,0.6)', animation:'fadeIn 0.3s ease' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'10px' }}>
              <div style={{ flex:1, textAlign:'center', color:'#ec4899', fontSize:'16px', fontWeight:'bold' }}>⚡ 抢开谁（可多选）</div>
              <button onClick={() => setShowGrabModal(false)} style={{ background:'transparent', border:'none', color:'#aaa', fontSize:'22px', cursor:'pointer', lineHeight:1, padding:'0 4px' }}>✕</button>
            </div>
            <div style={{ overflowY:'auto', flex:'1 1 auto', display:'flex', flexWrap:'wrap', gap:'8px', justifyContent:'center', padding:'8px 2px' }}>
              {players.filter(p => p.name !== playerName && p.status !== "watching").map(p => {
                const on = myTargets.includes(p.name);
                return (
                  <button key={p.name} onClick={() => toggleTarget(p.name)} style={{ padding:'8px 14px', borderRadius:'16px', fontSize:'13px', cursor:'pointer', background: on ? 'rgba(236,72,153,0.85)' : 'rgba(255,255,255,0.08)', border: on ? '1px solid #ec4899' : '1px solid rgba(255,255,255,0.15)', color: on ? '#fff' : '#ccc' }}>{p.name}</button>
                );
              })}
            </div>
            <div style={{ display:'flex', gap:'10px', marginTop:'12px' }}>
              <button disabled={myTargets.length === 0} onClick={() => { setShowGrabModal(false); openDice(myTargets, false); }} style={{ flex:1, padding:'12px', borderRadius:'12px', border:'none', background: myTargets.length === 0 ? 'rgba(255,255,255,0.12)' : 'linear-gradient(90deg,#8b5cf6,#ec4899)', color: myTargets.length === 0 ? '#888' : '#fff', fontSize:'14px', fontWeight:'600', cursor: myTargets.length === 0 ? 'not-allowed' : 'pointer' }}>🔓 开骰</button>
              <button disabled={myTargets.length === 0} onClick={() => { setShowGrabModal(false); openDice(myTargets, true); }} style={{ flex:1, padding:'12px', borderRadius:'12px', border:'none', background: myTargets.length === 0 ? 'rgba(255,255,255,0.12)' : '#ef4444', color: myTargets.length === 0 ? '#888' : '#fff', fontSize:'14px', fontWeight:'600', cursor: myTargets.length === 0 ? 'not-allowed' : 'pointer' }}>⚡ 抢开</button>
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
    flex: "0 0 auto",
    minHeight: "320px",
    display: "flex",
    flexDirection: "column" as const,
    background: "linear-gradient(180deg, #2a1840 0%, #160d2b 100%)",
    borderRadius: "18px",
    border: "2px solid rgba(34,211,238,0.45)",
    boxShadow: "inset 0 0 40px rgba(0,0,0,0.4), 0 0 26px rgba(34,211,238,0.18)",
    marginBottom: "8px",
    padding: "50px 8px 10px",
    overflow: "visible" as const,
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
    padding: '12px',
    borderRadius: '14px',
    border: 'none',
    background: 'linear-gradient(135deg, #22d3ee, #0ea5e9)',
    color: '#0f0f1a',
    fontSize: '16px',
    fontWeight: '700',
    cursor: 'pointer',
    boxShadow: '0 4px 18px rgba(34,211,238,0.5)',
    width: '100%',
    marginTop: '4px',
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
      0% { transform: translateY(0) rotate(0deg) scale(1); filter: blur(0); }
      25% { transform: translateY(-6px) rotate(90deg) scale(1.12); filter: blur(1.5px); }
      50% { transform: translateY(4px) rotate(200deg) scale(0.92); filter: blur(2.5px); }
      75% { transform: translateY(-3px) rotate(300deg) scale(1.06); filter: blur(1.5px); }
      100% { transform: translateY(0) rotate(360deg) scale(1); filter: blur(0); }
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes turnPulse {
      0%, 100% { border-color: rgba(251,191,36,0.5); box-shadow: 0 0 10px rgba(251,191,36,0.2); }
      50% { border-color: #fbbf24; box-shadow: 0 0 22px rgba(251,191,36,0.55); }
    }
    @keyframes pulse-q { 0%,100% { opacity: 0.6; } 50% { opacity: 1; } }
    @keyframes cupShake {
      0%   { transform: translate(0px,0px) rotate(180deg); }
      12%  { transform: translate(14px,-7px) rotate(186deg); }
      25%  { transform: translate(0px,-13px) rotate(180deg); }
      37%  { transform: translate(-14px,-7px) rotate(174deg); }
      50%  { transform: translate(0px,0px) rotate(180deg); }
      68%  { transform: translate(-20px,0px) rotate(186deg); }
      86%  { transform: translate(20px,0px) rotate(174deg); }
      100% { transform: translate(0px,0px) rotate(180deg); }
    }
    .real-cup.shaking { animation: cupShake 1s ease-in-out infinite; }
    .cup-dice-inside.shaking { opacity: 0.95; filter:blur(0); transform:translate(-50%,-50%) scale(1); }
    .seat-top-row { display:flex; justify-content:center; gap:8px; flex-wrap:wrap; padding:4px 4px 8px; }
    .seat-mid-row { display:flex; justify-content:space-between; align-items:center; gap:8px; padding:0 4px; }
    .seat-side { display:flex; flex-direction:column; gap:8px; }
    .seat-card { width:62px; min-height:74px; border-radius:12px; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:6px 2px; background:rgba(255,255,255,0.05); }
    .seat-placeholder { width:62px; height:74px; border-radius:12px; border:1px dashed rgba(255,255,255,0.15); }
    .cup-zone { display:flex; flex-direction:column; align-items:center; gap:8px; flex:0 0 auto; }
    .real-cup { position:relative; width:100px; height:140px; transform:rotate(180deg); transition:transform 0.5s ease; cursor:pointer; }
    .cup-body-real { position:absolute; bottom:0; left:50%; transform:translateX(-50%); width:90px; height:130px; background:linear-gradient(90deg,#120a22 0%,#1d1136 30%,#281a45 50%,#1d1136 70%,#120a22 100%); border-radius:8px 8px 45px 45px; border:2px solid rgba(124,77,255,0.35); box-shadow:0 0 40px rgba(124,77,255,0.18), inset 0 6px 24px rgba(0,0,0,0.55); }
    .cup-rim { position:absolute; top:0; left:50%; transform:translateX(-50%); width:94px; height:15px; background:linear-gradient(180deg,#ffd700,#b8860b); border-radius:50%; border:2px solid rgba(255,215,0,0.6); box-shadow:0 2px 10px rgba(255,215,0,0.3); z-index:10; }
    .cup-opening { position:absolute; top:3px; left:50%; transform:translateX(-50%); width:80px; height:12px; background:#1a0a2e; border-radius:50%; display:flex; align-items:center; justify-content:center; z-index:11; }
    .cup-opening .question { font-size:20px; color:rgba(139,92,246,0.8); text-shadow:0 0 15px rgba(139,92,246,0.5); animation:pulse-q 2s ease-in-out infinite; transform:rotate(180deg); }
    .cup-dice-inside { position:absolute; top:52%; left:50%; transform:translate(-50%,-50%) scale(0.85); display:flex; flex-wrap:wrap; width:78px; justify-content:center; gap:3px; opacity:0; z-index:5; filter:blur(7px); transition:opacity 0.6s ease 0.15s, filter 0.6s ease 0.15s, transform 0.6s ease 0.15s; }
    .cup-zone.show-own .cup-dice-inside { opacity:1; filter:blur(0); transform:translate(-50%,-50%) scale(1); }
    .cup-zone.show-own .cup-opening .question { opacity:0; }
    .cup-zone.show-own .real-cup { transform:rotate(180deg) translateY(-18px); }
    .dice-roll-anim { animation: diceRoll 0.55s linear infinite; }
    @keyframes diceSettle {
      0% { transform: scale(0.5) rotate(-14deg); opacity: 0; }
      60% { transform: scale(1.12) rotate(5deg); opacity: 1; }
      100% { transform: scale(1) rotate(0deg); }
    }
    .dice-settle { }
    .fade-in { animation: fadeIn 0.35s ease; }
    .turn-highlight { animation: turnPulse 1.2s ease-in-out infinite; }
    .cup-glass { cursor: pointer; }
    .cup-glass:active { filter: brightness(1.12); }
    button { transition: transform 0.12s ease, filter 0.12s ease; }
    button:active { transform: scale(0.95); filter: brightness(1.12); }
  `;
  document.head.appendChild(style);
}