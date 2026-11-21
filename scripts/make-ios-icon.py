# Generates ios-template/AppIcon-1024.png (the iOS app icon) with only the Python stdlib.
# Same design as the Android adaptive icon: neon highway + pink speed chevron.
import math, struct, zlib, os

N = 1024
segs = [  # (x1, y1, x2, y2, width, (r, g, b))
    (250, 880, 470, 250, 40, (0, 212, 255)),
    (774, 880, 554, 250, 40, (0, 212, 255)),
    (512, 300, 512, 350, 26, (232, 244, 255)),
    (512, 420, 512, 490, 26, (232, 244, 255)),
    (512, 580, 512, 690, 26, (232, 244, 255)),
    (330, 650, 512, 500, 56, (255, 43, 214)),
    (512, 500, 694, 650, 56, (255, 43, 214)),
]

def dist(px, py, x1, y1, x2, y2):
    dx, dy = x2 - x1, y2 - y1
    t = max(0.0, min(1.0, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)))
    cx, cy = x1 + t * dx, y1 + t * dy
    return math.hypot(px - cx, py - cy)

rows = []
for y in range(N):
    k = y / (N - 1)
    br, bg, bb = 11 * (1 - k) + 5 * k, 16 * (1 - k) + 7 * k, 48 * (1 - k) + 15 * k  # #0b1030 -> #05070f
    row = bytearray([0])
    for x in range(N):
        r, g, b = br, bg, bb
        for (x1, y1, x2, y2, w, col) in segs:
            # cheap bounding box reject
            if x < min(x1, x2) - w * 3 or x > max(x1, x2) + w * 3 or y < min(y1, y2) - w * 3 or y > max(y1, y2) + w * 3:
                continue
            d = dist(x, y, x1, y1, x2, y2)
            core = max(0.0, min(1.0, w / 2 - d + 1))
            glow = math.exp(-((d / (w * 1.3)) ** 2)) * 0.5
            a = min(1.0, core + glow)
            r, g, b = r + (col[0] - r) * a, g + (col[1] - g) * a, b + (col[2] - b) * a
        row += bytes((int(min(255, r)), int(min(255, g)), int(min(255, b))))
    rows.append(bytes(row))

def chunk(tag, data):
    c = struct.pack('>I', len(data)) + tag + data
    return c + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)

png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', N, N, 8, 2, 0, 0, 0)) \
    + chunk(b'IDAT', zlib.compress(b''.join(rows), 9)) + chunk(b'IEND', b'')
out = os.path.join(os.path.dirname(__file__), '..', 'ios-template', 'AppIcon-1024.png')
open(out, 'wb').write(png)
print('wrote', os.path.normpath(out), len(png), 'bytes')
