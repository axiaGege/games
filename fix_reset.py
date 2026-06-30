import sys
sys.stdout.reconfigure(encoding='utf-8')

src = r'D:\WeChatDevTools\party-games\app\game\067\page.tsx'
with open(src, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# 在 447 行（空行）后插入 handleReset 函数头
insert_lines = [
    '  // ==================== 重置游戏 ====================\n',
    '  const handleReset = useCallback(async () => {\n',
    '    if (!isCreator) { setErrorMsg("只有房主可以重置"); return; }\n',
]

for i, new_line in enumerate(insert_lines):
    lines.insert(448 + i, new_line)

with open(src, 'w', encoding='utf-8') as f:
    f.writelines(lines)

print('handleReset restored')
