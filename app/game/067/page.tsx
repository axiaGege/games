'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';

const DICE_UNICODE = ['','\u2680','\u2681','\u2682','\u2683','\u2684','\u2685'];

function rollDice() {
  return Array.from({ length: 5 }, () => Math.floor(Math.random() * 6) + 1);
}

function calcHand(dice: number[]) {
  const counts = [0,0,0,0,0,0,0];
  for (const d of dice) counts[d as number]++;
  const maxCount = Math.max(...counts.slice(2));
  let maxVal = 2;
  for (let i = 2; i <= 6; i++) if (counts[i] === maxCount) maxVal = i;
  const ones = counts[1];
  const s = [...dice].sort().join(',');
  if (s === '1,2,3,4,5' || s === '2,3,4,5,6') return { label: 'Straight', score: 0, icon: 'star' };
  if (maxCount === 5) return { label: 'Triple ' + maxVal, score: 7, icon: 'leopard' };
  if (maxCount === 4 && ones > 0) return { label: 'Four ' + maxVal, score: 6, icon: 'four' };
  if (ones + maxCount >= 4 && maxCount >= 3) return { label: 'Four ' + maxVal, score: 6, icon: 'four' };
  return { label: (ones + maxCount) + 'x' + maxVal, score: ones + maxCount, icon: 'normal' };
}

export default function Page() {
  const [name, setName] = useState('');
  const [room, setRoom] = useState('');
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState('');
  const [players, setPlayers] = useState<any[]>([]);
  const [myDice, setMyDice] = useState<number[]>([]);
  const [myHand, setMyHand] = useState<any>(null);
  const [phase, setPhase] = useState('waiting');
  const [log, setLog] = useState<string[]>([]);
  const [shaking, setShaking] = useState(false);
  const chRef = useRef<any>(null);
  const nameRef = useRef(name);
  nameRef.current = name;

  const addLog = (msg: string) => setLog(prev => [...prev.slice(-20), msg]);

  const connect = (rid: string, n: string, creator: boolean) => {
    if (chRef.current) chRef.current.unsubscribe();
    const ch = supabase.channel(rid);
    chRef.current = ch;
    ch.on('broadcast', { event: 'state' }, (p) => {
      const s = p.payload;
      if (s.players) setPlayers(s.players);
      if (s.phase !== undefined) setPhase(s.phase);
      if (s.myDice) { setMyDice(s.myDice); setMyHand(calcHand(s.myDice)); }
    });
    ch.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        setJoined(true);
        addLog('Joined room ' + rid);
        await ch.send({
          type: 'broadcast', event: 'state',
          payload: { type: 'join', name: n, players: [...players, { name: n, dice: [] }] },
        });
        setPlayers(prev => {
          const exists = prev.find(p => p.name === n);
          if (!exists) return [...prev, { name: n, dice: [] }];
          return prev;
        });
      }
    });
  };

  const createRoom = () => {
    if (!name.trim()) { setError('Enter your name'); return; }
    const id = Math.floor(100000 + Math.random() * 900000).toString();
    setRoom(id);
    connect(id, name, true);
  };

  const joinRoom = () => {
    if (!name.trim()) { setError('Enter your name'); return; }
    if (!room.trim()) { setError('Enter room code'); return; }
    connect(room, name, false);
  };

  const handleRoll = async () => {
    if (shaking) return;
    setShaking(true);
    await new Promise(r => setTimeout(r, 1000));
    const dice = rollDice();
    setMyDice(dice);
    setMyHand(calcHand(dice));
    setShaking(false);
    addLog('Rolled: ' + dice.join(', '));
    if (chRef.current) {
      await chRef.current.send({
        type: 'broadcast', event: 'state',
        payload: { type: 'roll', name, dice, players: players.map(p => p.name === name ? { ...p, dice } : p) },
      });
    }
  };

  const handleStart = async () => {
    if (players.length < 2) { setError('Need 2+ players'); return; }
    if (chRef.current) {
      await chRef.current.send({
        type: 'broadcast', event: 'state',
        payload: { type: 'start', players: players.map(p => ({ ...p, dice: [] })), phase: 'rolling' },
      });
    }
    addLog('Game started!');
  };

  useEffect(() => () => { if (chRef.current) chRef.current.unsubscribe(); }, []);

  if (!joined) {
    return (
      <div style={{minHeight:'100vh',background:'linear-gradient(135deg,#0f0f1a,#1a1a2e)',display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
        <div style={{background:'rgba(20,20,35,0.92)',borderRadius:24,padding:24,width:'100%',maxWidth:420,border:'1px solid rgba(255,255,255,0.06)',boxShadow:'0 8px 32px rgba(0,0,0,0.5)'}}>
          <div style={{textAlign:'center',marginBottom:24}}>
            <div style={{fontSize:56}}>🎲</div>
            <h1 style={{color:'#fff',fontSize:28,margin:'0 0 8px'}}>067 Dice</h1>
            <p style={{color:'rgba(255,255,255,0.4)',margin:0}}>Enter name to create or join a room</p>
          </div>
          <input style={{width:'100%',padding:'14px 16px',borderRadius:14,border:'1px solid rgba(255,255,255,0.1)',background:'rgba(255,255,255,0.05)',color:'#fff',fontSize:16,marginBottom:12,outline:'none',boxSizing:'border-box'}} placeholder='Your name' value={name} onChange={e => setName(e.target.value)} />
          {error && <p style={{color:'#f87171',textAlign:'center',margin:'0 0 12px'}}>{error}</p>}
          <button style={{width:'100%',padding:'14px',borderRadius:14,border:'none',background:'linear-gradient(135deg,#f43f5e,#e11d48)',color:'#fff',fontSize:16,fontWeight:600,cursor:'pointer',marginBottom:8}} onClick={createRoom}>Create Room</button>
          <div style={{textAlign:'center',color:'rgba(255,255,255,0.3)',margin:'12px 0'}}>OR</div>
          <input style={{width:'100%',padding:'14px 16px',borderRadius:14,border:'1px solid rgba(255,255,255,0.1)',background:'rgba(255,255,255,0.05)',color:'#fff',fontSize:16,marginBottom:12,outline:'none',boxSizing:'border-box'}} placeholder='Room code' value={room} onChange={e => setRoom(e.target.value)} />
          <button style={{width:'100%',padding:'14px',borderRadius:14,border:'1px solid rgba(255,255,255,0.1)',background:'rgba(255,255,255,0.05)',color:'#fff',fontSize:16,fontWeight:600,cursor:'pointer'}} onClick={joinRoom}>Join Room</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{minHeight:'100vh',background:'linear-gradient(135deg,#0f0f1a,#1a1a2e)',display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
      <div style={{background:'rgba(20,20,35,0.92)',borderRadius:24,padding:24,width:'100%',maxWidth:420,border:'1px solid rgba(255,255,255,0.06)',boxShadow:'0 8px 32px rgba(0,0,0,0.5)'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
          <h1 style={{color:'#fff',fontSize:20,margin:0}}>067 Dice</h1>
          <div style={{color:'rgba(255,255,255,0.4)',fontSize:12}}>Room: <span style={{color:'#fbbf24'}}>{room}</span></div>
        </div>
        <div style={{background:'rgba(255,255,255,0.04)',borderRadius:14,padding:'12px 16px',textAlign:'center',marginBottom:14,minHeight:44,border:'1px solid rgba(255,255,255,0.04)'}}>
          <span style={{color:'rgba(255,255,255,0.6)',fontSize:14}}>{players.length} players | Phase: {phase}</span>
        </div>
        <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:14,maxHeight:260,overflowY:'auto'}}>
          {players.map((p, i) => (
            <div key={i} style={{borderRadius:14,padding:'10px 14px',border:'1px solid rgba(255,255,255,0.06)',background:'rgba(255,255,255,0.02)',borderColor: p.name === name ? 'rgba(251,191,36,0.5)' : 'rgba(255,255,255,0.06)'}}>
              <div style={{display:'flex',alignItems:'center',gap:4}}>
                <span style={{color:'#e0e0e0',fontWeight:600,fontSize:14}}>{p.name}</span>
                {p.name === name && <span style={{color:'#a78bfa',fontSize:11,background:'rgba(139,92,246,0.15)',padding:'2px 8px',borderRadius:10}}>ME</span>}
              </div>
              {p.dice && p.dice.length > 0 && (
                <div style={{display:'flex',gap:6,marginTop:6}}>
                  {p.dice.map((d: number, j: number) => <span key={j} style={{fontSize:26}}>{DICE_UNICODE[d]}</span>)}
                </div>
              )}
            </div>
          ))}
        </div>
        {myDice.length > 0 && (
          <div style={{background:'rgba(251,191,36,0.06)',borderRadius:16,padding:16,marginBottom:14,border:'1px solid rgba(251,191,36,0.1)',textAlign:'center'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <span style={{color:'#fbbf24',fontWeight:600}}>Your Dice</span>
              <button style={{background:'rgba(255,255,255,0.08)',border:'none',color:'rgba(255,255,255,0.6)',fontSize:12,padding:'4px 10px',borderRadius:8,cursor:'pointer'}} onClick={() => setMyDice([])}>Hide</button>
            </div>
            <div style={{display:'flex',gap:8,justifyContent:'center',marginTop:8}}>
              {myDice.map((d: number, i: number) => <span key={i} style={{fontSize:36}}>{DICE_UNICODE[d]}</span>)}
            </div>
            {myHand && <div style={{color:'#fbbf24',fontSize:13,marginTop:8}}>{myHand.icon} {myHand.label}</div>}
          </div>
        )}
        {log.length > 0 && (
          <div style={{background:'rgba(0,0,0,0.25)',borderRadius:10,padding:'8px 12px',marginBottom:14,maxHeight:90,overflowY:'auto'}}>
            <div style={{fontWeight:'bold',color:'rgba(255,255,255,0.7)',marginBottom:4}}>LOG</div>
            {log.map((l, i) => <div key={i} style={{padding:'2px 0',fontSize:12,color:'rgba(255,255,255,0.5)',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>{l}</div>)}
          </div>
        )}
        <div style={{display:'flex',gap:12,marginTop:12,justifyContent:'center'}}>
          {phase === 'waiting' && players.length >= 2 && (
            <button style={{padding:'12px 40px',borderRadius:14,border:'none',background:'linear-gradient(135deg,#22d3ee,#0891b2)',color:'#fff',fontSize:16,fontWeight:600,cursor:'pointer'}} onClick={handleStart}>Start Game</button>
          )}
          <button style={{padding:'12px 40px',borderRadius:14,border:'1px solid rgba(255,255,255,0.1)',background:'transparent',color:'rgba(255,255,255,0.4)',fontSize:14,cursor:'pointer'}} onClick={() => { if (chRef.current) chRef.current.unsubscribe(); setJoined(false); setPlayers([]); setMyDice([]); setLog([]); }}>Leave</button>
        </div>
      </div>
    </div>
  );
}







