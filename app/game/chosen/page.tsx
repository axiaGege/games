"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import Link from "next/link";

// ===================== 常量 =====================
const GAME_TYPE = "tianxuan";
const ROUND_HANDS = [1, 1, 1, 2]; // 每轮新发张数：第1轮+1→第2轮+1→第3轮+1→第4轮+2（累积手牌 1/2/3/5 张，全部保留）
const ROUND_WHEELS = [
  ["大", "小", "单", "双", "红桃", "黑桃", "梅花", "方片"],
  ["同花色", "同数字", "相加超13", "相加低于12", "得数奇数", "得数偶数", "点数最大", "点数最小"],
  ["豹子", "同花顺", "金花", "顺子", "对子", "单张"],
  ["没牛", "牛一", "牛二", "牛三", "牛四", "牛五", "牛六", "牛七", "牛八", "牛九", "牛牛"],
];
const SUITS = ["♠", "♥", "♣", "♦"]; // 0黑桃 1红桃 2梅花 3方片
const SUIT_NAMES = ["黑桃", "红桃", "梅花", "方片"];
const MAX_POUR = 3;

// ===================== 牌工具 =====================
function cardSuit(c: number) { return Math.floor(c / 13); }
function cardRank(c: number) { return (c % 13) + 1; } // 1..13
function rankLabel(r: number) {
  if (r === 1) return "A";
  if (r === 11) return "J";
  if (r === 12) return "Q";
  if (r === 13) return "K";
  return String(r);
}
function isRed(c: number) { const s = cardSuit(c); return s === 1 || s === 3; }

// 种子随机 + 确定性洗牌
function mulberry32(a: number) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffleDeck(seed: number) {
  const rng = mulberry32(seed);
  const deck = Array.from({ length: 52 }, (_, i) => i);
  for (let i = 51; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

// 三张是否顺子（A 可当最小 1-2-3 也可当最大 Q-K-A）
function isStraight3(ranks: number[]) {
  const rs = [...ranks].sort((a, b) => a - b);
  if (rs[0] === rs[1] || rs[1] === rs[2]) return false; // 有重复不是顺子
  if (rs[0] === 1 && rs[1] === 12 && rs[2] === 13) return true; // Q-K-A 特例（A 当最大）
  return rs[2] - rs[0] === 2; // 1-2-3 / 2-3-4 ... Q-K-A 都连续
}

// 五张斗牛：从5张挑3张和为10倍数，余2张和%10 = 牛值
function niuValue(cards: number[]) {
  const ranks = cards.map(cardRank).map((r) => (r > 10 ? 10 : r)); // 斗牛：10/J/Q/K 都算10分
  let best = -1;
  for (let i = 0; i < 5; i++)
    for (let j = i + 1; j < 5; j++)
      for (let k = j + 1; k < 5; k++) {
        const s3 = ranks[i] + ranks[j] + ranks[k];
        if (s3 % 10 === 0) {
          const rest = (ranks.reduce((a, b) => a + b, 0) - s3) % 10;
          const v = rest === 0 ? 10 : rest; // 余0=牛牛=10
          if (v > best) best = v;
        }
      }
  if (best < 0) return "没牛";
  if (best === 10) return "牛牛";
  if (best === 1) return "牛一";
  if (best === 2) return "牛二";
  if (best === 3) return "牛三";
  if (best === 4) return "牛四";
  if (best === 5) return "牛五";
  if (best === 6) return "牛六";
  if (best === 7) return "牛七";
  if (best === 8) return "牛八";
  return "牛九";
}

// 按轮次从累积手牌中取出"截至该轮为止的全部牌"（r1:前1张 / r2:前2张 / r3:前3张 / r4:前5张）
function roundCards(cards: number[], round: number) {
  const per = ROUND_HANDS; // [1,1,1,2] 每轮新发张数
  let total = 0;
  for (let i = 0; i < round; i++) total += per[i] || 0;
  return (cards || []).slice(0, total);
}

// 判定某手牌在第 round 轮是否符合某 feature（单手牌可判定类）
function matchSingle(cards: number[], round: number, feature: string) {
  const seg = roundCards(cards, round); // 本轮应参与判定的那几张
  if (round === 1) {
    const c = seg[0];
    const r = cardRank(c), s = cardSuit(c);
    switch (feature) {
      case "大": return r >= 8;
      case "小": return r <= 7;
      case "单": return r % 2 === 1;
      case "双": return r % 2 === 0;
      case "红桃": return s === 1;
      case "黑桃": return s === 0;
      case "梅花": return s === 2;
      case "方片": return s === 3;
    }
  }
  if (round === 2) {
    const [a, b] = seg;
    const ra = cardRank(a), rb = cardRank(b);
    const sa = cardSuit(a), sb = cardSuit(b);
    const sum = ra + rb;
    switch (feature) {
      case "同花色": return sa === sb;
      case "同数字": return ra === rb;
      case "相加超13": return sum > 13;
      case "相加低于12": return sum < 12;
    }
  }
  if (round === 3) {
    const s = seg.map(cardSuit);
    const r = seg.map(cardRank);
    const allSameSuit = s[0] === s[1] && s[1] === s[2];
    const allSameRank = r[0] === r[1] && r[1] === r[2];
    const straight = isStraight3(r);
    const pair = r[0] === r[1] || r[1] === r[2] || r[0] === r[2];
    let cls = "单张";
    if (allSameRank) cls = "豹子";
    else if (allSameSuit && straight) cls = "同花顺";
    else if (allSameSuit) cls = "金花";
    else if (straight) cls = "顺子";
    else if (pair) cls = "对子";
    return cls === feature;
  }
  if (round === 4) {
    return niuValue(seg) === feature;
  }
  return false;
}

// ===================== 转盘 SVG =====================
function Wheel({ segments, selected, rotation = 0, size = 250, spinning = false }: any) {
  const n = segments.length;
  const cx = size / 2, cy = size / 2, r = size / 2 - 6;
  const slicesBg = [];
  const sliceTexts = [];
  for (let i = 0; i < n; i++) {
    const a0 = -90 + (i * 360) / n;
    const a1 = -90 + ((i + 1) * 360) / n;
    const rad = (deg: number) => (deg * Math.PI) / 180;
    const x0 = cx + r * Math.cos(rad(a0)), y0 = cy + r * Math.sin(rad(a0));
    const x1 = cx + r * Math.cos(rad(a1)), y1 = cy + r * Math.sin(rad(a1));
    const mid = (a0 + a1) / 2;
    const tx = cx + (r * 0.6) * Math.cos(rad(mid));
    const ty = cy + (r * 0.6) * Math.sin(rad(mid));
    const isSel = !spinning && segments[i] === selected;
    // 赛博霓虹：深夜蓝黑交替盘面 + 青色细分割线，指中格青光脉冲
    const base = i % 2 === 0 ? "#10131c" : "#181d2a";
    const NEON = ["#00e5ff", "#ff2e88", "#a3ff12", "#ffb300", "#b26bff", "#ff5c5c"];
    slicesBg.push(
      <path
        key={`bg-${i}`}
        d={`M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 0 1 ${x1} ${y1} Z`}
        fill={isSel ? "#0e2f38" : base}
        stroke={isSel ? "#00e5ff" : "rgba(0,229,255,0.28)"}
        strokeWidth={isSel ? 3 : 1}
        style={isSel ? { animation: "selpulse 1s ease-in-out infinite" } : undefined}
      />
    );
    sliceTexts.push(
      <text
        key={`t-${i}`}
        x={tx} y={ty}
        transform={`rotate(${-rotation} ${tx} ${ty})`}
        fill={isSel ? "#fff" : NEON[i % NEON.length]}
        fontSize={segments[i].length > 3 ? 11 : 14}
        fontWeight={700}
        textAnchor="middle"
        dominantBaseline="middle"
        style={isSel ? undefined : { filter: `drop-shadow(0 0 4px ${NEON[i % NEON.length]})` }}
      >
        {segments[i]}
      </text>
    );
  }
  return (
    <svg width={size} height={size} style={{ filter: "drop-shadow(0 0 18px rgba(0,229,255,0.35))" }}>
      <style>{`@keyframes selpulse{0%,100%{opacity:1}50%{opacity:.5}}`}</style>
      <g style={{ transform: `rotate(${rotation}deg)`, transformOrigin: `${cx}px ${cy}px`, transition: "transform 4s cubic-bezier(0.33,1,0.68,1)" }}>
        {slicesBg}
        {sliceTexts}
      </g>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#00e5ff" strokeWidth={2} />
      <circle cx={cx} cy={cy} r={r - 4} fill="none" stroke="rgba(0,229,255,0.25)" strokeWidth={1} />
      <circle cx={cx} cy={cy} r={22} fill="#0a0d14" stroke="#00e5ff" strokeWidth={2} />
      <text x={cx} y={cy} fill="#00e5ff" fontSize={18} textAnchor="middle" dominantBaseline="middle">🍷</text>
    </svg>
  );
}

// ===================== 主组件 =====================
export default function Chosen() {
  const [playerName, setPlayerName] = useState("");
  const [roomPassword, setRoomPassword] = useState("");
  const [joined, setJoined] = useState(false);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [players, setPlayers] = useState<any[]>([]);
  const [phase, setPhase] = useState("waiting"); // waiting|pouring|round|result
  const [round, setRound] = useState(1);
  const [dealerId, setDealerId] = useState<string | null>(null);
  const [seed, setSeed] = useState<number | null>(null);
  const [deckOffset, setDeckOffset] = useState(0);
  const [wheelSegments, setWheelSegments] = useState<string[]>(ROUND_WHEELS[0]);
  const [wheelSelected, setWheelSelected] = useState<string | null>(null);
  const [wheelRotation, setWheelRotation] = useState(0);
  const [wheelVisible, setWheelVisible] = useState(false);
  const [wheelSpinning, setWheelSpinning] = useState(false);
  const [readyPlayers, setReadyPlayers] = useState<string[]>([]);
  const [result, setResult] = useState("");
  const [drinkers, setDrinkers] = useState<string[]>([]);
  const [excluded, setExcluded] = useState<string[]>([]);
  const [flipped, setFlipped] = useState<boolean[]>([]);        // 自己手牌逐张翻开状态
  const [resultRevealed, setResultRevealed] = useState(false); // 转盘结果是否已翻面揭示
  const [wheelRevealed, setWheelRevealed] = useState(false);   // 转盘轮盘本身是否已翻面露出
  const [revealedOpponents, setRevealedOpponents] = useState<Record<string, boolean>>({}); // 揭晓阶段临时点开查看对手手牌（本地状态，不影响他人）
  const [errorMsg, setErrorMsg] = useState("");
  const [disconnected, setDisconnected] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [pourFloat, setPourFloat] = useState<string | null>(null); // 倒酒飘字反馈

  const playersRef = useRef<any[]>([]);
  const phaseRef = useRef("waiting");
  const roundRef = useRef(1);
  const dealerRef = useRef<string | null>(null);
  const seedRef = useRef<number | null>(null);
  const deckOffsetRef = useRef(0);
  const readyRef = useRef<string[]>([]);
  const versionRef = useRef(0);
  const channelRef = useRef<any>(null);
  const roundSeatsRef = useRef<number[]>([]);
  const dealingRef = useRef(false);
  const spinBusyRef = useRef(false); // 转盘转动/揭晓中防重入（真随机重转期间禁止再点）
  const wheelRotRef = useRef(0);     // 最新转盘角度（落空重转递归时 state 闭包过期，用 ref 取真值）
  const leavingRef = useRef(false);  // 主动暂离/返回键离开中：true 时心跳不再把自己标回在线，保护暂离状态

  const isDealer = playerName && dealerId === playerName;
  const dealerName = (players.find((p: any) => p.name === dealerId)?.name) || dealerId || "—";
  const myPlayer = players.find((p) => p.name === playerName);
  const playingCount = players.filter((p) => p.status === "playing" && p.online !== false).length;
  // 公共杯 = 所有 playing 玩家本轮压酒之和（实时算）
  const cup = players.filter((p) => p.status === "playing" && p.online !== false).reduce((s, p) => s + (p.pouredCups || 0), 0);
  // 全员压完酒（暂离的人不算，避免卡死）：发牌按钮才出现，防止房主误发
  const allPoured = players.filter((p) => p.status === "playing" && p.online !== false).every((p) => p.hasPoured);
  const myCards = myPlayer?.cards || [];

  useEffect(() => { playersRef.current = players; }, [players]);
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { roundRef.current = round; }, [round]);
  useEffect(() => { dealerRef.current = dealerId; }, [dealerId]);
  useEffect(() => { seedRef.current = seed; }, [seed]);
  useEffect(() => { deckOffsetRef.current = deckOffset; }, [deckOffset]);
  useEffect(() => { readyRef.current = readyPlayers; }, [readyPlayers]);

  // ---------- 联机：广播+写库双通道 ----------
  const broadcastAndSyncDB = async (state: any) => {
    const newVersion = versionRef.current + 1;
    versionRef.current = newVersion;
    const payload = {
      ...state,
      version: newVersion,
      roundSeats: roundSeatsRef.current,
      structuralSync: state.structuralSync || false,
    };
    try {
      const channel = channelRef.current || supabase.channel(`tianxuan:${roomId}`, { config: { broadcast: { ack: true } } });
      await channel.send({ type: "broadcast", event: "gameState", payload });
    } catch (e) {
      setDisconnected(true);
      setErrorMsg("⚠️ 连接断开，请检查网络");
      return;
    }
    if (!state.skipWrite) {
      try {
        await supabase.from("rooms").update({
          players: state.players,
          phase: state.phase,
          dealerid: state.dealerId,
          gameover: false,
          currentplayerindex: 0,
          seed: state.seed,
          ...(state.deckOffset !== undefined ? { deckoffset: state.deckOffset } : {}),
          wheelvisible: state.wheelVisible || false,
          wheelselected: state.wheelSelected || null,
          wheelsegments: state.wheelSegments || [],
          communitycard: state.roundSeats ? JSON.stringify(state.roundSeats) : null,
          result: state.result || "",
          resultdetails: JSON.stringify({ round: state.round, excluded: state.excluded || [] }),
          readyplayers: state.readyPlayers || [],
          version: newVersion, // 写入版本号：3秒对账据此判断库里数据新旧，防旧数据抹掉刚发的牌
        }).eq("id", roomId);
        setDisconnected(false);
      } catch (e) {
        console.error("⚠️ 数据库同步失败", e);
      }
    }
  };

  // ---------- 建房 ----------
  // 拆封数据库里以字符串形式存储的数组（rooms 表的 json 列读回来是字符串，需 JSON.parse 还原成真正的数组）
  const parseArray = (raw: any, fallback: any[] = []): any[] => {
    if (!raw) return fallback;
    if (Array.isArray(raw)) return raw;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    } catch {}
    return fallback;
  };

  // ============ 隐形身份证：每台设备一个永久编号，退出也不删，认人靠编号不靠名字 ============
  const getOrCreateCid = () => {
    try {
      let c = localStorage.getItem('txzz_cid');
      if (!c) {
        c = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : ('txzz_' + Math.random().toString(36).slice(2) + Date.now().toString(36));
        localStorage.setItem('txzz_cid', c);
      }
      return c;
    } catch (_) {
      return 'txzz_' + Math.random().toString(36).slice(2);
    }
  };

  // 窄写：结构变更（重进 / 新加入）时，只把「自己那一行」写进数据库，绝不整套覆盖。
  // 写前重新读一次库里最新名单，避免把 joinRoom 开头抄到的（可能过期的）旧快照刻回源头
  // ——这是「别人牌被擦成 0 张 / 5 张」的深层病根（污染了数据库源头，之后谁刷新都中招）。
  const narrowWriteSelf = async (rid: string, selfRow: any, extra?: any) => {
    try {
      const { data } = await supabase.from("rooms").select("players").eq("id", rid).maybeSingle();
      let list = parseArray(data?.players);
      const idx = list.findIndex((p: any) => (p.cid && selfRow.cid && p.cid === selfRow.cid) || (p.name && selfRow.name && p.name === selfRow.name));
      if (idx >= 0) list = list.map((p: any, i: number) => (i === idx ? { ...p, ...selfRow } : p));
      else list = [...list, selfRow];
      await supabase.from("rooms").update({ players: list, ...(extra || {}) }).eq("id", rid);
    } catch (_) {}
  };

  const createRoom = async () => {
    if (!playerName.trim()) { setErrorMsg("请输入名字"); return; }
    if (!roomPassword.trim()) { setErrorMsg("请设置房间密码"); return; }
    setErrorMsg("");
    const { data: existing } = await supabase.from("rooms").select("password").eq("password", roomPassword.trim()).maybeSingle();
    if (existing) { setErrorMsg("这个密码已被使用，请换一个"); return; }
    const newPlayer = { cid: getOrCreateCid(), lastSeen: Date.now(), name: playerName.trim(), seatId: 0, isDealer: true, status: "playing", cards: [], pouredCups: 0, hasPoured: false };
    const { data, error } = await supabase.from("rooms").insert({
      game_type: GAME_TYPE, password: roomPassword.trim(), players: [newPlayer],
      phase: "waiting", dealerid: playerName.trim(), gameover: false, currentplayerindex: 0,
      seed: null, wheelvisible: false, wheelselected: null, wheelsegments: ROUND_WHEELS[0],
      communitycard: null, result: "", resultdetails: JSON.stringify({ round: 1, excluded: [] }),
      readyplayers: [playerName.trim()],
    }).select().single();
    if (error) { setErrorMsg("创建失败: " + error.message); return; }
    setRoomId(data.id); setPlayers([newPlayer]); playersRef.current = [newPlayer]; leavingRef.current = false;
    setDealerId(playerName.trim()); setSeed(null); setDeckOffset(0); setRound(1); setPhase("waiting");
    setReadyPlayers([playerName.trim()]); setWheelSegments(ROUND_WHEELS[0]); setWheelSelected(null);
    setWheelVisible(false); setExcluded([]); setResult(""); setDrinkers([]);
    setJoined(true);
    try {
      localStorage.setItem("txzz_name", playerName.trim());
      localStorage.setItem("txzz_pass", roomPassword.trim());
      localStorage.setItem("txzz_room", data.id);
    } catch (_) {}
    await broadcastAndSyncDB({
      players: [newPlayer], phase: "waiting", dealerId: playerName.trim(), seed: null,
      deckOffset: 0, wheelVisible: false, wheelSelected: null, wheelSegments: ROUND_WHEELS[0],
      round: 1, excluded: [], readyPlayers: [playerName.trim()], result: "", drinkers: [],
    });
  };

  // ---------- 加入房 ----------
  const joinRoom = async (nm?: string, pw?: string) => {
    const name = (nm ?? playerName).trim();
    const pass = (pw ?? roomPassword).trim();
    if (!name) { setErrorMsg("请输入名字"); return; }
    if (!pass) { setErrorMsg("请输入房间密码"); return; }
    setErrorMsg("");
    const { data: roomData, error } = await supabase.from("rooms").select("*").eq("password", pass).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (error || !roomData) { setErrorMsg("密码错误，未找到对应房间"); return; }
    const dbVersion = roomData.version || 0;
    versionRef.current = Math.max(versionRef.current, dbVersion);
    let currentPlayers = parseArray(roomData.players);
    const currentReady = parseArray(roomData.readyplayers);
    const currentWheel = parseArray(roomData.wheelsegments);
    if (currentPlayers.length >= 10) { setErrorMsg("房间已满（最多10人）"); return; }
    const myCid = getOrCreateCid();
    // 认人放宽：cid 相同 或 名字相同都算同一人 —— 换设备/清缓存(cid变)回来靠名字也能认回原座位原牌，不会平白多一个人
    const existingIdx = currentPlayers.findIndex((p: any) => (p.cid && p.cid === myCid) || (p.name === name));
    if (existingIdx >= 0) {
      currentPlayers = currentPlayers.map((p, i) => i === existingIdx ? { ...p, cid: myCid, name, lastSeen: Date.now() } : p);
    }
    if (existingIdx >= 0) {
      leavingRef.current = false;
      // 重进（含暂离回归）：恢复全套，并把 online 设回 true（牌与座位一直在服务器，直接续上）。
      // 用 roomData（joinRoom 开头查到的最新房间）恢复本机 + 广播/写库完整状态——
      // 带的是当前最新进度，绝不丢别人牌、绝不把正在玩的人拽回旧轮次。（对齐已知可用版本 6d8da7f）
      const isMidGame = (roomData.phase || "waiting") !== "waiting";
      const revived = currentPlayers.map((p: any) => {
        if (!((p.cid && p.cid === myCid) || (p.name === name))) return p;
        // 重进：恢复在线身份 + 认回原座位原牌
        const base = { ...p, cid: myCid, name, online: true, lastSeen: Date.now() };
        // 区分两种「回来」：
        // 1) 暂离/返回键回来：之前被标记 online:false，座位+手牌一直在服务器。直接续上原身份、保留手牌，不让其降级为观战（兑现「牌会保留，回来直接续上」）。
        // 2) 退出/刷新重进：并未主动暂离，online 仍是过期的 true。对局进行中则先转观战、清牌，等下一轮 promoteWatchers 自动转正补发缺的牌，避免被强行塞进当前轮。
        const wasPaused = p.online === false;
        if (!wasPaused && isMidGame && p.status === "playing") {
          return { ...base, status: "watching", cards: [], pouredCups: 0, hasPoured: false };
        }
        return base; // 暂离回来：保留原 status(playing) 与 cards，online 设回 true，直接续上
      });
      setRoomId(roomData.id); setJoined(true); setPlayers(revived); playersRef.current = revived;
      // 重进重置本机翻牌/轮盘视觉状态：避免回来后之前翻开的牌/轮盘残留
      setFlipped([]); setWheelRevealed(false); setResultRevealed(false); setRevealedOpponents({}); setWheelSpinning(false);
      setPhase(roomData.phase || "waiting"); setDealerId(roomData.dealerid || null);
      setSeed(roomData.seed || null); setDeckOffset(roomData.deckoffset || 0);
      setWheelSegments(currentWheel.length ? currentWheel : ROUND_WHEELS[0]); setWheelSelected(roomData.wheelselected || null);
      if (roomData.wheelselected && currentWheel.length) {
        const ridx = currentWheel.indexOf(roomData.wheelselected);
        if (ridx >= 0) setWheelRotation(-((ridx + 0.5) * (360 / currentWheel.length)));
      }
      setWheelVisible(roomData.wheelvisible || false);
      setReadyPlayers(currentReady);
      const rd = roomData.resultdetails ? JSON.parse(roomData.resultdetails) : { round: 1, excluded: [] };
      setRound(rd.round || 1); setExcluded(rd.excluded || []);
      roundSeatsRef.current = roomData.communitycard ? JSON.parse(roomData.communitycard) : [];
      try {
        localStorage.setItem("txzz_name", name);
        localStorage.setItem("txzz_pass", pass);
        localStorage.setItem("txzz_room", roomData.id);
      } catch (_) {}
      let retries = 0;
      while (!channelRef.current && retries < 30) { await new Promise((r) => setTimeout(r, 100)); retries++; }
      // 只喊「我自己回来了」：带发件人签名 + skipWrite（不把抄来的整套旧快照写回库），
      // 接收端据签名只更新「我」这一条，别人牌一根都不碰。
      const mySelfRow = revived.find((p: any) => (p.cid && p.cid === myCid) || (p.name === name));
      await broadcastAndSyncDB({ structuralSync: true, skipWrite: true, senderCid: myCid, senderName: name, players: revived });
      // 窄写：只把自己那一行（在线 + 观战/续玩状态）写进库，源头不被污染
      if (mySelfRow) await narrowWriteSelf(roomData.id, mySelfRow);
      return;
    }
    // 全新加入（之前从未进过这房）：直接追加自己，广播/写库完整状态（对齐已知可用版本 6d8da7f）
    const occupied = currentPlayers.map((p: any) => p.seatId).filter((id: any) => id !== undefined);
    let seatId = 0;
    for (let i = 0; i < 10; i++) { if (!occupied.includes(i)) { seatId = i; break; } }
    const isActive = roomData.phase !== "waiting";
    const newPlayer = { cid: myCid, lastSeen: Date.now(), name, seatId, isDealer: false, status: isActive ? "watching" : "playing", cards: [], pouredCups: 0, hasPoured: false };
    const updated = [...currentPlayers, newPlayer];
    // 窄写：重读库里最新名单后只追加自己这一行，绝不用开头抄到的（可能过期的）整套名单覆盖库
    await narrowWriteSelf(roomData.id, newPlayer, { readyplayers: currentReady });
    leavingRef.current = false;
    setRoomId(roomData.id); setJoined(true); setPlayers(updated); playersRef.current = updated;
    setPhase(roomData.phase || "waiting"); setDealerId(roomData.dealerid || null);
    setSeed(roomData.seed || null); setDeckOffset(roomData.deckoffset || 0);
    const reSegs = currentWheel.length ? currentWheel : ROUND_WHEELS[0];
    setWheelSegments(reSegs);
    const reSel = roomData.wheelselected || null;
    setWheelSelected(reSel);
    if (reSel && reSegs.length) {
      const ridx = reSegs.indexOf(reSel);
      if (ridx >= 0) setWheelRotation(-((ridx + 0.5) * (360 / reSegs.length)));
    }
    setWheelVisible(roomData.wheelvisible || false); setReadyPlayers(currentReady);
    const rd = roomData.resultdetails ? JSON.parse(roomData.resultdetails) : { round: 1, excluded: [] };
    setRound(rd.round || 1); setExcluded(rd.excluded || []);
    roundSeatsRef.current = roomData.communitycard ? JSON.parse(roomData.communitycard) : [];
    try {
      localStorage.setItem("txzz_name", name);
      localStorage.setItem("txzz_pass", pass);
      localStorage.setItem("txzz_room", roomData.id);
    } catch (_) {}
    let retries = 0;
    while (!channelRef.current && retries < 30) { await new Promise((r) => setTimeout(r, 100)); retries++; }
    // 只喊「我这个新人进来了」：带发件人签名 + skipWrite；接收端据签名把我追加为新人，别人牌不动
    await broadcastAndSyncDB({ structuralSync: true, skipWrite: true, senderCid: myCid, senderName: name, players: updated });
  };

  // ---------- 接收端 ----------
  useEffect(() => {
    if (!roomId) return;
    const channel = supabase.channel(`tianxuan:${roomId}`, { config: { broadcast: { ack: true } } })
      .on("broadcast", { event: "gameState" }, (msg: any) => {
        const st = msg.payload;
        if (st.version && st.version <= versionRef.current && !st.structuralSync) return;
        if (st.version && !st.structuralSync) { versionRef.current = st.version; }
        if (st.roundSeats) roundSeatsRef.current = st.roundSeats;
        // 结构同步（重进/新加入）：只据「发件人签名」采用他自己那一条，别人一律只合并在线状态、牌 / 座位铁打不动。
        // 且绝不碰 phase/round/seed/wheel 等游戏进度（那些只听当前发牌人的非结构广播）——从根上杜绝旧快照擦别人牌 / 卡轮次。
        if (st.structuralSync) {
          const incoming = st.players || [];
          const senderCid = st.senderCid;
          const senderName = st.senderName;
          if (incoming.length > 0) {
            const myCid = getOrCreateCid();
            const myName = (playerName || "").trim();
            // 铁律：结构广播（有人进来 / 重进 / 暂离返回）只允许「发件人宣布自己那一条」，
            // 绝不允许发件人拿着抄来的（可能过期的）名单替别人代言手牌 / 身份。
            // 从本地(prev)出发逐条决定，天然保证别人的牌 / 座位铁打不动。
            setPlayers((prev) => {
              const next = prev.map((p: any) => {
                // 「接收者自己」这条永远以本地为准（远端对自己只会是回声 / 旧信），只把自己标在线
                if ((p.cid && p.cid === myCid) || (myName && p.name === myName)) {
                  return { ...p, online: true };
                }
                const q = incoming.find((x: any) => (x.cid && p.cid && x.cid === p.cid) || (x.name && p.name && x.name === p.name));
                if (!q) return p; // incoming 没这人 → 保留本地（防旧名单漏人擦人）
                // 「发件人自己」那条：采用他带来的最新状态（观战 / 续玩 / 在线 / 补牌都只是他自己的事），
                // 带新鲜度校验：只有他那条不比本地旧才采用，防「迟到广播」把已被转正的他打回观战 0 张
                const isSender = (senderCid && q.cid === senderCid) || (senderName && q.name === senderName);
                if (isSender) {
                  return ((q.lastSeen || 0) >= (p.lastSeen || 0)) ? { ...q } : p;
                }
                // 其他老玩家：只做「在线保护」——本地在线就保持在线，牌 / 身份 / 座位一律本地，过期空牌再也擦不动
                return { ...p, online: p.online || q.online };
              });
              // incoming 里有、本地没有的人 = 真正的全新玩家 → 追加（本地无旧数据可保，采用他的）
              for (const q of incoming) {
                const has = next.some((p: any) => (q.cid && p.cid && q.cid === p.cid) || (q.name && p.name && q.name === p.name));
                if (!has) next.push({ ...q });
              }
              playersRef.current = next;
              return next;
            });
          }
          setDisconnected(false);
          return;
        }
        const ps = st.players || [];
        if (ps.length > 0) { setPlayers(ps); playersRef.current = ps; }
        if (st.phase) { setPhase(st.phase); phaseRef.current = st.phase; }
        if (st.dealerId !== undefined) setDealerId(st.dealerId);
        if (st.seed !== undefined) setSeed(st.seed);
        if (st.deckOffset !== undefined) setDeckOffset(st.deckOffset);
        if (st.wheelSegments) setWheelSegments(st.wheelSegments);
        if (st.wheelSelected !== undefined) setWheelSelected(st.wheelSelected);
        if (st.wheelRotation !== undefined) {
          setWheelRotation(st.wheelRotation);
          wheelRotRef.current = st.wheelRotation; // 同步角度真值（换发牌人后新房主重转角度才连贯）
          setWheelRevealed(true);   // 立即翻开盖子露出真转盘（杜绝盖子匀速转与真转盘减速转脱节跳位）
          setWheelSpinning(true);
          setTimeout(() => setWheelSpinning(false), 4100); // 真转盘CSS减速动画4秒，spinning须等满才停
        }
        if (st.wheelVisible !== undefined) setWheelVisible(st.wheelVisible);
        if (st.phase === "pouring") {
          setWheelRevealed(false); setResultRevealed(false);
          setRevealedOpponents({}); setFlipped([]); // 换轮倒酒：收起本机翻看的对手牌，并清空自己手牌翻开状态（flipped/revealedOpponents 不进广播，接收端须自行重置，否则旧翻牌残留一直敞着）
        }
        if (st.readyPlayers) setReadyPlayers(st.readyPlayers);
        if (st.round) setRound(st.round);
        if (st.excluded) setExcluded(st.excluded);
        if (st.result !== undefined) setResult(st.result);
        if (st.drinkers) setDrinkers(st.drinkers);
        setDisconnected(false);
      })
      .subscribe();
    channelRef.current = channel;
    return () => { if (channelRef.current) supabase.removeChannel(channelRef.current); channelRef.current = null; };
  }, [roomId]);

  // ---------- 返回键拦截：进房后按返回键先弹确认，确定则当暂离（保留座位手牌） ----------
  useEffect(() => {
    if (!joined) return;
    const onPop = () => {
      history.pushState(null, "", location.href); // 重新压入一条历史，阻止真正后退离开页面
      if (window.confirm("确定离开对局吗？\n（离开后保留座位和手牌，回来可直接续上）")) {
        leaveRoom();
      }
    };
    history.pushState(null, "", location.href); // 进房先压一条历史，让“返回键”先命中此处而不是直接退出
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [joined]);

  // 转盘翻面：转动期间确保盖子翻开（双保险——广播处理函数里已设，effect 再保证一次，防 React 批量更新吞掉）
  useEffect(() => {
    if (wheelSpinning) { setResultRevealed(false); setWheelRevealed(true); return; }
    if (phase === "result" && result) {
      const t = setTimeout(() => { setResultRevealed(true); }, 650);
      return () => clearTimeout(t);
    }
  }, [wheelSpinning, phase, result]);

  // ---------- 自动重连 ----------
  useEffect(() => {
    try {
      const sn = localStorage.getItem("txzz_name");
      const sp = localStorage.getItem("txzz_pass");
      const sr = localStorage.getItem("txzz_room");
      if (sn && sp && sr) {
        setPlayerName(sn); setRoomPassword(sp); setRoomId(sr);
        setTimeout(() => joinRoom(sn, sp), 500);
      }
    } catch (_) {}
  }, []);

  // ---------- 在线状态轻量兜底：每4秒只核对「谁在线/谁暂离」，绝不碰牌/轮次/阶段 ----------
  // 背景：之前删掉乱擦牌的心跳后，别人看到你「已回来在线」全靠重进那一条广播。若广播恰巧丢包，
  // 别人会短暂残留「暂离」。此轮询只读 rooms.players 这一列，把远端(别人自己写入的权威 online)合并到本地，
  // 且只更新 online 一个字段：
  //  - 自己：以本地为准，绝不让自己本机已确认的状态被远端旧值覆盖（防自己写库延迟被误标离线）；
  //  - 别人：采用远端 online（别人暂离/在线都由他自己写入，最权威），既纠正丢包残留，也绝不碰其牌与座位。
  useEffect(() => {
    if (!joined || !roomPassword) return;
    const myCid = getOrCreateCid();
    const id = setInterval(async () => {
      try {
        const { data, error } = await supabase.from("rooms").select("players").eq("password", roomPassword.trim()).maybeSingle();
        if (error || !data) return;
        const remote = parseArray(data.players);
        if (!remote.length) return;
        setPlayers((prev) => {
          const next = prev.map((p: any) => {
            const isSelf = (p.cid && p.cid === myCid) || (p.name && p.name === playerName.trim());
            if (isSelf) return p; // 自己以本地为准，不受远端旧值干扰
            const r: any = remote.find((q: any) => (q.cid && p.cid && q.cid === p.cid) || (q.name && p.name && q.name === p.name));
            return r ? { ...p, online: r.online } : p;
          });
          playersRef.current = next;
          return next;
        });
      } catch (_) {}
    }, 4000);
    return () => clearInterval(id);
  }, [joined, roomPassword, playerName]);

  // ---------- 离开 ----------
  const leaveRoom = async () => {
    if (!roomId) return;
    leavingRef.current = true; // 主动暂离/返回键离开：心跳护栏，避免被标回在线
    const me = playerName;
    // 暂离：保留玩家（含手牌/座位），只标记 offline，回来牌还在、座位不丢
    let updated = players.map((p) => (p.name === me ? { ...p, online: false } : p));
    let newDealer = dealerId;
    const isDealerLeaving = me === dealerId;
    let newReady = readyPlayers.filter((n) => n !== me);
    if (isDealerLeaving) {
      const idx = players.findIndex((p) => p.name === me);
      const n = players.length;
      let next: any = null;
      for (let step = 1; step <= n; step++) {
        const cand = players[(idx + step) % n];
        if (cand.name !== me && cand.status === "playing" && cand.online !== false) { next = cand; break; }
      }
      if (next) {
        newDealer = next.name;
        updated = updated.map((p) => ({ ...p, isDealer: p.name === next.name }));
      }
      // 无人接手则保留房主标记（暂离期间游戏暂停，回来继续）
    }
    await supabase.from("rooms").update({ players: updated, dealerid: newDealer, readyplayers: newReady }).eq("id", roomId);
    await broadcastAndSyncDB({ players: updated, phase: phase, dealerId: newDealer, seed: seed, deckOffset: deckOffset, wheelVisible: wheelVisible, wheelSelected: wheelSelected, wheelSegments: wheelSegments, round: round, excluded: excluded, readyPlayers: newReady, result: result, drinkers: drinkers });
    setJoined(false); setRoomId(""); // 本机退出界面，但服务器仍保留该玩家（online=false），牌与座位都在
    try { localStorage.removeItem("txzz_name"); localStorage.removeItem("txzz_pass"); localStorage.removeItem("txzz_room"); /* 保留 txzz_cid */ } catch (_) {}
    if (channelRef.current) { supabase.removeChannel(channelRef.current); channelRef.current = null; }
  };

  // ===================== 玩法逻辑（房主控制） =====================
  const syncPlayers = (ps: any[], extra: any = {}) => {
    setPlayers(ps); playersRef.current = ps;
    broadcastAndSyncDB({
      players: ps, phase: phaseRef.current, dealerId: dealerRef.current, seed: seedRef.current,
      deckOffset: deckOffsetRef.current, wheelVisible, wheelSelected, wheelSegments,
      round: roundRef.current, excluded, readyPlayers: readyRef.current, result, drinkers, ...extra,
    });
  };

  // 房主：开始游戏（冻结座位，进入第①轮倒酒）
  const startGame = () => {
    const playing = players.filter((p) => p.status === "playing" && p.online !== false);
    if (playing.length < 2) {
      setErrorMsg("至少 2 人才能开始游戏");
      return;
    }
    const seats = playing.map((p) => p.seatId).sort((a, b) => a - b);
    roundSeatsRef.current = seats;
    const ns = Math.floor(Math.random() * 1e9);
    setSeed(ns); seedRef.current = ns; setDeckOffset(0); deckOffsetRef.current = 0;
    const ps = players.map((p) => ({ ...p, cards: [], pouredCups: 0, hasPoured: false }));
    setPlayers(ps); playersRef.current = ps;
    setRound(1); setWheelSegments(ROUND_WHEELS[0]); setWheelSelected(null); setWheelVisible(true);
    setReadyPlayers([playerName]); setExcluded([]); setResult(""); setDrinkers([]); setFlipped([]); setWheelRevealed(false); setResultRevealed(false); setRevealedOpponents({}); setPhase("pouring");
    broadcastAndSyncDB({
      players: ps, phase: "pouring", dealerId, seed: ns, deckOffset: 0,
      wheelVisible: true, wheelSelected: null, wheelSegments: ROUND_WHEELS[0],
      round: 1, excluded: [], readyPlayers: [playerName], result: "", drinkers: [], roundSeats: seats,
    });
  };

  // 玩家：一键压酒（点哪个直接定为 n 杯并锁定，压过后不可再改）
  const doPour = (n: number) => {
    if (myPlayer?.hasPoured) return; // 已压过则锁定，防止误改/连点
    const nn = Math.max(0, Math.min(MAX_POUR, n));
    const ps = players.map((p) => p.name === playerName ? { ...p, pouredCups: nn, hasPoured: true } : p);
    const rp = readyRef.current.includes(playerName) ? readyRef.current : [...readyRef.current, playerName];
    setReadyPlayers(rp); readyRef.current = rp;
    syncPlayers(ps, { readyPlayers: rp });
    setPourFloat(nn === 0 ? "🚫 不倒" : `🍺 +${nn}杯`);
    setTimeout(() => setPourFloat(null), 900);
  };

  // 中途加入的观战者，在「下一轮 / 洗牌重来」时转正为玩家，并补发其缺的历史牌。
  // 只处理 status==="watching" 的人——补牌只由 dealer 一人算、一次广播，其它端只接收 players，绝不本地各自补牌
  // （否则各端 seed/deckOffset 中间态不一致 → 同一个人在不同端补到的牌不同 = "第三轮有人3张有人2张"）。
  // playing 玩家若因重进/暂离链路漏了历史牌，改由 dealRound 发牌时统一兜底补齐（同样只在 dealer 端算一次）。
  // （按当前种子牌堆顺序续接 deckOffset 追加到末尾，roundCards 取的是前 N 张，顺序不乱、牌合法不重复；cumsum=各轮累积张数前缀和）
  const promoteWatchers = (list: any[], nr: number) => {
    const cumsum = [1, 2, 3, 5];
    const need = nr <= 1 ? 0 : cumsum[nr - 2];
    const deck = shuffleDeck(seedRef.current || 1);
    let off = deckOffsetRef.current;
    const out = list.map((p) => {
      if (p.status !== "watching") return p;
      const cards = [...(p.cards || [])];
      while (cards.length < need) { cards.push(deck[off]); off++; }
      return { ...p, status: "playing", cards };
    });
    deckOffsetRef.current = off;
    return out;
  };

  // 轮转发牌人：按进房顺序（seatId）找下一个 status===playing 且非暂离(online!==false) 的玩家；循环；极端全暂离则保持当前
  const nextDealer = (list: any[], cur: string | null) => {
    const q = list.filter((p: any) => p.status === "playing").slice().sort((a: any, b: any) => (a.seatId || 0) - (b.seatId || 0));
    if (q.length === 0) return cur;
    const idx = q.findIndex((p: any) => p.name === cur);
    const start = idx < 0 ? 0 : idx;
    for (let step = 1; step <= q.length; step++) {
      const cand = q[(start + step) % q.length];
      if (cand.online !== false) return cand.name;
    }
    return cur; // 全是暂离，兜底保持
  };

  // 发牌（当轮发牌人 dealer 调用）
  const dealRound = () => {
    if (dealingRef.current) return; // 防连点竞态
    dealingRef.current = true;
    try {
    const r = roundRef.current;
    const n = ROUND_HANDS[r - 1];
    const cumsum = [1, 2, 3, 5];
    const prevNeed = r <= 1 ? 0 : cumsum[r - 2]; // 本轮发牌前，玩家手里应有的「上一轮累积」张数
    const deck = shuffleDeck(seedRef.current || 1);
    let off = deckOffsetRef.current;
    const ps = playersRef.current.map((p) => ({ ...p, cards: [...(p.cards || [])] }));
    // 遍历所有 playing 玩家（含本局中途转正者），按座位号排序，保证发牌顺序稳定且中途加入者也能拿到本轮新牌
    const seats = ps.filter((p) => p.status === "playing").map((p) => p.seatId).sort((a, b) => a - b);
    roundSeatsRef.current = seats;
    seats.forEach((seat) => {
      const p = ps.find((x) => x.seatId === seat);
      if (!p) return;
      // 兜底补牌：若该玩家因重进/暂离链路漏了历史牌（牌数不足上一轮累积数），先补齐到 prevNeed——
      // 只在 dealer 端算、随本次广播一起下发，各端只接收，保证所有人牌数一致（根治"有人3张有人2张"）
      while (p.cards.length < prevNeed) { p.cards.push(deck[off]); off++; }
      // 累积发牌：保留之前轮次手牌，本轮再追加 n 张新牌
      for (let k = 0; k < n; k++) { p.cards.push(deck[off]); off++; }
    });
    setDeckOffset(off); deckOffsetRef.current = off;
    setPlayers(ps); playersRef.current = ps;
    setPhase("round"); setDrinkers([]); setResultRevealed(false); setWheelRevealed(false); setRevealedOpponents({});
    broadcastAndSyncDB({
      players: ps, phase: "round", dealerId, seed: seedRef.current, deckOffset: off,
      wheelVisible: true, wheelSelected: null, wheelSegments: ROUND_WHEELS[r - 1],
      round: r, excluded: [], readyPlayers: readyRef.current, result: "", drinkers: [], roundSeats: seats,
    });
    } catch (e) { dealingRef.current = false; }
  };

  // 转转盘（当轮发牌人 dealer 调用）
  // 真随机转盘：8格全保留、不预筛必中；转盘停稳后才判定符合者并公告（转的时候不剧透）；
  // 落空（无人符合）→ 提示后自动重转，最多重转 3 次，仍落空则兜底选"符合人数最多"的格子
  const spinWheel = (attempt: number = 0) => {
    if (attempt === 0) {
      if (spinBusyRef.current) return; // 转动/重转中禁止再点
      spinBusyRef.current = true;
    }
    const r = roundRef.current;
    const segs = ROUND_WHEELS[r - 1];
    const ps = playersRef.current;
    const active = ps.filter((p) => p.status === "playing" && p.online !== false);
    // 计算每人点数和（用于奇偶等比较）
    const sums = active.map((p) => roundCards(p.cards, r).reduce((s: number, c: number) => s + cardRank(c), 0));
    const maxSum = sums.length ? Math.max(...sums) : 0;
    const minSum = sums.length ? Math.min(...sums) : 0;
    const matchNames = (f: string) => active.filter((p, i) => {
      if (f === "得数奇数") return sums[i] % 2 === 1;
      if (f === "得数偶数") return sums[i] % 2 === 0;
      if (f === "点数最大") return sums[i] === maxSum;
      if (f === "点数最小") return sums[i] === minSum;
      return matchSingle(p.cards, r, f);
    }).map((p) => p.name);
    // 候选特征（仅排除已排除的，不做"必中"预筛——真随机）
    const candidates = segs.filter((s) => !excluded.includes(s));
    let picked: string;
    if (attempt >= 3) {
      // 连落空3次兜底：选符合人数最多的格子，防无限空转
      picked = candidates.reduce((best, f) => (matchNames(f).length > matchNames(best).length ? f : best), candidates[0]);
    } else {
      picked = candidates[Math.floor(Math.random() * candidates.length)];
    }
    // 转盘旋转角度：让选中的格子转到最上方（12点）
    const idx = segs.indexOf(picked);
    const step = 360 / segs.length;
    const restAngle = -((idx + 0.5) * step); // 选中格到顶部的静止角度
    const cur = wheelRotRef.current;
    const curMod = ((cur % 360) + 360) % 360;
    const restMod = ((restAngle % 360) + 360) % 360;
    const forward = (restMod - curMod + 360) % 360;
    const newRot = cur + 360 * 5 + forward; // 转5圈再落到结果格
    wheelRotRef.current = newRot;
    setWheelRotation(newRot);
    setWheelSelected(picked);
    setWheelRevealed(true);    // 转动开始就翻开盖子：全程看真转盘减速转，杜绝盖子匀速转→翻开跳位
    setWheelSpinning(true);
    setTimeout(() => setWheelSpinning(false), 4100); // 真转盘CSS减速动画4秒，spinning等满才停
    // 先只广播"转盘在转"（不带谁喝的结果——防剧透），让所有端同步看转
    broadcastAndSyncDB({
      players: ps, phase: "round", dealerId, seed: seedRef.current, deckOffset: deckOffsetRef.current,
      wheelVisible: true, wheelSelected: picked, wheelSegments: segs,
      round: r, excluded, readyPlayers: readyRef.current, result: "", drinkers: [], roundSeats: roundSeatsRef.current,
      wheelRotation: newRot,
    });
    // 转盘停稳后（4s减速动画+0.2s缓冲）才判定并公告
    setTimeout(() => {
      const drinkersList = matchNames(picked);
      if (drinkersList.length === 0 && attempt < 3) {
        // 落空：全场提示后自动重转（公共杯原样保留，无人喝不清）
        const missTxt = `❌ 指中【${picked}】无人符合，转盘重新转！`;
        setResult(missTxt);
        broadcastAndSyncDB({
          players: playersRef.current, phase: "round", dealerId, seed: seedRef.current, deckOffset: deckOffsetRef.current,
          wheelVisible: true, wheelSelected: picked, wheelSegments: segs,
          round: r, excluded, readyPlayers: readyRef.current, result: missTxt, drinkers: [], roundSeats: roundSeatsRef.current,
        });
        setTimeout(() => { setResult(""); spinWheel(attempt + 1); }, 1600);
        return;
      }
      const txt = drinkersList.length === 1
        ? `🎡 指中【${picked}】→ 🌟天选之子,你不喝谁喝（一口闷，别哼）`
        : drinkersList.length > 1
        ? `🎡 指中【${picked}】→ 有 ${drinkersList.length} 位天命人，（平分）`
        : `🎡 指中【${picked}】，本场无人符合`;
      setResult(txt); setDrinkers(drinkersList);
      setPhase("result");
      spinBusyRef.current = false;
      broadcastAndSyncDB({
        players: playersRef.current, phase: "result", dealerId, seed: seedRef.current, deckOffset: deckOffsetRef.current,
        wheelVisible: true, wheelSelected: picked, wheelSegments: segs,
        round: r, excluded, readyPlayers: readyRef.current, result: txt, drinkers: drinkersList, roundSeats: roundSeatsRef.current,
      });
    }, 4200);
  };

  // 房主：下一轮 或 洗牌重来
  const nextRound = () => {
    const r = roundRef.current;
    dealingRef.current = false; // 解锁发牌，允许下一轮发牌
    spinBusyRef.current = false; // 复位转盘锁（防极端情况卡住不能再转）
    if (r < 4) {
      const nr = r + 1;
      let ps = playersRef.current.map((p) => ({ ...p, pouredCups: 0, hasPoured: false }));
      ps = promoteWatchers(ps, nr); // 观战者转正 + 补发其缺的历史牌
      const nd = nextDealer(ps, dealerId); setDealerId(nd); dealerRef.current = nd; // 轮转发牌人（跳过暂离）
      setPlayers(ps); playersRef.current = ps;
      setDeckOffset(deckOffsetRef.current); // 同步补牌推进后的牌堆位置
      setRound(nr); setWheelSegments(ROUND_WHEELS[nr - 1]); setWheelSelected(null);
      setReadyPlayers([nd]); setExcluded([]); setResult(""); setDrinkers([]); setWheelRevealed(false); setResultRevealed(false); setRevealedOpponents({}); setPhase("pouring");
      broadcastAndSyncDB({
        players: ps, phase: "pouring", dealerId: nd, seed: seedRef.current, deckOffset: deckOffsetRef.current,
        wheelVisible: true, wheelSelected: null, wheelSegments: ROUND_WHEELS[nr - 1],
        round: nr, excluded: [], readyPlayers: [nd], result: "", drinkers: [], roundSeats: roundSeatsRef.current,
      });
    } else {
      // 洗牌重来：新种子
      const ns = Math.floor(Math.random() * 1e9);
      let ps = playersRef.current.map((p) => ({ ...p, cards: [], pouredCups: 0, hasPoured: false }));
      ps = promoteWatchers(ps, 1); // 新局：观战者转正（cards 已清空，新局重新发牌，不补历史）
      const nd = nextDealer(ps, dealerId); setDealerId(nd); dealerRef.current = nd; // 洗牌重来后继续往下轮（不回房主）
      setPlayers(ps); playersRef.current = ps; // 必须本地清牌：房主自己的广播回声被 version 拦截，不调用则上一局5张残留
      setSeed(ns); seedRef.current = ns; setDeckOffset(0); deckOffsetRef.current = 0;
      setRound(1); setWheelSegments(ROUND_WHEELS[0]); setWheelSelected(null);
      setReadyPlayers([nd]); setExcluded([]); setResult("🔄 洗牌重来，新一轮开始！"); setDrinkers([]); setFlipped([]); setWheelRevealed(false); setResultRevealed(false); setRevealedOpponents({}); setPhase("pouring");
      broadcastAndSyncDB({
        players: ps, phase: "pouring", dealerId: nd, seed: ns, deckOffset: 0,
        wheelVisible: true, wheelSelected: null, wheelSegments: ROUND_WHEELS[0],
        round: 1, excluded: [], readyPlayers: [nd], result: "🔄 洗牌重来，新一轮开始！", drinkers: [], roundSeats: roundSeatsRef.current,
      });
    }
  };

  // ===================== 渲染 =====================
  const gold = "#d4af37", goldSoft = "#f0c75e", dark = "#0a0a0f", wine = "#5a1326";

  if (!joined) {
    return (
      <div style={{ minHeight: "100vh", background: `radial-gradient(circle at 50% 30%, ${wine} 0%, ${dark} 70%)`, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: "-apple-system, sans-serif" }}>
        <div style={{ width: "100%", maxWidth: 380, background: "rgba(20,12,16,0.85)", border: `1.5px solid ${gold}`, borderRadius: 24, padding: "34px 26px", boxShadow: `0 0 40px rgba(212,175,55,0.25), inset 0 0 24px rgba(212,175,55,0.08)` }}>
          <div style={{ textAlign: "center", marginBottom: 6, fontSize: 54 }}>🍷</div>
          <div style={{ textAlign: "center", color: goldSoft, fontSize: 13, letterSpacing: 3, marginBottom: 2 }}>THE CHOSEN ONE</div>
          <h1 style={{ textAlign: "center", color: "#fff", fontSize: 28, fontWeight: 800, margin: "4px 0 4px", textShadow: `0 0 16px ${gold}` }}>天选之子</h1>
          <p style={{ textAlign: "center", color: "rgba(255,255,255,0.55)", fontSize: 13, marginBottom: 22 }}>The Chosen One · 命中注定，谁是天命人？</p>
          <input placeholder="你的昵称" value={playerName} onChange={(e) => setPlayerName(e.target.value)} style={inp(gold)} />
          <input placeholder="房间密码（建房自定 / 加入填相同）" value={roomPassword} onChange={(e) => setRoomPassword(e.target.value)} style={{ ...inp(gold), marginTop: 10 }} />
          {errorMsg && <div style={{ color: "#f87171", fontSize: 13, marginTop: 10, textAlign: "center" }}>{errorMsg}</div>}
          <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
            <button onClick={createRoom} style={{ ...btnPrimary(gold, goldSoft), flex: 1, fontFamily: '"KaiTi","STKaiti","楷体","Kaiti SC",serif', letterSpacing: 3, textShadow: "0 1px 4px rgba(0,0,0,0.35)" }}>🍷 开房</button>
            <button onClick={() => joinRoom()} style={{ ...btnSecondary(gold), flex: 1, fontFamily: '"KaiTi","STKaiti","楷体","Kaiti SC",serif', letterSpacing: 3, textShadow: "0 1px 4px rgba(0,0,0,0.35)" }}>🔑 贵宾一位</button>
          </div>
          <div style={{ textAlign: "center", marginTop: 16 }}>
            <Link href="/" style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, textDecoration: "none" }}>← 返回游戏厅</Link>
          </div>
        </div>
      </div>
    );
  }

  const opponents = players.filter((p) => p.name !== playerName && p.status !== "left");

  return (
    <div style={{ minHeight: "100vh", background: `radial-gradient(circle at 50% 0%, ${wine} 0%, ${dark} 65%)`, display: "flex", flexDirection: "column", alignItems: "center", padding: "12px 12px 24px", fontFamily: "-apple-system, sans-serif", color: "#fff" }}>
      {/* 顶栏 */}
      <div style={{ width: "100%", maxWidth: 480, display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ color: goldSoft, fontSize: 13, letterSpacing: 2 }}>🍷 THE CHOSEN ONE</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>👥 {players.length}</span>
          <button onClick={() => setShowRules(true)} style={miniBtn(gold)}>❓规则</button>
          <button onClick={() => { if (confirm("确定暂离？你的牌会保留，回来直接续上")) leaveRoom(); }} style={miniBtn("#f87171")}>暂离</button>
        </div>
      </div>

      {/* 阶段条 */}
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        {[1, 2, 3, 4].map((r) => (
          <div key={r} style={{ padding: "4px 12px", borderRadius: 999, fontSize: 13, fontWeight: 700, border: `1px solid ${round >= r ? gold : "rgba(255,255,255,0.2)"}`, background: round === r ? gold : "transparent", color: round === r ? dark : "rgba(255,255,255,0.5)" }}>第{r}轮</div>
        ))}
      </div>

      {/* 转盘：盖着 → 转 → 停 → 翻面亮出指中特征 */}
      {wheelVisible && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ perspective: 800, display: "flex", justifyContent: "center" }}>
            <div style={{ width: 230, height: 230, position: "relative", transformStyle: "preserve-3d", transition: "transform 0.6s", transform: wheelRevealed ? "rotateY(180deg)" : "rotateY(0deg)" }}>
              {/* 盖面（酒红丝绒牌背，转前盖住轮盘） */}
              <div style={{ position: "absolute", inset: 0, backfaceVisibility: "hidden", borderRadius: "50%", background: "linear-gradient(135deg,#131826,#0a0d14)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", border: "3px solid #00e5ff", boxShadow: "inset 0 0 18px rgba(0,0,0,0.7), 0 0 16px rgba(0,229,255,0.35)" }}>
                <style>{`@keyframes txspin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
                <svg width="76" height="76" viewBox="0 0 100 100" style={{ animation: wheelSpinning ? "txspin 1.1s linear infinite" : "none", filter: "drop-shadow(0 0 6px rgba(0,229,255,0.6))" }}>
                  {/* 电光准星：外环 + 虚线雷达环 + 十字准星线 + 顶部粉色锁定标记 + 中心锁定圈 */}
                  <circle cx="50" cy="50" r="46" fill="none" stroke="#00e5ff" strokeWidth="3" />
                  <circle cx="50" cy="50" r="34" fill="none" stroke="rgba(0,229,255,0.35)" strokeWidth="1.5" strokeDasharray="4 5" />
                  <line x1="50" y1="7" x2="50" y2="27" stroke="#00e5ff" strokeWidth="2.5" />
                  <line x1="50" y1="73" x2="50" y2="93" stroke="#00e5ff" strokeWidth="2.5" />
                  <line x1="7" y1="50" x2="27" y2="50" stroke="#00e5ff" strokeWidth="2.5" />
                  <line x1="73" y1="50" x2="93" y2="50" stroke="#00e5ff" strokeWidth="2.5" />
                  <polygon points="50,1 43,15 57,15" fill="#ff2e88" />
                  <circle cx="50" cy="50" r="13" fill="none" stroke="#8ef6ff" strokeWidth="2" />
                  <circle cx="50" cy="50" r="3.2" fill="#ff2e88" />
                </svg>
                <span style={{ color: "#8ef6ff", fontSize: 14, marginTop: 10, letterSpacing: 2, textShadow: "0 0 8px rgba(0,229,255,0.5)" }}>{wheelSpinning ? "转动中…" : "天选转盘"}</span>
              </div>
              {/* 背面：真实轮盘（指中格金边脉冲高亮） */}
              <div style={{ position: "absolute", inset: 0, backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}>
                <Wheel segments={wheelSegments} selected={wheelSelected} rotation={wheelRotation} size={230} spinning={wheelSpinning} />
              </div>
            </div>
          </div>
          {/* 结果区翻面（谁喝了） */}
          {phase === "result" && result ? (
            <div style={{ perspective: 800, marginTop: 4, display: "flex", justifyContent: "center" }}>
              <div style={{ width: "100%", maxWidth: 360, height: 48, position: "relative", transformStyle: "preserve-3d", transition: "transform 0.6s", transform: resultRevealed ? "rotateY(180deg)" : "rotateY(0deg)" }}>
                <div style={{ position: "absolute", inset: 0, backfaceVisibility: "hidden", borderRadius: 12, background: "linear-gradient(135deg,#5c1a2e,#2e0a16)", display: "flex", alignItems: "center", justifyContent: "center", border: `2px solid ${gold}`, color: goldSoft, fontSize: 14 }}>🂠 揭晓中…</div>
                <div style={{ position: "absolute", inset: 0, backfaceVisibility: "hidden", transform: "rotateY(180deg)", borderRadius: 12, background: "rgba(212,175,55,0.12)", display: "flex", alignItems: "center", justifyContent: "center", border: `2px solid ${gold}`, color: goldSoft, fontSize: 13, padding: "0 10px", textAlign: "center" }}>{result}</div>
              </div>
            </div>
          ) : (
            <div style={{ textAlign: "center", fontSize: 14, color: goldSoft, minHeight: 20, marginTop: 4 }}>
              {phase === "round" ? (result || `本轮由 ${dealerName} 转转盘`) : phase === "pouring" ? `往公共杯倒酒，本轮由 ${dealerName} 发牌` : ""}
            </div>
          )}
        </div>
      )}

      {/* 公共杯（金红酒杯图形，酒柱随杯数涨） */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12, padding: "8px 16px", borderRadius: 14, background: "rgba(212,175,55,0.1)", border: `1px solid ${gold}`, position: "relative" }}>
        <style>{`@keyframes txblink{0%,100%{opacity:1}50%{opacity:.3}}@keyframes txfloat{0%{opacity:0;transform:translateY(6px)}20%{opacity:1}100%{opacity:0;transform:translateY(-12px)}}`}</style>
        {/* 酒杯图形 */}
        <div style={{ position: "relative", width: 34, height: 46, flexShrink: 0 }}>
          <div style={{ position: "absolute", left: 2, top: 0, width: 30, height: 38, borderRadius: "4px 4px 10px 10px", border: `2px solid ${gold}`, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
            <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: `${cup <= 0 ? 0 : Math.max(12, Math.min(100, (cup / Math.max(1, playingCount * MAX_POUR)) * 100))}%`, background: "linear-gradient(180deg,#e23b54,#7a0f22)", transition: "height 0.45s ease", boxShadow: "0 0 10px rgba(196,30,58,0.6)" }} />
          </div>
          <div style={{ position: "absolute", left: 15, top: 38, width: 4, height: 5, background: gold }} />
          <div style={{ position: "absolute", left: 5, top: 43, width: 24, height: 3, borderRadius: 2, background: gold }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15 }}>公共杯：<b style={{ color: goldSoft }}>{cup}</b> 杯{phase === "pouring" && <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>（倒酒阶段）</span>}</div>
          {phase === "pouring" && (
            <div style={{ fontSize: 12, color: goldSoft, marginTop: 2 }}>已倒完 {players.filter((p) => p.status === "playing" && p.online !== false && p.hasPoured).length} / {playingCount} 人</div>
          )}
        </div>
        {pourFloat && (
          <span style={{ position: "absolute", right: 14, top: 4, fontSize: 13, fontWeight: 800, color: goldSoft, animation: "txfloat 0.9s ease", pointerEvents: "none" }}>{pourFloat}</span>
        )}
      </div>

      {/* 对手 */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", marginBottom: 14, width: "100%", maxWidth: 480 }}>
        {opponents.map((p) => {
          const isWatching = p.status === "watching";
          const isAway = p.online === false && !isWatching;
          const canPeek = phase === "result" && resultRevealed && !isWatching && !isAway;
          const isRevealed = !!revealedOpponents[p.name];
          const cards = p.cards && p.cards.length ? p.cards : Array(round).fill(0);
          return (
          <div key={p.name} onClick={() => canPeek && setRevealedOpponents((prev) => ({ ...prev, [p.name]: !prev[p.name] }))} style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "6px 10px", borderRadius: 12, background: "rgba(255,255,255,0.04)", border: `1px solid ${(isWatching || isAway) ? "rgba(255,255,255,0.25)" : (p.hasPoured ? gold : (phase === "pouring" ? "#f87171" : (canPeek ? goldSoft : "rgba(255,255,255,0.12)")))}`, animation: (!isWatching && !isAway && phase === "pouring" && !p.hasPoured) ? "txblink 1s infinite" : "none", cursor: canPeek ? "pointer" : "default", minWidth: 72 }}>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", marginBottom: 3 }}>{p.name}{p.isDealer ? "👑" : ""}{isWatching ? " 👁" : ""}{isAway ? " 💤" : ""}{isRevealed ? " 👀" : ""}</div>
            <div style={{ display: "flex", gap: 3 }}>
              {cards.map((c: any, i: number) => {
                if (isRevealed && c) {
                  const red = isRed(c);
                  return (
                    <span key={i} style={{ width: 15, height: 21, borderRadius: 3, background: "#fbf7ee", border: `1px solid ${gold}`, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 8, color: red ? "#c41e3a" : "#111", fontWeight: 800, lineHeight: 1 }}>
                      {rankLabel(cardRank(c))}{SUITS[cardSuit(c)]}
                    </span>
                  );
                }
                return <span key={i} style={{ width: 15, height: 21, borderRadius: 3, background: "radial-gradient(circle at 50% 42%, #1a1030, #05050c)", border: "1px solid rgba(255,255,255,0.18)", display: "inline-block" }} />;
              })}
            </div>
            <div style={{ fontSize: 10, color: isAway ? "rgba(255,255,255,0.45)" : (isWatching ? "rgba(255,255,255,0.45)" : (p.hasPoured ? goldSoft : "rgba(255,255,255,0.4)")), marginTop: 2 }}>{isRevealed ? "已偷看" : (isAway ? "暂离中" : (isWatching ? "观战中" : (p.hasPoured ? "已倒完" : "倒酒中")))}</div>
          </div>
          );
        })}
      </div>

      {/* 自己手牌 */}
      <div style={{ display: "flex", gap: 6, justifyContent: "center", marginBottom: 6, flexWrap: "wrap" }}>
        {myCards.length > 0 ? myCards.map((c: number, i: number) => {
          const isF = !!flipped[i];
          const hit = false; // 不自动高亮命中牌：玩家自己翻牌、自己算点数才有悬念
          return (
            <div key={i} onClick={() => setFlipped((prev) => { const n = [...prev]; n[i] = !n[i]; return n; })}
              style={{ width: 52, height: 74, borderRadius: 8, cursor: "pointer", perspective: 500 }}>
              <div style={{ position: "relative", width: "100%", height: "100%", transformStyle: "preserve-3d", transition: "transform 0.45s", transform: isF ? "rotateY(180deg)" : "rotateY(0deg)" }}>
                {/* 牌背（盖着）—— 朴素深色：不发光不闪，留悬念 */}
                <div style={{ position: "absolute", inset: 0, backfaceVisibility: "hidden", borderRadius: 8, background: "radial-gradient(circle at 50% 42%, #1a1030, #05050c)", display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid rgba(255,255,255,0.2)" }}>
                  <span style={{ fontSize: 26, fontWeight: 800, color: "rgba(255,255,255,0.25)" }}>◆</span>
                </div>
                {/* 牌面（翻开）—— ①经典角标式：左上/右下角标 + 中央大花色 */}
                <div style={{ position: "absolute", inset: 0, backfaceVisibility: "hidden", transform: "rotateY(180deg)", borderRadius: 8, background: "#fbf7ee", border: `2px solid ${hit ? "#c41e3a" : gold}`, boxShadow: hit ? "0 0 14px #c41e3a" : "none", overflow: "hidden" }}>
                  <div style={{ position: "absolute", top: 3, left: 4, fontSize: 13, fontWeight: 800, color: isRed(c) ? "#c41e3a" : "#1a1a1a", lineHeight: 1, textAlign: "center" }}>{rankLabel(cardRank(c))}<br />{SUITS[cardSuit(c)]}</div>
                  <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, color: isRed(c) ? "#c41e3a" : "#1a1a1a" }}>{SUITS[cardSuit(c)]}</div>
                  <div style={{ position: "absolute", bottom: 3, right: 4, fontSize: 13, fontWeight: 800, color: isRed(c) ? "#c41e3a" : "#1a1a1a", lineHeight: 1, textAlign: "center", transform: "rotate(180deg)" }}>{rankLabel(cardRank(c))}<br />{SUITS[cardSuit(c)]}</div>
                </div>
              </div>
            </div>
          );
        }) : (
          <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, padding: "20px 0" }}>{myPlayer?.status === "watching" && phase !== "waiting" ? "👁 观战中，下一轮自动加入" : `等待 ${dealerName} 发牌…`}</div>
        )}
      </div>
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 10 }}>我的手牌（第 {round} 轮 · 共 {myCards.length} 张）</div>

      {/* 压酒（玩家）：点哪个直接定为 N 杯并锁定，压过后按钮消失 */}
      {phase === "pouring" && !myPlayer?.hasPoured && (
        <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap", justifyContent: "center" }}>
          {[0, 1, 2, 3].map((n) => (
            <button key={n} onClick={() => doPour(n)} style={{ ...(n === 0 ? btnSecondary("#94a3b8") : btnSecondary(gold)), minWidth: 66, fontSize: 14, fontWeight: 600 }}>
              {n === 0 ? "🚫 不倒" : `🍺 ${n}杯`}
            </button>
          ))}
        </div>
      )}
      {phase === "pouring" && myPlayer?.hasPoured && (
        <div style={{ width: "100%", textAlign: "center", color: goldSoft, fontSize: 13, marginBottom: 14 }}>已压 {myPlayer?.pouredCups || 0} 杯，等待 {dealerName} 发牌…</div>
      )}

      {/* 当轮发牌人控制条 */}
      {isDealer && (
        <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", justifyContent: "center" }}>
          {phase === "waiting" && <button onClick={startGame} style={btnPrimary(gold, goldSoft)}>▶ 开始游戏（冻结座位）</button>}
          {phase === "pouring" && allPoured && <button onClick={dealRound} style={btnPrimary(gold, goldSoft)}>🃏 发牌（第 {round} 轮）</button>}
          {phase === "pouring" && !allPoured && <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, padding: "8px 0" }}>⏳ 等待所有人倒酒…</div>}
          {phase === "round" && <button onClick={() => spinWheel()} style={btnPrimary(gold, goldSoft)}>转转盘</button>}
          {phase === "result" && round < 4 && <button onClick={nextRound} style={btnPrimary(gold, goldSoft)}>➡ 下一轮</button>}
          {phase === "result" && round === 4 && <button onClick={nextRound} style={btnPrimary(gold, goldSoft)}>🔄 洗牌重来</button>}
        </div>
      )}

      {/* 房主提示（非房主视角） */}
      {!isDealer && phase !== "pouring" && (
        <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, marginBottom: 10 }}>等待 {dealerName} 发牌 / 转转盘…</div>
      )}

      {/* 规则弹窗 */}
      {showRules && (
        <div onClick={() => setShowRules(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 50 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420, maxHeight: "82vh", overflowY: "auto", background: "rgba(20,12,16,0.97)", border: `1.5px solid ${gold}`, borderRadius: 18, padding: 22 }}>
            <h2 style={{ color: goldSoft, marginTop: 0 }}>🍷 天选之子 规则</h2>
            <p style={{ fontSize: 13, lineHeight: 1.7, color: "rgba(255,255,255,0.8)" }}>
              1. 一副 52 张牌，最多 10 人，中间一个公共酒杯。<br />
              2. 每轮大家往公共杯倒酒（0~3 杯），都倒完当轮发牌人发牌。<br />
              3. 共 4 轮：每轮新发 +1/+1/+1/+2 张，手牌累计 1/2/3/5 张（牌累积不弃）。<br />
              4. 每轮由当轮发牌人（👑）转转盘，指中的特征 → 手牌符合的人喝公共杯（多人平分）。<br />
              5. 转盘特征：①大/小/单/双/花色 ②同花/同数/和超13/和低于12/奇数/偶数/点数最大/点数最小 ③豹子/同花顺/金花/顺子/对子/单张 ④没牛/牛一/牛二/牛三/牛四/牛五/牛六/牛七/牛八/牛九/牛牛。<br />
              6. 转盘真随机：若转到无人符合的特征，转盘自动重新转，直到有人喝为止。<br />
              7. 5 张打完洗牌重来，无限循环。<br />
              8. 每轮由当轮发牌人（👑）负责发牌与转转盘，按进房顺序轮着来。
            </p>
            <button onClick={() => setShowRules(false)} style={{ ...btnPrimary(gold, goldSoft), width: "100%" }}>知道了</button>
          </div>
        </div>
      )}

    </div>
  );
}

// ===================== 样式辅助 =====================
function inp(gold: string): any {
  return {
    width: "100%", padding: "12px 14px", marginBottom: 4, borderRadius: 12,
    border: `1px solid ${gold}`, background: "rgba(0,0,0,0.3)", color: "#fff",
    fontSize: 15, outline: "none", boxSizing: "border-box" as const,
  };
}
function btnPrimary(gold: string, goldSoft: string): any {
  return {
    padding: "12px 18px", borderRadius: 12, border: "none", cursor: "pointer",
    background: `linear-gradient(135deg, ${goldSoft}, ${gold})`, color: "#1a0a0f",
    fontSize: 15, fontWeight: 800, boxShadow: `0 4px 18px rgba(212,175,55,0.4)`,
  };
}
function btnSecondary(gold: string): any {
  return {
    padding: "12px 18px", borderRadius: 12, cursor: "pointer",
    border: `1px solid ${gold}`, background: "rgba(212,175,55,0.08)", color: gold,
    fontSize: 15, fontWeight: 600,
  };
}
function miniBtn(c: string): any {
  return {
    padding: "4px 10px", borderRadius: 8, cursor: "pointer",
    border: `1px solid ${c}`, background: "transparent", color: c, fontSize: 12,
  };
}
