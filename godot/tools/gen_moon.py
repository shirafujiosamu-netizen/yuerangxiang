# -*- coding: utf-8 -*-
"""月亮：反照率 + 法线图（环形山做高度场）。"""
import os
import numpy as np
from PIL import Image

W, H = 2048, 1024
OUT = r'F:\job\oc-game\godot\assets\planets'
os.makedirs(OUT, exist_ok=True)

LAT = np.repeat((np.linspace(90, -90, H)[:, None] * np.pi / 180.0), W, axis=1)


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


rng = np.random.default_rng(2026)

# ---------- 高度场 ----------
maria_n = fbm(H, W, 6.4, seed=13) * 0.72 + fbm(H, W, 7.6, seed=14) * 0.28
maria = smoothstep(maria_n, 0.25, 1.45)

hgt = np.zeros((H, W))
hgt -= 0.85 * maria                      # 月海整体低洼
hgt += 0.10 * fbm(H, W, 4.4, seed=15)    # 大尺度起伏


def add_craters(hgt, count, rmin, rmax, seed, depth=1.0, rim=0.55):
    r = np.random.default_rng(seed)
    hh, ww = hgt.shape
    made, guard = 0, 0
    while made < count and guard < count * 40:
        guard += 1
        u, v = r.random(), r.random()
        latv = (0.5 - v) * np.pi
        if abs(np.degrees(latv)) > 78:
            continue
        cx, cy = int(u * ww), int(v * hh)
        rad = int(r.uniform(rmin, rmax))
        rlat = max(0.18, float(np.cos(latv)))
        rx, ry = max(2, int(rad / rlat)), max(2, rad)
        y0, y1 = max(0, cy - ry * 2), min(hh, cy + ry * 2)
        x0, x1 = max(0, cx - rx * 2), min(ww, cx + rx * 2)
        if y1 <= y0 or x1 <= x0:
            continue
        yy, xx = np.mgrid[y0:y1, x0:x1]
        d = np.sqrt(((xx - cx) / float(rx)) ** 2 + ((yy - cy) / float(ry)) ** 2)
        bowl = -(1.0 - smoothstep(d, 0.0, 0.92)) * depth
        ring = np.exp(-((d - 1.02) ** 2) / 0.012) * rim * depth
        hgt[y0:y1, x0:x1] += bowl + ring
        made += 1


add_craters(hgt, 26, 26, 88, seed=31, depth=1.00, rim=0.60)
add_craters(hgt, 130, 10, 26, seed=32, depth=0.85, rim=0.55)
add_craters(hgt, 700, 3, 9, seed=33, depth=0.60, rim=0.40)

# ---------- 反照率 ----------
grain = fbm(H, W, 2.6, seed=41)
alb = 0.640 + 0.030 * grain + 0.045 * hgt
alb *= (1.0 - 0.26 * maria)
alb = np.stack([alb, alb * 0.992, alb * 0.968], axis=-1)
alb += rng.normal(0, 0.004, (H, W, 3))
Image.fromarray((np.clip(alb, 0, 1) * 255).astype(np.uint8)).save(os.path.join(OUT, 'moon.png'))
print('moon.png')

# ---------- 法线 ----------
dh_dy, dh_dx = np.gradient(hgt)
coslat = np.clip(np.cos(LAT), 0.12, 1.0)
sx = dh_dx * (W / (2.0 * np.pi)) / coslat
sy = dh_dy * (H / np.pi)
strength = 0.030
nx = -sx * strength
ny = sy * strength
nz = np.ones_like(nx)
ln = np.sqrt(nx ** 2 + ny ** 2 + nz ** 2)
nrm = np.stack([nx / ln, ny / ln, nz / ln], axis=-1)
img = (nrm * 0.5 + 0.5)
Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8)).save(os.path.join(OUT, 'moon_n.png'))
print('moon_n.png')
