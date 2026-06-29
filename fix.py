import sys
path = r'D:\\WeChatDevTools\\party-games\\app\\game\\067\\page.tsx'
with open(path, 'r', encoding='utf-8-sig') as f:
    lines = f.readlines()
d = chr(36)
ob = chr(123)
cb = chr(125)
for i, line in enumerate(lines):
    if 'left: calc(50% +' in line and 'px)' in line:
        lines[i] = line.replace('px', d + ob + 'x' + cb + 'px')
    if 'top: calc(50% +' in line and 'px)' in line:
        lines[i] = line.replace('px', d + ob + 'y' + cb + 'px')
with open(path, 'w', encoding='utf-8-sig') as f:
    f.writelines(lines)
print('Fixed!')
