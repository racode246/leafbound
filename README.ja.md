# Leafbound

Windows 向けの、静かで軽いオープンソース EPUB リーダーです。

[English README](README.md)

![Leafbound のライブラリ](docs/screenshot-library.png)

Leafbound は [Tauri 2](https://tauri.app/)(Rust)、React、TypeScript、[epub.js](https://github.com/futurepress/epub.js) で作られています。本をローカルのライブラリに保管し、読んだ位置を覚え、読書の邪魔をしないことを目指しています。

## 機能

- EPUB 2 / EPUB 3 を開けます。本はライブラリにコピーされ、元のファイルは変更しません。
- 本ごとに読書位置を保存し、次回はそこから再開します。
- カテゴリで本を整理できます。1 冊を複数のカテゴリに入れられます。
- 表紙グリッド表示とリスト表示、タイトル・著者での検索、並び替え(最近読んだ順・追加順・タイトル順・著者順)。
- 横読み(ページ送り)と縦読み(連続スクロール)。
- 単ページ、自動、見開きのページ表示。
- フォント(プリセットまたは任意のインストール済みフォント)、文字サイズ、行間の調整。
- 白 / セピア / 黒の配色。
- 目次、本文内検索(Ctrl+F)、4 色のハイライトとメモ。
- EPUB ファイルのドラッグ＆ドロップ、エクスプローラーからの「開く」(`.epub` の関連付け)。常に 1 つのウィンドウで動作します。
- UI は英語と日本語に対応。既定ではシステムの言語に従います。
- 縦書きの EPUB(`writing-mode: vertical-rl`)は出版社の指定どおりに表示します。
- 同じファイルを二度取り込んでも重複しません。

## インストール

バイナリ配布はまだありません。下記の手順でソースからビルドしてください。NSIS インストーラと MSI が `src-tauri/target/release/bundle/` に生成されます。

動作環境: Windows 10 / 11 と WebView2 ランタイム(Windows 11 には同梱)。

## キーボード操作

| キー | 動作 |
|---|---|
| `→` `PageDown` `Space` | 次のページ |
| `←` `PageUp` | 前のページ |
| `Ctrl+F` | 本文内検索 |
| `Esc` | 開いているパネルを閉じる |

ページ送りモードではマウスホイールでもページをめくれます。

## ソースからのビルド

必要なもの:

- Node.js 20 以上
- Rust(stable、`x86_64-pc-windows-msvc`)
- Visual Studio Build Tools 2022 の「C++ によるデスクトップ開発」ワークロード
- WebView2 ランタイム(Windows 11 には同梱)

```bash
npm install
npm run tauri dev      # ホットリロード付きで起動
npm run tauri build    # インストーラと MSI を生成
```

チェック:

```bash
npm run typecheck
cargo test --manifest-path src-tauri/Cargo.toml
```

ブラウザモード: `npm run dev` を実行し、ブラウザで http://localhost:1420 を開きます。Tauri の外ではメモリ上のモックバックエンドとサンプル本に切り替わるので、UI の作業に便利です。このモードでは何も保存されません。

## データの保存場所

`%APPDATA%\dev.leafbound.app\`

| パス | 内容 |
|---|---|
| `library.json` | 本、カテゴリ、読書位置、設定 |
| `books\` | 取り込んだ EPUB のコピー |
| `covers\` | 抽出した表紙画像 |
| `annotations\` | ハイライトとメモ(本ごとに 1 ファイル) |

ライブラリから本を削除すると、コピーとメモも削除されます。元のファイルには触れません。

## ディレクトリ構成

```
src/            React フロントエンド: ライブラリ、リーダー、設定、i18n
src-tauri/      Rust バックエンド: ライブラリ保存、EPUB メタデータと表紙の抽出、IPC コマンド
scripts/        補助スクリプト: アプリアイコン、テスト用 EPUB、スクリーンショット用デモ本
```

## ロードマップ

- 複数ウィンドウ

## コントリビュート

Issue と Pull Request を歓迎します。PR を送る前に `npm run typecheck` と `cargo test` を通してください。ユーザーに見える文字列を追加するときは `src/i18n.tsx` の両方の辞書に入れてください。

## ライセンス

MIT © racode246
