#!/usr/bin/env python3
"""Candidate works from an artist's own Bluesky posts (public AppView API, no login).

    python3 build/bsky.py find "name" ["other name" ...]      # search accounts
    python3 build/bsky.py feed HANDLE OUT.json [--max 300]     # images from own posts

Only the artist's own posts count (reposts are skipped). Each image becomes a candidate
{img: feed_fullsize URL, th: feed_thumbnail URL, src: post URL, alt, t (first line of
post text), w, h}. The account itself must be confirmed as official separately
(linked from the artist's site / known handle) before anything is used.
"""
import json, re, sys, time, urllib.parse, urllib.request

API = 'https://public.api.bsky.app/xrpc/'


def call(method, **q):
    url = API + method + '?' + urllib.parse.urlencode(q, doseq=True)
    for attempt in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'SalonGalleryResearch/1.0'}), timeout=30) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503) and attempt < 3:
                time.sleep(3 * (attempt + 1)); continue
            raise
        except (TimeoutError, OSError):
            if attempt < 3:
                time.sleep(3 * (attempt + 1)); continue
            raise


def find(q):
    j = call('app.bsky.actor.searchActors', q=q, limit=8)
    out = []
    for a in j.get('actors', []):
        p = call('app.bsky.actor.getProfile', actor=a['did'])
        out.append({'handle': a['handle'], 'name': a.get('displayName', ''), 'followers': p.get('followersCount'),
                    'posts': p.get('postsCount'), 'desc': (p.get('description') or '')[:160].replace('\n', ' ')})
    return out


def feed(handle, maxn=300):
    cands, cursor, seen = [], None, 0
    while seen < maxn:
        q = {'actor': handle, 'limit': 100, 'filter': 'posts_with_media'}
        if cursor:
            q['cursor'] = cursor
        j = call('app.bsky.feed.getAuthorFeed', **q)
        for it in j.get('feed', []):
            seen += 1
            if 'reason' in it:            # repost
                continue
            p = it['post']
            if p['author']['handle'] != handle:
                continue
            e = p.get('embed') or {}
            imgs = e.get('images') or (e.get('media') or {}).get('images') or []
            text = (p['record'].get('text') or '').strip()
            first = text.split('\n')[0].strip()
            rkey = p['uri'].split('/')[-1]
            for k, im in enumerate(imgs):
                ar = im.get('aspectRatio') or {}
                cands.append({'img': im['fullsize'], 'th': im.get('thumb'),
                              'src': 'https://bsky.app/profile/%s/post/%s' % (handle, rkey),
                              'alt': im.get('alt') or '', 'text': text[:300], 't': first[:100],
                              'n_in_post': len(imgs), 'k': k, 'posted': p['record'].get('createdAt', '')[:10],
                              'w': ar.get('width'), 'h': ar.get('height')})
        cursor = j.get('cursor')
        if not cursor:
            break
    return cands


if __name__ == '__main__':
    if sys.argv[1] == 'find':
        for q in sys.argv[2:]:
            print('==', q)
            for a in find(q):
                print('  %-34s %-24s f=%s p=%s  %s' % (a['handle'], a['name'][:24], a['followers'], a['posts'], a['desc'][:90]))
    elif sys.argv[1] == 'feed':
        mx = int(sys.argv[sys.argv.index('--max') + 1]) if '--max' in sys.argv else 300
        c = feed(sys.argv[2], mx)
        json.dump(c, open(sys.argv[3], 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
        print(len(c), 'images')
