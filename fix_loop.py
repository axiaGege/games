import sys
sys.stdout.reconfigure(encoding='utf-8')

src = r'D:\WeChatDevTools\party-games\app\game\067\page.tsx'
with open(src, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# 删除顶层的 wasFirstCall
del lines[368]  # "// 封1检测..."
del lines[368]  # "const wasFirstCall..."

# 在 handleBid 内部添加 wasFirstCall
for i in range(368, 380):
    if i < len(lines) and 'setErrorMsg' in lines[i] and '还没轮到你' in lines[i]:
        lines.insert(i, '    const wasFirstCall = !lastBid;\n')
        break

with open(src, 'w', encoding='utf-8') as f:
    f.writelines(lines)
print('Fixed infinite loop')
