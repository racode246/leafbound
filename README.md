# Leafbound

A calm, open-source EPUB reader for Windows.
Windows 向けの、静かで軽い EPUB リーダーです。

Built with [Tauri 2](https://tauri.app/) (Rust) + React + TypeScript + [epub.js](https://github.com/futurepress/epub.js).

## Features / 機能

- EPUB 2 / EPUB 3 を開く(本はアプリ内ライブラリにコピーされます)
- 読書位置の自動保存と再開
- カテゴリによる本の整理(複数カテゴリ可)
- 表紙グリッド表示とリスト表示の切り替え
- 横読み(ページ送り)と縦読み(連続スクロール)
- 文字サイズ、フォント(プリセット + 任意のインストール済みフォント)、行間の調整
- 白 / セピア / 黒の配色
- 目次ジャンプ、検索、並び替え
- エクスプローラーからの `.epub` ドラッグ＆ドロップ、ダブルクリックで開く(ファイル関連付け)

## Development / 開発

Prerequisites: Node.js 20+, Rust (stable, MSVC toolchain), Visual Studio Build Tools with the C++ workload, WebView2 (bundled with Windows 11).

```bash
npm install
npm run tauri dev
```

Production build (NSIS installer and MSI under `src-tauri/target/release/bundle/`):

```bash
npm run tauri build
```

Other scripts:

```bash
npm run typecheck   # TypeScript
cargo test --manifest-path src-tauri/Cargo.toml
```

## Where data lives / データの保存場所

`%APPDATA%\dev.leafbound.app\`

- `library.json` – books, categories, reading progress, settings
- `books\` – imported EPUB copies
- `covers\` – extracted cover images

Deleting a book from the library also deletes its copy. Original files are never touched.

## Project layout

```
src/            React frontend (library, reader, settings)
src-tauri/      Rust backend (library store, EPUB metadata, IPC commands)
scripts/        Icon generator
```

## Roadmap

- 縦書き(writing-mode: vertical-rl)のサポート
- 本文内検索
- ハイライトとメモ
- 複数ウィンドウ

## License

MIT © racode246
