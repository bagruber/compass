"""Generate placeholder PWA icons (solid brand-green squares with a white dot).

Minimal raw-PNG encoder so there's no Pillow dependency. Replace with a real
designed icon before release — these only exist so the manifest doesn't 404.
"""
import os
import struct
import zlib

ROOT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "public")
GREEN = (11, 110, 79)
WHITE = (255, 255, 255)


def png(size, path):
    cx = cy = size / 2
    r = size * 0.22
    rows = bytearray()
    for y in range(size):
        rows.append(0)  # filter type 0 per scanline
        for x in range(size):
            inside = (x - cx) ** 2 + (y - cy) ** 2 <= r * r
            rows.extend(WHITE if inside else GREEN)

    def chunk(tag, data):
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    ihdr = struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)  # 8-bit RGB
    out = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", zlib.compress(bytes(rows), 9))
        + chunk(b"IEND", b"")
    )
    with open(path, "wb") as f:
        f.write(out)
    print(f"wrote {os.path.relpath(path, ROOT)} ({size}x{size})")


def main():
    icons = os.path.join(ROOT, "icons")
    os.makedirs(icons, exist_ok=True)
    png(192, os.path.join(icons, "icon-192.png"))
    png(512, os.path.join(icons, "icon-512.png"))


if __name__ == "__main__":
    main()
