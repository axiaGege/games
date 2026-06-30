import sys
sys.stdout.reconfigure(encoding='utf-8')

src = r'D:\WeChatDevTools\party-games\app\game\067\page.tsx'
with open(src, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# 找到 handleOpen 的开始和结束
start_line = None
end_line = None
brace_count = 0
in_handleOpen = False

for i in range(len(lines)):
    line = lines[i]
    if 'const handleOpen = useCallback' in line:
        start_line = i
        in_handleOpen = True
        continue
    if in_handleOpen:
        brace_count += line.count('{') - line.count('}')
        if brace_count <= 0 and '{' in ''.join(lines[start_line:i+1]):
            end_line = i
            break

print(f'handleOpen: lines {start_line+1} to {end_line+1}')

# 替换为新的 handleOpen
new_handleOpen = '''  // ==================== 开盅结算 ====================
  const handleOpen = useCallback(async (targetName?: string) => {
    if (gameOver) { setErrorMsg('游戏已结束'); return; }
    if (!lastBid) { setErrorMsg('还没人叫牌'); return; }
    
    const opener = playerName;
    const target = targetName || lastBid.player;
    const targetPlayer = players.find((p: any) => p.name === target);
    if (!targetPlayer) { setErrorMsg('找不到该玩家'); return; }
    
    // 1. 优先判断顺子 - 谁开谁喝
    const targetHand = calcHand(targetPlayer.dice || [], oneSealed);
    if (targetHand.type === 'straight') {
      const resultMsg = '🌈 ' + target + ' 是顺子！' + opener + ' 喝！';
      setGameOver(true);
      setPhase('ended');
      setResult(resultMsg);
      addLog(resultMsg);
      broadcastState({ type: 'open', players, gameOver: true, result: resultMsg, opener, target, phase: 'ended' });
      setOpenTargets([]);
      return;
    }
    
    // 2. 计算被开者的实际数量（考虑1号万能/封印）
    const actualCount = countFace(targetPlayer.dice || [], lastBid.value, oneSealed);
    
    // 3. 判断输赢
    let resultMsg: string;
    if (actualCount >= lastBid.count) {
      resultMsg = '🎉 ' + opener + ' 开 ' + target + '！实际 ' + actualCount + '个' + lastBid.value + ' >= ' + lastBid.count + '个' + lastBid.value + '，' + opener + ' 喝！';
    } else {
      resultMsg = '🍺 ' + opener + ' 开 ' + target + '！实际 ' + actualCount + '个' + lastBid.value + ' < ' + lastBid.count + '个' + lastBid.value + '，' + target + ' 喝！';
    }
    
    setGameOver(true);
    setPhase('ended');
    setResult(resultMsg);
    addLog(resultMsg);
    broadcastState({ type: 'open', players, gameOver: true, result: resultMsg, opener, target, phase: 'ended' });
    setOpenTargets([]);
  }, [players, playerName, lastBid, oneSealed, broadcastState, addLog, gameOver]);
'''

if start_line is not None and end_line is not None:
    lines[start_line:end_line+1] = [new_handleOpen + '\n']
    with open(src, 'w', encoding='utf-8') as f:
        f.writelines(lines)
    print('handleOpen replaced!')
else:
    print('Could not find handleOpen boundaries')
