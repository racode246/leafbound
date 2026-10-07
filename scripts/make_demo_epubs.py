"""Generate a handful of demo EPUBs with generated PNG covers.

Useful for screenshots and for trying the library UI without real books.
Pure standard library; no Pillow required.

Run: python scripts/make_demo_epubs.py [output_dir]
Default output: <temp>/leafbound-demo/
"""
from __future__ import annotations

import math
import struct
import sys
import tempfile
import zipfile
import zlib
from pathlib import Path

BOOKS = [
    ("Pride and Prejudice", "Jane Austen", (0x2F, 0x5D, 0x50), (0xB7, 0xD8, 0xC3)),
    ("吾輩は猫である", "夏目 漱石", (0x3A, 0x2F, 0x22), (0xD9, 0xB8, 0x7A)),
    ("Moby-Dick", "Herman Melville", (0x1F, 0x3A, 0x5F), (0x9F, 0xC5, 0xE8)),
    ("銀河鉄道の夜", "宮沢 賢治", (0x24, 0x1E, 0x4A), (0xC9, 0xB6, 0xF2)),
    ("The Great Gatsby", "F. Scott Fitzgerald", (0x6B, 0x4A, 0x12), (0xF2, 0xD3, 0x7A)),
    ("こころ", "夏目 漱石", (0x5A, 0x1F, 0x2B), (0xE8, 0xA6, 0xB0)),
]

W, H = 600, 900


def lerp(a: tuple[int, int, int], b: tuple[int, int, int], t: float) -> tuple[int, int, int]:
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))  # type: ignore[return-value]


def cover_png(dark: tuple[int, int, int], light: tuple[int, int, int], seed: int) -> bytes:
    """Diagonal gradient with a soft circle and a title band: enough to look like a cover."""
    rows = bytearray()
    cx, cy, r = W * (0.3 + 0.1 * (seed % 3)), H * 0.36, W * 0.28
    for y in range(H):
        rows.append(0)
        for x in range(W):
            t = (x / W * 0.6 + y / H * 0.4)
            c = lerp(dark, light, t)
            d = math.hypot(x - cx, y - cy)
            if d < r:
                k = 0.35 * (1 - d / r)
                c = lerp(c, light, k)
            if H * 0.66 < y < H * 0.78:
                c = lerp(c, (0xFD, 0xFB, 0xF7), 0.85)
            elif H * 0.80 < y < H * 0.805 and W * 0.12 < x < W * 0.6:
                c = dark
            rows.extend(c)

    def chunk(tag: bytes, body: bytes) -> bytes:
        return struct.pack(">I", len(body)) + tag + body + struct.pack(">I", zlib.crc32(tag + body) & 0xFFFFFFFF)

    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", W, H, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(bytes(rows), 6))
        + chunk(b"IEND", b"")
    )


CONTAINER = """<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>
"""


def opf(title: str, author: str, uid: str) -> str:
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">urn:uuid:{uid}</dc:identifier>
    <dc:title>{title}</dc:title>
    <dc:creator>{author}</dc:creator>
    <dc:language>en</dc:language>
    <meta property="dcterms:modified">2026-10-07T00:00:00Z</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="cover-image" href="cover.png" media-type="image/png" properties="cover-image"/>
    <item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine><itemref idref="ch1"/></spine>
</package>
"""


def nav(title: str) -> str:
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>{title}</title></head>
<body><nav epub:type="toc"><ol><li><a href="ch1.xhtml">Chapter 1</a></li></ol></nav></body>
</html>
"""


def chapter(title: str) -> str:
    body = "".join(f"<p>Demo text for {title}, paragraph {i + 1}.</p>" for i in range(20))
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>{title}</title></head>
<body><h1>{title}</h1>{body}</body></html>
"""


def main() -> None:
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(tempfile.gettempdir()) / "leafbound-demo"
    out.mkdir(parents=True, exist_ok=True)
    for i, (title, author, dark, light) in enumerate(BOOKS):
        path = out / f"demo-{i + 1}.epub"
        with zipfile.ZipFile(path, "w") as z:
            z.writestr(zipfile.ZipInfo("mimetype"), "application/epub+zip", compress_type=zipfile.ZIP_STORED)
            z.writestr("META-INF/container.xml", CONTAINER, compress_type=zipfile.ZIP_DEFLATED)
            z.writestr("OEBPS/content.opf", opf(title, author, f"leafbound-demo-{i + 1}"), compress_type=zipfile.ZIP_DEFLATED)
            z.writestr("OEBPS/nav.xhtml", nav(title), compress_type=zipfile.ZIP_DEFLATED)
            z.writestr("OEBPS/cover.png", cover_png(dark, light, i), compress_type=zipfile.ZIP_DEFLATED)
            z.writestr("OEBPS/ch1.xhtml", chapter(title), compress_type=zipfile.ZIP_DEFLATED)
        print(f"wrote {path}")


if __name__ == "__main__":
    main()
