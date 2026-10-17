"""EPUB with four clearly different chapters, used by the E2E suite (e2e/) to
check Ask AI retrieval: a question about one chapter should find that chapter.

Run: python scripts/make_e2e_epub.py
Writes: e2e/fixtures/assistant-test.epub (deterministic: fixed zip timestamps)
"""
import zipfile
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "e2e" / "fixtures" / "assistant-test.epub"
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


if __name__ == "__main__":
    main()
