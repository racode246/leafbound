"""Build a small, valid EPUB 3 for manual testing and Rust tests.

Run: python scripts/make_sample_epub.py
Writes: src-tauri/tests/fixtures/sample.epub
"""
from __future__ import annotations

import struct
import zipfile
import zlib
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "src-tauri" / "tests" / "fixtures" / "sample.epub"


def tiny_png() -> bytes:
    """A 2x3 solid green PNG so the cover extractor has something to find."""
    w, h = 2, 3
    raw = b"".join(b"\x00" + bytes([0x2F, 0x5D, 0x50] * w) for _ in range(h))

    def chunk(tag: bytes, body: bytes) -> bytes:
        return struct.pack(">I", len(body)) + tag + body + struct.pack(">I", zlib.crc32(tag + body) & 0xFFFFFFFF)

    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw))
        + chunk(b"IEND", b"")
    )


CONTAINER = """<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
"""

OPF = """<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">urn:uuid:5a6d3c0e-7d1b-4a0f-9d6e-leafbound-sample</dc:identifier>
    <dc:title>Leafbound サンプル</dc:title>
    <dc:creator>Leafbound Contributors</dc:creator>
    <dc:language>ja</dc:language>
    <meta property="dcterms:modified">2026-10-07T00:00:00Z</meta>
    <meta name="cover" content="cover-image"/>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="cover-image" href="cover.png" media-type="image/png" properties="cover-image"/>
    <item id="css" href="style.css" media-type="text/css"/>
    <item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
    <item id="ch2" href="ch2.xhtml" media-type="application/xhtml+xml"/>
    <item id="ch3" href="ch3.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="ch1"/>
    <itemref idref="ch2"/>
    <itemref idref="ch3"/>
  </spine>
</package>
"""

NAV = """<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>目次</title></head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>目次</h1>
    <ol>
      <li><a href="ch1.xhtml">第一章 葉のはじまり</a></li>
      <li><a href="ch2.xhtml">第二章 ページをめくる</a>
        <ol><li><a href="ch2.xhtml#sec">二の一 見返し</a></li></ol>
      </li>
      <li><a href="ch3.xhtml">第三章 奥付</a></li>
    </ol>
  </nav>
</body>
</html>
"""

CSS = "body { font-family: serif; } h1 { color: #2f5d50; } p { text-indent: 1em; }\n"

PARA = (
    "吾輩は猫である。名前はまだ無い。どこで生れたかとんと見当がつかぬ。"
    "何でも薄暗いじめじめした所でニャーニャー泣いていた事だけは記憶している。"
    "吾輩はここで始めて人間というものを見た。"
)


def chapter(n: int, title: str, paras: int, anchor: bool = False) -> str:
    body = "\n".join(f"<p>{PARA} ({n}-{i + 1})</p>" for i in range(paras))
    sec = '<h2 id="sec">二の一 見返し</h2>\n' if anchor else ""
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>{title}</title><link rel="stylesheet" href="style.css"/></head>
<body>
<h1>{title}</h1>
{body}
{sec}
{"".join(f"<p>{PARA}</p>" for _ in range(6)) if anchor else ""}
</body>
</html>
"""


def main() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(OUT, "w") as z:
        z.writestr(zipfile.ZipInfo("mimetype"), "application/epub+zip", compress_type=zipfile.ZIP_STORED)
        z.writestr("META-INF/container.xml", CONTAINER, compress_type=zipfile.ZIP_DEFLATED)
        z.writestr("OEBPS/content.opf", OPF, compress_type=zipfile.ZIP_DEFLATED)
        z.writestr("OEBPS/nav.xhtml", NAV, compress_type=zipfile.ZIP_DEFLATED)
        z.writestr("OEBPS/style.css", CSS, compress_type=zipfile.ZIP_DEFLATED)
        z.writestr("OEBPS/cover.png", tiny_png(), compress_type=zipfile.ZIP_DEFLATED)
        z.writestr("OEBPS/ch1.xhtml", chapter(1, "第一章 葉のはじまり", 40), compress_type=zipfile.ZIP_DEFLATED)
        z.writestr("OEBPS/ch2.xhtml", chapter(2, "第二章 ページをめくる", 30, anchor=True), compress_type=zipfile.ZIP_DEFLATED)
        z.writestr("OEBPS/ch3.xhtml", chapter(3, "第三章 奥付", 20), compress_type=zipfile.ZIP_DEFLATED)
    print(f"wrote {OUT} ({OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
