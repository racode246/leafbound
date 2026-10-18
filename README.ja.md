<p align="center"><a href="README.md">English</a> | <b>日本語</b></p>

# Leafbound

Windows と macOS 向けの、静かで軽いオープンソース EPUB リーダーです。読んでいる本の内容を AI に質問できます。

https://github.com/user-attachments/assets/a9ec5861-b565-4ac1-9db6-a431f097cb5b

Leafbound は [Tauri 2](https://tauri.app/)(Rust)、React、TypeScript、[epub.js](https://github.com/futurepress/epub.js) で作られています。本をローカルのライブラリに保管し、読んだ位置を覚え、読書の邪魔をしないことを目指しています。本について話したくなったら「AI に質問」を開いてください。登場人物が誰だったか、3 章前に何があったか、先週引いたハイライトとこの一節がどうつながるか、といったことを聞けます。

## AI に質問

- 普段の言葉で、どの言語でも質問できます。回答は質問と同じ言語で、書かれた端から表示されます。
- 回答の材料は 4 つです: いま読んでいる章 (読書位置の前後)、本全体から検索した箇所、あなたのハイライトとメモ、同じ本についての過去の会話。
- 直近 5 往復の会話は文脈としてそのまま渡すので、「それはなぜ？」のような続きの質問ができます。それより前の会話も消えるわけではなく、関係があれば類似検索で呼び戻されます。
- 回答には根拠が `[#1]` (本文) や `[H1]` (ハイライト) の形で付きます。クリックすると本のその箇所へ移動します。
- Anthropic (既定のモデルは `claude-sonnet-5-5`) と、OpenAI 互換の API (OpenAI、OpenRouter、Ollama、LM Studio など) に対応しています。プロバイダ・モデル・URL はパネルの ⚙ で設定します。
- 「新しい会話」で会話をやり直せます。履歴は本ごとに削除できます。

### しくみ

1. 初めてパネルを開くと、確認のうえで小さな多言語の検索用モデル ([multilingual-e5-small](https://huggingface.co/Xenova/multilingual-e5-small)、int8 ONNX、約 135 MB) をダウンロードします。取得するリビジョンは固定し、SHA-256 で検証しています。
2. 本文を約 500 字ずつに区切り、この PC 上でベクトルに変換します。ベクトルは、ハイライトや過去の回答と一緒に、[sqlite-vec](https://github.com/asg017/sqlite-vec) を使ったローカルの SQLite データベースに保存されます。長編小説 1 冊でおよそ 10 秒です。
3. 質問のたびに、設定したモデルがまず「答えになりそうな短い一節」を書き、それをローカルでベクトルにして本文から近い箇所を探します (質問文そのもので探すより、答えの載っている章を見つけやすくなります)。ハイライトと過去の会話は質問文で探します。
4. 見つかった材料からプロンプトを組み立て、設定したモデルに送ります。

### プライバシーと API キー

- 索引作成と本文の検索はこの PC 上で行います。プロバイダへのリクエストは質問ごとに 2 回 (検索用の一節と回答) です。送られるのは、質問、いま読んでいる章の本文 (最大約 6,000 字)、検索で見つかった本文・ハイライト・メモ、直近 5 往復の会話だけです。Ollama のようなローカルサーバーを使えば、何も PC の外に出ません。
- API キーは Windows 資格情報マネージャー、または macOS のキーチェーンに保存します。設定ファイルには書かれず、アプリに再表示されることもなく、HTTPS でのみ送信します (平文の HTTP は `localhost` に限り許可)。

## 機能

- AI に質問: 本文・ハイライト・過去の会話をもとに、本についての質問に根拠付きで答えます (上記参照)。
- EPUB 2 / EPUB 3 を開けます。本はライブラリにコピーされ、元のファイルは変更しません。
- 本ごとに読書位置を保存し、次回はそこから再開します。
- ページ番号を指定して移動(Ctrl+G)、進捗バーのドラッグで移動。ページは本文を一定の文字数で区切ったもので、フォントやレイアウトを変えても番号は変わりません。
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

[Releases ページ](https://github.com/racode246/leafbound/releases)からダウンロードしてください。

- **Windows**: インストーラ `Leafbound_<version>_x64-setup.exe`。コード署名はまだ行っていないため、初回起動時に Windows SmartScreen の確認が出ることがあります。
- **macOS** (Apple Silicon): ディスクイメージ `Leafbound_<version>_aarch64.dmg`。開いて Leafbound を「アプリケーション」にドラッグします。アプリは署名・公証していないため、初回起動は macOS にブロックされます。「アプリケーション」で Leafbound を Control キーを押しながらクリック (または右クリック) して **開く** を選び、確認してください (最近の macOS では、一度開こうとしたあと **システム設定 > プライバシーとセキュリティ** で **このまま開く** を押します)。ターミナルで隔離フラグを外す方法もあります:

  ```bash
  xattr -dr com.apple.quarantine /Applications/Leafbound.app
  ```

Leafbound は起動時 (1 日 1 回まで) と、ライブラリのサイドバー下部の **アップデートを確認** を押したときに新しいリリースを確認します。新しいバージョンと変更点を表示し、確認してからインストールして再起動します。アップデートには署名があり、インストール前に検証します。

下記の手順でソースからビルドすることもできます。Windows では `src-tauri/target/release/bundle/nsis/`、macOS では `src-tauri/target/release/bundle/dmg/` に生成されます。

動作環境: Windows 10 / 11 と WebView2 ランタイム(Windows 11 には同梱)、または Apple Silicon の macOS。「AI に質問」にはプロバイダの API キー、またはローカルの OpenAI 互換サーバーが必要です。

## キーボード操作

| キー | 動作 |
|---|---|
| `→` `PageDown` `Space` | 次のページ |
| `←` `PageUp` | 前のページ |
| `Ctrl+F` (macOS: `⌘F`) | 本文内検索 |
| `Ctrl+G` (macOS: `⌘G`) | ページ指定で移動 |
| `Ctrl+=` / `Ctrl+-` (macOS: `⌘=` / `⌘-`) | 文字を大きく / 小さく |
| `Ctrl+0` (macOS: `⌘0`) | 文字サイズを既定に戻す |
| `Esc` | 開いているパネルを閉じる |
| `Enter` / `Shift+Enter` | AI に質問: 送信 / 改行 |

ページ送りモードではマウスホイールでもページをめくれます。

## ソースからのビルド

必要なもの:

- Node.js 20.19 以上 または 22.12 以上 (Vite 8 の要件)
- Rust 1.90 以上 (stable、`x86_64-pc-windows-msvc` または `aarch64-apple-darwin`)
- Windows: Visual Studio Build Tools 2022 の「C++ によるデスクトップ開発」ワークロード。リンクのほか、同梱の C/C++ コード (SQLite、sqlite-vec、トークナイザのライブラリ) のコンパイルに使います。
- Windows: WebView2 ランタイム(Windows 11 には同梱)
- macOS: Xcode Command Line Tools (`xcode-select --install`)
- `src-tauri/target` 用に約 5 GB の空き容量

```bash
npm install
npm run tauri dev      # ホットリロード付きで起動
npm run tauri build    # インストーラを生成
```

初回の Rust ビルドでは、`ort` クレートがビルド済みの ONNX Runtime (約 350 MB) を `cdn.pyke.io` からダウンロードし、検証したうえで静的リンクします。キャッシュは `%LOCALAPPDATA%\ort.pyke.io` (macOS は `~/Library/Caches/ort.pyke.io`) に置かれます。オフラインでビルドする場合は、自分でビルドした ONNX Runtime を `ORT_LIB_LOCATION` で指定してください ([ort のリンク方法](https://ort.pyke.io/setup/linking))。

チェック:

```bash
npm run typecheck
cargo test --manifest-path src-tauri/Cargo.toml
# 検索用モデルをダウンロードして検索精度を確認 (任意):
cargo test --manifest-path src-tauri/Cargo.toml --test embedding_model -- --ignored --nocapture
```

ブラウザモード: `npm run dev` を実行し、ブラウザで http://localhost:1420 を開きます。Tauri の外ではメモリ上のモックバックエンドとサンプル本に切り替わるので、UI の作業に便利です。このモードでは何も保存されません。

## データの保存場所

- Windows: `%APPDATA%\dev.leafbound.app\`
- macOS: `~/Library/Application Support/dev.leafbound.app/`

| パス | 内容 |
|---|---|
| `library.json` | 本、カテゴリ、読書位置、設定 |
| `books\` | 取り込んだ EPUB のコピー |
| `covers\` | 抽出した表紙画像 |
| `annotations\` | ハイライトとメモ(本ごとに 1 ファイル) |
| `assistant.sqlite` | AI に質問: 本文・ハイライト・会話のベクトルと会話履歴 |
| `models\` | 検索用モデル (「AI に質問」の初回利用時にダウンロード) |
| `logs\` | ログファイル (`leafbound.log`、1 MB で切り替え、直近 4 本を保持)。不具合報告に添付してください |

ライブラリから本を削除すると、コピー、メモ、「AI に質問」がその本について保存したデータも削除されます。元のファイルには触れません。API キーはこのフォルダではなく Windows 資格情報マネージャー、または macOS のキーチェーンにあります。

## ディレクトリ構成

```
src/            React フロントエンド: ライブラリ、リーダー、設定、i18n
src-tauri/      Rust バックエンド: ライブラリ保存、EPUB メタデータと表紙の抽出、IPC コマンド、
                読書アシスタント (ローカル embedding、ベクトルストア、LLM クライアント)
scripts/        補助スクリプト: アプリアイコン、テスト用 EPUB、スクリーンショット用デモ本
```

## コントリビュート

Issue と Pull Request を歓迎します。PR を送る前にコードを整形し (`npm run format` と `cargo fmt --manifest-path src-tauri/Cargo.toml`)、`npm run typecheck` と `cargo test` を通してください。ユーザーに見える文字列を追加するときは `src/i18n.tsx` の両方の辞書に入れてください。

## ライセンス

MIT © racode246
