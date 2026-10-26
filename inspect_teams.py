with open(r'C:\Users\j2cha\AppData\Local\Temp\1792982368482-copilot-tool-output-9326867cb0304b72ad0809fb6c8144b8.txt', 'r', encoding='utf-8') as f:
    content = f.read()

import re
urls = re.findall(r'https?://[^"\'\s]+', content)
print('URLs found:', len(urls))
for u in urls[:30]:
    print(u)

if '1177' in content:
    print('Found 1177 in content')
else:
    print('1177 NOT FOUND')

matches = [(m.start(), content[m.start()-20:m.start()+50]) for m in re.finditer('team', content, re.IGNORECASE)]
print('team occurrences:', len(matches))
