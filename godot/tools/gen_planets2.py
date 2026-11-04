# -*- coding: utf-8 -*-
"""四颗星球贴图 v2：月亮、木星、青蓝海洋行星、紫红气态行星。"""
import os
import numpy as np
from PIL import Image, ImageFilter

W, H = 1024, 512
OUT = r'F:\job\oc-game\godot\assets\planets'
os.makedirs(OUT, exist_ok=True)

LAT = np.repeat((np.linspace(90, -90, H)[:, None] * np.pi / 180.0), W, axis=1)
LATU = (0.5 - LAT / np.pi)
Y = LATU * 2.0 - 1.0                      # -1 南 -> 1 北


def fbm(h, w, beta=2.6, seed=0):
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


def blur2d(arr, radius):
    """对 HxWx3 数组做高斯模糊。"""
    img = Image.fromarray((np.clip(arr, 0, 1) * 255).astype(np.uint8))
    img = img.filter(ImageFilter.GaussianBlur(radius))
    return np.asarray(img, dtype=np.float64) / 255.0


def blur_lat(arr, k):
    """沿纬度方向做简单盒式模糊，让条带过渡柔和（经度方向不动）。"""
    if k <= 1:
        return arr
    pad = k // 2
    padarr = np.concatenate([np.repeat(arr[:1], pad, 0), arr, np.repeat(arr[-1:], pad, 0)], 0)
    kernel = np.ones(k) / k
    if arr.ndim == 3:
        out = np.empty_like(arr)
        for c in range(arr.shape[2]):
            out[..., c] = np.apply_along_axis(lambda m: np.convolve(m, kernel, 'valid'), 0, padarr[..., c])
        return out
    return np.apply_along_axis(lambda m: np.convolve(m, kernel, 'valid'), 0, padarr)


def craters(img, count, rmin, rmax, seed=0, depth=0.16, rim_gain=0.18):
    rng = np.random.default_rng(seed)
    hh, ww = img.shape[:2]
    made, guard = 0, 0
    while made < count and guard < count * 30:
        guard += 1
        u, v = rng.random(), rng.random()
        latv = (0.5 - v) * np.pi
        if abs(np.degrees(latv)) > 70:
            continue
        cx, cy = int(u * ww), int(v * hh)
        rad = int(rng.uniform(rmin, rmax))
        rlat = max(0.25, float(np.cos(latv)))
        rx, ry = max(2, int(rad / rlat)), max(2, rad)
        y0, y1 = max(0, cy - ry), min(hh, cy + ry)
        x0, x1 = max(0, cx - rx), min(ww, cx + rx)
        if y1 <= y0 or x1 <= x0:
            continue
        yy, xx = np.mgrid[y0:y1, x0:x1]
        d = np.sqrt(((xx - cx) / float(rx)) ** 2 + ((yy - cy) / float(ry)) ** 2)
        seg = img[y0:y1, x0:x1]
        floor = 1.0 - depth * (1.0 - smoothstep(d, 0.55, 1.0))
        rim = 1.0 + rim_gain * np.exp(-((d - 1.0) ** 2) / 0.03)
        seg *= (floor * rim)[..., None]
        made += 1


def save(arr, name):
    Image.fromarray((np.clip(arr, 0, 1) * 255).astype(np.uint8)).save(os.path.join(OUT, name))
    print(name)


# ---------------- 月亮 ----------------
base_n = fbm(H, W, 4.0, seed=11) * 0.6 + fbm(H, W, 5.6, seed=12) * 0.4
maria_n = fbm(H, W, 6.2, seed=13) * 0.7 + fbm(H, W, 7.4, seed=14) * 0.3
maria = smoothstep(maria_n, 0.15, 1.15)

grey = 0.635 + 0.020 * base_n
moon = np.stack([grey, grey * 0.99, grey * 0.965], axis=-1)
moon *= (1.0 - 0.30 * maria[..., None])
moon = blur2d(moon, 1.1)
craters(moon, 90, 7, 18, seed=21, depth=0.18, rim_gain=0.20)
craters(moon, 18, 20, 46, seed=22, depth=0.20, rim_gain=0.22)
craters(moon, 240, 2, 5, seed=23, depth=0.12, rim_gain=0.14)
moon += np.random.default_rng(31).normal(0, 0.006, (H, W, 3))
save(moon, 'moon.png')

# ---------------- 木星 ----------------
w1 = fbm(H, W, 4.2, seed=41)
w2 = fbm(H, W, 5.2, seed=42)

band = np.sin(Y * 5.4 + 0.42 * w1) * 0.5 + 0.5
belt = smoothstep(band, 0.68, 0.96)                       # 暗带
zone = smoothstep(band, 0.20, 0.02)                       # 亮区
t = np.clip(band + 0.06 * w2, 0, 1)

jup = palette(t, [
    (0.00, (0.46, 0.33, 0.24)),
    (0.16, (0.66, 0.50, 0.36)),
    (0.38, (0.86, 0.79, 0.66)),
    (0.52, (0.80, 0.66, 0.48)),
    (0.68, (0.92, 0.88, 0.79)),
    (0.84, (0.68, 0.52, 0.37)),
    (1.00, (0.50, 0.37, 0.27)),
])
jup *= (1.0 - 0.16 * belt[..., None]) 
jup += 0.05 * zone[..., None] * np.array([1.0, 0.97, 0.90])
# 细丝流纹
streak = fbm(H, W, 3.4, seed=43)
jup *= (1.0 + 0.045 * streak * np.sin(Y * 46.0))[..., None]
jup = blur_lat(jup, 3)

# 大红斑：紧凑椭圆
lon_u = np.linspace(0, 1, W)[None, :]
gx, gy = 0.62, 0.5 + (-21.0 / 180.0) * 1.0
dx = (lon_u - gx) / 0.075
dy = (LATU - gy) / 0.045
d2 = dx ** 2 + dy ** 2
spot = smoothstep(d2, 1.0, 0.25)
collar = smoothstep(d2, 2.6, 1.15) * (1.0 - spot)
jup = jup * (1 - 0.45 * collar[..., None]) + np.array([0.85, 0.79, 0.68]) * 0.45 * collar[..., None]
jup = jup * (1 - 0.90 * spot[..., None]) + np.array([0.74, 0.34, 0.22]) * 0.90 * spot[..., None]
jup += np.random.default_rng(51).normal(0, 0.007, (H, W, 3))
save(jup, 'jupiter.png')

# ---------------- 青蓝海洋行星 ----------------
elev = fbm(H, W, 5.0, seed=61) * 0.8 + fbm(H, W, 6.4, seed=62) * 0.2
elev = (elev - elev.mean()) / (elev.std() + 1e-9)
sea = 0.30

deep = smoothstep(-elev, 0.0, 2.2)
ocean = palette(np.clip(deep, 0, 1), [
    (0.0, (0.16, 0.44, 0.50)),
    (0.45, (0.07, 0.26, 0.40)),
    (1.0, (0.03, 0.11, 0.22)),
])
land = smoothstep(elev, sea, sea + 1.1)
ground = palette(np.clip(land, 0, 1), [
    (0.0, (0.34, 0.46, 0.28)),
    (0.55, (0.42, 0.40, 0.24)),
    (1.0, (0.58, 0.55, 0.42)),
])
land_mask = smoothstep(elev, sea - 0.03, sea + 0.08)
exo = ocean * (1 - land_mask[..., None]) + ground * land_mask[..., None]

# 极冠（带噪声边缘）
capn = fbm(H, W, 5.0, seed=63) * 0.12
ice = smoothstep(np.abs(LATU - 0.5) * 2.0 + capn, 0.82, 0.99)
exo = exo * (1 - 0.9 * ice[..., None]) + np.array([0.87, 0.92, 0.96]) * 0.9 * ice[..., None]

# 云带：赤道少、中纬多，成丝缕
cl = fbm(H, W, 4.6, seed=64)
lats = np.sin(np.abs(LAT) * 3.2)
cloud_a = smoothstep(cl, 0.55, 1.7) * (0.25 + 0.45 * lats)
cloud_a = np.clip(cloud_a, 0, 0.75)
exo = exo * (1 - cloud_a[..., None]) + np.array([0.96, 0.97, 0.98]) * cloud_a[..., None]
exo += np.random.default_rng(65).normal(0, 0.005, (H, W, 3))
save(exo, 'exo_teal.png')

# ---------------- 紫红气态行星 ----------------
v1 = fbm(H, W, 4.4, seed=71)
v2 = fbm(H, W, 5.6, seed=72)
vb = np.sin(Y * 4.2 + 0.38 * v1) * 0.5 + 0.5
vb2 = np.sin(Y * 11.0 + 0.20 * v2) * 0.5 + 0.5
vt = np.clip(vb * 0.8 + vb2 * 0.2 + 0.05 * v2, 0, 1)

vio = palette(vt, [
    (0.00, (0.16, 0.06, 0.22)),
    (0.20, (0.32, 0.12, 0.38)),
    (0.42, (0.50, 0.19, 0.47)),
    (0.60, (0.68, 0.32, 0.52)),
    (0.78, (0.78, 0.45, 0.60)),
    (1.00, (0.90, 0.66, 0.74)),
])
streak2 = fbm(H, W, 3.8, seed=73)
vio *= (1.0 + 0.05 * streak2 * np.sin(Y * 40.0))[..., None]
vio = blur_lat(vio, 3)
# 高纬淡雾
haze = smoothstep(np.abs(Y), 0.72, 0.98)
vio = vio * (1 - 0.4 * haze[..., None]) + np.array([0.70, 0.60, 0.76]) * 0.4 * haze[..., None]
vio += np.random.default_rng(74).normal(0, 0.006, (H, W, 3))
save(vio, 'exo_violet.png')

print('DONE planets v2')
