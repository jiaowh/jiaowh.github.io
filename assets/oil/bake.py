# Register consecutive process stages, chain transforms to the final stage,
# bake aligned quads with a common inset, and emit verification blends.
import numpy as np, glob, os
from PIL import Image, ImageOps
from align import load, register
from warp import QUADS, SRC

def bilerp(quad, u, v):
    # quad = (NW, NE, SE, SW) mapping unit square -> source coords
    nw, ne, se, sw = quad
    top = (nw[0] + (ne[0]-nw[0])*u, nw[1] + (ne[1]-nw[1])*u)
    bot = (sw[0] + (se[0]-sw[0])*u, sw[1] + (se[1]-sw[1])*u)
    return (top[0] + (bot[0]-top[0])*v, top[1] + (bot[1]-top[1])*v)

def run(series, aspect, H=1600, outdir="aligned"):
    os.makedirs(outdir, exist_ok=True)
    keys = sorted(k for k in QUADS if k.startswith(series + "/"))
    files = [f"warped/{k.replace('/','_')}.webp" for k in keys]
    ims = [load(f) for f in files]
    # consecutive registration: L[i] maps stage i+1 frame -> stage i frame
    S = [1.0]; Dx = [0.0]; Dy = [0.0]  # composed transform per stage, final=identity
    trans = []
    for i in range(len(ims)-1):
        e, s, dx, dy = register(ims[i+1], ims[i])
        h, w = ims[i+1].shape
        trans.append((s, dx/w, dy/h, e))
        print(f"  {keys[i]} -> {keys[i+1]}: s={s:.3f} dx={dx/w:+.4f} dy={dy/h:+.4f} err={e:.3f}")
    # compose from final backwards: A_k = L_k o A_{k+1}
    comp = [(1.0, 0.0, 0.0)] * len(ims)
    for i in range(len(ims)-2, -1, -1):
        Sn, Dxn, Dyn = comp[i+1]
        sL, dxL, dyL = trans[i][:3]
        comp[i] = (Sn*sL, Dxn/sL + dxL, Dyn/sL + dyL)
    # inset: max overflow of transformed unit-square corners
    over = 0.0
    for (s, dx, dy) in comp:
        for (u, v) in [(0,0),(1,0),(1,1),(0,1)]:
            uu = (u-0.5)/s + 0.5 + dx
            vv = (v-0.5)/s + 0.5 + dy
            over = max(over, -uu, uu-1, -vv, vv-1)
    m = min(over + 0.008, 0.10)
    print(f"  inset m={m:.3f}")
    W = int(H * aspect)
    outs = []
    for k, (s, dx, dy) in zip(keys, comp):
        q = QUADS[k]
        corners = []
        for (u, v) in [(0,0),(0,1),(1,1),(1,0)]:  # PIL QUAD order UL,LL,LR,UR
            uu = (m + u*(1-2*m) - 0.5)/s + 0.5 + dx
            vv = (m + v*(1-2*m) - 0.5)/s + 0.5 + dy
            corners.extend(bilerp(q, uu, vv))
        src = os.path.join(SRC, k.replace("/", os.sep) + ".jpg")
        im = ImageOps.exif_transpose(Image.open(src)).convert("RGB")
        out = im.transform((W, H), Image.QUAD, tuple(corners), resample=Image.BICUBIC)
        name = k.replace("/", "_") + ".webp"
        out.save(os.path.join(outdir, name), "WEBP", quality=82, method=6)
        outs.append(out)
        print(f"  wrote {name} comp s={s:.3f} dx={dx:+.4f} dy={dy:+.4f}")
    # verification blend sheet
    small = [o.copy() for o in outs]
    for o in small: o.thumbnail((300, 300))
    w2, h2 = small[0].size
    sheet = Image.new("RGB", ((w2+8)*(len(small)-1)+8, h2+8), (30,30,30))
    for i in range(len(small)-1):
        sheet.paste(Image.blend(small[i], small[i+1], 0.5), (8+(w2+8)*i, 4))
    sheet.save(f"blend/aligned{series}.png")

if __name__ == "__main__":
    print("series 1"); run("1", 0.699)
    print("series 2"); run("2", 0.671)
