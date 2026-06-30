'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';

// ==================== 工具函数 ====================
const rollDice = () => Array.from({ length: 5 }, () => Math.floor(Math.random() * 6) + 1);

const calcHand = (dice: number[]): { label: string; score: number; emoji: string } => {
  const counts = [0, 0, 0, 0, 0, 0, 0];
  for (const d of dice) counts[d]++;

  const sorted = [...dice].sort();
  const isStraight = sorted.join(',') === '1,2,3,4,5' || sorted.join(',') === '2,3,4,5,6';
  if (isStraight) return { label: '✨ 顺子', score: 0, emoji: '🌈' };

  const ones = counts[1];
  let maxCount = 0;
  let maxVal = 2;
  for (let i = 2; i <= 6; i++) {
    if (counts[i] > maxCount) { maxCount = counts[i]; maxVal = i; }
  }

  if (maxCount === 5) return { label: '🔥 纯豹 (' + maxVal + ')', score: 7, emoji: '👑' };
  if (maxCount === 4 && ones > 0) return { label: '💫 围骰 (6个' + maxVal + ')', score: 6, emoji: '⭐' };
  const total = ones + maxCount;
  if (total >= 4 && maxCount >= 3) return { label: '💫 围骰 (6个' + maxVal + ')', score: 6, emoji: '⭐' };
  return { label: total + '个' + maxVal, score: total, emoji: '🎯' };
};

const DICE_EMOJIS = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

// ==================== 主组件 ====================
export default function Page() {
  const [playerName, setPlayerName] = useState('');
  const [roomPassword, setRoomPassword] = useState('');
  const [joined, setJoined] = useState(false);
  const [roomId, setRoomId] = useState('');
  const [isCreator, setIsCreator] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [players, setPlayers] = useState<any[]>([]);
  const [myDice, setMyDice] = useState<number[]>([]);
  const [myHand, setMyHand] = useState<any>(null);
  const [currentPlayer, setCurrentPlayer] = useState('');
  const [gameStarted, setGameStarted] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [result, setResult] = useState('');
  const [lastBid, setLastBid] = useState<any>(null);
  const [bidHistory, setBidHistory] = useState<any[]>([]);
  const [phase, setPhase] = useState('waiting');
  const [hasRolled, setHasRolled] = useState(false);

  const [diceShaking, setDiceShaking] = useState(false);
  const [revealedPlayer, setRevealedPlayer] = useState<string | null>(null);
  const [operationLog, setOperationLog] = useState<string[]>([]);
  const [showConfirmReload, setShowConfirmReload] = useState(false);

  // 骰盅查看状态
  const [myDiceRevealed, setMyDiceRevealed] = useState(false);
  const [diceLocked, setDiceLocked] = useState(false);
  const [playerPrepared, ] = useState({});
  // 违规闪烁
  const [violators, setViolators] = useState<string[]>([]);

  const channelRef = useRef<any>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const nameRef = useRef(playerName);
  nameRef.current = playerName;

  // ==================== 音效 ====================
  const playSound = useCallback((freq: number, dur: number, type = 'sine') => {
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      const ctx = audioCtxRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = type as OscillatorType;
      gain.gain.value = 0.08;
      osc.start();
      osc.stop(ctx.currentTime + dur);
    } catch {}
  }, []);

  const playShakeSound = useCallback(() => {
    for (let i = 0; i < 10; i++) {
      setTimeout(() => playSound(600 + Math.random() * 400, 0.04, 'square'), i * 50);
    }
  }, [playSound]);

  // ==================== 日志 ====================
  const addLog = useCallback((msg: string) => {
    setOperationLog(prev => [...prev.slice(-30), msg]);
  }, []);

  // ==================== 广播状态 ====================
  const broadcastState = useCallback(async (state: any) => {
    if (!channelRef.current) return;
    try {
      await channelRef.current.send({
        type: 'broadcast',
        event: 'gameState',
        payload: state,
      });
    } catch (e) { console.error('Broadcast failed:', e); }
  }, []);

  // ==================== 连接房间 ====================
  const connectToRoom = useCallback((rid: string, name: string, creator: boolean) => {
    if (channelRef.current) { channelRef.current.unsubscribe(); channelRef.current = null; }

    const ch = supabase.channel(rid);
    channelRef.current = ch;

    ch.on('broadcast', { event: 'gameState' }, (payload) => {
      const s = payload.payload;
      if (s.type === 'join') {
        setPlayers(prev => {
          const exists = prev.find((p: any) => p.name === s.player);
          if (!exists) return [...prev, { name: s.player, dice: [], score: 0 }];
          return prev;
        });
      } else if (s.type === 'roll') {
        setPlayers(prev => prev.map((p: any) => p.name === s.player ? { ...p, dice: s.dice } : p));
        if (s.players) setPlayers(s.players);
        
      } else if (s.type === 'leave') {
        setPlayers(prev => prev.filter((p: any) => p.name !== s.player));
        addLog(s.player + ' 离开了房间');
        if (s.dice && s.dice.length === 5) setMyHand(calcHand(s.dice));
        setHasRolled(true);
      } else if (s.type === 'start') {
        setPlayers(s.players || []);
        setCurrentPlayer(s.currentTurn || '');
        setGameStarted(true);
        setPhase(s.phase || 'rolling');
        setHasRolled(false);
        setGameOver(false);
        setResult('');
        setLastBid(null);
        setMyDice([]);
        setMyHand(null);
        setRevealedPlayer(null);
      } else if (s.type === 'bid') {
        setLastBid(s.lastBid);
        setCurrentPlayer(s.currentPlayer);
        setPhase(s.phase);
      } else if (s.type === 'open') {
        setGameOver(true);
        setPhase('ended');
        setResult(s.result);
        setPlayers(s.players || []);
      } else if (s.type === 'reset') {
        setGameStarted(false);
        setGameOver(false);
        setResult('');
        setLastBid(null);
        setCurrentPlayer('');
        setPhase('waiting');
        setHasRolled(false);
        setMyDice([]);
        setMyHand(null);
        setRevealedPlayer(null);
      }
    });



    ch.subscribe(async (status) => {
      console.log('Subscribe status:', status);
      if (status === 'SUBSCRIBED') {
        setJoined(true);
        setIsCreator(creator);
        setRoomId(rid);
        addLog(name + ' 加入房间 ' + rid);

        // 广播自己加入了，让房间裡其他人看到
        broadcastState({ type: "join", player: name });

        // 如果是创建者，初始化房间
        if (creator) {
          const newPlayers = [{ name, dice: [], score: 0 }];
          setPlayers(newPlayers);
          await broadcastState({
            type: 'start',
            players: newPlayers,
            currentPlayer: '',
            phase: 'waiting',
          });
          // 同步到数据库
          try {
            await supabase.from('rooms').insert({
              game_type: 'dice067',
              password: rid,
              players: newPlayers.map(p => p.name).join(','),
              });
          } catch (e) { console.error('DB insert failed:', e); }
        } else {
          // 加入已有房间 - 先尝试数据库
          let joinedViaDb = false;
          try {
              const { data: roomList } = await supabase.from('rooms').select().eq('password', rid); const roomData = roomList && roomList.length > 0 ? roomList[0] : null;
            if (roomData) {
              const existingPlayers = roomData.players ? roomData.players.split(',').filter(Boolean) : [];
              if (!existingPlayers.includes(name)) {
                const newPlayers = [...existingPlayers, name];
                await supabase.from('rooms').update({ players: newPlayers.join(',') }).eq('password', rid);
                await broadcastState({
                  type: 'join',
                  player: name,
                  players: newPlayers.map((n: string) => ({ name: n, dice: [], score: 0 })),
                });
                setPlayers(newPlayers.map((n: string) => ({ name: n, dice: [], score: 0 })));
                joinedViaDb = true;
              }
            }
          } catch (e) { console.error('DB join failed:', e); }
          
          // 即使数据库失败，也要广播自己加入，让房间里的人看到
          if (!joinedViaDb) {
            await broadcastState({ type: 'join', player: name });
          }
        }
      }
    });
  }, [broadcastState, addLog]);

  // ==================== 创建房间 ====================
  const createRoom = useCallback(() => {
    if (!playerName.trim()) { setErrorMsg('请输入你的名字'); return; }
    if (!roomPassword.trim()) { setErrorMsg('请设置房间密码'); return; }
    setErrorMsg('');
    connectToRoom(roomPassword.trim(), playerName.trim(), true);
  }, [playerName, roomPassword, connectToRoom]);

  // ==================== 加入房间 ====================
  const joinRoom = useCallback(() => {
    if (!playerName.trim()) { setErrorMsg('请输入你的名字'); return; }
    if (!roomPassword.trim()) { setErrorMsg('请输入房间密码'); return; }
    setErrorMsg('');
    connectToRoom(roomPassword.trim(), playerName.trim(), false);
  }, [playerName, roomPassword, connectToRoom]);

  // ==================== 开始游戏 ====================
  // ==================== 准备流程 ====================
  const handlePrepare = useCallback(() => {
    const me = players.find((p: any) => p.name === playerName);
    if (!me) return;
    const newPrepared = !me.prepared;
    setPlayers(prev => prev.map((p: any) => p.name === playerName ? { ...p, prepared: newPrepared } : p));
    broadcastState({ type: "prepare", player: playerName, prepared: newPrepared });
    addLog(newPrepared ? playerName + " 已准备" : playerName + " 取消准备");
  }, [players, playerName, broadcastState, addLog]);

  const handleBeginGame = useCallback(async () => {
    const me = players.find((p: any) => p.name === playerName);
    if (!me || !me.prepared) { setErrorMsg("你自己还没准备"); return; }
    const prepPlayers = players.filter((p: any) => p.prepared);
    if (prepPlayers.length < 2) { setErrorMsg("至少2人准备才能开始"); return; }
    setPhase("rolling");
    broadcastState({ type: "update", phase: "rolling", players });
    playShakeSound();
    setDiceShaking(true);
    addLog("摇骰中...");
    await new Promise(r => setTimeout(r, 1500));
    const shuffled = [...players].sort(() => Math.random() - 0.5);
    const newPlayers = shuffled.map((p: any) => {
      if (p.prepared) return { ...p, dice: rollDice(), revealed: false };
      return p;
    });
    const firstPlayer = newPlayers[0].name;
    setPlayers(newPlayers);
    setCurrentPlayer(firstPlayer);
    setGameStarted(true);
    setPhase("bidding");
    setHasRolled(true);
    setDiceShaking(false);
    setDiceLocked(true);
    setPhase("bidding");
    const me2 = newPlayers.find((p: any) => p.name === playerName);
    if (me2) { setMyDice(me2.dice || []); setMyHand(me2.dice ? calcHand(me2.dice) : null); }
    addLog(firstPlayer + " 先手叫牌");
    broadcastState({ type: "start", players: newPlayers, currentPlayer: firstPlayer, phase: "bidding" });
  }, [players, playerName, broadcastState, addLog, playShakeSound]);


  // ==================== 叫牌 ====================
  const handleBid = useCallback(async (count: number, value: number) => {
    if (diceLocked && !gameStarted) { /* 等待摇骰 */ }
    if (currentPlayer !== playerName) { setErrorMsg('还没轮到你'); return; }
    if (gameOver) { setErrorMsg('游戏已结束'); return; }
    if (count < 1 || count > 7 || value < 1 || value > 6) { setErrorMsg('叫点 1-7，数字 1-6'); return; }
    if (lastBid) {
      if (count < lastBid.count || (count === lastBid.count && value <= lastBid.value)) {
        setErrorMsg('必须比 ' + lastBid.count + '个' + lastBid.value + ' 更大');
        return;
      }
    }
    setErrorMsg('');
    const newBid = { player: playerName, count, value };
    setLastBid(newBid);
    setBidHistory(prev => [...prev, newBid]);
    const playerNames = players.map((p: any) => p.name);
    const idx = playerNames.indexOf(currentPlayer);
    const nextPlayer = playerNames[(idx + 1) % playerNames.length];

    setCurrentPlayer(nextPlayer);
    addLog(playerName + ' 叫了 ' + count + '个' + value);
    await broadcastState({
      type: 'bid',
      lastBid: newBid,
      currentPlayer: nextPlayer,
      phase: 'bidding',
      bidHistory: [...bidHistory, newBid],
    });
  }, [currentPlayer, playerName, gameOver, lastBid, players, broadcastState, addLog]);

  // ==================== 开盅 ====================
  // 支持的抢开：任何人都可以随时开任何人
  const handleOpen = useCallback(async (targetName?: string) => {
    if (gameOver) { setErrorMsg('游戏已结束'); return; }
    if (!lastBid) { setErrorMsg('还没人叫牌'); return; }
    // 任何人都可以在叫牌阶段随时开任何人（无限制抢开）

    // 如果没有传 targetName，就是当前玩家自己开（传统开盅）
    const opener = playerName;
    const target = targetName || lastBid.player;

    // 计算总数
    let totalCount = 0;
    for (const p of players) {
      const dice = p.dice || [];
      const counts = [0, 0, 0, 0, 0, 0, 0];
      for (const d of dice) counts[d]++;
      if (lastBid.value === 1) totalCount += counts[1];
      else totalCount += counts[1] + counts[lastBid.value];
    }

    const bidder = lastBid.player;
    const winner = totalCount >= lastBid.count ? bidder : opener;
    const loser = winner === bidder ? opener : target;
    const resultMsg = '🔓 ' + opener + ' 开 ' + target + '！实际有 ' + totalCount + ' 个' + (lastBid.value === 1 ? '1' : lastBid.value);

    setGameOver(true);
    setPhase('ended');
    setResult(resultMsg);
    addLog(resultMsg);

    await broadcastState({
      type: 'open',
      players,
      gameOver: true,
      result: resultMsg,
      opener,
      target: target,
      lastBid,
      phase: 'ended',
    });
  }, [currentPlayer, playerName, lastBid, players, broadcastState, addLog, gameOver]);

  // ==================== 重置游戏 ====================
  const handleReset = useCallback(async () => {
    if (!isCreator) { setErrorMsg('只有房主可以重置'); return; }
    setGameStarted(false);
    setGameOver(false);
    setResult('');
    setLastBid(null);
    setCurrentPlayer('');
    setPhase('waiting');
    setHasRolled(false);
    setMyDice([]);
    setMyHand(null);
    setRevealedPlayer(null);
    addLog('🔄 房主重置游戏');
    await broadcastState({
      type: 'reset',
      players: players.map((p: any) => ({ ...p, dice: [] })),
      phase: 'waiting',
    });
  }, [isCreator, players, broadcastState, addLog]);

  // ==================== 离开房间 ====================
  const handleLeave = useCallback(() => {
    // 离开前广播
    if (channelRef.current && playerName) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'gameState',
        payload: { type: 'leave', player: playerName },
      }).catch((e: any) => console.error('Leave broadcast failed:', e));
    }
    if (channelRef.current) { channelRef.current.unsubscribe(); channelRef.current = null; }
    setJoined(false);
    setPlayers([]);
    setMyDice([]);
    setMyHand(null);
    setHasRolled(false);
    setPhase('waiting');
    setGameStarted(false);
    setGameOver(false);
    setResult('');
    setLastBid(null);
    setOperationLog([]);
    setErrorMsg('');
    setRoomPassword('');
  }, []);

  // ==================== 清理 ====================
  useEffect(() => {
    return () => { if (channelRef.current) channelRef.current.unsubscribe(); };
  }, []);

  // 刷新提醒
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (gameStarted && !gameOver) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [gameStarted, gameOver]);

  // ==================== 登录界面 ====================
  if (!joined) {
    return (
      <div style={S.container}>
        <div style={S.card}>
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div style={{ fontSize: 64, marginBottom: 12 }}>🎲</div>
            <h1 style={S.title}>零六七</h1>
            <p style={S.subtitle}>酒桌吹牛 · 经典骰子</p>
          </div>

          <input style={S.input} placeholder='👤 输入你的名字' value={playerName} onChange={e => setPlayerName(e.target.value)} />
          <input style={S.input} placeholder='🔐 房间密码（设置或加入）' value={roomPassword} onChange={e => setRoomPassword(e.target.value)} />

          <div style={S.btnRow}>
            <button style={S.btnCreate} onClick={createRoom}>🆕 创建房间</button>
            <button style={S.btnJoin} onClick={joinRoom}>🔗 加入房间</button>
          </div>

          {errorMsg && <p style={S.error}>{errorMsg}</p>}

          <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: 12, textAlign: 'center', marginTop: 16 }}>
            💡 创建房间后把密码发给朋友
          </p>
        </div>
      </div>
    );
  }

  // ==================== 游戏界面 ====================
  const isMyTurn = currentPlayer === playerName && !gameOver && phase === 'bidding';
  const prepCount = players.filter((p: any) => p.prepared).length;
  const me = players.find((p: any) => p.name === playerName);
  const others = players.filter((p: any) => p.name !== playerName);
  const totalPlayers = players.length;

    // 计算座位角度（最多12人圆桌）
    const getSeatAngle = (index: number, total: number) => {
      // 座位数最少2人，最多12人
      const n = Math.max(2, Math.min(total, 12));
      return (index / n) * 2 * Math.PI - Math.PI / 2;
    };

  return (
    <div style={S.container}>
      <div style={S.gameCard}>
        {/* 顶部信息 */}
        <div style={S.header}>
          <span style={S.roomBadge}>🏠 密码: {roomId}</span>
          <span style={S.playerBadge}>👤 {playerName}</span>
        </div>

        {/* 状态栏 */}
        <div style={S.statusBar}>
          {!gameStarted ? (
            <span style={S.statusText}>
              👥 {players.length} 人在线
              {isCreator && (
                <>
                  {' '}| {' '}
                  {players.filter((p:any) => p.prepared).length >= 2 ? (
                    <button style={S.btnStartSmall} onClick={handleBeginGame}>🎮 开始对局</button>
                  ) : (
                    <span style={{fontSize:12,color:'rgba(255,255,255,0.4)'}}>等待2人准备...</span>
                  )}
                </>
              )}
            </span>
          ) : gameOver ? (
            <span style={S.resultText}>{result}</span>
          ) : diceShaking ? (
            <span style={S.statusText}>🎲 摇骰中...</span>
          ) : (
            <span style={S.statusText}>
              🎯 <strong style={{ color: '#fbbf24' }}>{currentPlayer}</strong> 的回合
            </span>
          )}
        </div>

        {/* 圆桌布局 */}
        <div style={S.tableArea}>
          {/* 中间的骰子台 */}
          <div style={S.diceTable}>
            {gameStarted && hasRolled && myDice.length > 0 && (
              <>
                <div style={S.centerDiceLabel}>🎲 你的骰子</div>
                <div style={S.centerDiceRow}>
                  {myDice.map((d: number, i: number) => (
                    <span key={i} style={{
                      fontSize: 40,
                      animation: diceShaking ? 'shakeAnim 0.3s infinite' : undefined,
                    }}>
                      {DICE_EMOJIS[d - 1]}
                    </span>
                  ))}
                </div>
                {myHand && (
                  <div style={S.centerHandInfo}>
                    {myHand.emoji} {myHand.label}
                  </div>
                )}
              </>
            )}
            {!gameStarted && <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 14 }}>等待开始...</div>}
          </div>

          {/* 周围玩家 */}
          {players.map((p: any, i: number) => {
            const angle = getSeatAngle(i, totalPlayers);
            const radius = 170;
            const x = Math.cos(angle) * radius;
            const y = Math.sin(angle) * radius;
            const isMe = p.name === playerName;
            const isActive = p.name === currentPlayer && !gameOver;
            const hasDice = p.dice && p.dice.length === 5;
            const shouldReveal = isMe && revealedPlayer === p.name && !diceShaking;

            return (
              <div
                key={i}
                style={{
                  ...S.seat,
                  left: `calc(50% + ${x}px)`,
                  top: `calc(50% + ${y}px)`,
                  transform: 'translate(-50%, -50%)',
                  borderColor: isActive ? '#fbbf24' : isMe ? 'rgba(251,191,36,0.5)' : 'rgba(255,255,255,0.06)',
                  background: isActive ? 'rgba(251,191,36,0.1)' : 'rgba(255,255,255,0.02)',
                }}
                onClick={() => {
                  if (isMe && hasDice && !diceShaking) {
                    setMyDiceRevealed(!myDiceRevealed);
                    if (!myDiceRevealed) {
                      setTimeout(() => setMyDiceRevealed(false), 3000);
                    }
                  }
                }}
              >
                <div style={S.seatName}>
                  <div style={{width:28,height:28,borderRadius:'50%',background:'linear-gradient(135deg,#a78bfa,#22d3ee)',display:'inline-flex',alignItems:'center',justifyContent:'center',fontSize:13,fontWeight:'bold',color:'#fff',marginBottom:3}}>{p.name.charAt(0).toUpperCase()}</div>
                  {isMe && '👤 '}{p.name}
                  {isActive && <span style={S.crown}>👑</span>}
                  {isMe && <span style={S.meBadge}>我</span>}
                </div>
                {hasDice && (
                  <div style={S.seatDice}>
                    {(diceShaking && isMe) ? (
                      <span style={{ fontSize: 26, animation: 'shakeAnim 0.1s infinite alternate' }}>🎲</span>
                    ) : (
                      p.dice.map((d: number, j: number) => (
                        <span key={j} style={S.seatDiceItem}>
                          {shouldReveal ? DICE_EMOJIS[d - 1] : '🎲'}
                        </span>
                      ))
                    )}
                  </div>
                )}
                
                {isMe && hasDice && shouldReveal && myHand && (
                  <div style={S.handInfo}>
                    {myHand.emoji} {myHand.label}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* 叫牌信息 + 历史记录 */}
        {lastBid && !gameOver && (
          <div style={{
            background: 'linear-gradient(135deg, rgba(251,191,36,0.06), rgba(139,92,246,0.06))',
            borderRadius: 14, padding: '14px 18px',
            marginBottom: 16, border: '1px solid rgba(251,191,36,0.1)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 8 }}>
              <span style={{ fontSize: 18 }}>📢</span>
              <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 15 }}>
                <strong style={{ color: '#fbbf24' }}>{lastBid.player}</strong> 叫了{' '}
                <strong style={{ color: '#60a5fa', fontSize: 18 }}>{lastBid.count}</strong> 个{' '}
                <strong style={{ color: '#60a5fa', fontSize: 18 }}>{lastBid.value === 1 ? '🎯1' : lastBid.value}</strong>
              </span>
              {isMyTurn && <span style={{ fontSize: 12, color: '#22d3ee' }}>⬅️ 轮到你!</span>}
            </div>
            {/* 叫牌历史 */}
            {bidHistory.length > 0 && (
              <div style={{
                fontSize: 12, color: 'rgba(255,255,255,0.4)',
                maxHeight: 50, overflowY: 'auto', paddingTop: 4, borderTop: '1px solid rgba(255,255,255,0.06)',
              }}>
                {bidHistory.map((b: any, i: number) => (
                  <div key={i} style={{ padding: '2px 0' }}>
                    {b.player}: {b.count}个{b.value}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 操作区 */}
        <div style={S.actionBar}>
          {!gameStarted && players.length >= 2 && isCreator && (
            <button style={S.btnStart} onClick={handleBeginGame} disabled={diceShaking}>
              {diceShaking ? '🎲 摇骰中...' : '🎮 开始对局'}
            </button>
          )}

          {gameStarted && !gameOver && phase === 'bidding' && isMyTurn && (
            <>
              <div style={S.bidGroup}>
                {(() => {
                  const bids: any[] = [];
                  const startCount = lastBid ? lastBid.count : 0;
                  const startVal = lastBid ? lastBid.value : 0;
                  for (let v = 1; v <= 6; v++) {
                    if (v > startVal || startCount === 0) {
                      bids.push({ count: startCount + 1, value: v });
                    }
                  }
                  if (startCount < 6) {
                    for (let v = 1; v <= 6; v++) {
                      bids.push({ count: startCount + 2, value: v });
                    }
                  }
                  if (startCount < 6) {
                    bids.push({ count: 7, value: 6 });
                  }
                  // 去重
                  const unique = bids.filter((b, i, arr) =>
                    arr.findIndex(x => x.count === b.count && x.value === b.value) === i
                  );
                  return unique.map((b, i) => (
                    <button key={i} style={S.btnBid} onClick={() => handleBid(b.count, b.value)}>
                      {b.count}个{b.value}
                    </button>
                  ));
                })()}
              </div>
              <div style={S.btnRow}>
                <button style={S.btnOpen} onClick={() => handleOpen()}>🔓 开盅</button>
              </div>
            </>
          )}

          {gameStarted && !gameOver && phase === 'bidding' && !isMyTurn && (
            <div style={S.waitBox}>
              <span style={S.waitText}>⏳ 等待 <strong style={{ color: '#fbbf24' }}>{currentPlayer}</strong> 操作...</span>
            </div>
          )}

          {gameOver && (
            <div style={S.btnRow}>
              {isCreator && <button style={S.btnReset} onClick={handleReset}>🔄 再来一局</button>}
              <button style={S.btnLeave} onClick={handleLeave}>🏠 返回大厅</button>
            </div>
          )}

          {errorMsg && !gameOver && <p style={{ color: '#f87171', fontSize: 13, marginTop: 8 }}>{errorMsg}</p>}
        </div>

        {/* 操作日志 */}
        {operationLog.length > 0 && (
          <div style={S.logContainer}>
            <div style={S.logTitle}>📋 记录</div>
            {operationLog.slice(-5).map((log, i) => (
              <div key={i} style={S.logEntry}>{log}</div>
            ))}
          </div>
        )}

        {/* 底部信息 */}
        <div style={S.footer}>
          <span style={S.playerCount}>👥 {players.length}/12 人</span>
          {gameStarted && !gameOver && (
            <span style={S.phaseTag}>{phase === 'bidding' ? '🎯 叫牌阶段' : '⏳ 准备中'}</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ==================== 样式 ====================
const S: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    background: 'radial-gradient(ellipse at 50% 50%, #1a1a3e 0%, #0f0f1a 60%, #0a0a12 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    fontFamily: 'system-ui, -apple-system, sans-serif',
    position: 'relative',
    overflow: 'hidden',
  },
  card: {
    background: 'rgba(255,255,255,0.04)',
    backdropFilter: 'blur(30px)',
    WebkitBackdropFilter: 'blur(30px)',
    borderRadius: 32,
    padding: '48px 40px',
    maxWidth: 440,
    width: '100%',
    boxShadow: '0 30px 80px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.06)',
    position: 'relative',
    zIndex: 1,
  },
  title: {
    textAlign: 'center',
    color: '#fff',
    fontSize: 36,
    fontWeight: 800,
    marginBottom: 4,
    background: 'linear-gradient(135deg, #fbbf24, #f59e0b)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  },
  subtitle: {
    textAlign: 'center',
    color: 'rgba(255,255,255,0.4)',
    fontSize: 14,
    marginBottom: 32,
  },
  input: {
    width: '100%',
    padding: '14px 18px',
    marginBottom: 12,
    borderRadius: 14,
    border: '1px solid rgba(255,255,255,0.08)',
    background: 'rgba(255,255,255,0.04)',
    color: '#fff',
    fontSize: 15,
    outline: 'none',
    boxSizing: 'border-box',
  },
  btnRow: { display: 'flex', gap: 12, marginTop: 4 },
  btnCreate: {
    flex: 1, padding: 14, borderRadius: 14, border: 'none',
    background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)',
    color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer',
    boxShadow: '0 4px 20px rgba(139,92,246,0.3)',
  },
  btnJoin: {
    flex: 1, padding: 14, borderRadius: 14,
    border: '1px solid rgba(255,255,255,0.12)',
    background: 'rgba(255,255,255,0.04)',
    color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer',
  },
  error: { color: '#f87171', textAlign: 'center', margin: '12px 0 0', fontSize: 14 },
  gameCard: {
    background: 'rgba(255,255,255,0.04)',
    backdropFilter: 'blur(30px)',
    WebkitBackdropFilter: 'blur(30px)',
    borderRadius: 28,
    padding: '24px 28px',
    maxWidth: 800,
    width: '100%',
    boxShadow: '0 30px 80px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.06)',
    position: 'relative',
    zIndex: 1,
  },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  roomBadge: {
    color: 'rgba(255,255,255,0.4)', fontSize: 13,
    background: 'rgba(255,255,255,0.06)', padding: '4px 14px', borderRadius: 20,
  },
  playerBadge: {
    color: '#a78bfa', fontSize: 13, fontWeight: 600,
    background: 'rgba(139,92,246,0.12)', padding: '4px 14px', borderRadius: 20,
  },
  statusBar: {
    background: 'rgba(255,255,255,0.04)', borderRadius: 16,
    padding: '14px 20px', textAlign: 'center', marginBottom: 20,
    minHeight: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
    border: '1px solid rgba(255,255,255,0.04)',
  },
  statusText: { color: 'rgba(255,255,255,0.6)', fontSize: 15 },
  resultText: { color: '#fbbf24', fontSize: 17, fontWeight: 600 },
  btnStartSmall: {
    padding: '4px 14px', borderRadius: 8, border: 'none',
    background: 'linear-gradient(135deg, #22d3ee, #0891b2)',
    color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', marginLeft: 8,
  },
  tableArea: {
    position: 'relative',
    width: 420,
    height: 420,
    margin: '0 auto 20px',
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(34,211,238,0.03) 0%, rgba(34,211,238,0.01) 40%, transparent 70%)',
    border: '2px solid rgba(34,211,238,0.1)',
    boxShadow: 'inset 0 0 60px rgba(34,211,238,0.03)',
  },
  diceTable: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    transform: 'translate(-50%, -50%)',
    width: 150,
    height: 150,
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(251,191,36,0.12) 0%, rgba(251,191,36,0.04) 60%, transparent 100%)',
    border: '2px solid rgba(251,191,36,0.2)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    boxShadow: '0 0 30px rgba(251,191,36,0.05)',
  },
  centerDiceLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginBottom: 4 },
  centerDiceRow: { display: 'flex', gap: 8 },
  centerHandInfo: { color: '#fbbf24', fontSize: 12, marginTop: 4 },
  seat: {
    position: 'absolute',
    width: 80,
    padding: '6px 8px',
    borderRadius: 12,
    border: '1px solid rgba(255,255,255,0.08)',
    background: 'rgba(255,255,255,0.03)',
    textAlign: 'center',
    transition: 'all 0.3s',
    cursor: 'default',
    backdropFilter: 'blur(10px)',
  },
  seatName: {
    color: '#e0e0e0', fontWeight: 600, fontSize: 13,
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2,
  },
  crown: { color: '#fbbf24', fontSize: 12 },
  meBadge: {
    color: '#a78bfa', fontSize: 10, fontWeight: 600,
    background: 'rgba(139,92,246,0.15)', padding: '1px 6px', borderRadius: 8, marginLeft: 4,
  },
  seatDice: { display: 'flex', gap: 4, marginTop: 4, justifyContent: 'center' },
  seatDiceItem: { fontSize: 20 },
  hintText: { color: 'rgba(255,255,255,0.3)', fontSize: 10, marginTop: 2 },
  handInfo: {
    color: '#fbbf24', fontSize: 11, marginTop: 4,
    background: 'rgba(251,191,36,0.08)', padding: '2px 8px', borderRadius: 10,
    display: 'inline-flex', alignItems: 'center', gap: 4,
  },
  bidInfo: {
    background: 'linear-gradient(135deg, rgba(251,191,36,0.06), rgba(139,92,246,0.06))',
    borderRadius: 14, padding: '12px 16px',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
    marginBottom: 16, border: '1px solid rgba(251,191,36,0.08)',
  },
  bidIcon: { fontSize: 18 },
  bidText: { color: 'rgba(255,255,255,0.7)', fontSize: 15 },
  actionBar: { display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center', marginTop: 4 },
  bidGroup: { display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' },
  btnBid: {
    padding: '6px 14px', borderRadius: 10,
    border: '1px solid rgba(255,255,255,0.08)',
    background: 'rgba(255,255,255,0.04)',
    color: '#fff', fontSize: 13, cursor: 'pointer',
  },
  btnOpen: {
    padding: '12px 44px', borderRadius: 14, border: 'none',
    background: 'linear-gradient(135deg, #f43f5e, #e11d48)',
    color: '#fff', fontSize: 16, fontWeight: 600, cursor: 'pointer',
    boxShadow: '0 4px 20px rgba(244,63,94,0.3)',
  },
  btnStart: {
    padding: '12px 44px', borderRadius: 14, border: 'none',
    background: 'linear-gradient(135deg, #22d3ee, #0891b2)',
    color: '#fff', fontSize: 16, fontWeight: 600, cursor: 'pointer',
    boxShadow: '0 4px 20px rgba(34,211,238,0.25)',
  },
  btnReset: {
    padding: '12px 44px', borderRadius: 14, border: 'none',
    background: 'linear-gradient(135deg, #fbbf24, #f59e0b)',
    color: '#0f0f1a', fontSize: 16, fontWeight: 600, cursor: 'pointer',
    boxShadow: '0 4px 20px rgba(251,191,36,0.2)',
  },
  btnLeave: {
    padding: '10px 30px', borderRadius: 12,
    border: '1px solid rgba(255,255,255,0.1)',
    background: 'transparent',
    color: 'rgba(255,255,255,0.4)', fontSize: 14, cursor: 'pointer',
  },
  waitBox: { padding: 14, textAlign: 'center' },
  waitText: { color: 'rgba(255,255,255,0.4)', fontSize: 15 },
  logContainer: {
    background: 'rgba(0,0,0,0.3)', borderRadius: 8,
    padding: '8px 12px', marginBottom: 12, maxHeight: 80,
    overflowY: 'auto', fontSize: 12, color: 'rgba(255,255,255,0.5)',
  },
  logTitle: { fontWeight: 'bold', color: 'rgba(255,255,255,0.7)', marginBottom: 4 },
  logEntry: { padding: '2px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' },
  footer: {
    display: 'flex', justifyContent: 'space-between', marginTop: 14, paddingTop: 14,
    borderTop: '1px solid rgba(255,255,255,0.04)',
  },
  playerCount: { color: 'rgba(255,255,255,0.3)', fontSize: 13 },
  phaseTag: { color: 'rgba(255,255,255,0.2)', fontSize: 13 },
};







