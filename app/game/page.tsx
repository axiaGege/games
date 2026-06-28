"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";

// 生成5个随机骰子
const rollDice = () => {
  return Array.from({ length: 5 }, () => Math.floor(Math.random() * 6) + 1);
};

// 计算067牌型
const calc067 = (dice: number[]) => {
  const sorted = [...dice].sort();
  const counts = Array(7).fill(0);
  for (const d of dice) counts[d]++;

  const isStraight = sorted.join(",") === "1,2,3,4,5" || sorted.join(",") === "2,3,4,5,6";
  if (isStraight) return { label: "✨ 顺子 (0)", count: 0, emoji: "🌈" };

  const ones = counts[1];
  const maxCount = Math.max(...counts.slice(2));
  const maxVal = counts.indexOf(maxCount);

  if (maxCount === 5) return { label: `🔥 纯豹 (7个${maxVal})`, count: 7, emoji: "👑" };
  if (maxCount === 4 && ones > 0) return { label: `💫 围骰 (6个${maxVal})`, count: 6, emoji: "⭐" };
  const total = ones + maxCount;
  if (total >= 4 && maxCount >= 3) return { label: `💫 围骰 (6个${maxVal})`, count: 6, emoji: "⭐" };

  return { label: `${total}个${maxVal}`, count: total, emoji: "🎯" };
};

const DICE_EMOJIS = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];

export default function GamePage() {
  const [roomId, setRoomId] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [roomPassword, setRoomPassword] = useState(""); // 房主设置的密码
  const [joinPassword, setJoinPassword] = useState(""); // 加入时输入的密码
  const [joined, setJoined] = useState(false);
  const [players, setPlayers] = useState<any[]>([]);
  const [myDice, setMyDice] = useState<number[]>([]);
  const [myHand, setMyHand] = useState<any>(null);
  const [currentPlayer, setCurrentPlayer] = useState("");
  const [gameStarted, setGameStarted] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [result, setResult] = useState("");
  const [lastBid, setLastBid] = useState<{ player: string; count: number; value: number } | null>(null);
  const [phase, setPhase] = useState<"waiting" | "rolling" | "bidding" | "ended">("waiting");
  const [hasRolled, setHasRolled] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!roomId) return;
    const channel = supabase
      .channel(`room:${roomId}`)
      .on("broadcast", { event: "gameState" }, (payload) => {
        const state = payload.payload;
        setPlayers(state.players || []);
        setCurrentPlayer(state.currentPlayer || "");
        setGameStarted(state.gameStarted || false);
        setGameOver(state.gameOver || false);
        setResult(state.result || "");
        setLastBid(state.lastBid || null);
        setPhase(state.phase || "waiting");
        setHasRolled(state.hasRolled || false);
        if (state.players) {
          const me = state.players.find((p: any) => p.name === playerName);
          if (me) {
            setMyDice(me.dice || []);
            if (me.dice && me.dice.length === 5) setMyHand(calc067(me.dice));
          }
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [roomId, playerName]);

  const broadcastState = async (state: any) => {
    await supabase.channel(`room:${roomId}`).send({
      type: "broadcast",
      event: "gameState",
      payload: state,
    });
  };

  // 创建房间（带密码）
  const createRoom = async () => {
    if (!playerName.trim()) { setErrorMsg("请输入你的名字"); return; }
    if (!roomPassword.trim()) { setErrorMsg("请设置房间密码"); return; }
    setErrorMsg("");
    const { data, error } = await supabase
      .from("rooms")
      .insert({ 
        game_type: "dice067", 
        password: roomPassword.trim(),
        players: [playerName.trim()]
      })
      .select()
      .single();
    if (error) {
      setErrorMsg("创建房间失败: " + error.message);
      return;
    }
    setRoomId(data.id);
    setJoined(true);
    // 广播初始玩家列表
    await broadcastState({
      players: [{ name: playerName.trim(), dice: [] }],
      currentPlayer: "",
      gameStarted: false,
      gameOver: false,
      result: "",
      lastBid: null,
      phase: "waiting",
      hasRolled: false,
    });
  };

  // 加入房间（验证密码）
  const joinRoom = async () => {
    if (!roomId.trim()) { setErrorMsg("请输入房间号"); return; }
    if (!playerName.trim()) { setErrorMsg("请输入你的名字"); return; }
    if (!joinPassword.trim()) { setErrorMsg("请输入房间密码"); return; }
    setErrorMsg("");

    // 查询房间并验证密码
    const { data, error } = await supabase
      .from("rooms")
      .select()
      .eq("id", roomId.trim())
      .single();

    if (error || !data) {
      setErrorMsg("房间不存在，请检查房间号");
      return;
    }

    // 验证密码
    if (data.password !== joinPassword.trim()) {
      setErrorMsg("密码错误，请重新输入");
      return;
    }

    // 检查人数
    const currentPlayers = data.players || [];
    if (currentPlayers.length >= 6) {
      setErrorMsg("房间已满（最多6人）");
      return;
    }

    // 如果玩家已在列表中，直接进入
    if (currentPlayers.includes(playerName.trim())) {
      setJoined(true);
      return;
    }

    // 添加玩家
    const newPlayers = [...currentPlayers, playerName.trim()];
    await supabase.from("rooms").update({ players: newPlayers }).eq("id", roomId.trim());
    setJoined(true);
    // 广播更新玩家列表
    await broadcastState({
      players: newPlayers.map((name: string) => ({ name, dice: [] })),
      currentPlayer: "",
      gameStarted: false,
      gameOver: false,
      result: "",
      lastBid: null,
      phase: "waiting",
      hasRolled: false,
    });
  };

  // 开始游戏（每人摇骰）
  const startGame = async () => {
    if (players.length < 2) { setErrorMsg("至少需要2人才能开始"); return; }
    setErrorMsg("");
    const shuffled = [...players];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const newPlayers = shuffled.map((p) => ({ name: p.name, dice: rollDice() }));
    const firstPlayer = newPlayers[0].name;
    setPlayers(newPlayers);
    setCurrentPlayer(firstPlayer);
    setGameStarted(true);
    setGameOver(false);
    setResult("");
    setLastBid(null);
    setPhase("bidding");
    setHasRolled(true);
    await broadcastState({
      players: newPlayers,
      currentPlayer: firstPlayer,
      gameStarted: true,
      gameOver: false,
      result: "",
      lastBid: null,
      phase: "bidding",
      hasRolled: true,
    });
  };

  const makeBid = async (count: number, value: number) => {
    if (currentPlayer !== playerName) { setErrorMsg("还没轮到你"); return; }
    if (phase === "ended") { setErrorMsg("游戏已结束"); return; }
    if (count < 1 || count > 7 || value < 1 || value > 6) { setErrorMsg("叫点 1-7，叫数字 1-6"); return; }
    if (lastBid) {
      if (count < lastBid.count || (count === lastBid.count && value <= lastBid.value)) {
        setErrorMsg(`必须比 ${lastBid.count}个${lastBid.value} 更大`);
        return;
      }
    }
    setErrorMsg("");
    const newBid = { player: playerName, count, value };
    setLastBid(newBid);
    const playerNames = players.map((p) => p.name);
    const idx = playerNames.indexOf(currentPlayer);
    const nextIdx = (idx + 1) % playerNames.length;
    setCurrentPlayer(playerNames[nextIdx]);
    await broadcastState({
      players,
      currentPlayer: playerNames[nextIdx],
      gameStarted,
      gameOver,
      result,
      lastBid: newBid,
      phase,
      hasRolled,
    });
  };

  const openDice = async () => {
    if (currentPlayer !== playerName) { setErrorMsg("还没轮到你"); return; }
    if (!lastBid) { setErrorMsg("还没人叫牌"); return; }
    setErrorMsg("");
    let totalCount = 0;
    for (const p of players) {
      const dice = p.dice || [];
      const counts = Array(7).fill(0);
      for (const d of dice) counts[d]++;
      if (lastBid.value === 1) totalCount += counts[1];
      else totalCount += counts[1] + counts[lastBid.value];
    }
    const bidder = lastBid.player;
    const caller = playerName;
    const winner = totalCount >= lastBid.count ? bidder : caller;
    const loser = winner === bidder ? caller : bidder;
    setGameOver(true);
    setPhase("ended");
    const resultMsg = `🍺 ${loser} 输了！实际有 ${totalCount} 个${lastBid.value}`;
    setResult(resultMsg);
    await broadcastState({
      players,
      currentPlayer,
      gameStarted,
      gameOver: true,
      result: resultMsg,
      lastBid,
      phase: "ended",
      hasRolled,
    });
  };

  const resetGame = async () => {
    setGameStarted(false);
    setGameOver(false);
    setResult("");
    setLastBid(null);
    setCurrentPlayer("");
    setPhase("waiting");
    setHasRolled(false);
    await broadcastState({
      players: players.map((p) => ({ ...p, dice: [] })),
      currentPlayer: "",
      gameStarted: false,
      gameOver: false,
      result: "",
      lastBid: null,
      phase: "waiting",
      hasRolled: false,
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
            placeholder="🔑 房间号（加入时填写）"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            style={styles.input}
          />
          <input
            placeholder="🔐 房间密码（创建或加入时填写）"
            value={roomPassword}
            onChange={(e) => setRoomPassword(e.target.value)}
            style={styles.input}
          />
          <div style={styles.btnGroup}>
            <button onClick={createRoom} style={styles.btnPrimary}>🆕 创建房间</button>
            <button onClick={joinRoom} style={styles.btnSecondary}>🔗 加入房间</button>
          </div>
          {errorMsg && <div style={{ color: "#f87171", marginTop: 12, fontSize: 14 }}>{errorMsg}</div>}
        </div>
      </div>
    );
  }

  const isMyTurn = currentPlayer === playerName && !gameOver && phase === "bidding";

  return (
    <div style={styles.container}>
      <div style={styles.glowOrb}></div>
      <div style={styles.glowOrb2}></div>
      <div style={styles.gameCard}>
        <div style={styles.header}>
          <span style={styles.roomBadge}>🏠 {roomId}</span>
          <span style={styles.playerBadge}>👤 {playerName}</span>
        </div>

        <div style={styles.statusBar}>
          {!gameStarted ? (
            <span style={styles.statusText}>⏳ 等待开始... (至少2人)</span>
          ) : gameOver ? (
            <span style={styles.resultText}>{result}</span>
          ) : (
            <span style={styles.statusText}>
              🎯 <strong style={{ color: "#fbbf24" }}>{currentPlayer}</strong> 的回合
            </span>
          )}
        </div>

        <div style={styles.playersGrid}>
          {players.map((p, i) => {
            const isMe = p.name === playerName;
            const isActive = p.name === currentPlayer && !gameOver;
            const hasDice = p.dice && p.dice.length === 5;
            return (
              <div
                key={i}
                style={{
                  ...styles.playerCard,
                  background: isActive
                    ? "linear-gradient(135deg, rgba(251,191,36,0.15), rgba(251,191,36,0.05))"
                    : "rgba(255,255,255,0.03)",
                  borderColor: isActive ? "#fbbf24" : "rgba(255,255,255,0.06)",
                }}
              >
                <div style={styles.playerName}>
                  <span>{isMe ? "👤 " : ""}{p.name}</span>
                  {isActive && <span style={styles.crown}> 👑</span>}
                  {hasDice && <span style={styles.diceIcon}> 🎲</span>}
                </div>
                {hasDice && (
                  <div style={styles.diceRow}>
                    {p.dice.map((val: number, idx: number) => (
                      <span key={idx} style={styles.dice}>{DICE_EMOJIS[val-1]}</span>
                    ))}
                  </div>
                )}
                {isMe && hasDice && myHand && (
                  <div style={styles.handInfo}>
                    <span style={styles.handEmoji}>{myHand.emoji || "🎯"}</span>
                    {myHand.label}
                  </div>
                )}
                {isMe && !hasDice && gameStarted && (
                  <div style={styles.handInfo}>⏳ 等待摇骰...</div>
                )}
              </div>
            );
          })}
        </div>

        {lastBid && !gameOver && (
          <div style={styles.bidInfo}>
            <span style={styles.bidIcon}>📢</span>
            <span style={styles.bidText}>
              <strong style={{ color: "#fbbf24" }}>{lastBid.player}</strong> 叫了{" "}
              <strong style={{ color: "#60a5fa" }}>{lastBid.count}</strong> 个{" "}
              <strong style={{ color: "#60a5fa" }}>{lastBid.value}</strong>
            </span>
          </div>
        )}

        <div style={styles.actionBar}>
          {!gameStarted && players.length >= 2 && (
            <button onClick={startGame} style={styles.btnStart}>🚀 开始游戏</button>
          )}
          {gameStarted && !gameOver && phase === "bidding" && isMyTurn && (
            <>
              <div style={styles.bidGroup}>
                <button onClick={() => makeBid(1, 1)} style={styles.btnBid}>1⚀</button>
                <button onClick={() => makeBid(2, 2)} style={styles.btnBid}>2⚁</button>
                <button onClick={() => makeBid(3, 3)} style={styles.btnBid}>3⚂</button>
                <button onClick={() => makeBid(4, 4)} style={styles.btnBid}>4⚃</button>
                <button onClick={() => makeBid(5, 5)} style={styles.btnBid}>5⚄</button>
                <button onClick={() => makeBid(6, 6)} style={styles.btnBid}>6⚅</button>
                <button onClick={() => makeBid(7, 6)} style={styles.btnBid}>7⚅</button>
              </div>
              <div style={styles.btnRow}>
                <button onClick={openDice} style={styles.btnOpen}>🔓 开盅</button>
              </div>
            </>
          )}
          {gameStarted && !gameOver && phase === "bidding" && !isMyTurn && (
            <div style={styles.waitBox}>
              <span style={styles.waitText}>⏳ 等待 <strong style={{ color: "#fbbf24" }}>{currentPlayer}</strong> 操作...</span>
            </div>
          )}
          {gameOver && (
            <button onClick={resetGame} style={styles.btnReset}>🔄 再来一局</button>
          )}
          {errorMsg && !gameOver && (
            <div style={{ color: "#f87171", fontSize: 13, marginTop: 8 }}>{errorMsg}</div>
          )}
        </div>

        <div style={styles.footer}>
          <span style={styles.playerCount}>👥 {players.length}/6 人</span>
          {gameStarted && !gameOver && (
            <span style={styles.phaseTag}>{phase === "bidding" ? "🎯 叫牌阶段" : "⏳ 准备中"}</span>
          )}
        </div>
      </div>
    </div>
  );
}

// 样式（沿用之前的暗黑霓虹风格，未变）
const styles: any = {
  container: {
    minHeight: "100vh",
    background: "radial-gradient(ellipse at 20% 50%, #1a0a2e 0%, #0f0f1a 50%, #0a0a12 100%)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    padding: "20px",
    fontFamily: "system-ui, -apple-system, sans-serif",
    position: "relative",
    overflow: "hidden",
  },
  glowOrb: {
    position: "absolute",
    top: "-20%",
    right: "-10%",
    width: "500px",
    height: "500px",
    background: "radial-gradient(circle, rgba(139,92,246,0.15), transparent 70%)",
    borderRadius: "50%",
    pointerEvents: "none" as const,
    animation: "pulse 4s ease-in-out infinite",
  },
  glowOrb2: {
    position: "absolute",
    bottom: "-30%",
    left: "-10%",
    width: "400px",
    height: "400px",
    background: "radial-gradient(circle, rgba(251,191,36,0.08), transparent 70%)",
    borderRadius: "50%",
    pointerEvents: "none" as const,
    animation: "pulse 5s ease-in-out infinite reverse",
  },
  card: {
    background: "rgba(255,255,255,0.04)",
    backdropFilter: "blur(30px)",
    WebkitBackdropFilter: "blur(30px)",
    borderRadius: "32px",
    padding: "48px 40px",
    maxWidth: "440px",
    width: "100%",
    boxShadow: "0 30px 80px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.06)",
    position: "relative",
    zIndex: 1,
  },
  logo: { fontSize: "48px", textAlign: "center" as const, marginBottom: "8px" },
  title: {
    textAlign: "center" as const,
    color: "#fff",
    fontSize: "36px",
    fontWeight: "800",
    marginBottom: "4px",
    background: "linear-gradient(135deg, #fbbf24, #f59e0b)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
  },
  subtitle: { textAlign: "center" as const, color: "rgba(255,255,255,0.4)", fontSize: "14px", marginBottom: "32px" },
  input: {
    width: "100%",
    padding: "14px 18px",
    marginBottom: "12px",
    borderRadius: "14px",
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.04)",
    color: "#fff",
    fontSize: "15px",
    outline: "none",
    transition: "all 0.3s",
    boxSizing: "border-box" as const,
  },
  btnGroup: { display: "flex", gap: "12px", marginTop: "4px" },
  btnPrimary: {
    flex: 1,
    padding: "14px",
    borderRadius: "14px",
    border: "none",
    background: "linear-gradient(135deg, #8b5cf6, #6d28d9)",
    color: "#fff",
    fontSize: "15px",
    fontWeight: "600",
    cursor: "pointer",
    transition: "transform 0.2s, box-shadow 0.2s",
    boxShadow: "0 4px 20px rgba(139,92,246,0.3)",
  },
  btnSecondary: {
    flex: 1,
    padding: "14px",
    borderRadius: "14px",
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.04)",
    color: "#fff",
    fontSize: "15px",
    fontWeight: "600",
    cursor: "pointer",
    transition: "all 0.2s",
  },
  gameCard: {
    background: "rgba(255,255,255,0.04)",
    backdropFilter: "blur(30px)",
    WebkitBackdropFilter: "blur(30px)",
    borderRadius: "28px",
    padding: "24px 28px",
    maxWidth: "720px",
    width: "100%",
    boxShadow: "0 30px 80px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.06)",
    position: "relative",
    zIndex: 1,
  },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" },
  roomBadge: { color: "rgba(255,255,255,0.4)", fontSize: "13px", background: "rgba(255,255,255,0.06)", padding: "4px 14px", borderRadius: "20px" },
  playerBadge: { color: "#a78bfa", fontSize: "13px", fontWeight: "600", background: "rgba(139,92,246,0.12)", padding: "4px 14px", borderRadius: "20px" },
  statusBar: {
    background: "rgba(255,255,255,0.04)",
    borderRadius: "16px",
    padding: "14px 20px",
    textAlign: "center" as const,
    marginBottom: "16px",
    minHeight: "48px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: "1px solid rgba(255,255,255,0.04)",
  },
  statusText: { color: "rgba(255,255,255,0.6)", fontSize: "15px" },
  resultText: { color: "#fbbf24", fontSize: "17px", fontWeight: "600" },
  playersGrid: { display: "flex", flexDirection: "column" as const, gap: "8px", marginBottom: "16px", maxHeight: "320px", overflowY: "auto" as const },
  playerCard: {
    borderRadius: "14px",
    padding: "12px 16px",
    border: "1px solid rgba(255,255,255,0.06)",
    transition: "all 0.3s",
  },
  playerName: { color: "#e0e0e0", fontWeight: "600", fontSize: "14px", display: "flex", alignItems: "center", gap: "4px" },
  crown: { color: "#fbbf24" },
  diceIcon: { color: "rgba(255,255,255,0.3)" },
  diceRow: { display: "flex", gap: "8px", marginTop: "6px" },
  dice: { fontSize: "26px", lineHeight: "1" },
  handInfo: {
    color: "#fbbf24",
    fontSize: "12px",
    marginTop: "4px",
    display: "flex",
    alignItems: "center",
    gap: "6px",
    background: "rgba(251,191,36,0.08)",
    padding: "2px 10px",
    borderRadius: "20px",
    width: "fit-content",
  },
  handEmoji: { fontSize: "14px" },
  bidInfo: {
    background: "linear-gradient(135deg, rgba(251,191,36,0.06), rgba(139,92,246,0.06))",
    borderRadius: "14px",
    padding: "12px 16px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "10px",
    marginBottom: "16px",
    border: "1px solid rgba(251,191,36,0.08)",
  },
  bidIcon: { fontSize: "18px" },
  bidText: { color: "rgba(255,255,255,0.7)", fontSize: "15px" },
  actionBar: { display: "flex", flexDirection: "column" as const, gap: "12px", alignItems: "center", marginTop: "4px" },
  bidGroup: { display: "flex", flexWrap: "wrap" as const, gap: "8px", justifyContent: "center" },
  btnBid: {
    padding: "8px 18px",
    borderRadius: "10px",
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.04)",
    color: "#fff",
    fontSize: "14px",
    cursor: "pointer",
    transition: "all 0.2s",
  },
  btnRow: { display: "flex", gap: "12px" },
  btnOpen: {
    padding: "12px 44px",
    borderRadius: "14px",
    border: "none",
    background: "linear-gradient(135deg, #f43f5e, #e11d48)",
    color: "#fff",
    fontSize: "16px",
    fontWeight: "600",
    cursor: "pointer",
    boxShadow: "0 4px 20px rgba(244,63,94,0.3)",
    transition: "all 0.2s",
  },
  btnStart: {
    padding: "12px 44px",
    borderRadius: "14px",
    border: "none",
    background: "linear-gradient(135deg, #22d3ee, #0891b2)",
    color: "#fff",
    fontSize: "16px",
    fontWeight: "600",
    cursor: "pointer",
    boxShadow: "0 4px 20px rgba(34,211,238,0.25)",
    transition: "all 0.2s",
  },
  btnReset: {
    padding: "12px 44px",
    borderRadius: "14px",
    border: "none",
    background: "linear-gradient(135deg, #fbbf24, #f59e0b)",
    color: "#0f0f1a",
    fontSize: "16px",
    fontWeight: "600",
    cursor: "pointer",
    boxShadow: "0 4px 20px rgba(251,191,36,0.2)",
    transition: "all 0.2s",
  },
  waitBox: { padding: "14px", textAlign: "center" as const },
  waitText: { color: "rgba(255,255,255,0.4)", fontSize: "15px" },
  footer: { display: "flex", justifyContent: "space-between", marginTop: "14px", paddingTop: "14px", borderTop: "1px solid rgba(255,255,255,0.04)" },
  playerCount: { color: "rgba(255,255,255,0.3)", fontSize: "13px" },
  phaseTag: { color: "rgba(255,255,255,0.2)", fontSize: "13px" },
};