"""Generate the Leafbound source icon (1024x1024 PNG) without third-party deps.

Run: python scripts/make_icon.py
Then: npx tauri icon src-tauri/app-icon.png
"""
from __future__ import annotations

import math
import struct
import zlib
from pathlib import Path

SIZE = 1024
BG = (0x2F, 0x5D, 0x50)        # deep leaf green
LEAF = (0xF3, 0xEB, 0xDA)      # warm paper
VEIN = (0x2F, 0x5D, 0x50)


def rounded_square(x: float, y: float, r: float) -> bool:
    inset = 64
    lo, hi = inset, SIZE - inset
    if x < lo or x > hi or y < lo or y > hi:
        return False
    cx = min(max(x, lo + r), hi - r)
    cy = min(max(y, lo + r), hi - r)
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r


def leaf(x: float, y: float) -> bool:
    # Rotate 45 degrees around center, then test intersection of two circles.
    cx, cy = SIZE / 2, SIZE / 2
    a = math.radians(-45)
    dx, dy = x - cx, y - cy
    rx = dx * math.cos(a) - dy * math.sin(a)
    ry = dx * math.sin(a) + dy * math.cos(a)
    r = 330
    off = 190
    in_a = (rx - off) ** 2 + ry**2 <= r * r
    in_b = (rx + off) ** 2 + ry**2 <= r * r
    return in_a and in_b


def vein(x: float, y: float) -> bool:
    cx, cy = SIZE / 2, SIZE / 2
    a = math.radians(-45)
    dx, dy = x - cx, y - cy
    rx = dx * math.cos(a) - dy * math.sin(a)
    ry = dx * math.sin(a) + dy * math.cos(a)
    return abs(ry) <= 14 and abs(rx) <= 250


def pixel(x: int, y: int) -> tuple[int, int, int, int]:
    # 2x2 supersampling for soft edges
    acc = [0, 0, 0, 0]
    for sx in (0.25, 0.75):
        for sy in (0.25, 0.75):
            px, py = x + sx, y + sy
            if not rounded_square(px, py, 200):
                continue
            if leaf(px, py) and not vein(px, py):
                c = LEAF
            else:
                c = BG if not leaf(px, py) else VEIN
            acc[0] += c[0]
            acc[1] += c[1]
            acc[2] += c[2]
            acc[3] += 255
    return tuple(v // 4 for v in acc)  # type: ignore[return-value]


def write_png(path: Path) -> None:
    raw = bytearray()
    for y in range(SIZE):
        raw.append(0)  # filter type: none
        for x in range(SIZE):
            raw.extend(pixel(x, y))

    def chunk(tag: bytes, body: bytes) -> bytes:
        return struct.pack(">I", len(body)) + tag + body + struct.pack(">I", zlib.crc32(tag + body) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", SIZE, SIZE, 8, 6, 0, 0, 0)
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(bytes(raw), 9)) + chunk(b"IEND", b"")
    path.write_bytes(png)


if __name__ == "__main__":
    out = Path(__file__).resolve().parent.parent / "src-tauri" / "app-icon.png"
    write_png(out)
    print(f"wrote {out}")
