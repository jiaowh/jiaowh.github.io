"""Hoki Museum exhibition pages → (image, caption) pairs naming the artist.
Bounded crawl of the public category listings; no API use (the API is 403)."""
import json, re, sys, os, html as H
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from research import get
ARTISTS = {'森本草介': 'Sōsuke Morimoto', '島村信之': 'Nobuyuki Shimamura', '生島浩': 'Hiroshi Ikushima', '三重野慶': 'Kei Mieno',
           '山本大貴': 'Hiroki Yamamoto', '小木曽誠': 'Makoto Ogiso', '本木ひかり': 'Hikari Motoki', '松永瑠利子': 'Ruriko Matsunaga'}
pages = set()
for cat in ('exhibition', 'permanent-exhibition'):
    for n in range(1, 9):
        u = 'https://www.hoki-museum.jp/category/%s/' % cat + ('page/%d/' % n if n > 1 else '')
        try:
            h = get(u)
        except Exception as e:
            break
        for m in re.finditer(r'href="(https://www\.hoki-museum\.jp/(?:exhibition|permanent-exhibition|special_exhibition)/[^"#?]+)"', h):
            pages.add(m.group(1))
print('pages', len(pages), file=sys.stderr)
out = []
for p in sorted(pages):
    try:
        h = get(p)
    except Exception:
        continue
    body = h[h.find('<body'):]
    parts = re.split(r'(<img\b[^>]*>)', body)
    for i in range(1, len(parts), 2):
        tag = parts[i]
        src = re.search(r'\bsrc="([^"]+)"', tag)
        if not src or 'wp-content/uploads' not in src.group(1):
            continue
        ss = re.findall(r'(https://[^\s,"]+) (\d+)w', tag)
        best = max(ss, key=lambda x: int(x[1]))[0] if ss else src.group(1)
        alt = (re.search(r'\balt="([^"]*)"', tag) or [None, ''])[1]
        after = re.sub(r'<[^>]+>', ' ', parts[i + 1] if i + 1 < len(parts) else '')
        after = H.unescape(re.sub(r'\s+', ' ', after)).strip()[:160]
        text = alt + ' ' + after
        for jp, en in ARTISTS.items():
            if jp in text[:120]:
                t = re.search(r'[《『「]([^》』」]+)[》』」]', text)
                y = re.search(r'((?:19|20)\d\d)\s*年', text)
                out.append({'n': en, 'img': best, 'src': p, 'alt': text[:120], 't': t.group(1) if t else None, 'y': y.group(1) if y else None})
                break
json.dump(out, open(sys.argv[1], 'w'), ensure_ascii=False, indent=0)
from collections import Counter
print(Counter(x['n'] for x in out))
