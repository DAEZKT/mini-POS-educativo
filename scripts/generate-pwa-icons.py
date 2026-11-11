"""Render the Mini POS PWA icon variants using only Python's standard library."""

from __future__ import annotations

import math
import struct
import zlib
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public"
SCALE = 3


def png_chunk(kind: bytes, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)


def render(size: int) -> bytes:
    factor = SCALE
    width = height = size * factor
    pixels = bytearray(width * height * 3)

    # Rich purple field, with a soft violet highlight near the upper-right.
    for y in range(height):
        ny = y / (height - 1)
        for x in range(width):
            nx = x / (width - 1)
            glow = max(0.0, 1.0 - math.hypot((nx - 0.75) * 1.3, (ny - 0.15) * 1.2)) * 0.2
            blend = min(1.0, max(0.0, ny * 0.62 + (1 - nx) * 0.08))
            top = (105, 91, 229)
            bottom = (66, 54, 184)
            color = tuple(round(top[c] * (1 - blend) + bottom[c] * blend) for c in range(3))
            color = tuple(round(value * (1 - glow) + (148, 136, 255)[i] * glow) for i, value in enumerate(color))
            pos = (y * width + x) * 3
            pixels[pos:pos + 3] = bytes(color)

    def rounded_rect(x: float, y: float, w: float, h: float, radius: float, color: tuple[int, int, int], alpha: float = 1.0) -> None:
        left, top = round(x * size * factor), round(y * size * factor)
        right, bottom = round((x + w) * size * factor), round((y + h) * size * factor)
        r = radius * size * factor
        for py in range(max(0, top), min(height, bottom)):
            cy = min(max(py + 0.5, top + r), bottom - r)
            for px in range(max(0, left), min(width, right)):
                cx = min(max(px + 0.5, left + r), right - r)
                if (px + 0.5 - cx) ** 2 + (py + 0.5 - cy) ** 2 > r * r:
                    continue
                idx = (py * width + px) * 3
                if alpha >= 1:
                    pixels[idx:idx + 3] = bytes(color)
                else:
                    pixels[idx:idx + 3] = bytes(round(pixels[idx + c] * (1 - alpha) + color[c] * alpha) for c in range(3))

    def circle(cx: float, cy: float, radius: float, color: tuple[int, int, int]) -> None:
        rounded_rect(cx - radius, cy - radius, radius * 2, radius * 2, radius, color)

    def line(points: list[tuple[float, float]], thickness: float, color: tuple[int, int, int]) -> None:
        radius = thickness / 2
        for start, end in zip(points, points[1:]):
            dx, dy = end[0] - start[0], end[1] - start[1]
            count = max(1, math.ceil(math.hypot(dx, dy) * size * factor / (radius * size * factor * 0.55)))
            for step in range(count + 1):
                t = step / count
                circle(start[0] + dx * t, start[1] + dy * t, radius, color)

    # A soft offset shadow gives the white tile depth without losing contrast.
    rounded_rect(0.16, 0.18, 0.68, 0.68, 0.17, (37, 29, 120), 0.42)
    rounded_rect(0.16, 0.16, 0.68, 0.68, 0.17, (255, 255, 255))

    bar_colors = [(201, 195, 255), (169, 159, 249), (132, 117, 240), (91, 75, 218)]
    bars = [(0.283, 0.658, 0.078, 0.068), (0.422, 0.568, 0.078, 0.158), (0.561, 0.467, 0.078, 0.259), (0.700, 0.361, 0.078, 0.365)]
    for (x, y, w, h), color in zip(bars, bar_colors):
        rounded_rect(x, y, w, h, 0.022, color)

    mint = (39, 189, 146)
    points = [(0.293, 0.553), (0.441, 0.475), (0.574, 0.387), (0.729, 0.279)]
    line(points, 0.029, mint)
    for x, y in points[:-1]:
        circle(x, y, 0.019, mint)
    line([(0.682, 0.283), (0.732, 0.273), (0.729, 0.323)], 0.029, mint)
    rounded_rect(0.279, 0.768, 0.443, 0.018, 0.009, (239, 237, 249))

    # Downsample the supersampled drawing for clean edges at every app size.
    reduced = bytearray(size * size * 3)
    samples = factor * factor
    for y in range(size):
        for x in range(size):
            totals = [0, 0, 0]
            for oy in range(factor):
                for ox in range(factor):
                    offset = (((y * factor + oy) * width) + x * factor + ox) * 3
                    for channel in range(3):
                        totals[channel] += pixels[offset + channel]
            target = (y * size + x) * 3
            reduced[target:target + 3] = bytes(round(value / samples) for value in totals)

    raw = b"".join(b"\x00" + reduced[y * size * 3:(y + 1) * size * 3] for y in range(size))
    header = struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + png_chunk(b"IHDR", header) + png_chunk(b"IDAT", zlib.compress(raw, 9)) + png_chunk(b"IEND", b"")


for filename, size in (("pwa-192.png", 192), ("pwa-512.png", 512), ("apple-touch-icon.png", 180)):
    (OUT / filename).write_bytes(render(size))
    print(f"Generated {filename} ({size}x{size})")
