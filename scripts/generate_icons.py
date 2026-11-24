#!/usr/bin/env python3
"""
Genera le icone PWA (SVG e PNG) per "Presidente di Provincia"
usando esclusivamente la libreria standard Python (nessuna dipendenza esterna).
"""

import math
import os
import struct
import zlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ICONS_DIR = os.path.join(ROOT, "icons")


SVG_ICON = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="pitch" cx="50%" cy="42%" r="65%">
      <stop offset="0%" stop-color="#22c55e"/>
      <stop offset="65%" stop-color="#15803d"/>
      <stop offset="100%" stop-color="#0b3b1e"/>
    </radialGradient>
    <linearGradient id="gold" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#fef08a"/>
      <stop offset="50%" stop-color="#f59e0b"/>
      <stop offset="100%" stop-color="#b45309"/>
    </linearGradient>
    <linearGradient id="shield" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#1e293b"/>
      <stop offset="100%" stop-color="#0f172a"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="108" fill="url(#pitch)"/>
  <g opacity="0.16" fill="#ffffff">
    <rect x="0" y="64" width="512" height="52"/>
    <rect x="0" y="168" width="512" height="52"/>
    <rect x="0" y="272" width="512" height="52"/>
    <rect x="0" y="376" width="512" height="52"/>
  </g>
  <!-- Scudetto -->
  <path d="M256 76 L396 122 V254 C396 346 336 410 256 446 C176 410 116 346 116 254 V122 Z"
        fill="url(#shield)" stroke="url(#gold)" stroke-width="18" stroke-linejoin="round"/>
  <!-- Banda tricolore -->
  <clipPath id="shieldClip">
    <path d="M256 92 L380 132 V252 C380 334 326 393 256 426 C186 393 132 334 132 252 V132 Z"/>
  </clipPath>
  <g clip-path="url(#shieldClip)">
    <rect x="130" y="128" width="84" height="34" fill="#16a34a"/>
    <rect x="214" y="128" width="84" height="34" fill="#f8fafc"/>
    <rect x="298" y="128" width="84" height="34" fill="#dc2626"/>
  </g>
  <!-- Corona Presidente -->
  <path d="M188 118 L204 68 L236 96 L256 54 L276 96 L308 68 L324 118 Z"
        fill="url(#gold)" stroke="#78350f" stroke-width="6" stroke-linejoin="round"/>
  <!-- Pallone stilizzato -->
  <circle cx="256" cy="284" r="76" fill="#f8fafc" stroke="#0f172a" stroke-width="8"/>
  <polygon points="256,238 286,260 274,296 238,296 226,260" fill="#0f172a"/>
  <path d="M256 238 V208 M286 260 L322 250 M274 296 L300 332 M238 296 L212 332 M226 260 L190 250"
        stroke="#0f172a" stroke-width="7" stroke-linecap="round"/>
  <circle cx="256" cy="284" r="76" fill="none" stroke="url(#gold)" stroke-width="5" opacity="0.7"/>
</svg>
"""


def _png_chunk(chunk_type: bytes, data: bytes) -> bytes:
    chunk = chunk_type + data
    crc = zlib.crc32(chunk) & 0xFFFFFFFF
    return struct.pack(">I", len(data)) + chunk + struct.pack(">I", crc)


def write_png(path: str, width: int, height: int, rgba_bytes: bytearray) -> None:
    raw = bytearray()
    stride = width * 4
    for y in range(height):
        raw.append(0)  # filter type 0 (None)
        start = y * stride
        raw.extend(rgba_bytes[start : start + stride])

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    idat = zlib.compress(bytes(raw), level=6)
    png = b"\x89PNG\r\n\x1a\n"
    png += _png_chunk(b"IHDR", ihdr)
    png += _png_chunk(b"IDAT", idat)
    png += _png_chunk(b"IEND", b"")

    with open(path, "wb") as f:
        f.write(png)


def clamp(v: float, lo: float = 0.0, hi: float = 255.0) -> int:
    return int(max(lo, min(hi, round(v))))


def blend(dst, src_r, src_g, src_b, alpha):
    inv = 1.0 - alpha
    return (
        dst[0] * inv + src_r * alpha,
        dst[1] * inv + src_g * alpha,
        dst[2] * inv + src_b * alpha,
    )


def inside_shield(nx: float, ny: float) -> float:
    """Signed distance approximation (negative inside shield) in normalized [0..1] coords."""
    dx = abs(nx - 0.5)
    # Top edge slopes slightly down from center (0.5, 0.16) to shoulders (0.76, 0.24)
    top_y = 0.16 + (dx / 0.26) * 0.075
    if ny < top_y:
        return top_y - ny
    if ny <= 0.50:
        return dx - 0.265
    # Bottom tapered curve toward (0.5, 0.86)
    t = (ny - 0.50) / 0.36
    if t > 1.0:
        return ny - 0.86
    half_w = 0.265 * (1.0 - t * t)
    return dx - half_w


def inside_crown(nx: float, ny: float) -> bool:
    if ny < 0.10 or ny > 0.225 or abs(nx - 0.5) > 0.135:
        return False
    # Base band
    if ny > 0.188:
        return abs(nx - 0.5) <= 0.125
    # Three peaks at 0.39, 0.50, 0.61
    peaks = [(0.395, 0.125), (0.50, 0.102), (0.605, 0.125)]
    for px, py in peaks:
        if ny >= py:
            half = (ny - py) * 0.55 + 0.008
            if abs(nx - px) <= half:
                return True
    return False


def render_icon_rgba(size: int, rounded: bool = True) -> bytearray:
    buf = bytearray(size * size * 4)
    inv_s = 1.0 / size

    # Pentagon vertices for soccer ball center
    ball_cx, ball_cy, ball_r = 0.5, 0.56, 0.155
    pent_r = ball_r * 0.44
    pent_angles = [math.radians(-90 + i * 72) for i in range(5)]
    pent_pts = [
        (ball_cx + math.cos(a) * pent_r, ball_cy + math.sin(a) * pent_r)
        for a in pent_angles
    ]

    for y in range(size):
        ny = (y + 0.5) * inv_s
        stripe_band = int(ny * 8.5) % 2 == 0
        for x in range(size):
            nx = (x + 0.5) * inv_s

            # Rounded corners alpha (smooth anti-aliased)
            alpha = 255
            if rounded:
                r = 0.20
                qx = max(abs(nx - 0.5) - (0.5 - r), 0.0)
                qy = max(abs(ny - 0.5) - (0.5 - r), 0.0)
                corner_d = math.hypot(qx, qy) - r
                if corner_d > 0.004:
                    alpha = 0
                elif corner_d > -0.004:
                    alpha = clamp((0.004 - corner_d) / 0.008 * 255.0)

            if alpha == 0:
                idx = (y * size + x) * 4
                buf[idx : idx + 4] = b"\x00\x00\x00\x00"
                continue

            # Pitch radial gradient background
            dist_c = math.hypot(nx - 0.5, ny - 0.44)
            grad = min(1.0, dist_c / 0.72)
            r_col = 34 * (1 - grad) + 11 * grad
            g_col = 197 * (1 - grad) + 64 * grad
            b_col = 94 * (1 - grad) + 32 * grad

            if stripe_band:
                r_col, g_col, b_col = blend((r_col, g_col, b_col), 255, 255, 255, 0.09)

            # Subtle center pitch circle line
            ring_d = abs(math.hypot(nx - 0.5, ny - 0.5) - 0.39)
            if ring_d < 0.008:
                r_col, g_col, b_col = blend((r_col, g_col, b_col), 255, 255, 255, 0.22)

            # Shield shape + gold border
            sd = inside_shield(nx, ny)
            if sd < 0.032:
                if sd >= -0.004:
                    # Gold border gradient
                    gt = (nx + ny) * 0.5
                    r_col = 250 * (1 - gt) + 210 * gt
                    g_col = 220 * (1 - gt) + 125 * gt
                    b_col = 95 * (1 - gt) + 15 * gt
                else:
                    # Dark navy shield fill
                    r_col = 28 * (1 - ny) + 12 * ny
                    g_col = 42 * (1 - ny) + 22 * ny
                    b_col = 64 * (1 - ny) + 40 * ny
                    # Italian tricolor stripe near top of shield
                    if 0.255 <= ny <= 0.32:
                        if nx < 0.415:
                            r_col, g_col, b_col = 22, 163, 74
                        elif nx <= 0.585:
                            r_col, g_col, b_col = 248, 250, 252
                        else:
                            r_col, g_col, b_col = 220, 38, 38

            # Crown on top
            if inside_crown(nx, ny):
                r_col, g_col, b_col = 250, 204, 21

            # Soccer ball
            bd = math.hypot(nx - ball_cx, ny - ball_cy)
            if bd <= ball_r + 0.012:
                if bd >= ball_r - 0.006:
                    r_col, g_col, b_col = 15, 23, 42
                else:
                    # Shaded white sphere
                    shade = max(0.0, 1.0 - math.hypot(nx - (ball_cx - 0.04), ny - (ball_cy - 0.04)) / (ball_r * 1.5))
                    r_col = 222 + 33 * shade
                    g_col = 228 + 27 * shade
                    b_col = 236 + 19 * shade

                    # Center pentagon check (half-space test)
                    inside_pent = True
                    for i in range(5):
                        x1, y1 = pent_pts[i]
                        x2, y2 = pent_pts[(i + 1) % 5]
                        if (x2 - x1) * (ny - y1) - (y2 - y1) * (nx - x1) < 0:
                            inside_pent = False
                            break
                    if inside_pent:
                        r_col, g_col, b_col = 15, 23, 42
                    else:
                        # Radial seams from pentagon vertices
                        for px, py in pent_pts:
                            vx, vy = px - ball_cx, py - ball_cy
                            vlen = math.hypot(vx, vy)
                            ux, uy = vx / vlen, vy / vlen
                            proj = (nx - ball_cx) * ux + (ny - ball_cy) * uy
                            if proj >= pent_r * 0.9:
                                perp = abs((nx - ball_cx) * (-uy) + (ny - ball_cy) * ux)
                                if perp < 0.011:
                                    r_col, g_col, b_col = 30, 41, 59
                                    break

            idx = (y * size + x) * 4
            buf[idx] = clamp(r_col)
            buf[idx + 1] = clamp(g_col)
            buf[idx + 2] = clamp(b_col)
            buf[idx + 3] = alpha

    return buf


def main() -> None:
    os.makedirs(ICONS_DIR, exist_ok=True)

    svg_path = os.path.join(ICONS_DIR, "icon.svg")
    with open(svg_path, "w", encoding="utf-8") as f:
        f.write(SVG_ICON.strip() + "\n")
    print(f"Creato {svg_path}")

    targets = [
        ("icon-192.png", 192, True),
        ("icon-512.png", 512, True),
        ("apple-touch-icon.png", 180, False),
    ]
    for filename, size, rounded in targets:
        out_path = os.path.join(ICONS_DIR, filename)
        rgba = render_icon_rgba(size, rounded=rounded)
        write_png(out_path, size, size, rgba)
        print(f"Creato {out_path} ({size}x{size})")


if __name__ == "__main__":
    main()
