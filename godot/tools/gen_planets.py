# -*- coding: utf-8 -*-
"""生成四颗星球贴图：月亮、木星、两颗系外行星。等距柱状 1024x512。"""
import os
import numpy as np
from PIL import Image

W, H = 1024, 512
OUT = r'F:\job\oc-game\godot\assets\planets'
os.makedirs(OUT, exist_ok=True)

lat = np.linspace(90, -90, H)[:, None] * np.pi / 180.0
LAT = np.repeat(lat, W, axis=1)
LATU = (0.5 - LAT / np.pi)


def fbm(h, w, beta=2.6, seed=0):
    """环面（经度无缝）分形噪声，均值 0 方差 1。"""
    rng = np.random.default_rng(seed)
    white = rng.normal(size=(h, w))
    F = np.fft.fft2(white)
    fy = np.fft.fftfreq(h)[:, None]
    fx = np.fft.fftfreq(w)[None, :]
    rad = np.sqrt(fx ** 2 + fy ** 2)
    rad[0, 0] = 1.0
    filt = rad ** (-beta / 2.0)
    filt[0, 0] = 0.0
    n = np.real(np.fft.ifft2(F * filt))
    return (n - n.mean()) / (np.std(n) + 1e-9)


def smoothstep(x, a, b):
    t = np.clip((x - a) / (b - a + 1e-9), 0, 1)
    return t * t * (3 - 2 * t)


def palette(t, stops):
    pos = np.array([s[0] for s in stops], dtype=np.float64)
    cols = np.array([s[1] for s in stops], dtype=np.float64)
    out = np.empty(t.shape + (3,), dtype=np.float64)
    for c in range(3):
        out[..., c] = np.interp(t, pos, cols[:, c])
    return out


def craters(img, count, rmin, rmax, seed=0, soft=1.0):
    rng = np.random.default_rng(seed)
    hh, ww = img.shape[:2]
    made = 0
    guard = 0
    while made < count and guard < count * 20:
        guard += 1
        u = rng.random()
        v = rng.random()
        latv = (0.5 - v) * np.pi
        if abs(np.degrees(latv)) > 72:
            continue
        cx = int(u * ww)
        cy = int(v * hh)
        rad = int(rng.uniform(rmin, rmax))
        rlat = max(0.20, float(np.cos(latv)))
        rx = max(2, int(rad / rlat))
        ry = max(2, rad)
        y0, y1 = max(0, cy - ry), min(hh, cy + ry)
        x0, x1 = max(0, cx - rx), min(ww, cx + rx)
        if y1 <= y0 or x1 <= x0:
            continue
        yy, xx = np.mgrid[y0:y1, x0:x1]
        d = np.sqrt(((xx - cx) / float(rx)) ** 2 + ((yy - cy) / float(ry)) ** 2)
        seg = img[y0:y1, x0:x1]
        floor = 1.0 - 0.10 * smoothstep(d, 0.0, 0.85) * soft
        rim = 1.0 + 0.10 * np.exp(-((d - 0.95) ** 2) / 0.02) * soft
        seg *= (floor * rim)[..., None]
        made += 1


def save(arr, name):
    arr = np.clip(arr, 0, 1)
    Image.fromarray((arr * 255).astype(np.uint8)).save(os.path.join(OUT, name))
    print(name, arr.shape)


# ---------------- 月亮 ----------------
n_fine = fbm(H, W, 2.2, seed=11)
n_med = fbm(H, W, 3.0, seed=12)
maria_raw = fbm(H, W, 4.2, seed=13)
# 自相似叠加，做出大片低洼
maria_raw = maria_raw * 0.7 + fbm(H, W, 5.4, seed=14) * 0.3
maria = smoothstep(maria_raw, 0.35, 1.35)

grey = 0.615 + 0.055 * n_fine + 0.030 * n_med
moon = np.stack([grey, grey * 0.985, grey * 0.955], axis=-1)
moon *= (1.0 - 0.36 * maria[..., None])
moon += (0.018 * n_fine * (1 - maria))[..., None]
craters(moon, 300, 2, 6, seed=21, soft=0.50)
craters(moon, 34, 9, 24, seed=22, soft=1.0)
moon += np.random.default_rng(31).normal(0, 0.007, (H, W, 3))
save(moon, 'moon.png')

# ---------------- 木星 ----------------
warp = fbm(H, W, 3.2, seed=41)
warp2 = fbm(H, W, 4.6, seed=42)
t = np.sin(LAT * 8.2 + warp * 1.9 + warp2 * 0.7) * 0.5 + 0.5
t2 = np.sin(LAT * 19.0 + warp2 * 2.6) * 0.5 + 0.5
t = np.clip(t * 0.78 + t2 * 0.22, 0, 1)

jup = palette(t, [
    (0.00, (0.52, 0.40, 0.30)),
    (0.18, (0.70, 0.56, 0.40)),
    (0.35, (0.88, 0.82, 0.70)),
    (0.55, (0.80, 0.68, 0.50)),
    (0.72, (0.90, 0.85, 0.75)),
    (0.88, (0.66, 0.50, 0.36)),
    (1.00, (0.55, 0.42, 0.31)),
])
jup *= (0.96 + 0.08 * (0.5 + 0.5 * np.sin(LAT * 46 + warp * 5.0)))[..., None]

lon_u = np.linspace(0, 1, W)[None, :]
gx, gy = 0.60, 0.5 + (-22 / 180.0)
dx = (lon_u - gx) * 1.55
dy = (LATU - gy) / 0.085
d2 = dx ** 2 + dy ** 2
spot = smoothstep(d2, 1.0, 0.35)
collar = smoothstep(d2, 2.2, 1.1) * (1 - spot)
jup = jup * (1 - 0.55 * collar[..., None]) + np.array([0.86, 0.80, 0.70]) * 0.55 * collar[..., None]
jup = jup * (1 - 0.92 * spot[..., None]) + np.array([0.72, 0.33, 0.22]) * 0.92 * spot[..., None]
jup += np.random.default_rng(51).normal(0, 0.009, (H, W, 3))
save(jup, 'jupiter.png')

# ---------------- 系外行星 A：青蓝海洋 ----------------
elev = fbm(H, W, 2.4, seed=61) * 0.75 + fbm(H, W, 3.6, seed=62) * 0.25
elev = (elev - elev.mean()) / (elev.std() + 1e-9)
sea = 0.55
depth = smoothstep(-elev, 0.0, 1.6)
land_h = smoothstep(elev, sea, sea + 1.7)

ocean = palette(np.clip(depth, 0, 1), [
    (0.0, (0.10, 0.34, 0.44)),
    (0.5, (0.06, 0.22, 0.36)),
    (1.0, (0.03, 0.12, 0.24)),
])
ground = palette(np.clip(land_h, 0, 1), [
    (0.0, (0.30, 0.42, 0.26)),
    (0.6, (0.38, 0.36, 0.22)),
    (1.0, (0.55, 0.52, 0.38)),
])
land_mask = smoothstep(elev, sea - 0.05, sea + 0.10)
exo = ocean * (1 - land_mask[..., None]) + ground * land_mask[..., None]

ice = smoothstep(np.abs(LATU - 0.5) * 2.0, 0.80, 0.97)
exo = exo * (1 - 0.85 * ice[..., None]) + np.array([0.88, 0.92, 0.95]) * 0.85 * ice[..., None]

cloud_n = fbm(H, W, 3.4, seed=63)
cloud_a = smoothstep(cloud_n, 0.75, 1.9) * 0.85
cloud_a *= (0.55 + 0.45 * np.sin(LAT * 5.0 + fbm(H, W, 4.0, seed=64) * 2.0))
cloud_a = np.clip(cloud_a, 0, 0.92)
exo = exo * (1 - cloud_a[..., None]) + np.array([0.95, 0.96, 0.98]) * cloud_a[..., None]
exo += np.random.default_rng(65).normal(0, 0.005, (H, W, 3))
save(exo, 'exo_teal.png')

# ---------------- 系外行星 B：紫红气态 ----------------
wb = fbm(H, W, 3.0, seed=71)
wb2 = fbm(H, W, 4.2, seed=72)
u = np.sin(LAT * 6.5 + wb * 2.2) * 0.5 + 0.5
u2 = np.sin(LAT * 15.0 + wb2 * 3.4) * 0.5 + 0.5
u = np.clip(u * 0.72 + u2 * 0.28, 0, 1)

vio = palette(u, [
    (0.00, (0.20, 0.08, 0.26)),
    (0.22, (0.36, 0.14, 0.40)),
    (0.45, (0.52, 0.20, 0.48)),
    (0.66, (0.70, 0.34, 0.54)),
    (0.85, (0.80, 0.48, 0.62)),
    (1.00, (0.92, 0.68, 0.76)),
])
vio *= (0.94 + 0.10 * (0.5 + 0.5 * np.sin(LAT * 38 + wb * 6.0)))[..., None]
haze = smoothstep(np.abs(LATU - 0.5) * 2.0, 0.55, 0.95)
vio = vio * (1 - 0.35 * haze[..., None]) + np.array([0.72, 0.62, 0.78]) * 0.35 * haze[..., None]
vio += np.random.default_rng(73).normal(0, 0.008, (H, W, 3))
save(vio, 'exo_violet.png')

print('DONE planets')
