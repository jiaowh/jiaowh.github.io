# Perspective-crop oil painting photos to the canvas quad.
# Quads: (NW, NE, SE, SW) in full-res source coords (after EXIF transpose).
from PIL import Image, ImageOps
import os, math, sys

SRC = r"c:\Users\Jiaow\Documents\github\jiaowh.github.io\assets\oil"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "warped")
os.makedirs(OUT, exist_ok=True)

QUADS = {
    # salon
    "20250507_190707":   ((115,235),(2570,185),(2930,3830),(215,3835)),
    "20250531_223501":   ((75,245),(2600,235),(2612,3520),(235,3520)),
    "20260325_141413":   ((195,225),(2570,200),(2870,3490),(300,3240)),
    "20260325_141439":   ((65,430),(2770,430),(2830,3840),(95,3820)),
    "20260325_141509":   ((60,150),(2600,130),(2925,3940),(75,3910)),
    "20260325_141522":   ((70,110),(2600,95),(2935,3870),(100,3865)),
    "20260325_191940":   ((140,400),(2580,370),(2650,3960),(150,3980)),
    # series 1
    "1/20241214_153218": ((45,25),(2975,45),(2985,3990),(50,3990)),
    "1/20241214_165958": ((70,55),(2675,40),(2690,3835),(90,3845)),
    "1/20241214_181616": ((110,60),(2620,10),(2620,3830),(80,3825)),
    "1/20241215_172708": ((30,30),(2660,110),(2680,3880),(90,3860)),
    "1/20241218_230248": ((75,30),(2905,50),(2975,3975),(100,3985)),
    "1/20241219_002329": ((25,70),(2650,15),(2680,3890),(60,3870)),
    "1/20250103_143638": ((55,45),(2660,55),(2690,3830),(50,3850)),
    "1/20250403_155609": ((20,130),(2650,120),(2600,3845),(85,3765)),
    # series 2
    "2/20250103_155347": ((20,15),(2935,10),(2960,3970),(45,3975)),
    "2/20250103_161728": ((15,10),(2955,30),(2960,3990),(65,3985)),
    "2/20250112_153332": ((55,25),(2980,55),(2870,3800),(95,3920)),
    "2/20250112_220017": ((20,20),(2990,40),(2955,3925),(75,3970)),
    "2/20250115_151536": ((200,50),(2625,85),(2600,3775),(220,3765)),
    "2/20250531_223542": ((110,95),(2640,40),(2645,3760),(210,3770)),
}

# force common output aspect within a process series so stages align
def quad_aspect(q):
    (nw,ne,se,sw) = q
    w = (math.dist(nw,ne)+math.dist(sw,se))/2
    h = (math.dist(nw,sw)+math.dist(ne,se))/2
    return w/h

def warp(key, q, out_w, out_h, preview=None, final_dir=None, quality=82):
    src = os.path.join(SRC, key.replace("/", os.sep) + ".jpg")
    im = ImageOps.exif_transpose(Image.open(src)).convert("RGB")
    (nw,ne,se,sw) = q
    # PIL QUAD order: UL, LL, LR, UR
    data = (*nw, *sw, *se, *ne)
    out = im.transform((out_w,out_h), Image.QUAD, data, resample=Image.BICUBIC)
    name = key.replace("/","_")
    if preview:
        p = out.copy(); p.thumbnail((460,460))
        p.save(os.path.join(OUT, name + ".webp"), "WEBP", quality=72)
    if final_dir:
        out.save(os.path.join(final_dir, name + ".webp"), "WEBP", quality=quality, method=6)
    return out

if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv)>1 else "preview"
    for key, q in QUADS.items():
        a = quad_aspect(q)
        if key.startswith("1/"): a = 0.699
        if key.startswith("2/"): a = 0.671
        H = 1200; W = int(H*a)
        warp(key, q, W, H, preview=True)
        print(key, "aspect %.3f" % quad_aspect(q))
