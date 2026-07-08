# Extract per-work tone palettes for The Atelier's relight system.
# Quantizes each salon webp, scores colors by coverage x saturation, prints
# hex triples [deep-wall, mid-ambient, glow] to paste into COLLECTION.
import glob, os, colorsys
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SALON = os.path.join(HERE, "web", "salon")

def tones(path):
    im = Image.open(path).convert("RGB")
    im.thumbnail((160, 160))
    q = im.quantize(colors=6, method=Image.MEDIANCUT).convert("RGB")
    counts = {}
    for c in q.getdata():
        counts[c] = counts.get(c, 0) + 1
    total = sum(counts.values())
    scored = []
    for (r, g, b), n in counts.items():
        h, l, s = colorsys.rgb_to_hls(r/255, g/255, b/255)
        cover = n / total
        scored.append({"rgb": (r, g, b), "h": h, "l": l, "s": s,
                       "cover": cover, "score": cover * (0.25 + s)})
    scored.sort(key=lambda x: -x["score"])
    # glow: the most saturated-bright of the top colors
    glow = max(scored[:4], key=lambda x: x["s"] * (0.3 + x["l"]))
    # deep wall: dominant color, darkened well below wall-legibility
    dom = scored[0]
    def shade(rgb, l_target, s_mul=1.0):
        h, l, s = colorsys.rgb_to_hls(*[v/255 for v in rgb])
        r, g, b = colorsys.hls_to_rgb(h, l_target, min(1, s * s_mul))
        return "#%02x%02x%02x" % (round(r*255), round(g*255), round(b*255))
    deep = shade(dom["rgb"], 0.075, 0.9)     # near-black wall wash
    mid  = shade(dom["rgb"], 0.16, 0.85)     # ambient penumbra
    gl   = shade(glow["rgb"], 0.58, 1.1)     # lamp glow accent
    return deep, mid, gl

if __name__ == "__main__":
    for f in sorted(glob.glob(os.path.join(SALON, "*.webp"))):
        d, m, g = tones(f)
        print(f"{os.path.basename(f)[:-5]}: tone:['{d}','{m}','{g}'],")
