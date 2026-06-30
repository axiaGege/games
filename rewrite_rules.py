import sys
sys.stdout.reconfigure(encoding='utf-8')

src = r'D:\WeChatDevTools\party-games\app\game\067\page.tsx'
with open(src, 'r', encoding='utf-8') as f:
    c = f.read()

# ============================================================
# 核心1: 重写 calcHand - 按067规则
# ============================================================
old_calc = '''const calcHand = (dice: number[]): { label: string; score: number; emoji: string } => {
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
};'''

new_calc = '''// 按067规则计算骰子
// dice: 5个骰子 [1-6]
// 返回: { count: 实际数量, value: 点数, type: 牌型, emoji: 表情, label: 描述 }
const calcHand = (dice: number[], oneSealed: boolean) => {
  const counts = [0, 0, 0, 0, 0, 0, 0];
  for (const d of dice) counts[d]++;
  
  const sorted = [...dice].sort();
  
  // 1. 检查顺子 - 五个骰子全部不重复
  const isStraight = (sorted.join(',') === '1,2,3,4,5' || sorted.join(',') === '2,3,4,5,6');
  if (isStraight) {
    return { count: 0, value: 0, type: 'straight', emoji: '🌈', label: '顺子(0个)', score: 0 };
  }
  
  // 2. 检查纯豹 - 五颗完全一样
  for (let v = 1; v <= 6; v++) {
    if (counts[v] === 5) {
      return { count: 7, value: v, type: 'seven', emoji: '👑', label: '7个' + v + ' (纯豹)', score: 7 };
    }
  }
  
  // 3. 检查6个 - 有4个相同 + 至少1个1
  for (let v = 2; v <= 6; v++) {
    if (counts[v] === 4 && counts[1] >= 1) {
      return { count: 6, value: v, type: 'six', emoji: '⭐', label: '6个' + v + ' (含1豹)', score: 6 };
    }
  }
  
  // 4. 普通牌型 - 1号是否万能
  let bestVal = 2, bestCount = 0;
  for (let v = 2; v <= 6; v++) {
    if (counts[v] > bestCount) {
      bestCount = counts[v];
      bestVal = v;
    }
  }
  
  // 如果1号未被封印(未封1)，1可以当bestVal使用
  if (!oneSealed && counts[1] > 0) {
    bestCount += counts[1]; // 1号万能，加入计数
  }
  // 如果1号已被封印，1只能当1算，不加到bestCount里
  
  return { count: bestCount, value: bestVal, type: 'normal', emoji: '🎯', label: bestCount + '个' + bestVal, score: bestCount };
};

// 计算某个点数的实际数量（用于开盅结算）
const countFace = (dice: number[], face: number, oneSealed: boolean): number => {
  const counts = [0, 0, 0, 0, 0, 0, 0];
  for (const d of dice) counts[d]++;
  
  if (face === 1) return counts[1]; // 数1的数量
  
  // 数face的数量 + 1是否万能
  let total = counts[face];
  if (!oneSealed && counts[1] > 0) {
    total += counts[1]; // 1号万能，可以当face用
  }
  return total;
};'''

c = c.replace(old_calc, new_calc)

# ============================================================
# 核心2: 添加 oneSealed 状态（封1）
# ============================================================
old_states = '''  const [tempBidFace, setTempBidFace] = useState(0); // 叫牌临时选的数字
  const [tempBidCount, setTempBidCount] = useState(0); // 叫牌临时选的数量'''
new_states = old_states + '''
  const [oneSealed, setOneSealed] = useState(false); // 1号是否被封（第一次叫人后封1）'''
c = c.replace(old_states, new_states)

# ============================================================
# 核心3: 封1逻辑 - 第一次叫牌时封1
# ============================================================
old_bid_func = '''  const handleBid = useCallback(async (count: number, value: number) => {'''
new_bid_func = '''  // 封1检测: 第一次有人叫牌后，1号封印
  const wasFirstCall = !lastBid;
  
  const handleBid = useCallback(async (count: number, value: number) => {'''
c = c.replace(old_bid_func, new_bid_func)

# ============================================================
# 核心4: 叫牌按钮 - 根据封1状态显示
# ============================================================
# 叫牌面板：未封1时可以叫1-6，封1后只能叫2-6
old_face_buttons = '''                {[1,2,3,4,5,6].map(v => ('''
new_face_buttons = '''                {(!oneSealed ? [1,2,3,4,5,6] : [2,3,4,5,6]).map(v => ('''
c = c.replace(old_face_buttons, new_face_buttons)

# ============================================================
# 核心5: 开盅结算 - 按067规则
# ============================================================
old_open = '''  const handleOpen = useCallback(async (targetName?: string) => {
    if (gameOver) { setErrorMsg('游戏已结束'); return; }
    if (!lastBid) { setErrorMsg('还没人叫牌'); return; }
    // 支持的抢开：任何人都可以随时开任何人
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
    const resultMsg = '🔓 ' + opener + ' 开 ' + target + '！实际有 ' + totalCount + ' 个' + (lastBid.value === 1 ? '1' : lastBid.value);'''

new_open = '''  const handleOpen = useCallback(async (targetName?: string) => {
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
      // 叫牌者赢，开牌者喝
      resultMsg = '🎉 ' + opener + ' 开 ' + target + '！实际 ' + actualCount + '个' + lastBid.value + ' ≥ ' + lastBid.count + '个' + lastBid.value + '，' + opener + ' 喝！';
    } else {
      // 叫牌者吹牛，喝
      resultMsg = '🍺 ' + opener + ' 开 ' + target + '！实际 ' + actualCount + '个' + lastBid.value + ' < ' + lastBid.count + '个' + lastBid.value + '，' + target + ' 喝！';
    }'''

c = c.replace(old_open, new_open)

# 修复结果赋值
c = c.replace(
    "    setSettlingResult(result);",
    "    setResult(resultMsg);\n    setGameOver(true);\n    setPhase('ended');"
)

# 修复广播
old_open_broadcast = '''    broadcastState({ type: 'open', players, gameOver: true, result: resultMsg, opener, target, phase: 'ended' });
    addLog(resultMsg);
    setOpenTargets([]);'''
new_open_broadcast = old_open_broadcast
# 已经在上面对应位置了，不用改

with open(src, 'w', encoding='utf-8') as f:
    f.write(c)

print('Core rules rewritten! Size:', len(c))
