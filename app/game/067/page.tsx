'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';

const rollDice = () => Array.from({ length: 5 }, () => Math.floor(Math.random() * 6) + 1);
const DICE_EMOJIS = ['', '\u2680', '\u2681', '\u2682', '\u2683', '\u2684', '\u2685'];

const calcHand = (dice: number[], oneSealed: boolean) => {
  const counts = [0,0,0,0,0,0,0];
  for (const d of dice) counts[d]++;
  const sorted = [...dice].sort();
  const isStraight = (sorted.join(',') === '1,2,3,4,5' || sorted.join(',') === '2,3,4,5,6');
  if (isStraight) return { count: 0, value: 0, type: 'straight', emoji: String.fromCodePoint(0x1F3B2), label: '顺子', score: 0 };
  for (let v = 1; v <= 6; v++) {
    if (counts[v] === 5) return { count: 7, value: v, type: 'seven', emoji: String.fromCodePoint(0x1F525), label: v + '纯豹', score: 7 };
  }
  for (let v = 2; v <= 6; v++) {
    if (counts[v] === 4 && counts[1] >= 1) return { count: 6, value: v, type: 'six', emoji: String.fromCodePoint(0x1F436), label: v + '品豹', score: 6 };
  }
  let bestVal = 2, bestCount = 0;
  for (let v = 2; v <= 6; v++) {
    if (counts[v] > bestCount) { bestCount = counts[v]; bestVal = v; }
  }
  if (!oneSealed && counts[1] > 0) bestCount += counts[1];
  return { count: bestCount, value: bestVal, type: 'normal', emoji: String.fromCodePoint(0x1F3AF), label: bestCount + '个' + bestVal, score: bestCount };
};

const countFace = (dice: number[], face: number, oneSealed: boolean) => {
  const counts = [0,0,0,0,0,0,0];
  for (const d of dice) counts[d]++;
  if (face === 1) return counts[1];
  let total = counts[face];
  if (!oneSealed && counts[1] > 0) total += counts[1];
  return total;
};

const SEAT_ANGLES: number[] = [];
for (let i = 0; i < 12; i++) SEAT_ANGLES.push((i * 30 - 90) * Math.PI / 180);

export default function Page() {
  const [screen, setScreen] = useState<'login'|'lobby'|'game'>('login');
  const [playerName, setPlayerName] = useState('');
  const [roomPassword, setRoomPassword] = useState('');
  const [joined, setJoined] = useState(false);
  const [isCreator, setIsCreator] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [players, setPlayers] = useState<any[]>([]);
  const [myDice, setMyDice] = useState<number[]>([]);
  const [myHand, setMyHand] = useState<any>(null);
  const [gameStarted, setGameStarted] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [phase, setPhase] = useState('waiting');
  const [hasRolled, setHasRolled] = useState(false);
  const [lastBid, setLastBid] = useState<any>(null);
  const [bidHistory, setBidHistory] = useState<any[]>([]);
  const [currentPlayer, setCurrentPlayer] = useState('');
  const [oneSealed, setOneSealed] = useState(false);
  const [myPrepared, setMyPrepared] = useState(false);
  const [myDiceRevealed, setMyDiceRevealed] = useState(false);
  const [showingDice, setShowingDice] = useState(false);
  const [violators, setViolators] = useState<string[]>([]);
  const [operationLog, setOperationLog] = useState<string[]>([]);

  const channelRef = useRef<any>(null);
  const mountedRef = useRef<boolean>(false);
  const playersRef = useRef<any[]>([]);
  const oneSealedRef = useRef<boolean>(false);
  const gameOverRef = useRef<boolean>(false);
  const bidHistoryRef = useRef<any[]>([]);
  const lastBidRef = useRef<any>(null);
  const phaseRef = useRef<string>('waiting');
  const myPreparedRef = useRef<boolean>(false);
  const myDiceRef = useRef<number[]>([]);
  const myHandRef = useRef<any>(null);
  const hasRolledRef = useRef<boolean>(false);

  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);
  useEffect(() => { playersRef.current = players; }, [players]);
  useEffect(() => { oneSealedRef.current = oneSealed; }, [oneSealed]);
  useEffect(() => { gameOverRef.current = gameOver; }, [gameOver]);
  useEffect(() => { bidHistoryRef.current = bidHistory; }, [bidHistory]);
  useEffect(() => { lastBidRef.current = lastBid; }, [lastBid]);
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { myPreparedRef.current = myPrepared; }, [myPrepared]);
  useEffect(() => { myDiceRef.current = myDice; }, [myDice]);
  useEffect(() => { myHandRef.current = myHand; }, [myHand]);
  useEffect(() => { hasRolledRef.current = hasRolled; }, [hasRolled]);

  const connectToRoom = () => {
    if (!supabase) { setErrorMsg('Supabase未配置'); return; }
    if (!playerName.trim() || !roomPassword.trim()) {
      setErrorMsg('请输入玩家名和房间密码'); return;
    }
    if (channelRef.current) { channelRef.current.unsubscribe(); channelRef.current = null; }

    const ch = supabase.channel(roomPassword);
    channelRef.current = ch;

    ch.on('broadcast', { event: 'state' }, (payload) => {
      const data = payload.payload;
      if (data.players) setPlayers(data.players);
      if (data.myDice !== undefined) { setMyDice(data.myDice); myDiceRef.current = data.myDice; }
      if (data.myHand) { setMyHand(data.myHand); myHandRef.current = data.myHand; }
      if (data.gameStarted !== undefined) setGameStarted(data.gameStarted);
      if (data.gameOver !== undefined) setGameOver(data.gameOver);
      if (data.phase) { setPhase(data.phase); phaseRef.current = data.phase; }
      if (data.hasRolled !== undefined) { setHasRolled(data.hasRolled); hasRolledRef.current = data.hasRolled; }
      if (data.lastBid) { setLastBid(data.lastBid); lastBidRef.current = data.lastBid; }
      if (data.bidHistory) { setBidHistory(data.bidHistory); bidHistoryRef.current = data.bidHistory; }
      if (data.currentPlayer !== undefined) setCurrentPlayer(data.currentPlayer);
      if (data.oneSealed !== undefined) { setOneSealed(data.oneSealed); oneSealedRef.current = data.oneSealed; }
      if (data.violators) setViolators(data.violators);
      if (data.operationLog) setOperationLog(data.operationLog);
      if (data.myPrepared !== undefined) setMyPrepared(data.myPrepared);
    });

    ch.on('broadcast', { event: 'action' }, (payload) => {
      const data = payload.payload;
      if (data.type === 'start_game' || data.type === 'roll_dice' || data.type === 'bid' || data.type === 'open') {
        addLog(data.message || data.type);
      }
    });

    ch.subscribe(async (status) => {
      if (status !== 'SUBSCRIBED') { setErrorMsg('连接失败: ' + status); return; }
      try {
        await ch.send({ type: 'broadcast', event: 'state', payload: { type: 'join', playerName: playerName.trim(), isCreator, myPrepared: false } });
        setJoined(true);
        setScreen('game');
      } catch(e) { console.warn('send join failed', e); setErrorMsg('加入房间失败'); }
    });
  };

  const disconnectFromRoom = () => {
    if (channelRef.current) {
      channelRef.current.unsubscribe();
      channelRef.current = null;
    }
  };

  const addLog = (msg: string) => setOperationLog(prev => [...prev.slice(-50), msg]);

  const sendAction = async (action: string, data: any) => {
    if (!channelRef.current) return;
    try {
      await channelRef.current.send({ type: 'broadcast', event: 'action', payload: { ...data, type: action, playerName, timestamp: Date.now() } });
    } catch(e) { console.warn('sendAction failed', e); }
  };

  const handlePrepare = async () => {
    const newState = !myPrepared;
    setMyPrepared(newState);
    myPreparedRef.current = newState;
    await sendAction('prepare', { prepared: newState });
    addLog(newState ? playerName + ' 准备好了' : playerName + ' 取消准备');
  };

  const handleRoll = async () => {
    if (hasRolledRef.current || gameOverRef.current || phaseRef.current !== 'rolling') return;
    const dice = rollDice();
    setMyDice(dice); myDiceRef.current = dice;
    await sendAction('roll', { dice });
    addLog(playerName + ' 摇了骰子');
  };

  const handleReveal = () => {
    if (!gameStarted || !hasRolledRef.current || gameOverRef.current) return;
    setMyDiceRevealed(!myDiceRevealed);
    setShowingDice(!myDiceRevealed);
  };

  const handleBid = async (face: number, count: number) => {
    if (!gameStarted || gameOverRef.current) return;
    setOneSealed(true);
    oneSealedRef.current = true;
    const newBid = { face, count, playerName, timestamp: Date.now() };
    setLastBid(newBid);
    lastBidRef.current = newBid;
    const newHist = [...bidHistoryRef.current, { ...newBid, prev: lastBidRef.current }];
    setBidHistory(newHist);
    bidHistoryRef.current = newHist;
    await sendAction('bid', { face, count, playerName });
    addLog(playerName + ' 叫 ' + count + ' 个 ' + face);
  };

  const handleStart = async () => {
    setPhase('rolling');
    phaseRef.current = 'rolling';
    await sendAction('start_game', {});
    addLog('房主开始游戏');
  };

  const handleOpen = async (targetPlayer: string) => {
    if (!gameStarted || gameOverRef.current) return;
    await sendAction('open', { targetPlayer, playerName });
    addLog(playerName + ' 开了 ' + targetPlayer);
  };

  const handleLeave = async () => {
    await sendAction('leave', {});
    disconnectFromRoom();
    setJoined(false);
    setScreen('lobby');
  };

  const otherPlayers = players.filter(p => p.name !== playerName);
  const preparedCount = players.filter(p => p.prepared).length;


  // LOGIN SCREEN
  if (screen === 'login') {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <h1 style={styles.title}>{String.fromCodePoint(0x1F3B2)} 067 骰子游戏</h1>
          <p style={styles.subtitle}>朋友聚会 喝酒小游戏</p>
          <input style={styles.input} placeholder='玩家姓名' value={playerName} onChange={e => setPlayerName(e.target.value)} />
          <input style={styles.input} placeholder='房间密码' value={roomPassword} onChange={e => setRoomPassword(e.target.value)} />
          <button style={styles.btnPrimary} onClick={() => { setIsCreator(true); setScreen('lobby'); }}>创建房间</button>
          <button style={styles.btnSecondary} onClick={() => { setIsCreator(false); setScreen('lobby'); }}>加入房间</button>
          {errorMsg && <p style={styles.error}>{errorMsg}</p>}
        </div>
      </div>
    );
  }

  // LOBBY SCREEN
  if (screen === 'lobby') {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>房间室</h2>
          <p style={styles.roomInfo}>房间密码: <strong>{roomPassword}</strong></p>
          <p style={styles.roomInfo}>请其他玩家输入相同密码加入</p>
          <p style={styles.roomInfo}>分享给朋友的链接: <a href={'https://games-sigma-eight.vercel.app/game/067?room=' + encodeURIComponent(roomPassword)} target='_blank' rel='noreferrer' style={{color: '#8b5cf6', wordBreak: 'break-all'}}>{'https://games-sigma-eight.vercel.app/game/067?room=' + roomPassword}</a></p>
          <button style={styles.btnPrimary} onClick={connectToRoom}>进入房间</button>
          <button style={styles.btnLeave} onClick={() => { disconnectFromRoom(); setScreen('login'); }}>返回</button>
        </div>
      </div>
    );
  }

  // GAME SCREEN
  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <span>{playerName}</span>
        <span style={styles.badge}>{players.length}/12</span>
        <button style={styles.btnSmall} onClick={() => { disconnectFromRoom(); setScreen('lobby'); }}>退出</button>
      </div>

      <div style={styles.tableContainer}>
        <div style={styles.tableCenter}>
          <div style={{fontSize: 40}}>{String.fromCodePoint(0x1F3B2)}</div>
          {lastBid && (
            <div style={styles.centerBid}>
              <span>{lastBid.count}个{lastBid.face}!</span>
            </div>
          )}
          {!gameStarted && <div style={styles.centerHint}>房主请点击开始游戏</div>}
          {gameStarted && phase === 'rolling' && <div style={styles.centerHint}>正在摇骰子...</div>}
          {gameStarted && phase === 'bidding' && <div style={styles.centerHint}>叫牌阶段</div>}
        </div>

        {players.map((p: any, i: number) => {
          const angle = SEAT_ANGLES[i % 12];
          const radius = 42;
          const x = 50 + radius * Math.cos(angle);
          const y = 50 + radius * Math.sin(angle);
          const isMe = p.name === playerName;
          const isPrepared = p.prepared;
          const isCurrent = p.name === currentPlayer;
          const isViolator = violators.includes(p.name);
          const pDice = p.dice || [];
          const pHand = p.hand || null;

          return (
            <div key={p.name} style={{
              ...styles.seat,
              left: x + '%',
              top: y + '%',
              transform: 'translate(-50%, -50%)',
              borderColor: isViolator ? '#f43f5e' : isCurrent ? '#22d3ee' : isMe ? '#a78bfa' : 'rgba(255,255,255,0.1)',
              boxShadow: isViolator ? '0 0 20px rgba(244,63,94,0.6)' : isCurrent ? '0 0 15px rgba(34,211,238,0.4)' : 'none',
            }}>
              {isMe && <span style={styles.meBadge}>我</span>}
              {isCurrent && <span style={styles.crown}>{String.fromCodePoint(0x1F451)}</span>}
              <div style={styles.seatName}>{p.name}</div>
              <div style={{fontSize: 22, margin: '2px 0'}}>
                {gameStarted && hasRolled ? (
                  (isMe && myDiceRevealed) || (!isMe && p.revealed) ?
                    pDice.map((d: number, j: number) => <span key={j} style={{margin: '0 2px'}}>{DICE_EMOJIS[d]}</span>) :
                    <span>{String.fromCodePoint(0x1F371)}</span>
                ) : <span style={{color: 'rgba(255,255,255,0.3)'}}>?</span>}
              </div>
              <div style={{fontSize: 11, color: isPrepared ? '#4ade80' : '#f87171'}}>
                {isPrepared ? String.fromCodePoint(0x2705) : String.fromCodePoint(0x23F3)}
              </div>
            </div>
          );
        })}
      </div>

      <div style={styles.actionBar}>
        {!gameStarted && isCreator && (
          <button style={styles.btnStart} onClick={handleStart}>
            {preparedCount >= 1 ? '开始游戏' : '等待玩家准备... (' + preparedCount + '/2)'}
          </button>
        )}
        {!gameStarted && !isCreator && (
          <button style={myPrepared ? styles.btnLeave : styles.btnStart} onClick={handlePrepare}>
            {myPrepared ? '取消准备' : '我准备好了'}
          </button>
        )}

        {gameStarted && phase === 'rolling' && hasRolled && !myDiceRevealed && (
          <button style={styles.btnSecondary} onClick={handleReveal}>打开骰子</button>
        )}
        {gameStarted && hasRolled && myDiceRevealed && (
          <button style={styles.btnSecondary} onClick={handleReveal}>盖住骰子</button>
        )}

        {gameStarted && phase === 'bidding' && !oneSealed && (
          <div style={styles.bidGroup}>
            {[2,3,4,5,6].map(f => [4,5,6,7].map(c => (
              <button key={f+'-'+c} style={styles.btnBid} onClick={() => handleBid(f, c)}>{c}个{f}</button>
            )))}
            <button style={{...styles.btnBid, borderColor: '#fbbf24'}} onClick={() => handleBid(1, 4)}>4个1（封）</button>
          </div>
        )}

        {gameStarted && phase === 'bidding' && !oneSealed && (
          <div style={{display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center'}}>
            {otherPlayers.map((op: any) => (
              <button key={op.name} style={styles.btnOpen} onClick={() => handleOpen(op.name)}>{op.name}</button>
            ))}
          </div>
        )}

        {gameStarted && hasRolled && myDice.length > 0 && myDiceRevealed && myHand && (
          <div style={styles.handInfo}>{myHand.emoji} {myHand.label}</div>
        )}

        {operationLog.length > 0 && (
          <div style={styles.logContainer}>
            {operationLog.slice(-5).map((log: string, i: number) => (
              <div key={i} style={styles.logEntry}>{log}</div>
            ))}
          </div>
        )}
      </div>

      <div style={styles.footer}>
        <span style={styles.playerCount}>在线: {players.length}</span>
        <span style={styles.phaseTag}>状态: {phase}</span>
      </div>
    </div>
  );
}


const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', background: 'linear-gradient(135deg, #0f0f23 0%, #1a1a2e 50%, #16213e 100%)', color: '#fff', fontFamily: '-apple-system, BlinkMacSystemFont, "Microsoft YaHei", "PingFang SC", sans-serif', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '12px 8px', boxSizing: 'border-box' },
  card: { background: 'rgba(255,255,255,0.06)', borderRadius: 20, padding: '32px 24px', maxWidth: 380, width: '100%', textAlign: 'center', border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(20px)' },
  title: { fontSize: 32, margin: '0 0 8px' },
  subtitle: { color: 'rgba(255,255,255,0.5)', margin: '0 0 24px', fontSize: 14 },
  input: { width: '100%', padding: '14px 18px', borderRadius: 14, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.08)', color: '#fff', fontSize: 16, marginBottom: 12, boxSizing: 'border-box' },
  btnPrimary: { width: '100%', padding: '14px', borderRadius: 14, border: 'none', background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)', color: '#fff', fontSize: 16, fontWeight: 600, cursor: 'pointer', marginBottom: 8 },
  btnSecondary: { width: '100%', padding: '14px', borderRadius: 14, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.08)', color: '#fff', fontSize: 16, cursor: 'pointer', marginBottom: 8 },
  btnStart: { padding: '14px 32px', borderRadius: 14, border: 'none', background: 'linear-gradient(135deg, #22d3ee, #0891b2)', color: '#fff', fontSize: 16, fontWeight: 600, cursor: 'pointer', boxShadow: '0 4px 20px rgba(34,211,238,0.25)' },
  btnOpen: { padding: '8px 16px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #f43f5e, #e11d48)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  btnLeave: { padding: '10px 24px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: 'rgba(255,255,255,0.5)', fontSize: 14, cursor: 'pointer' },
  btnSmall: { padding: '6px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)', fontSize: 12, cursor: 'pointer' },
  btnBid: { padding: '5px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)', color: '#fff', fontSize: 12, cursor: 'pointer' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', maxWidth: 600, padding: '8px 0', marginBottom: 8 },
  badge: { background: 'rgba(251,191,36,0.2)', color: '#fbbf24', padding: '4px 12px', borderRadius: 20, fontSize: 13, fontWeight: 600 },
  tableContainer: { position: 'relative', width: '95vw', maxWidth: 420, aspectRatio: '1/1', margin: '0 auto' },
  tableCenter: { position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 100, height: 100, borderRadius: '50%', background: 'radial-gradient(circle, rgba(34,197,94,0.15), rgba(34,197,94,0.05))', border: '2px solid rgba(34,197,94,0.2)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 },
  seat: { position: 'absolute', width: 72, padding: '6px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', textAlign: 'center', transition: 'all 0.3s', backdropFilter: 'blur(10px)' },
  seatName: { color: '#e0e0e0', fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  meBadge: { color: '#a78bfa', fontSize: 10, fontWeight: 600, background: 'rgba(139,92,246,0.2)', padding: '1px 5px', borderRadius: 6, display: 'inline-block', marginBottom: 2 },
  crown: { fontSize: 14, marginBottom: 2 },
  handInfo: { color: '#fbbf24', fontSize: 13, marginTop: 8, background: 'rgba(251,191,36,0.1)', padding: '6px 14px', borderRadius: 12, display: 'inline-flex', alignItems: 'center', gap: 6 },
  bidGroup: { display: 'flex', flexWrap: 'wrap', gap: 4, justifyContent: 'center', maxWidth: '95vw' },
  centerBid: { fontSize: 14, fontWeight: 700, color: '#fbbf24' },
  centerHint: { color: 'rgba(255,255,255,0.4)', fontSize: 11 },
  logContainer: { background: 'rgba(0,0,0,0.3)', borderRadius: 8, padding: '6px 10px', maxHeight: 70, overflowY: 'auto', fontSize: 11, color: 'rgba(255,255,255,0.5)' },
  logEntry: { padding: '2px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' },
  actionBar: { display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center', marginTop: 8, width: '100%' },
  footer: { display: 'flex', justifyContent: 'space-between', width: '100%', maxWidth: 600, marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.04)' },
  playerCount: { color: 'rgba(255,255,255,0.3)', fontSize: 13 },
  phaseTag: { color: 'rgba(255,255,255,0.2)', fontSize: 13 },
  error: { color: '#f87171', fontSize: 13, marginTop: 12 },
  roomInfo: { color: 'rgba(255,255,255,0.6)', fontSize: 14, margin: '8px 0' },
  cardTitle: { fontSize: 22, margin: '0 0 16px' },
};
