# Register process stages within each series: find scale+shift per stage
# (relative to the final stage) that minimizes MSE, then bake into quads.
import numpy as np, glob, math
from PIL import Image, ImageFilter

def load(f, h=360):
    im = Image.open(f).convert("L")
    w = int(im.width * h / im.height)
    im = im.resize((w, h)).filter(ImageFilter.GaussianBlur(2))
    a = np.asarray(im, dtype=np.float32)
    a = (a - a.mean()) / (a.std() + 1e-6)
    return a

def sample(a, s, dx, dy, w, h):
    # sample a at scale s around center, shifted by dx,dy; output w×h grid
    H, W = a.shape
    ys = (np.arange(h) - h/2) / s + H/2 + dy
    xs = (np.arange(w) - w/2) / s + W/2 + dx
    ys = np.clip(ys, 0, H-1).astype(int)
    xs = np.clip(xs, 0, W-1).astype(int)
    return a[np.ix_(ys, xs)]

def register(ref, mov):
    h, w = ref.shape
    # central window (figure region), avoid edges
    cy, cx = slice(h//8, h*7//8), slice(w//8, w*7//8)
    refc = ref[cy, cx]
    best = (1e18, 1.0, 0, 0)
    for s in np.arange(0.90, 1.105, 0.01):
        for dy in range(-30, 31, 3):
            for dx in range(-30, 31, 3):
                m = sample(mov, s, dx, dy, w, h)[cy, cx]
                e = np.mean((refc - m)**2)
                if e < best[0]: best = (e, s, dx, dy)
    # refine
    _, s0, dx0, dy0 = best
    for s in np.arange(s0-0.008, s0+0.009, 0.004):
        for dy in range(dy0-3, dy0+4):
            for dx in range(dx0-3, dx0+4):
                m = sample(mov, s, dx, dy, w, h)[cy, cx]
                e = np.mean((refc - m)**2)
                if e < best[0]: best = (e, s, dx, dy)
    return best

if __name__ == "__main__":
    for series in ["1", "2"]:
        files = sorted(glob.glob(f"warped/{series}_*.webp"))
        ref = load(files[-1])
        h, w = ref.shape
        print(f"# series {series} ref={files[-1]} grid {w}x{h}")
        for f in files[:-1]:
            mov = load(f)
            e, s, dx, dy = register(ref, mov)
            # content transform in normalized units (relative to output size)
            print(f"{f}: scale={s:.3f} dx={dx/w:+.4f} dy={dy/h:+.4f} err={e:.3f}")
