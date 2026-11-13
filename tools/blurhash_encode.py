"""Make BlurHash strings for images (the blurred preview shown while a picture loads).
Usage:  python tools/blurhash_encode.py videos/some-thumbnail.jpg [more images...]
Paste the printed hash into the image's tag as data-blurhash="...", e.g.
    <video poster="../videos/x.jpg" data-blurhash="L9AB*A%L00t7..."> or <img src="x.jpg" data-blurhash="...">
ux.js turns it into the preview. Needs Pillow + numpy."""
import math
import sys

import numpy as np
from PIL import Image

B83 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz#$%*+,-.:;=?@[]^_{|}~"


def e83(value, length):
    return "".join(B83[(value // 83 ** (length - i - 1)) % 83] for i in range(length))


def to_linear(v):
    v = v / 255.0
    return np.where(v <= 0.04045, v / 12.92, ((v + 0.055) / 1.055) ** 2.4)


def to_srgb(v):
    v = max(0.0, min(1.0, v))
    return int(v * 12.92 * 255 + 0.5) if v <= 0.0031308 else int((1.055 * v ** (1 / 2.4) - 0.055) * 255 + 0.5)


def sign_pow(v, e):
    return math.copysign(abs(v) ** e, v)


def encode(path, cx=4, cy=3):
    img = Image.open(path).convert("RGB")
    img.thumbnail((64, 64))
    px = to_linear(np.asarray(img, dtype=np.float64))
    h, w, _ = px.shape
    xs, ys = np.arange(w), np.arange(h)
    factors = []
    for j in range(cy):
        for i in range(cx):
            basis = np.outer(np.cos(math.pi * j * ys / h), np.cos(math.pi * i * xs / w))
            norm = 1 if (i == 0 and j == 0) else 2
            factors.append([norm * float((basis * px[:, :, c]).sum()) / (w * h) for c in range(3)])
    dc, ac = factors[0], factors[1:]
    out = e83((cx - 1) + (cy - 1) * 9, 1)
    if ac:
        actual = max(abs(v) for f in ac for v in f)
        q = int(max(0, min(82, math.floor(actual * 166 - 0.5))))
        maxv = (q + 1) / 166
        out += e83(q, 1)
    else:
        maxv = 1
        out += e83(0, 1)
    out += e83((to_srgb(dc[0]) << 16) + (to_srgb(dc[1]) << 8) + to_srgb(dc[2]), 4)
    for f in ac:
        qs = [int(max(0, min(18, math.floor(sign_pow(v / maxv, 0.5) * 9 + 9.5)))) for v in f]
        out += e83(qs[0] * 19 * 19 + qs[1] * 19 + qs[2], 2)
    return out


if __name__ == "__main__":
    for p in sys.argv[1:]:
        print(encode(p), p)
