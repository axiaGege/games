import sys
path = r'D:\\WeChatDevTools\\party-games\\app\\game\\067\\page.tsx'
with open(path, 'r', encoding='utf-8-sig') as f:
    content = f.read()
content = content.replace('left: calc(50% + px)', 'left: calc(50% + px)')
content = content.replace('top: calc(50% + px)', 'top: calc(50% + px)')
with open(path, 'w', encoding='utf-8-sig') as f:
    f.write(content)
print('Fixed!')