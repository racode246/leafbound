"""EPUBs used by the E2E suite (e2e/):

- assistant-test.epub: four clearly different chapters, to check Ask AI retrieval
  (a question about one chapter should find that chapter).
- cover-test.epub: a cover image and the kinds of publisher resources epub.js turns
  into blob:/data: URLs or inline styles (stylesheet, CSS background, <style>,
  style attributes, images), for the Content Security Policy check.
- long-contents.epub: forty short chapters, so the Contents panel has to scroll.
- numbered-contents.epub: EPUB 2 with only a toc.ncx whose entries are all at the top
  level but numbered (第N部 / N章 / N.N / N.N.N), like a book calibre converted from a
  Kindle format, for inferring the nesting of the Contents panel.
- inline-images.epub: formula images inside sentences, scaled to one fixed width with the
  pixel size repeated in the CSS as calibre does (525x367 for a short formula), a small
  gaiji-like image, images the publisher sized in em (a fraction 2em tall and lowered
  0.5em, a 400x400 gaiji at 1em), and a figure alone in its paragraph, for sizing images
  to the text.

Run: python scripts/make_e2e_epub.py
Writes them into e2e/fixtures/ (deterministic: fixed zip timestamps)
"""
import base64
import struct
import zipfile
import zlib
from pathlib import Path

FIXTURES = Path(__file__).resolve().parent.parent / "e2e" / "fixtures"
OUT = FIXTURES / "assistant-test.epub"
COVER_OUT = FIXTURES / "cover-test.epub"
STAMP = (2026, 10, 18, 0, 0, 0)

CHAPTERS = [
    ("第一章 猫のミケ", [
        "ミケは三毛猫で、古本屋の店先で暮らしている。",
        "毎朝八時になると、店主の佐伯さんが煮干しを三匹くれる。",
        "ミケは雨の日になると、決まって文庫本の棚の上で丸くなって眠る。",
        "常連の女子高生の千夏は、ミケのことを「店長」と呼んでいる。",
        "ミケの好物は煮干しだが、本当はかつお節のほうがもっと好きだ。",
    ]),
    ("第二章 夜行列車", [
        "佐伯さんは若いころ、夜行列車の車掌として働いていた。",
        "上野から青森まで、十二時間かけて北へ走る急行だった。",
        "冬の夜、雪で列車が三時間止まったとき、乗客全員に温かいお茶を配ったことがある。",
        "その夜に出会った老人から、一冊の古い詩集を譲り受けた。",
        "それが古本屋を始めるきっかけになったと、佐伯さんは千夏に語った。",
    ]),
    ("第三章 カレーの作り方", [
        "店の奥の台所で、佐伯さんは土曜日だけカレーを作る。",
        "玉ねぎを飴色になるまで四十分炒めるのが、いちばん大事な工程だ。",
        "隠し味は、すりおろしたりんごと少量のインスタントコーヒーである。",
        "スパイスはクミン、コリアンダー、ターメリックの三種類だけを使う。",
        "千夏は一度だけ手伝ったが、玉ねぎを焦がしてしまった。",
    ]),
    ("第四章 灯台", [
        "夏休み、千夏は祖母の住む岬の町を訪ねた。",
        "岬の先には白い灯台があり、灯台守の青年が一人で住んでいる。",
        "灯台の光は十五秒ごとに一回転し、二十キロ先の船まで届くという。",
        "青年は、佐伯さんが車掌だった頃の乗客の孫だと名乗った。",
        "千夏は帰りの電車で、詩集の話をどうやって佐伯さんに伝えようか考えた。",
    ]),
]


def xhtml(title: str, sentences: list[str]) -> str:
    # Repeat with numbered variations so each chapter spans several chunks.
    paras = []
    for round_ in range(6):
        for s in sentences:
            paras.append(f"<p>{s}（{round_ + 1}）</p>")
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<html xmlns="http://www.w3.org/1999/xhtml"><head>'
        f"<title>{title}</title></head><body><h1>{title}</h1>\n" + "\n".join(paras) + "\n</body></html>\n"
    )


def entry(name: str) -> zipfile.ZipInfo:
    info = zipfile.ZipInfo(name, STAMP)
    info.compress_type = zipfile.ZIP_DEFLATED
    return info


def main(out: Path = OUT) -> None:
    out.parent.mkdir(parents=True, exist_ok=True)
    manifest = "\n".join(
        f'<item id="c{i}" href="c{i}.xhtml" media-type="application/xhtml+xml"/>' for i in range(len(CHAPTERS))
    )
    spine = "\n".join(f'<itemref idref="c{i}"/>' for i in range(len(CHAPTERS)))
    nav_items = "\n".join(f'<li><a href="c{i}.xhtml">{t}</a></li>' for i, (t, _) in enumerate(CHAPTERS))
    opf = f"""<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">urn:uuid:leafbound-assistant-test</dc:identifier>
    <dc:title>古本屋のミケ</dc:title>
    <dc:creator>テスト著者</dc:creator>
    <dc:language>ja</dc:language>
    <meta property="dcterms:modified">2026-10-17T00:00:00Z</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    {manifest}
  </manifest>
  <spine>{spine}</spine>
</package>
"""
    nav = f"""<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>目次</title></head><body><nav epub:type="toc"><ol>{nav_items}</ol></nav></body></html>
"""
    with zipfile.ZipFile(out, "w") as z:
        z.writestr(zipfile.ZipInfo("mimetype", STAMP), "application/epub+zip", compress_type=zipfile.ZIP_STORED)
        z.writestr(
            entry("META-INF/container.xml"),
            '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">'
            '<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>'
            "</rootfiles></container>",
        )
        z.writestr(entry("OEBPS/content.opf"), opf)
        z.writestr(entry("OEBPS/nav.xhtml"), nav)
        for i, (title, sentences) in enumerate(CHAPTERS):
            z.writestr(entry(f"OEBPS/c{i}.xhtml"), xhtml(title, sentences))
    print(f"wrote {out}")


def png(width: int, height: int, pixel) -> bytes:
    """Uncompressed-filter RGB PNG; pixel(x, y) returns (r, g, b)."""
    rows = bytearray()
    for y in range(height):
        rows.append(0)
        for x in range(width):
            rows.extend(pixel(x, y))

    def chunk(tag: bytes, body: bytes) -> bytes:
        return struct.pack(">I", len(body)) + tag + body + struct.pack(">I", zlib.crc32(tag + body) & 0xFFFFFFFF)

    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(bytes(rows), 9))
        + chunk(b"IEND", b"")
    )


COVER_CHAPTERS = [
    ("Chapter 1 The Lamplighter", "Every evening the lamplighter walks Lantern Street with a long brass pole."),
    ("Chapter 2 The Harbour", "Fishing boats come back to the harbour when the lighthouse starts to turn."),
    ("Chapter 3 The Bakery", "The bakery on the corner sells rye bread with caraway seeds before dawn."),
]


def cover_chapter(title: str, sentence: str, dot: str) -> str:
    # One of each way a publisher styles a page: linked stylesheet (with url() images
    # epub.js rewrites to blob: URLs), a <style> element, style attributes, a data: image.
    paras = "\n".join(f"<p>{sentence} ({i + 1})</p>" for i in range(12))
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<html xmlns="http://www.w3.org/1999/xhtml"><head>'
        f'<title>{title}</title><link rel="stylesheet" type="text/css" href="style.css"/>'
        "<style>p.lead { font-variant: small-caps; }</style></head>"
        f'<body><h1 class="ornament">{title}</h1>\n'
        f'<p class="lead" style="text-indent: 0; margin-top: 1em">{sentence}</p>\n'
        f'<p><img class="dot" src="data:image/png;base64,{dot}" alt=""/></p>\n'
        f"{paras}\n</body></html>\n"
    )


def cover_book(out: Path = COVER_OUT) -> None:
    cover = png(400, 600, lambda x, y: (0x2F, 0x5D, 0x50) if y < 420 else (0xFD, 0xFB, 0xF7))
    ornament = png(16, 16, lambda x, y: (0xB7, 0xD8, 0xC3) if (x + y) % 4 < 2 else (0x2F, 0x5D, 0x50))
    dot = base64.b64encode(png(8, 8, lambda x, y: (0xD9, 0xB8, 0x7A))).decode()
    css = (
        "body { margin: 0 4%; }\n"
        ".ornament { padding-left: 20px; background: url(ornament.png) no-repeat left center; }\n"
        f".lead {{ background-image: url(data:image/png;base64,{dot}); }}\n"
    )
    n = len(COVER_CHAPTERS)
    manifest = "\n".join(
        f'<item id="c{i}" href="c{i}.xhtml" media-type="application/xhtml+xml"/>' for i in range(n)
    )
    spine = "".join(f'<itemref idref="c{i}"/>' for i in range(n))
    nav_items = "\n".join(f'<li><a href="c{i}.xhtml">{t}</a></li>' for i, (t, _) in enumerate(COVER_CHAPTERS))
    opf = f"""<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">urn:uuid:leafbound-cover-test</dc:identifier>
    <dc:title>Lantern Street</dc:title>
    <dc:creator>Test Author</dc:creator>
    <dc:language>en</dc:language>
    <meta property="dcterms:modified">2026-10-18T00:00:00Z</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="cover-image" href="cover.png" media-type="image/png" properties="cover-image"/>
    <item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>
    <item id="css" href="style.css" media-type="text/css"/>
    <item id="ornament" href="ornament.png" media-type="image/png"/>
    {manifest}
  </manifest>
  <spine><itemref idref="cover"/>{spine}</spine>
</package>
"""
    nav = f"""<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Contents</title></head><body><nav epub:type="toc"><ol>{nav_items}</ol></nav></body></html>
"""
    cover_page = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Cover</title></head>'
        '<body><img src="cover.png" alt="Lantern Street"/></body></html>\n'
    )
    with zipfile.ZipFile(out, "w") as z:
        z.writestr(zipfile.ZipInfo("mimetype", STAMP), "application/epub+zip", compress_type=zipfile.ZIP_STORED)
        z.writestr(
            entry("META-INF/container.xml"),
            '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">'
            '<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>'
            "</rootfiles></container>",
        )
        z.writestr(entry("OEBPS/content.opf"), opf)
        z.writestr(entry("OEBPS/nav.xhtml"), nav)
        z.writestr(entry("OEBPS/cover.png"), cover)
        z.writestr(entry("OEBPS/cover.xhtml"), cover_page)
        z.writestr(entry("OEBPS/style.css"), css)
        z.writestr(entry("OEBPS/ornament.png"), ornament)
        for i, (title, sentence) in enumerate(COVER_CHAPTERS):
            z.writestr(entry(f"OEBPS/c{i}.xhtml"), cover_chapter(title, sentence, dot))
    print(f"wrote {out}")


LONG_OUT = FIXTURES / "long-contents.epub"
LONG_CHAPTERS = 40
# Zero-padded so no label is a prefix of another ("Chapter 1" / "Chapter 10").
LONG_TITLE = "Chapter {:02d}"
LONG_PARAGRAPH = (
    "The lamp on the corner of the street turned every fifteen seconds, and each time it did the "
    "shadows of the bookshelves slid across the floor of the shop like the hands of a slow clock. "
    "Nobody who came in that evening seemed to notice, except the cat on the counter."
)


def long_chapter(n: int) -> str:
    title = LONG_TITLE.format(n)
    # Enough text for a few screens, so a test can read on and stay in the chapter.
    paras = "\n".join(f"<p>{LONG_PARAGRAPH} ({n}.{i + 1})</p>" for i in range(14))
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<html xmlns="http://www.w3.org/1999/xhtml"><head>'
        f"<title>{title}</title></head><body><h1>{title}</h1>\n{paras}\n</body></html>\n"
    )


def write_long_contents(out: Path = LONG_OUT) -> None:
    out.parent.mkdir(parents=True, exist_ok=True)
    ids = range(1, LONG_CHAPTERS + 1)
    manifest = "\n".join(f'<item id="c{n}" href="c{n}.xhtml" media-type="application/xhtml+xml"/>' for n in ids)
    spine = "\n".join(f'<itemref idref="c{n}"/>' for n in ids)
    nav_items = "\n".join(f'<li><a href="c{n}.xhtml">{LONG_TITLE.format(n)}</a></li>' for n in ids)
    opf = f"""<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">urn:uuid:leafbound-long-contents</dc:identifier>
    <dc:title>Long Contents</dc:title>
    <dc:creator>Leafbound Contributors</dc:creator>
    <dc:language>en</dc:language>
    <meta property="dcterms:modified">2026-10-18T00:00:00Z</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    {manifest}
  </manifest>
  <spine>{spine}</spine>
</package>
"""
    nav = f"""<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Contents</title></head><body><nav epub:type="toc"><ol>{nav_items}</ol></nav></body></html>
"""
    with zipfile.ZipFile(out, "w") as z:
        z.writestr(zipfile.ZipInfo("mimetype", STAMP), "application/epub+zip", compress_type=zipfile.ZIP_STORED)
        z.writestr(
            entry("META-INF/container.xml"),
            '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">'
            '<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>'
            "</rootfiles></container>",
        )
        z.writestr(entry("OEBPS/content.opf"), opf)
        z.writestr(entry("OEBPS/nav.xhtml"), nav)
        for n in ids:
            z.writestr(entry(f"OEBPS/c{n}.xhtml"), long_chapter(n))
    print(f"wrote {out}")


NUMBERED_OUT = FIXTURES / "numbered-contents.epub"
# Flat in the NCX; the numbers say 第1部 > 1章 > 1.1 > 1.1.1.
NUMBERED_ENTRIES = [
    "はじめに",
    "第1部 基礎",
    "1章 はじまり",
    "1.1 準備",
    "1.1.1 道具",
    "1.1.2 材料",
    "1.2 手順",
    "2章 つづき",
    "2.1 応用",
    "2.1.1 発展",
    "第2部 実践",
    "3章 まとめ",
    "3.1 振り返り",
    "あとがき",
]


def numbered_page(title: str) -> str:
    # One file per entry, each a few screens long, so the entry for the page is unambiguous.
    paras = "\n".join(f"<p>{LONG_PARAGRAPH} ({title} {i + 1})</p>" for i in range(8))
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<html xmlns="http://www.w3.org/1999/xhtml"><head>'
        f"<title>{title}</title></head><body><h1>{title}</h1>\n{paras}\n</body></html>\n"
    )


def write_numbered_contents(out: Path = NUMBERED_OUT) -> None:
    out.parent.mkdir(parents=True, exist_ok=True)
    ids = range(len(NUMBERED_ENTRIES))
    manifest = "\n".join(f'<item id="s{n}" href="s{n}.xhtml" media-type="application/xhtml+xml"/>' for n in ids)
    spine = "\n".join(f'<itemref idref="s{n}"/>' for n in ids)
    nav_points = "\n".join(
        f'<navPoint id="np{n}" playOrder="{n + 1}"><navLabel><text>{t}</text></navLabel>'
        f'<content src="s{n}.xhtml"/></navPoint>'
        for n, t in enumerate(NUMBERED_ENTRIES)
    )
    opf = f"""<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">urn:uuid:leafbound-numbered-contents</dc:identifier>
    <dc:title>Numbered Contents</dc:title>
    <dc:creator>Leafbound Contributors</dc:creator>
    <dc:language>ja</dc:language>
  </metadata>
  <manifest>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    {manifest}
  </manifest>
  <spine toc="ncx">{spine}</spine>
</package>
"""
    ncx = f"""<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="urn:uuid:leafbound-numbered-contents"/>
    <meta name="dtb:depth" content="1"/>
  </head>
  <docTitle><text>Numbered Contents</text></docTitle>
  <navMap>
{nav_points}
  </navMap>
</ncx>
"""
    with zipfile.ZipFile(out, "w") as z:
        z.writestr(zipfile.ZipInfo("mimetype", STAMP), "application/epub+zip", compress_type=zipfile.ZIP_STORED)
        z.writestr(
            entry("META-INF/container.xml"),
            '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">'
            '<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>'
            "</rootfiles></container>",
        )
        z.writestr(entry("OEBPS/content.opf"), opf)
        z.writestr(entry("OEBPS/toc.ncx"), ncx)
        for n, title in enumerate(NUMBERED_ENTRIES):
            z.writestr(entry(f"OEBPS/s{n}.xhtml"), numbered_page(title))
    print(f"wrote {out}")


INLINE_OUT = FIXTURES / "inline-images.epub"


def write_inline_images(out: Path = INLINE_OUT) -> None:
    out.parent.mkdir(parents=True, exist_ok=True)
    white, ink = (0xFF, 0xFF, 0xFF), (0x10, 0x10, 0x10)
    # A "2^n" stand-in: dark strokes on white, scaled to 525 px wide like every formula.
    formula = png(525, 367, lambda x, y: ink if (x // 40 + y // 40) % 3 == 0 else white)
    gaiji = png(12, 12, lambda x, y: ink if 3 <= x <= 8 else white)
    figure = png(320, 200, lambda x, y: (0x2F, 0x5D, 0x50) if y < 160 else white)
    fraction = png(120, 240, lambda x, y: ink if 112 <= y <= 128 or (x // 30 + y // 30) % 4 == 0 else white)
    big_gaiji = png(400, 400, lambda x, y: ink if 100 <= x <= 300 and (y // 50) % 2 == 0 else white)
    css = (
        "p { margin: 0 0 0.5em; }\n"
        # calibre repeats the scaled pixel size of each image as a class.
        ".calibre_57 { height: 367px; text-align: middle; width: 525px; }\n"
        ".fig { display: block; text-indent: 0; margin: 1em 0 0; }\n"
        # Sizes and positions a publisher gives in units of the text.
        ".frac { height: 2em; vertical-align: -0.5em; }\n"
        "img.gaiji { height: 1em; }\n"
    )
    chapter = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Boolean Functions</title>'
        '<link rel="stylesheet" type="text/css" href="style.css"/></head><body>'
        "<h1>Boolean Functions</h1>\n"
        '<p id="inline">With n variables there are <img class="calibre_57" src="formula.png" alt="2^n"/>'
        " combinations of inputs, and a truth table lists the output for each one of them.</p>\n"
        '<p id="gaiji">An old ligature <img src="gaiji.png" alt="gaiji"/> stays the size it was drawn.</p>\n'
        '<p id="fraction">Half of it, <img class="frac" src="fraction.png" alt="1/2"/>, goes to the left.</p>\n'
        '<p id="gaiji-em">A rare character <img class="gaiji" src="gaiji-large.png" alt="gaiji"/> drawn large.</p>\n'
        '<p class="fig" id="figure"><img src="figure.png" alt="Figure 1"/>\u00a0\u00a0\u00a0 </p>\n'
        "<p>Figure 1 A truth table</p>\n"
        f"<p>{LONG_PARAGRAPH}</p>\n"
        "</body></html>\n"
    )
    opf = """<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">urn:uuid:leafbound-inline-images</dc:identifier>
    <dc:title>Inline Images</dc:title>
    <dc:creator>Leafbound Contributors</dc:creator>
    <dc:language>en</dc:language>
    <meta property="dcterms:modified">2026-10-29T00:00:00Z</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="css" href="style.css" media-type="text/css"/>
    <item id="formula" href="formula.png" media-type="image/png"/>
    <item id="gaiji" href="gaiji.png" media-type="image/png"/>
    <item id="figure" href="figure.png" media-type="image/png"/>
    <item id="fraction" href="fraction.png" media-type="image/png"/>
    <item id="gaiji-large" href="gaiji-large.png" media-type="image/png"/>
    <item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine><itemref idref="c1"/></spine>
</package>
"""
    nav = """<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Contents</title></head><body><nav epub:type="toc"><ol>
<li><a href="c1.xhtml">Boolean Functions</a></li></ol></nav></body></html>
"""
    with zipfile.ZipFile(out, "w") as z:
        z.writestr(zipfile.ZipInfo("mimetype", STAMP), "application/epub+zip", compress_type=zipfile.ZIP_STORED)
        z.writestr(
            entry("META-INF/container.xml"),
            '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">'
            '<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>'
            "</rootfiles></container>",
        )
        z.writestr(entry("OEBPS/content.opf"), opf)
        z.writestr(entry("OEBPS/nav.xhtml"), nav)
        z.writestr(entry("OEBPS/style.css"), css)
        z.writestr(entry("OEBPS/formula.png"), formula)
        z.writestr(entry("OEBPS/gaiji.png"), gaiji)
        z.writestr(entry("OEBPS/figure.png"), figure)
        z.writestr(entry("OEBPS/fraction.png"), fraction)
        z.writestr(entry("OEBPS/gaiji-large.png"), big_gaiji)
        z.writestr(entry("OEBPS/c1.xhtml"), chapter)
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
    cover_book()
    write_long_contents()
    write_numbered_contents()
    write_inline_images()
