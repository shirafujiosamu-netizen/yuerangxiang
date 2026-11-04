# -*- coding: utf-8 -*-
"""生成四颗星球贴图：月亮、木星、两颗系外行星。等距柱状 1024x512。"""
import os
import numpy as np
from PIL import Image, ImageFilter

W, H = 1024, 512
OUT = r'F:\job\oc-game\godot\assets\planets'
os.makedirs(OUT, exist_ok=True)
rng = np.random.default_rng(20261029)

# 网格
lat = (np.linspace(90, -90, H)[:, None] * np.pi / 180.0)
lon = (np.linspace(-180, 180, W)[None, :] * np.pi / 180.0)
LAT = np.repeat(lat, W, axis=1)
LON = np.repeat(lon, H, axis=0)
X = np.cos(LAT) * np.cos(LON)
Y = np.cos(LAT) * np.sin(LON)
Z = np.sin(LAT)


def fbm(shape, octaves=5, base=4.0, seed=0):
    r = np.random.default_rng(seed)
    out = np.zeros(shape, dtype=np.float64)
    amp = 1.0
    total = 0.0
    for o in range(octaves):
        n = r.normal(size=(max(2, shape[0] // 8), max(2, shape[1] // 8)))
        img = Image.fromarray(((n - n.min()) / (np.ptp(n) + 1e-9) * 255).astype(np.uint8))
        img = img.resize((shape[1], shape[0]), Image.BICUBIC)
        out += amp * (np.asarray(img, dtype=np.float64) / 255.0)
        total += amp
        amp *= 0.55
    return out / total


def sphere_uv_to_xyz(u, v):
    """u,v in [0,1) -> unit vector (equirect)."""
    lon_ = (u * 2 - 1) * np.pi
    lat_ = (0.5 - v) * np.pi
    return (np.cos(lat_) * np.cos(lon_), np.cos(lat_) * np.sin(lon_), np.sin(lat_))


def craters(img, count, rmin, rmax, tint=(0.42, 0.41, 0.39), rim=(0.86, 0.85, 0.82)):
    """在等距柱状图上撒陨石坑（处理极区拉伸）。"""
    hh, ww = img.shape[:2]
    for _ in range(count):
        u = rng.random()
        v = rng.random()
        latv = (0.5 - v) * np.pi
        cx = int(u * ww)
        cy = int(v * hh)
        rad = int(rng.uniform(rmin, rmax))
        rlat = max(0.06, float(np.cos(latv)))
        rx = max(1, int(rad / rlat))
        ry = max(1, rad)
        y0 = max(0, cy - ry); y1 = min(hh, cy + ry)
        x0 = max(0, cx - rx); x1 = min(ww, cx + rx)
        if y1 <= y0 or x1 <= x0:
            continue
        yy, xx = np.mgrid[y0:y1, x0:x1]
        d = np.sqrt(((xx - cx) / float(rx)) ** 2 + ((yy - cy) / float(ry)) ** 2)
        seg = img[y0:y1, x0:x1]
        inner = d < 0.72
        seg[inner] = seg[inner] * np.array(tint)
        rim_mask = (d >= 0.72) & (d < 1.0)
        seg[rim_mask] = seg[rim_mask] * 0.45 + np.array(rim) * 0.55


def save(arr, name):
    arr = np.clip(arr, 0, 1)
    Image.fromarray((arr * 255).astype(np.uint8)).save(os.path.join(OUT, name))
    print(name, arr.shape)


# ---------------- 月亮 ----------------
n1 = fbm((H, W), 6, seed=11)
n2 = fbm((H, W), 4, seed=12)
base = np.stack([0.60 + 0.10 * n1, 0.585 + 0.10 * n1, 0.555 + 0.10 * n1], axis=-1)
# 月海
maria = (n2 > 0.62).astype(np.float64)
maria = np.asarray(Image.fromarray((maria * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(18)), dtype=np.float64) / 255.0
base *= (1.0 - 0.30 * maria[..., None])
# 细微颗粒
grain = rng.normal(0, 0.012, (H, W, 1))
base += grain
craters(base, 260, 3, 22)
craters(base, 40, 10, 40)
save(base, 'moon.png')

# ---------------- 木星 ----------------
bands = np.sin(LAT * 9.0 + 0.6 * fbm((H, W), 4, seed=21)) * 0.5 + 0.5
turb = fbm((H, W), 5, seed=22)
bands = np.clip(bands * 0.75 + turb * 0.35, 0, 1)
palette = np.array([
    [0.86, 0.78, 0.64],
    [0.78, 0.66, 0.48],
    [0.62, 0.47, 0.34],
    [0.88, 0.82, 0.70],
    [0.45, 0.33, 0.25],
])
idx = (bands * (len(palette) - 1)).astype(np.int32)
jup = palette[idx]
# 大红斑
gx, gy = 0.62, 0.66
d = ((LON / np.pi + 1) * 0.5 - gx) ** 2 / 0.010 + ((0.5 - LAT / np.pi) - gy) ** 2 / 0.004
spot = np.clip(1.0 - d, 0, 1)[..., None]
jup = jup * (1 - 0.85 * spot) + np.array([0.62, 0.28, 0.18]) * 0.85 * spot
jup += rng.normal(0, 0.008, (H, W, 3))
save(jup, 'jupiter.png')

# ---------------- 系外行星 A：青蓝海洋 ----------------
na = fbm((H, W), 6, seed=31)
nb = fbm((H, W), 5, seed=32)
swirl = np.sin(LAT * 6.0 + 2.4 * nb) * 0.5 + 0.5
ocean = np.array([0.05, 0.20, 0.34])
shallow = np.array([0.10, 0.42, 0.52])
land = np.array([0.28, 0.40, 0.24])
cloud = np.array([0.90, 0.93, 0.96])
h = na * 0.7 + swirl * 0.3
exo = np.where((h > 0.66)[..., None], land[None, None, :], ocean[None, None, :])
exo = np.where(((h > 0.58) & (h <= 0.66))[..., None], shallow[None, None, :], exo)
cl = np.clip((nb - 0.60) * 3.2, 0, 1)[..., None]
exo = exo * (1 - cl * 0.85) + cloud * cl * 0.85
save(exo, 'exo_teal.png')

# ---------------- 系外行星 B：紫红 ----------------
nc = fbm((H, W), 6, seed=41)
nd = fbm((H, W), 4, seed=42)
band2 = np.clip((np.sin(LAT * 7.0 + 1.8 * nd) * 0.5 + 0.5) * 0.8 + nc * 0.3, 0, 1)
pal2 = np.array([
    [0.26, 0.10, 0.30],
    [0.45, 0.18, 0.46],
    [0.62, 0.26, 0.52],
    [0.78, 0.42, 0.58],
    [0.38, 0.12, 0.34],
])
exo2 = pal2[(band2 * (len(pal2) - 1)).astype(np.int32)]
glow = np.clip(np.abs(LAT) - 0.9, 0, 1)[..., None]
exo2 = exo2 * (1 - glow * 0.5) + np.array([0.85, 0.55, 0.75]) * glow * 0.5
exo2 += rng.normal(0, 0.008, (H, W, 3))
save(exo2, 'exo_violet.png')

print('DONE planets')
