"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";

// ==================== 工具函数 ====================
const SUITS = ["S", "H", "C", "D"] as const; // 黑桃 红心 梅花 方块
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"] as const;

type CardT = { id: string; rank: string; suit: string };

const buildDeck = (): CardT[] => {
  const d: CardT[] = [];
  for (const s of SUITS) for (const r of RANKS) d.push({ id: `${r}-${s}`, rank: r, suit: s });
  d.push({ id: "JK-BIG", rank: "JK", suit: "BIG" });
  d.push({ id: "JK-SMALL", rank: "JK", suit: "SMALL" });
  return d;
};

const shuffle = <T,>(arr: T[]): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const suitSymbol = (s: string) => ({ S: "♠", H: "♥", C: "♣", D: "♦" }[s] || "");
const suitColor = (s: string) => (s === "H" || s === "D" ? "#e23b46" : "#1a1a1a");
const rankLabel = (c: CardT) => {
  if (c.suit === "BIG") return "大王";
  if (c.suit === "SMALL") return "小王";
  return c.rank;
};

const orderPlayers = (g: any) => [...(g.players || [])].sort((a: any, b: any) => (a.seatId || 0) - (b.seatId || 0));
const neighbor = (g: any, name: string, dir: number) => {
  const order = orderPlayers(g);
  const idx = order.findIndex((p: any) => p.name === name);
  if (idx < 0) return name;
  const n = order[(idx + dir + order.length) % order.length];
  return n ? n.name : name;
};

const parsePlayers = (raw: any): any[] => {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
  } catch {}
  return [];
};

// ==================== 隐形身份证 ====================
// 每台设备一个永久随机编号，存 localStorage。退出房间也不删（只删房号/密码/昵称），
// 这样玩家重进同一张牌桌时，系统按编号把他认回来，而不是靠“名字文字”去猜。
const getOrCreateCid = (): string => {
  try {
    const k = "misspai_cid";
    let v = localStorage.getItem(k);
    if (!v) {
      v = "c_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem(k, v);
    }
    return v;
  } catch {
    return "c_fallback_" + Math.random().toString(36).slice(2);
  }
};

// 各牌规则文案（线下牌仅提示，系统不判定）
const cardRuleText = (c: CardT): string => {
  switch (c.rank) {
    case "A": return "代酒：指定任意一位替你喝一杯";
    case "2": return "小姐：你成为小姐，直到下一位抽到 2 的人出现";
    case "3": return "逛三园（线下）：定主题轮流说，卡壳/重复者喝";
    case "4": return "免死金牌：获得 1 张，可抵一次饮酒惩罚";
    case "5": return "照相机（线下）：喊停定住，先动者喝";
    case "6": return "石头剪刀布（线下）：全员同时出拳，输的家伙喝！人多可分组淘汰，最后输家喝 2 杯";
    case "7": return "逢七必过（线下）：轮流报数，含 7 / 7 倍数喊过，错者喝";
    case "8": return "厕所：持此牌才有资格上厕所";
    case "9": return "自己喝：自己喝一杯";
    case "10": return "神经病（线下）：喊“我是神经病”，谁先搭话谁喝，直到下个 10";
    case "J": return "左喝：你的左邻喝一杯";
    case "Q": return "右喝：你的右邻喝一杯";
    case "K": return "定酒：国王定酒，喝法按接力传递";
    default:
      if (c.suit === "BIG") return "大王：你被罚时可指定任意一人替喝，每人一生仅一次";
      if (c.suit === "SMALL") return "小王：你被罚时可转移他人替喝，共 2 次";
      return "";
  }
};
const cardTitle = (c: CardT): string => {
  if (c.suit === "BIG") return "大王";
  if (c.suit === "SMALL") return "小王";
  return c.rank;
};

// 战报：往共享状态写一条动作日志（随 commit 广播给全场），只保留最近 8 条
// 注意：战报只记“道具/特殊牌”事件（免死金牌、厕所、赐酒、K 牌），普通喝酒不进战报
const pushFeed = (g: any, text: string) => {
  g.feed = [{ t: text, id: Date.now() + Math.random() }, ...(g.feed || [])].slice(0, 8);
};
// 中央链条：当前这张牌的惩罚全过程（谁喝 / 免死 / 赐酒 / 转移），点“本张结束”即清空
const pushTrail = (g: any, text: string) => {
  g.trail = [...(g.trail || []), { t: text, id: Date.now() + Math.random() }].slice(-20);
};

// 罚酒结算：根据被罚者持有物决定是否需要弹窗（免死金牌 / 大小王转移）
const makePenalty = (target: string, amount: number, g: any, extra: any = {}): any => {
  const t = (g.players || []).find((p: any) => p.name === target);
  if (!t) return null;
  const gold = (t.gold || 0) > 0;
  const others = (g.players || []).filter((p: any) => p.name !== target);
  let king: string | null = null;
  let transferTargets: string[] = [];
  if (t.bigKing && (t.bigKingUsed || []).length < others.length) {
    king = "big";
    transferTargets = others.filter((p: any) => !(t.bigKingUsed || []).includes(p.name)).map((p: any) => p.name);
  } else if (t.smallKing && (t.smallKingUsed || 0) < 2) {
    king = "small";
    transferTargets = others.map((p: any) => p.name);
  }
  // 中央区域链条：记录“谁喝 / 要喝”
  let who = target;
  if (extra.via === "J") who = `左边 ${target}`;
  if (extra.via === "Q") who = `右边 ${target}`;
  const ktag = extra.via === "K" ? `（第 ${extra.kc}/4 张 K）` : "";
  if (!gold && !king) {
    g.players = g.players.map((p: any) => (p.name === target ? { ...p, cups: (p.cups || 0) + amount } : p));
    pushTrail(g, `🍺 ${who}${ktag} 喝了 ${amount} 杯`);
    return null;
  }
  pushTrail(g, `🍺 ${who}${ktag} 要喝 ${amount} 杯`);
  return {
    type: "penalty",
    target,
    amount,
    canGold: gold,
    king,
    transferTargets,
    ...extra,
  };
};

// 抽到牌后应用到状态（ng 为已克隆 players 的副本）
const applyCardToG = (g: any, card: CardT, drawer: string): any => {
  const ng = { ...g, players: [...(g.players || [])] };
  ng.trail = [];
  const me = ng.players.find((p: any) => p.name === drawer);
  const setMe = (patch: any) => {
    ng.players = ng.players.map((p: any) => (p.name === drawer ? { ...p, ...patch } : p));
  };
  const r = card.rank;
  if (r === "A") {
    ng.pending = { type: "atarget", drawer, amount: 1 };
    pushTrail(ng, `🎯 ${drawer} 抽到 A，指定谁替喝 1 杯`);
  } else if (r === "2") {
    ng.missName = drawer;
  } else if (r === "3" || r === "5" || r === "7") {
    // 纯线下，系统不判定
  } else if (r === "4") {
    setMe({ gold: (me.gold || 0) + 1 });
    pushTrail(ng, `🛡️ ${drawer} 获得免死金牌×1`);
  } else if (r === "8") {
    setMe({ toilet: (me.toilet || 0) + 1 });
    pushTrail(ng, `🚽 ${drawer} 获得厕所牌×1`);
  } else if (r === "9") {
    ng.pending = makePenalty(drawer, 1, ng, { via: "9" });
  } else if (r === "10") {
    ng.neuroName = drawer;
  } else if (r === "J") {
    const t = neighbor(ng, drawer, -1);
    ng.pending = makePenalty(t, 1, ng, { via: "J" });
  } else if (r === "Q") {
    const t = neighbor(ng, drawer, 1);
    ng.pending = makePenalty(t, 1, ng, { via: "Q" });
  } else if (r === "K") {
    const kc = ng.kCount + 1;
    ng.kCount = kc;
    const drink = kc === 1 ? 1 : ng.kStep;
    pushTrail(ng, `👑 ${drawer} 抽到第 ${kc}/4 张 K`);
    const pen = makePenalty(drawer, drink, ng, { via: "K", kc, kDrink: drink, ksetRequired: kc < 4, kOwner: drawer });
    if (pen === null && kc < 4) {
      ng.pending = { type: "kset", drawer, kc, minNext: drink, kDrink: drink };
    } else {
      ng.pending = pen; // 罚酒弹窗（含 ksetRequired）或 kc===4 直接喝完
    }
  } else if (card.suit === "BIG") {
    setMe({ bigKing: true, bigKingUsed: me.bigKingUsed || [] });
    pushTrail(ng, `👑 ${drawer} 获得大王`);
  } else if (card.suit === "SMALL") {
    setMe({ smallKing: true, smallKingUsed: me.smallKingUsed || 0 });
    pushTrail(ng, `👑 ${drawer} 获得小王`);
  }
  return ng;
};

const initialG = (players: any[]) => ({
  players,
  version: 0,
  currentDrawer: "",
  deck: shuffle(buildDeck()),
  drawnCard: null,
  drawnBy: null,
  ruleStep: "idle",
  started: false,
  roundCount: 1,
  missName: null,
  neuroName: null,
  kCount: 0,
  kBase: 1,
  kStep: 1,
  rps: null,
  pending: null,
  feed: [],
  trail: [],
});

// ==================== 主组件 ====================
export default function GamePage() {
  const [playerName, setPlayerName] = useState("");
  const [roomPassword, setRoomPassword] = useState("");
  const [joined, setJoined] = useState(false);
  const [roomId, setRoomId] = useState("");
  const [g, setG] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [kInput, setKInput] = useState("2");
  const [showLeave, setShowLeave] = useState(false);
  const [feedOpen, setFeedOpen] = useState(false);
  const [feedUnread, setFeedUnread] = useState(0);
  const lastFeedId = useRef<any>(undefined);
  const feedOpenRef = useRef(false);
  const channelRef = useRef<any>(null);
  const gVersionRef = useRef(0); // 状态版本号：单调增，接收端据此丢弃迟到/旧消息

  // 展开态实时可见，不计未读；关闭时清零（用 ref 同步给订阅闭包读取）
  useEffect(() => { feedOpenRef.current = feedOpen; }, [feedOpen]);

  const toggleFeed = () => {
    if (feedOpen) setFeedOpen(false);
    else { setFeedOpen(true); setFeedUnread(0); }
  };


  // ============ 广播 + 落库（双通道，沿用 067 做法）============
  const broadcastState = async (rid: string, st: any) => {
    try {
      await supabase.channel(`room:${rid}`).send({ type: "broadcast", event: "gameState", payload: st });
    } catch (e) {
      console.error("广播失败", e);
    }
    try {
      await supabase
        .from("rooms")
        .update({ players: st.players, resultdetails: JSON.stringify(st) })
        .eq("id", rid);
    } catch (e) {
      console.error("落库失败", e);
    }
  };

  const commit = (ng: any) => {
    ng.version = (ng?.version || 0) + 1; // 每次操作版本+1，作为"最新"凭证
    gVersionRef.current = ng.version;
    lastFeedId.current = ng?.feed?.[0]?.id; // 自己操作标记为已读，红点只给旁观者
    setG(ng);
    if (roomId) broadcastState(roomId, ng);
  };

  // ============ 订阅 ============
  useEffect(() => {
    if (!roomId) return;
    const channel = supabase
      .channel(`room:${roomId}`, { config: { broadcast: { ack: true } } })
      .on("broadcast", { event: "gameState" }, (payload: any) => {
        const st = payload.payload;
        const newV = st?.version || 0;
        if (newV <= gVersionRef.current) return; // 旧消息/回声：直接丢弃，绝不回退
        const id = st?.feed?.[0]?.id;
        if (id !== undefined && id !== lastFeedId.current) {
          lastFeedId.current = id;
          if (!feedOpenRef.current) setFeedUnread((n) => n + 1); // 仅旁观者（他人动态）冒红点
        }
        gVersionRef.current = newV;
        setG(st);
      })
      .subscribe();
    channelRef.current = channel;
    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, [roomId]);

  // ============ 定时对账 + 心跳 + 幽灵清理（兜底：每 3 秒从账本补回漏收的广播，绝不永久掉队）============
  useEffect(() => {
    if (!roomId) return;
    const iv = setInterval(async () => {
      try {
        const { data } = await supabase
          .from("rooms")
          .select("resultdetails, players")
          .eq("id", roomId)
          .maybeSingle();
        if (!data?.resultdetails) return;
        const st: any = JSON.parse(data.resultdetails);
        const newV = st?.version || 0;
        // 1) 对账：账本有更新就同步到本地
        if (newV > gVersionRef.current) {
          gVersionRef.current = newV;
          if (!st.players) st.players = parsePlayers(data.players);
          setG(st);
        }
        // 2) 心跳 + 幽灵清理（基于最新账本里的玩家名单）
        const players: any[] = st?.players || parsePlayers(data.players);
        if (!players.length) return;
        const myCid = getOrCreateCid();
        const isMe = (p: any) =>
          (p.cid && p.cid === myCid) || (!p.cid && p.name === playerName);
        const now = Date.now();
        let changed = false;
        // 先确保自己带编号
        let next: any[] = players.map((p: any) => (isMe(p) ? { ...p, cid: p.cid || myCid } : p));
        // 心跳：我自己 lastSeen 超过 10 秒没更新才写，避免刷屏
        const meNow = next.find(isMe);
        if (meNow && now - (meNow.lastSeen || 0) > 10000) {
          next = next.map((p: any) => (isMe(p) ? { ...p, lastSeen: now } : p));
          changed = true;
        }
        // 幽灵清理：关 app 没点退出、赖在名单里且超过 15 分钟没动静的人，清掉；自己永不清理
        const before = next.length;
        next = next.filter(
          (p: any) => isMe(p) || !(p.lastSeen && now - p.lastSeen > 15 * 60 * 1000)
        );
        if (next.length !== before) changed = true;
        if (changed) {
          const ng: any = { ...st, players: next, version: (st.version || 0) + 1 };
          gVersionRef.current = ng.version;
          setG(ng);
          await supabase
            .from("rooms")
            .update({ resultdetails: JSON.stringify(ng), players: next })
            .eq("id", roomId);
        }
      } catch {}
    }, 3000);
    return () => clearInterval(iv);
  }, [roomId]);

  // ============ 自动重连 ============
  useEffect(() => {
    try {
      const n = localStorage.getItem("misspai_name");
      const p = localStorage.getItem("misspai_pass");
      if (n && p) joinRoom(n, p);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const leaveRoom = async () => {
    if (!roomId || !g) return;
    // 先从账本读最新全量状态，避免用本地过期快照覆盖掉别人已做的操作
    let base: any = null;
    try {
      const { data } = await supabase.from("rooms").select("resultdetails").eq("id", roomId).maybeSingle();
      if (data?.resultdetails) base = JSON.parse(data.resultdetails);
    } catch {}
    if (!base) base = g;
    const myCid = getOrCreateCid();
    const updated = (base.players || []).filter(
      (p: any) => !((p.cid && p.cid === myCid) || (!p.cid && p.name === playerName))
    );
    let ng: any = { ...base, players: updated };
    // 若待办（选人/罚酒/定K）涉及离开者，清理掉，避免整局冻住
    if (ng.pending) {
      const p = ng.pending;
      const involves = p.drawer === playerName || p.target === playerName || (p.type === "kset" && p.drawer === playerName);
      if (involves) ng.pending = null;
    }
    // 离开者若是当前摸牌人，把轮次交给下家（清掉摸牌中间态）
    if (ng.currentDrawer === playerName) {
      const order = orderPlayers(ng);
      const idx = order.findIndex((x: any) => x.name === ng.currentDrawer);
      const next = order[(idx + 1) % order.length];
      ng.currentDrawer = next?.name || ng.currentDrawer;
      ng.ruleStep = "idle";
      ng.drawnCard = null;
      ng.drawnBy = null;
      ng.pending = null;
    }
    ng.version = (ng.version || 0) + 1; // 离开也 bump 版本，确保别人能收到这一变更
    gVersionRef.current = ng.version;
    await broadcastState(roomId, ng); // 同步给所有人（含 players / 轮次 / 待办清理）
    if (channelRef.current) supabase.removeChannel(channelRef.current);
    try { localStorage.removeItem("misspai_name"); localStorage.removeItem("misspai_pass"); } catch {}
    setJoined(false);
    setRoomId("");
    setG(null);
  };

  const createRoom = async () => {
    if (!playerName.trim()) { setErrorMsg("请留下尊驾贵姓"); return; }
    if (!roomPassword.trim()) { setErrorMsg("请设置摩斯密码"); return; }
    setErrorMsg("");
    const { data: existing } = await supabase.from("rooms").select("password").eq("password", roomPassword.trim()).maybeSingle();
    if (existing) { setErrorMsg("这串摩斯密码已被占用，换一个"); return; }
    const newPlayer = { name: playerName.trim(), cid: getOrCreateCid(), lastSeen: Date.now(), seatId: 0, cups: 0, gold: 0, toilet: 0, bigKing: false, bigKingUsed: [], smallKing: false, smallKingUsed: 0, isMiss: false, isNeuro: false };
    const { data, error } = await supabase
      .from("rooms")
      .insert({ game_type: "misspai", password: roomPassword.trim(), players: [newPlayer] })
      .select()
      .single();
    if (error) { setErrorMsg("开台失败：" + error.message); return; }
    setRoomId(data.id);
    const ng = initialG([newPlayer]);
    gVersionRef.current = ng.version;
    setG(ng);
    setJoined(true);
    try { localStorage.setItem("misspai_name", playerName.trim()); localStorage.setItem("misspai_pass", roomPassword.trim()); } catch {}
    broadcastState(data.id, ng);
  };

  const joinRoom = async (overrideName?: string, overridePass?: string) => {
    const name = (overrideName ?? playerName).trim();
    const pass = (overridePass ?? roomPassword).trim();
    if (!name) { setErrorMsg("请留下尊驾贵姓"); return; }
    if (!pass) { setErrorMsg("请填入摩斯密码"); return; }
    setErrorMsg("");
    setPlayerName(name);
    const { data, error } = await supabase
      .from("rooms")
      .select()
      .eq("password", pass)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) { setErrorMsg("摩斯密码错误，未找到对应牌桌"); try { localStorage.removeItem("misspai_name"); localStorage.removeItem("misspai_pass"); } catch {} return; }
    const current = parsePlayers(data.players);
    if (current.length >= 12) { setErrorMsg("牌桌已满（最多 12 人）"); return; }
    const myCid = getOrCreateCid();
    const existingIdx = current.findIndex(
      (p: any) => (p.cid && p.cid === myCid) || (!p.cid && p.name === name)
    );
    if (existingIdx >= 0) {
      // 认出是自己（编号优先，老房间没编号就用名字兜底）；认出后补上编号并同步最新昵称
      const revived = current.map((p: any, i: number) =>
        i === existingIdx ? { ...p, cid: p.cid || myCid, name, lastSeen: Date.now() } : p
      );
      setRoomId(data.id);
      setJoined(true);
      try {
        const saved = data.resultdetails ? JSON.parse(data.resultdetails) : null;
        const st = saved || initialG(revived);
        if (saved) st.players = revived; // 让最新昵称/编号在账本里也生效
        setG(st);
        gVersionRef.current = saved?.version || 0; // 重连进已有局：以账本版本为准
        // 把补上的编号落库，下次重连即可直接按编号认人
        supabase.from("rooms").update({ players: revived }).eq("id", data.id);
      } catch { setG(initialG(revived)); gVersionRef.current = 0; }
      try { localStorage.setItem("misspai_name", name); localStorage.setItem("misspai_pass", pass); } catch {}
      return;
    }
    const occupied = current.map((p: any) => p.seatId).filter((id: any) => id !== undefined);
    let seatId = 0;
    for (let i = 0; i < 12; i++) { if (!occupied.includes(i)) { seatId = i; break; } }
    const newPlayer = { name, cid: myCid, lastSeen: Date.now(), seatId, cups: 0, gold: 0, toilet: 0, bigKing: false, bigKingUsed: [], smallKing: false, smallKingUsed: 0, isMiss: false, isNeuro: false };
    const updated = [...current, newPlayer];
    const { error: ue } = await supabase.from("rooms").update({ players: updated }).eq("id", data.id);
    if (ue) { setErrorMsg("入座失败：" + ue.message); return; }
    setRoomId(data.id);
    const ng = (() => {
      try { return data.resultdetails ? JSON.parse(data.resultdetails) : initialG(updated); }
      catch { return initialG(updated); }
    })();
    ng.players = updated;
    ng.version = (ng.version || 0) + 1; // 新人加入也 bump 版本，让在场者收到
    gVersionRef.current = ng.version;
    setG(ng);
    setJoined(true);
    try { localStorage.setItem("misspai_name", name); localStorage.setItem("misspai_pass", pass); } catch {}
    broadcastState(data.id, ng);
  };

  const startGame = async () => {
    if (!g || g.players[0]?.name !== playerName) { setErrorMsg("只有开台者能开始"); return; }
    const order = orderPlayers(g);
    const clearedPlayers = g.players.map((p: any) => ({ ...p, gold: 0, toilet: 0, bigKing: false, bigKingUsed: [], smallKing: false, smallKingUsed: 0 }));
    const ng = { ...g, players: clearedPlayers, started: true, currentDrawer: order[0]?.name || "", ruleStep: "idle", drawnCard: null, drawnBy: null, pending: null, rps: null, deck: shuffle(buildDeck()), roundCount: 1, kCount: 0, kStep: 1, missName: null, neuroName: null, feed: [], trail: [] };
    commit(ng);
  };

  const onDraw = () => {
    if (!g || !g.started || g.ruleStep !== "idle" || g.currentDrawer !== playerName) return;
    const deck = [...(g.deck || [])];
    if (deck.length === 0) return;
    const card = deck.shift() as CardT;
    let ng = { ...g, deck, drawnCard: card, drawnBy: playerName, ruleStep: "show" };
    ng = applyCardToG(ng, card, playerName);
    commit(ng);
  };

  const advance = () => {
    if (!g || g.currentDrawer !== playerName) return;
    let ng = { ...g, drawnCard: null, drawnBy: null, ruleStep: "idle", pending: null, rps: null, trail: [] };
    const order = orderPlayers(ng);
    const idx = order.findIndex((p: any) => p.name === ng.currentDrawer);
    const next = order[(idx + 1) % order.length];
    ng.currentDrawer = next?.name || ng.currentDrawer;
    if ((ng.deck || []).length === 0) {
      ng.deck = shuffle(buildDeck());
      ng.kCount = 0;
      ng.kStep = 1;
      ng.roundCount = (ng.roundCount || 1) + 1;
      // 一副牌抽完重洗时，道具随局重置（杯数保留，做整局累计）
      ng.players = ng.players.map((p: any) => ({ ...p, gold: 0, toilet: 0, bigKing: false, bigKingUsed: [], smallKing: false, smallKingUsed: 0 }));
    }
    commit(ng);
  };

  // A 代酒：选目标
  const pickATarget = (name: string) => {
    if (!g || !g.pending || g.pending.type !== "atarget") return;
    if (playerName !== g.pending.drawer) return;
    const ng = { ...g, players: [...g.players] };
    const pen = makePenalty(name, 1, ng, { via: "A" });
    ng.pending = pen;
    commit(ng);
  };

  // 罚酒结算弹窗选择
  const resolvePenalty = (choice: any) => {
    if (!g || !g.pending || g.pending.type !== "penalty") return;
    if (playerName !== g.pending.target) return;
    const p = g.pending;
    let ng = { ...g, players: [...g.players] };
    const map = (name: string, patch: any) => ng.players = ng.players.map((x: any) => (x.name === name ? { ...x, ...patch } : x));
    // 结算收尾：K 接力还需弹出“设定下一位喝几杯”
    const closeWithKset = () => {
      if (p.ksetRequired) {
        ng.pending = { type: "kset", drawer: p.kOwner || p.target, kc: p.kc, minNext: p.kDrink, kDrink: p.kDrink };
      } else {
        ng.pending = null;
      }
    };
    if (choice === "self") {
      map(p.target, { cups: (ng.players.find((x: any) => x.name === p.target).cups || 0) + p.amount });
      pushTrail(ng, `🍺 ${p.target} 自己喝了 ${p.amount} 杯`);
      closeWithKset();
    } else if (choice === "gold") {
      const me = ng.players.find((x: any) => x.name === p.target);
      map(p.target, { gold: (me.gold || 0) - 1 });
      const remain = Math.max(0, p.amount - 1);
      if (remain > 0) {
        map(p.target, { cups: (me.cups || 0) + remain });
        pushTrail(ng, `🛡️ ${p.target} 用免死金牌，免掉 1 杯，喝下 ${remain} 杯`);
        pushFeed(ng, `🛡️ ${p.target} 用免死金牌，免掉 1 杯，喝下 ${remain} 杯`);
      } else {
        pushTrail(ng, `🛡️ ${p.target} 用免死金牌，免掉 ${p.amount} 杯`);
        pushFeed(ng, `🛡️ ${p.target} 用免死金牌，免掉 ${p.amount} 杯`);
      }
      closeWithKset();
    } else if (choice && choice.transfer) {
      const to = choice.transfer;
      pushTrail(ng, `👑 ${p.target} 用${p.king === "big" ? "大王" : "小王"}赐酒 ${p.amount} 杯给 ${to}`);
      pushFeed(ng, `👑 ${p.target} 赐酒 ${p.amount} 杯给 ${to}`);
      // 大王/小王的消耗记在“当前被罚者”身上
      ng.players = ng.players.map((x: any) => {
        if (x.name === p.target) {
          if (p.king === "big") return { ...x, bigKingUsed: [...(x.bigKingUsed || []), to] };
          if (p.king === "small") return { ...x, smallKingUsed: (x.smallKingUsed || 0) + 1 };
        }
        return x;
      });
      // 把罚酒转给接收者，由接收者再决定（自己喝 / 免死金牌 / 再赐酒）——形成连贯连锁
      const sub = makePenalty(to, p.amount, ng, { via: "transfer" });
      if (sub) {
        // 若本局是 K 接力，连锁到底后仍需由原 K 持有者设定下一位
        sub.ksetRequired = p.ksetRequired;
        sub.kc = p.kc;
        sub.kDrink = p.kDrink;
        sub.kOwner = p.kOwner;
        ng.pending = sub;
      } else {
        closeWithKset();
      }
    }
    commit(ng);
  };

  // K 设定下一位喝几杯
  const resolveKSet = () => {
    if (!g || !g.pending || g.pending.type !== "kset") return;
    if (playerName !== g.pending.drawer) return;
    const amt = Math.max(parseInt(kInput || "1", 10), g.pending.minNext || 1);
    let ng = { ...g, kStep: amt, pending: null };
    pushTrail(ng, `👑 ${g.pending.drawer} 设定下一张 K 喝 ${amt} 杯`);
    pushFeed(ng, `👑 ${g.pending.drawer} 定：下一张 K 喝 ${amt} 杯`);
    commit(ng);
  };

  // 厕所牌：持有者用掉一张（去厕所）
  const useToilet = () => {
    if (!g) return;
    const meNow = g.players.find((x: any) => x.name === playerName);
    if (!meNow || (meNow.toilet || 0) < 1) return;
    let ng = { ...g, players: g.players.map((x: any) => (x.name === playerName ? { ...x, toilet: Math.max(0, (x.toilet || 0) - 1) } : x)) };
    pushTrail(ng, `🚽 ${playerName} 用掉 1 张厕所牌`);
    pushFeed(ng, `🚽 ${playerName} 去了厕所（用掉 1 张厕所牌）`);
    commit(ng);
  };

  // ============ 渲染：登录界面（酒吧 v5）============
  if (!joined) {
    return (
      <div style={wrap}>
        <style dangerouslySetInnerHTML={{ __html: loginCss }} />
        <div className="barDeco" />
        <div className="barStage">
          <div className="spotL" />
          <div className="spotR" />
          <div className="neonSign">小姐牌</div>
          <div className="neonSub">今天你喝了吗</div>
          <div className="barTable">
            <div className="aceRow">
              <div className="aceCardWrap"><div className="aceCard" style={{ color: "#ff5a7a" }}><span>A</span><span>♥</span></div></div>
              <div className="aceCardWrap"><div className="aceCard" style={{ color: "#bfe8ff" }}><span>A</span><span>♠</span></div></div>
              <div className="aceCardWrap"><div className="aceCard" style={{ color: "#bfe8ff" }}><span>A</span><span>♣</span></div></div>
              <div className="aceCardWrap"><div className="aceCard" style={{ color: "#ff5a7a" }}><span>A</span><span>♦</span></div></div>
            </div>
          </div>

          <div className="entryCard">
            <input
              className="barInput"
              placeholder="请留下您的名号…"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              maxLength={12}
            />
            <input
              className="barInput"
              placeholder="— · — 房间暗号…"
              value={roomPassword}
              onChange={(e) => setRoomPassword(e.target.value)}
              maxLength={20}
            />
            {errorMsg && <div className="barErr">{errorMsg}</div>}
            <div className="barBtns">
              <button className="btnSeat" onClick={() => joinRoom()}>入座</button>
              <button className="btnTable" onClick={() => createRoom()}>开台</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ============ 渲染：游戏内界面（A 布局）============
  const order = g ? orderPlayers(g) : [];
  const me = g?.players?.find((p: any) => p.name === playerName);
  const isHost = order[0]?.name === playerName;
  const card = g?.drawnCard;
  const showEnd = g && g.ruleStep === "show" && !g.pending && g.currentDrawer === playerName;
  const canDraw = g && g.started && g.ruleStep === "idle" && g.currentDrawer === playerName;

  return (
    <div style={wrap}>
      <style dangerouslySetInnerHTML={{ __html: gameCss }} />
      <div className="gTop">
        <span className="gTitle">小姐牌</span>
        <span className="chip">桌 ·{roomPassword}·</span>
        <span className="chip" style={{ color: "#8fe" }}>K {g?.kCount || 0}/4</span>
        <button className="topLeave" onClick={() => setShowLeave(true)}>退出</button>
      </div>

      {/* 顺序赛道 */}
      <div className="track">
        {order.map((p: any, i: number) => (
          <div key={p.name} className={"dot" + (p.name === g?.currentDrawer ? " on" : "")}>{i + 1}</div>
        ))}
        <span className="trackNow">▶ {g?.currentDrawer || "—"}</span>
      </div>

      {/* 中央牌桌 */}
      <div className="stage">
        <div className="stageTop">
          <div className="deck">
            <div className="deckPile"><span>剩 {(g?.deck || []).length}</span><small>中央牌堆</small></div>
          </div>
          {card ? (
            <div className="drawnWrap">
              <div className={"drawnCard" + (card.rank === "JK" ? " joker" + (card.suit === "SMALL" ? " small" : "") : "")}
                style={{ color: card.rank === "JK" ? (card.suit === "SMALL" ? "#bfe8ff" : "#ffd27a") : (card.suit === "H" || card.suit === "D" ? "#ff5a7a" : "#bfe8ff") }}>
                {card.rank === "JK" ? (
                  <div className="dcJoker">
                    <div className="dcCrown">👑</div>
                    <div className="dcJokerName">{rankLabel(card)}</div>
                  </div>
                ) : (
                  <>
                    <div className="dcCorner tl"><span className="dcR">{rankLabel(card)}</span><span className="dcS">{suitSymbol(card.suit)}</span></div>
                    <div className="dcCenter">{suitSymbol(card.suit)}</div>
                    <div className="dcCorner br"><span className="dcR">{rankLabel(card)}</span><span className="dcS">{suitSymbol(card.suit)}</span></div>
                  </>
                )}
              </div>
              <div className="ruleBox">
                <div className="ruleTitle">{cardTitle(card)}</div>
                <div className="ruleText">{cardRuleText(card)}</div>
                <RuleAction g={g} playerName={playerName} me={me}
                  pickATarget={pickATarget} resolvePenalty={resolvePenalty}
                  resolveKSet={resolveKSet} kInput={kInput} setKInput={setKInput} />
              </div>
            </div>
          ) : (
            <div className="idleHint">
              {canDraw ? "轮到你摸牌" : `等待 ${g?.currentDrawer || "—"} 摸牌`}
            </div>
          )}
        </div>
        {(g?.trail || []).length > 0 && (
          <div className="trailWide">
            <div className="trailHead">⚡ 本张惩罚实况</div>
            <div className="trailList">
              {(g.trail).map((f: any, i: number) => (
                <div key={f.id} className={"trailItem" + (i === g.trail.length - 1 ? " last" : "")}>{f.t}</div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 战报（全场同步 · 可折叠） */}
      {feedOpen ? (
        <div className="feedBox">
          <div className="feedTitle" onClick={toggleFeed}>📢 战报 ▾</div>
          {(g?.feed || []).length === 0 ? (
            <div className="feedEmpty">还没有动作…</div>
          ) : (
            <div className="feedList">
              {(g?.feed || []).map((f: any) => (
                <div key={f.id} className="feedItem">{f.t}</div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="feedBar" onClick={toggleFeed}>
          <span>📢 战报</span>
          <span className="feedArrow">▸</span>
          {feedUnread > 0 && <span className="feedDot">{feedUnread > 9 ? "9+" : feedUnread}</span>}
        </div>
      )}

      {/* 玩家坐席 两排 5+5 */}
      <div className="seats">
        {order.map((p: any, i: number) => (
          <div key={p.name} className={"seat" + (p.name === g?.currentDrawer ? " cur" : "")}>
            <div className="seatNo">{i + 1}</div>
            <div className="seatName">{p.name}{p.name === playerName ? "（你）" : ""}</div>
            <div className="seatCups">{(p.cups || 0)} 杯</div>
            <div className="seatBadge">
              {p.gold > 0 && <span className="bd gold">金牌×{p.gold}</span>}
              {(p.toilet || 0) > 0 && <span className="bd toilet">🚽×{p.toilet}</span>}
              {p.bigKing && (() => {
                const _total = (g?.players?.length || 1) - 1;
                const _used = p.bigKingUsed?.length || 0;
                const _done = _used >= _total;
                return <span className={"bd king" + (_done ? " used" : "")}>{_done ? "大王·已用完" : _used > 0 ? `大王 ${_used}/${_total}` : "大王"}</span>;
              })()}
              {p.smallKing && (() => {
                const _used = p.smallKingUsed || 0;
                const _done = _used >= 2;
                return <span className={"bd king" + (_done ? " used" : "")}>{_done ? "小王·已用完" : _used > 0 ? `小王 ${_used}/2` : "小王"}</span>;
              })()}
              {p.name === playerName && g?.missName === playerName && <span className="bd miss">小姐</span>}
              {p.name === playerName && g?.neuroName === playerName && <span className="bd neuro">神经病</span>}
            </div>
            {p.name === playerName && (p.toilet || 0) > 0 && (
              <button className="toiletBtn" onClick={useToilet}>🚽 去厕所（用掉此牌）</button>
            )}
          </div>
        ))}
      </div>

      {/* 底部主按钮 */}
      <div className="bottomBar">
        {!g?.started ? (
          isHost ? (
            <button className="bigBtn pink" onClick={startGame}>开始牌局</button>
          ) : (
            <div className="waitStart">等待 {order[0]?.name} 开局…</div>
          )
        ) : canDraw ? (
          <button className="bigBtn pink" onClick={onDraw}>摸一张牌</button>
        ) : showEnd ? (
          <button className="bigBtn red" onClick={advance}>✓ 本张结束，下一位</button>
        ) : (
          <div className="waitStart">{g?.currentDrawer === playerName ? "请完成当前操作" : `等待 ${g?.currentDrawer} 操作…`}</div>
        )}
      </div>

      {errorMsg && <div className="barErr float">{errorMsg}</div>}

      {showLeave && (
        <div className="leaveModal" onClick={() => setShowLeave(false)}>
          <div className="leaveCard" onClick={(e: any) => e.stopPropagation()}>
            <div className="leaveTitle">确定退出牌桌？</div>
            <div className="leaveRow">
              <button className="leaveCancel" onClick={() => setShowLeave(false)}>取消</button>
              <button className="leaveOk" onClick={() => { setShowLeave(false); leaveRoom(); }}>确定退出</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============ 当前牌的操作区（按 pending 渲染）============
function RuleAction({ g, playerName, me, pickATarget, resolvePenalty, resolveKSet, kInput, setKInput }: any) {
  const p = g?.pending;
  // 各类 pending
  if (!p) return null;
  if (p.type === "atarget") {
    const targets = g.players.filter((x: any) => x.name !== p.drawer);
    if (playerName !== p.drawer) {
      return (
        <div className="pickBox">
          <div className="pickTip">等待 {p.drawer} 指定谁替喝…</div>
        </div>
      );
    }
    return (
      <div className="pickBox">
        <div className="pickTip">指定谁替你喝：</div>
        <div className="pickGrid">
          {targets.map((t: any) => (
            <button key={t.name} className="pickBtn" onClick={() => pickATarget(t.name)}>{t.name}</button>
          ))}
        </div>
      </div>
    );
  }
  if (p.type === "penalty") {
    if (playerName !== p.target) {
      return (
        <div className="pickBox">
          <div className="pickTip">{p.target} 要喝 {p.amount} 杯，等待其处置…</div>
        </div>
      );
    }
    return (
      <div className="pickBox">
        <div className="pickTip">{p.target} 要喝 {p.amount} 杯，如何处置？</div>
        <div className="pickGrid">
          <button className="pickBtn" onClick={() => resolvePenalty("self")}>自己喝</button>
          {p.canGold && <button className="pickBtn gold" onClick={() => resolvePenalty("gold")}>用免死金牌</button>}
          {p.king && p.transferTargets.map((t: string) => (
            <button key={t} className="pickBtn king" onClick={() => resolvePenalty({ transfer: t })}>赐酒给 {t}</button>
          ))}
        </div>
      </div>
    );
  }
  if (p.type === "kset") {
    if (playerName !== p.drawer) {
      return (
        <div className="pickBox">
          <div className="pickTip">第 {p.kc}/4 张 K · 喝 {p.kDrink} 杯 · 等待 {p.drawer} 设定下一位…</div>
        </div>
      );
    }
    return (
      <div className="pickBox">
        <div className="pickTip">第 {p.kc}/4 张 K · 喝 {p.kDrink} 杯</div>
        <div className="pickTip">设定下一位拿到 K 的人喝几杯（≥ {p.minNext}）：</div>
        <div className="kSetRow">
          <input className="kInput" type="number" min={p.minNext} value={kInput} onChange={(e) => setKInput(e.target.value)} />
          <button className="pickBtn" onClick={resolveKSet}>确定</button>
        </div>
      </div>
    );
  }
  return null;
}

// ============ 样式 ============
const wrap: any = {
  minHeight: "100vh", maxWidth: 430, margin: "0 auto", position: "relative",
  background: "radial-gradient(120% 80% at 50% 0%, #2a1b2e 0%, #0d0710 70%)",
  fontFamily: "-apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif",
  color: "#fff", overflowX: "hidden",
};

const loginCss = `
.barDeco{position:absolute;inset:0;pointer-events:none;z-index:0;}
.barStage{position:relative;z-index:1;min-height:100vh;display:flex;flex-direction:column;align-items:center;padding:54px 22px 30px;}
.spotL,.spotR{position:absolute;top:-40px;width:180px;height:520px;background:radial-gradient(ellipse at top, rgba(255,200,120,0.20), transparent 70%);transform:rotate(18deg);filter:blur(6px);}
.spotL{left:-30px;}.spotR{right:-30px;transform:rotate(-18deg);}
.neonSign{font-size:40px;font-weight:800;letter-spacing:10px;color:#ff4f8b;text-shadow:0 0 14px rgba(255,79,139,0.9), 0 0 26px rgba(54,224,208,0.5);margin-bottom:8px;animation:neonPulse 2.8s ease-in-out infinite;}
.neonSub{font-size:15px;letter-spacing:4px;color:#ffd27a;text-shadow:0 0 10px rgba(255,210,122,0.6);margin-bottom:26px;animation:neonBlink 3.4s ease-in-out infinite;}
@keyframes neonPulse{0%,100%{text-shadow:0 0 10px rgba(255,79,139,0.7),0 0 20px rgba(54,224,208,0.4);}50%{text-shadow:0 0 22px rgba(255,79,139,1),0 0 40px rgba(54,224,208,0.85),0 0 60px rgba(255,79,139,0.6);}}
@keyframes neonBlink{0%,100%{opacity:.55;}50%{opacity:1;}}
.barTable{flex:1;width:100%;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;padding-bottom:18px;}
.aceRow{display:flex;gap:16px;margin-bottom:22px;justify-content:center;perspective:700px;}
.aceCardWrap{transform-style:preserve-3d;}
.aceCardWrap:nth-child(1){transform:rotate(-12deg) translateY(-7px);}
.aceCardWrap:nth-child(2){transform:rotate(8deg) translateY(5px);}
.aceCardWrap:nth-child(3){transform:rotate(-5deg) translateY(-3px);}
.aceCardWrap:nth-child(4){transform:rotate(15deg) translateY(8px);}
.aceCard{width:46px;height:64px;border-radius:9px;position:relative;overflow:hidden;background:radial-gradient(130% 90% at 28% 10%,rgba(255,255,255,0.18),rgba(255,255,255,0) 55%),linear-gradient(158deg,#2a1330,#5a1a40);border:1px solid rgba(255,158,196,0.55);box-shadow:0 6px 18px rgba(0,0,0,0.5),inset 0 0 12px rgba(255,111,160,0.18);display:flex;flex-direction:column;justify-content:space-between;padding:4px 5px;font-weight:800;transform-origin:center bottom;animation:floatA 3.4s ease-in-out infinite;}
.aceCard span:first-child{font-size:15px;}
.aceCard span:last-child{font-size:22px;text-align:right;}
.aceCardWrap:nth-child(1) .aceCard{animation-delay:0s;}
.aceCardWrap:nth-child(2) .aceCard{animation-delay:.6s;}
.aceCardWrap:nth-child(3) .aceCard{animation-delay:1.2s;}
.aceCardWrap:nth-child(4) .aceCard{animation-delay:1.8s;}
.aceCardWrap:nth-child(4) .aceCard{width:52px;height:72px;}
@keyframes floatA{0%,100%{transform:translateY(0) rotate(0deg);}50%{transform:translateY(-9px) rotate(2.5deg);}}
.entryCard{width:100%;background:rgba(20,10,24,0.72);border:1px solid #46304e;border-radius:18px;padding:20px 18px;backdrop-filter:blur(6px);box-shadow:0 10px 30px rgba(0,0,0,0.5);}
.barInput{width:100%;box-sizing:border-box;margin-bottom:12px;padding:14px 16px;border-radius:12px;background:#0d0710;border:1px solid #5a3a66;color:#fff;font-size:15px;outline:none;}
.barInput::placeholder{color:#7a6a82;}
.barErr{color:#ff9ec4;font-size:13px;text-align:center;margin:4px 0 10px;}
.barBtns{display:flex;align-items:center;gap:18px;margin-top:6px;}
.btnSeat{flex:1;padding:15px 0;border:none;border-radius:26px;background:linear-gradient(180deg,#ff6fa0,#e2597e);color:#fff;font-size:17px;font-weight:700;box-shadow:0 8px 20px rgba(226,89,126,0.4);cursor:pointer;}
.btnTable{padding:15px 22px;border:none;border-radius:26px;background:linear-gradient(180deg,#e23b46,#c8202e);color:#fff;font-size:16px;font-weight:700;box-shadow:0 8px 20px rgba(200,32,46,0.4);cursor:pointer;}
`;

const gameCss = `
.gTop{display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:12px 14px 6px;}
.topLeave{margin-left:auto;background:transparent;border:1px solid #3a2c40;color:#8a7a90;border-radius:12px;padding:4px 12px;font-size:12px;cursor:pointer;}
.topLeave:active{background:#241726;}
.gTitle{font-size:20px;font-weight:800;color:#ff6fa0;text-shadow:0 0 10px rgba(255,111,160,0.7);letter-spacing:3px;margin-right:4px;}
.chip{font-size:11px;background:rgba(28,18,32,0.8);border:1px solid #46304e;border-radius:11px;padding:3px 9px;color:#cfc3d6;}
.track{display:flex;align-items:center;gap:5px;padding:6px 12px 8px;flex-wrap:wrap;}
.dot{width:20px;height:20px;border-radius:50%;background:#1c1220;border:1px solid #46304e;font-size:10px;color:#9a8aa2;display:flex;align-items:center;justify-content:center;}
.dot.on{background:#ff6fa0;border-color:#fff;color:#fff;font-weight:700;box-shadow:0 0 10px rgba(255,111,160,0.8);}
.trackNow{font-size:11px;color:#ff9ec4;margin-left:4px;}
.stage{position:relative;margin:4px 12px;background:#120a16;border:1px solid #2a1830;border-radius:16px;min-height:300px;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:16px;overflow:hidden;}
.stageTop{display:flex;align-items:center;justify-content:center;gap:16px;z-index:1;}
.stage::before{content:"";position:absolute;top:-40px;left:30px;width:150px;height:380px;background:radial-gradient(ellipse at top,rgba(255,200,120,0.10),transparent 70%);transform:rotate(14deg);}
.stage::after{content:"";position:absolute;top:-40px;right:30px;width:150px;height:380px;background:radial-gradient(ellipse at top,rgba(255,200,120,0.10),transparent 70%);transform:rotate(-14deg);}
.deckPile{width:74px;height:104px;border-radius:10px;background:radial-gradient(120% 90% at 30% 15%,rgba(255,200,120,0.12),transparent 60%),linear-gradient(155deg,#2a1330,#4a163a);border:2px solid #5a3a66;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#ffd27a;font-weight:700;z-index:1;box-shadow:0 0 16px rgba(255,111,160,0.25),inset 0 0 14px rgba(255,111,160,0.12);}
.deckPile small{color:#9a8aa2;font-weight:400;font-size:10px;margin-top:4px;}
.drawnWrap{display:flex;align-items:center;gap:14px;z-index:1;}
.drawnCard{width:86px;height:120px;border-radius:12px;position:relative;overflow:hidden;background:radial-gradient(130% 90% at 28% 10%,rgba(255,255,255,0.20),rgba(255,255,255,0) 55%),linear-gradient(158deg,#2a1330 0%,#3d1638 50%,#5a1a40 100%);border:1px solid rgba(255,158,196,0.6);box-shadow:0 0 28px rgba(255,111,160,0.5),inset 0 0 20px rgba(255,111,160,0.18);display:flex;flex-direction:column;justify-content:space-between;padding:8px 9px;font-weight:800;}
.drawnCard::after{content:"";position:absolute;inset:4px;border:1px solid rgba(255,255,255,0.12);border-radius:8px;pointer-events:none;}
.dcCorner{display:flex;flex-direction:column;line-height:1;gap:1px;}
.dcCorner .dcR{font-size:19px;}
.dcCorner .dcS{font-size:14px;}
.dcCorner.br{align-self:flex-end;transform:rotate(180deg);align-items:flex-start;}
.dcCenter{flex:1;display:flex;align-items:center;justify-content:center;font-size:44px;filter:drop-shadow(0 0 8px currentColor);}
.drawnCard.joker{background:radial-gradient(130% 90% at 28% 10%,rgba(255,255,255,0.30),rgba(255,255,255,0) 55%),linear-gradient(158deg,#3a2a07 0%,#5a3f0a 50%,#7a5410 100%);border-color:rgba(255,210,122,0.85);box-shadow:0 0 32px rgba(255,200,90,0.55),inset 0 0 22px rgba(255,200,90,0.25);}
.drawnCard.joker.small{background:radial-gradient(130% 90% at 28% 10%,rgba(255,255,255,0.26),rgba(255,255,255,0) 55%),linear-gradient(158deg,#10243a 0%,#173a5c 50%,#1f4e7a 100%);border-color:rgba(150,200,255,0.85);box-shadow:0 0 32px rgba(120,180,255,0.5),inset 0 0 22px rgba(120,180,255,0.22);}
.dcJoker{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;}
.dcCrown{font-size:36px;filter:drop-shadow(0 0 10px rgba(255,210,122,0.85));}
.dcJokerName{font-size:17px;font-weight:800;letter-spacing:3px;}
.ruleBox{max-width:170px;background:rgba(28,18,34,0.92);border:1px solid #ff6fa0;border-radius:12px;padding:12px;z-index:1;}
.ruleTitle{font-size:15px;font-weight:700;color:#ff9ec4;margin-bottom:6px;}
.ruleText{font-size:12px;color:#e7dcec;line-height:1.5;margin-bottom:8px;}
.trailWide{margin-top:12px;width:100%;max-width:100%;box-sizing:border-box;z-index:1;background:rgba(38,14,38,0.75);border:1px solid #5a2a55;border-radius:12px;padding:10px 12px;display:flex;flex-direction:column;gap:4px;max-height:130px;}
.trailWide .trailHead{font-size:11px;color:#ff9ec4;letter-spacing:1px;margin-bottom:3px;opacity:0.85;}
.trailWide .trailList{display:flex;flex-direction:column;gap:3px;overflow-y:auto;}
.trailItem{font-size:12px;color:#dcc6e6;line-height:1.5;}
.trailItem.last{color:#ffd27a;font-weight:700;}
.idleHint{color:#9a8aa2;font-size:15px;z-index:1;}
.seats{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;padding:10px 12px;}
.seat{background:#160d1a;border:1px solid #46304e;border-radius:12px;padding:8px 4px;text-align:center;position:relative;}
.seat.cur{background:#3a1226;border-color:#ff6fa0;box-shadow:0 0 14px rgba(255,111,160,0.6);}
.seatNo{position:absolute;top:-7px;left:-7px;width:18px;height:18px;border-radius:50%;background:#1c1220;border:1px solid #46304e;font-size:10px;color:#cfc3d6;display:flex;align-items:center;justify-content:center;}
.seatName{font-size:11px;color:#e7dcec;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.seatCups{font-size:10px;color:#8fe;margin-top:2px;}
.seatBadge{display:flex;flex-wrap:wrap;gap:2px;justify-content:center;margin-top:3px;min-height:12px;}
.bd{font-size:8px;padding:1px 4px;border-radius:6px;}
.bd.gold{background:#3a2e10;color:#ffd27a;}
.bd.toilet{background:#10293a;color:#9ec5ff;}
.toiletBtn{margin-top:6px;width:100%;background:transparent;border:1px solid #3a6ea5;color:#9ec5ff;border-radius:10px;padding:5px 0;font-size:11px;cursor:pointer;}
.feedBar{display:flex;align-items:center;gap:6px;margin:6px 14px 4px;padding:5px 10px;background:rgba(20,10,26,0.45);border:1px solid #362042;border-radius:10px;font-size:12px;color:#c9a0e0;cursor:pointer;}
.feedArrow{font-size:10px;opacity:0.7;}
.feedDot{margin-left:auto;background:#ff4f6d;color:#fff;border-radius:10px;font-size:10px;padding:0 5px;min-width:16px;text-align:center;}
.feedBox{margin:6px 14px 4px;background:rgba(20,10,26,0.7);border:1px solid #4a2e58;border-radius:12px;padding:8px 10px;box-shadow:0 6px 20px rgba(0,0,0,0.4);}
.feedTitle{font-size:11px;color:#c9a0e0;margin-bottom:5px;letter-spacing:1px;cursor:pointer;}
.feedEmpty{font-size:11px;color:#6f6178;}
.feedList{display:flex;flex-direction:column;gap:3px;max-height:200px;overflow-y:auto;}
.trailItem{font-size:12px;color:#dcc6e6;line-height:1.5;}
.trailItem.last{color:#ffd27a;font-weight:700;}
.feedItem{font-size:12px;color:#e7dced;line-height:1.5;}
.feedItem:first-child{color:#ffd27a;font-weight:600;}
.bd.king{background:#2a1030;color:#ff9ec4;}
.bd.king.used{background:#1c141f;color:#6b5b73;text-decoration:line-through;opacity:0.7;}
.bd.miss{background:#3a1226;color:#ff9ec4;}
.bd.neuro{background:#102a22;color:#8fe;}
.bottomBar{position:sticky;bottom:0;padding:12px;display:flex;flex-direction:column;gap:8px;background:linear-gradient(0deg,#0d0710,rgba(13,7,16,0));}
.bigBtn{padding:16px 0;border:none;border-radius:26px;font-size:17px;font-weight:700;color:#fff;cursor:pointer;}
.bigBtn.pink{background:linear-gradient(180deg,#ff6fa0,#e2597e);box-shadow:0 8px 20px rgba(226,89,126,0.4);}
.bigBtn.red{background:linear-gradient(180deg,#e23b46,#c8202e);box-shadow:0 8px 20px rgba(200,32,46,0.4);}
.waitStart{text-align:center;color:#9a8aa2;font-size:14px;padding:14px 0;}
.leaveModal{position:fixed;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:200;}
.leaveCard{background:#1c1320;border:1px solid #3a2c40;border-radius:16px;padding:20px 22px;width:240px;max-width:80vw;text-align:center;box-shadow:0 10px 40px rgba(0,0,0,0.5);}
.leaveTitle{font-size:15px;color:#fff;margin-bottom:18px;}
.leaveRow{display:flex;gap:10px;}
.leaveCancel{flex:1;background:transparent;border:1px solid #46304e;color:#9a8aa2;border-radius:12px;padding:9px 0;font-size:14px;cursor:pointer;}
.leaveOk{flex:1;background:#e23b46;border:none;color:#fff;border-radius:12px;padding:9px 0;font-size:14px;cursor:pointer;}
.barErr.float{position:fixed;bottom:90px;left:50%;transform:translateX(-50%);background:rgba(40,10,20,0.9);padding:8px 16px;border-radius:12px;z-index:99;}
.pickBox{margin-top:8px;}
.pickTip{font-size:11px;color:#cfc3d6;margin-bottom:6px;}
.pickGrid{display:flex;flex-wrap:wrap;gap:6px;}
.pickBtn{padding:8px 12px;border:1px solid #46304e;background:#2a1830;border-radius:12px;color:#fff;font-size:12px;cursor:pointer;}
.pickBtn.gold{border-color:#ffd27a;color:#ffd27a;}
.pickBtn.king{border-color:#ff9ec4;color:#ff9ec4;}
.kSetRow{display:flex;gap:8px;align-items:center;}
.kInput{width:70px;padding:8px;border-radius:10px;background:#0d0710;border:1px solid #5a3a66;color:#fff;font-size:15px;}
`;
