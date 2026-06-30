import sys
sys.stdout.reconfigure(encoding='utf-8')

src = r'D:\WeChatDevTools\party-games\app\game\067\page.tsx'
with open(src, 'r', encoding='utf-8') as f:
    c = f.read()

# 修复1: 状态恢复时不要广播，避免循环
old_restore = '''        addLog('\U0001f504 已恢复上次状态');
        broadcastState({ type: 'update', players: state.players, phase: state.phase });'''
new_restore = '''        addLog('\U0001f504 已恢复上次状态');'''
c = c.replace(old_restore, new_restore)

# 修复2: 保存状态到 sessionStorage 时不要包含 players（避免保存->恢复->保存循环）
old_save = '''  useEffect(() => {
    if (!joined || !roomId) return;
    const state = {
      players,
      phase,'''
new_save = '''  useEffect(() => {
    if (!joined || !roomId || !gameStarted) return;
    const state = {
      players,'''
c = c.replace(old_save, new_save)

with open(src, 'w', encoding='utf-8') as f:
    f.write(c)
print('Fixed infinite loops')
