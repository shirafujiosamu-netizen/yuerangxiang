# -*- coding: utf-8 -*-
"""星球贴图 v3：套色版画风。三到四个平涂色阶，去掉写实噪点。

月亮 完人之门 —— 米白纸 + 淡灰坑 + 墨线边
木星 壹祖    —— 米白 / 陶土 / 朱红 三层横带
青星 全能之门 —— 墨青底 + 米白陆块
紫星 势宗    —— 墨紫底 + 朱红带 + 冷白高光
"""
import os
import numpy as np
from PIL import Image

W, H = 1024, 512
OUT = r'F:\job\oc-game\godot\assets\planets'
os.makedirs(OUT, exist_ok=True)

LAT = np.repeat((np.linspace(90, -90, H)[:, None] * np.pi / 180.0), W, axis=1)
LATU = (0.5 - LAT / np.pi)
LON = np.repeat((np.linspace(0, 2 * np.pi, W)[None, :]), H, axis=0)
Y = LATU * 2.0 - 1.0


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


def quantize(v, levels):
    """把 0..1 的值切成 levels 档，返回档位索引（0..levels-1）。"""
    idx = np.floor(np.clip(v, 0, 0.9999) * levels).astype(np.int32)
    return np.clip(idx, 0, levels - 1)


def paint(idx, colors):
    out = np.zeros(idx.shape + (3,), dtype=np.float64)
    for i, c in enumerate(colors):
        m = idx == i
        for k in range(3):
            out[..., k][m] = c[k]
    return out


def grain(shape, amp=0.012, seed=7):
    rng = np.random.default_rng(seed)
    return rng.normal(scale=amp, size=shape + (1,))


def save(arr, name):
    a = np.clip(arr, 0, 1)
    Image.fromarray((a * 255).astype(np.uint8), 'RGB').save(os.path.join(OUT, name))
    print('saved', name, a.shape)


def craters(hgt, count, rmin, rmax, depth, seed):
    rng = np.random.default_rng(seed)
    Wl, Hl = hgt.shape[1], hgt.shape[0]
    for _ in range(count):
        cu = rng.random()
        cv = rng.uniform(0.12, 0.88)          # 避开极点
        r = rng.uniform(rmin, rmax)
        ku = int(1.0 / (r * Wl / (2 * np.pi)))
        du = (LON - cu * 2 * np.pi + np.pi) % (2 * np.pi) - np.pi
        d = np.sqrt((du * np.cos(LAT) / (r * 2 * np.pi / Wl)) ** 2 +
                    ((LATU - cv) * Hl / r) ** 2)
        hgt -= depth * (1.0 - smoothstep(d, 0.0, 1.0)) ** 1.6
        hgt += depth * 0.55 * np.exp(-((d - 1.15) ** 2) / 0.03)
    return hgt


# ---------------- 月亮 ----------------
def moon():
    hgt = fbm(H, W, 3.4, 11) * 0.20
    maria = smoothstep(fbm(H, W, 4.6, 33), 0.55, 1.30)
    hgt -= maria * 0.55
    hgt = craters(hgt, 26, 26, 70, 0.75, 5)
    hgt = craters(hgt, 120, 9, 24, 0.55, 6)
    hgt = craters(hgt, 520, 3, 8, 0.40, 8)

    v = 0.62 + hgt * 0.85
    idx = quantize(v, 4)
    cols = [(0.95, 0.93, 0.87),   # 纸白
            (0.88, 0.86, 0.79),   # 淡灰
            (0.76, 0.74, 0.67),   # 中灰
            (0.60, 0.58, 0.52)]   # 深灰
    img = paint(idx, cols)
    img += grain((H, W), 0.010, 3)
    save(img, 'moon.png')


# ---------------- 木星 ----------------
def jupiter():
    warp = fbm(H, W, 3.8, 21) * 0.55 + fbm(H, W, 5.0, 44) * 0.25
    t = 0.5 + 0.5 * np.sin(Y * 7.2 + warp)

    t = np.where(np.abs(Y) > 0.86, t * 0.55, t)
    idx = quantize(t, 3)

    gx, gy = 0.60, 0.58
    du = (LON / (2 * np.pi) - gx + 0.5) % 1.0 - 0.5
    d = ((du * 3.2) ** 2 + ((LATU - gy) / 0.075) ** 2)
    spot = 1.0 - smoothstep(np.sqrt(d), 0.72, 1.0)

    cols = [(0.96, 0.91, 0.80),   # 米白
            (0.85, 0.63, 0.39),   # 陶土
            (0.63, 0.27, 0.20)]   # 朱红
    img = paint(idx, cols)
    red = np.array([0.66, 0.16, 0.13])
    ink = np.array([0.22, 0.07, 0.06])
    for k in range(3):
        img[..., k] = img[..., k] * (1 - spot) + red[k] * spot
    edge = (spot > 0.06) & (spot < 0.55)
    for k in range(3):
        img[..., k][edge] = img[..., k][edge] * 0.45 + ink[k] * 0.55
    img += grain((H, W), 0.008, 5)
    save(img, 'jupiter.png')


# ---------------- 青蓝异星 ----------------
def exo_teal(cap_color=(0.82, 0.80, 0.74)):
    base = fbm(H, W, 3.2, 71) * 0.9 + fbm(H, W, 4.4, 72) * 0.4
    land = smoothstep(base, 0.42, 0.62)
    land = smoothstep(np.clip(land * 1.15, 0, 1), 0.35, 0.75)

    sea_idx = quantize(fbm(H, W, 4.2, 81) * 0.5 + 0.5, 2)
    sea = paint(sea_idx, [(0.06, 0.16, 0.17), (0.09, 0.24, 0.25)])
    shore = np.array([0.55, 0.72, 0.68])
    land_col = np.array([0.80, 0.76, 0.62])
    land_dark = np.array([0.62, 0.60, 0.46])

    img = sea.copy()
    m = land > 0.55
    for k in range(3):
        img[..., k][m] = land_col[k]
    m2 = (land > 0.35) & (land <= 0.55)
    for k in range(3):
        img[..., k][m2] = land_dark[k]
    rim = (land > 0.25) & (land <= 0.35)
    for k in range(3):
        img[..., k][rim] = shore[k] * 0.55 + img[..., k][rim] * 0.45

    polar = smoothstep(np.abs(Y), 0.80, 0.97)
    for k in range(3):
        img[..., k] = img[..., k] * (1 - polar * 0.75) + cap_color[k] * polar * 0.75
    img += grain((H, W), 0.008, 9)
    save(img, 'exo_teal.png')


# ---------------- 紫红异星 ----------------
def exo_violet():
    warp = fbm(H, W, 4.0, 91) * 0.9
    t = 0.5 + 0.5 * np.sin(Y * 11.0 + warp)
    t = 0.35 * t + 0.65 * (0.5 + 0.5 * smoothstep(fbm(H, W, 3.4, 92), -0.6, 1.2))
    idx = quantize(t, 4)
    cols = [(0.09, 0.05, 0.11),    # 墨
            (0.24, 0.09, 0.18),    # 暗紫
            (0.48, 0.13, 0.23),    # 朱紫
            (0.82, 0.76, 0.72)]    # 冷白
    img = paint(idx, cols)
    glow = smoothstep(np.abs(Y), 0.72, 1.0) * 0.6
    for k in range(3):
        img[..., k] = img[..., k] * (1 - glow) + np.array([0.72, 0.30, 0.34])[k] * glow
    img += grain((H, W), 0.007, 12)
    save(img, 'exo_violet.png')


moon()
jupiter()
exo_teal()
exo_violet()
print('done')
