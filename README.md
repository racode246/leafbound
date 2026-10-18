<p align="center"><b>English</b> | <a href="README.ja.md">日本語</a></p>

# Leafbound

A calm, open-source EPUB reader for Windows and macOS, with an AI reading companion that answers questions about the book you are reading.

https://github.com/user-attachments/assets/a9ec5861-b565-4ac1-9db6-a431f097cb5b


Leafbound is built with [Tauri 2](https://tauri.app/) (Rust), React, TypeScript and [epub.js](https://github.com/futurepress/epub.js). It keeps your books in a local library, remembers where you stopped, and stays out of the way while you read. When you want to talk about the book, open **Ask AI** and ask: who a character is, what happened three chapters ago, or how a passage connects to the highlights you made last week.

## Ask AI about your book

- Ask in plain language, in any language; the answer comes back in the language of the question and streams in as it is written.
- Answers draw on four sources: the chapter you are reading (around your position), passages retrieved from the whole book, your highlights and notes, and earlier conversations about the same book.
- The last 5 question/answer pairs are kept as conversation context, so follow-ups such as "why?" work. Older conversations are not forgotten: they are found again by similarity when they become relevant.
- Every answer cites what it used, `[#1]` for a passage and `[H1]` for a highlight. Click a citation to jump to that place in the book.
- Works with Anthropic (default model `claude-sonnet-5-5`) or any OpenAI-compatible API: OpenAI, OpenRouter, Ollama, LM Studio and others. Provider, model and endpoint are set under ⚙ in the panel.
- "New chat" starts a fresh conversation; history can be deleted per book.

### How it works

1. The first time you open the panel, Leafbound asks before downloading a small multilingual embedding model ([multilingual-e5-small](https://huggingface.co/Xenova/multilingual-e5-small), int8 ONNX, about 135 MB). The download is pinned to a fixed revision and checked against SHA-256 digests.
2. The book text is split into ~500-character passages and turned into vectors on your PC. They are stored in a local SQLite database with [sqlite-vec](https://github.com/asg017/sqlite-vec), along with your highlights and past answers. Indexing a full-length novel takes roughly ten seconds.
3. For each question, the model you configured first writes a short passage that would answer it; that passage is embedded locally and the closest passages of the book are looked up (this finds the answering chapter far more often than searching with the question itself). Highlights and earlier conversations are looked up with the question.
4. Leafbound assembles a prompt from that material and sends it to the model you configured.

### Privacy and API keys

- Indexing and the passage search run on your PC; each question makes two requests to the provider (the search passage, then the answer). Only your question, the current chapter (up to about 6,000 characters), the retrieved passages, highlights and notes, and the last 5 exchanges are sent to the provider you choose. With a local server such as Ollama, nothing leaves your machine.
- API keys are stored in Windows Credential Manager or the macOS Keychain. They are never written to the settings file, never shown again in the app, and only sent over HTTPS (plain HTTP is allowed for `localhost`).

## Features

- Ask AI: questions about the book, answered from the text, your highlights and earlier conversations, with clickable citations (see above).
- Opens EPUB 2 and EPUB 3 files. Books are copied into a local library; your original files are never modified.
- Remembers your reading position per book and resumes there.
- Jump to a page number (Ctrl+G) or drag the progress bar to move through the book. Page numbers are fixed-size text chunks, so they don't change with font or layout.
- Categories for organizing the library. A book can belong to any number of categories.
- Cover grid or list view, search by title or author, and sorting by recently read, date added, title or author.
- Paged (horizontal) or continuous scrolling (vertical) reading.
- Single page, automatic or forced two-page spread.
- Font family (presets or any installed font), font size and line spacing.
- Light, sepia and dark color schemes.
- Table of contents, full-text search (Ctrl+F) and highlights in four colors with notes.
- Drag and drop EPUB files onto the window, or open them from Explorer through the `.epub` file association. Leafbound runs as a single instance.
- Interface in English and Japanese. The system language is used by default.
- Vertical Japanese text (`writing-mode: vertical-rl`) is rendered exactly as the publisher specified.
- Duplicate detection: importing the same file twice is skipped.

## Installation

Download a build from the [Releases page](https://github.com/racode246/leafbound/releases):

- **Windows**: the installer `Leafbound_<version>_x64-setup.exe`. Builds are not code-signed yet, so Windows SmartScreen may ask you to confirm the first launch.
- **macOS** (Apple Silicon): the disk image `Leafbound_<version>_aarch64.dmg`. Open it and drag Leafbound to Applications. The app is not signed or notarized, so macOS blocks the first launch. Either Control-click (or right-click) Leafbound in Applications and choose **Open**, then confirm (on recent macOS, open **System Settings > Privacy & Security** and click **Open Anyway** after the first attempt), or remove the quarantine flag in Terminal:

  ```bash
  xattr -dr com.apple.quarantine /Applications/Leafbound.app
  ```

Leafbound looks for a new release when it starts (at most once a day) and when you click **Check for updates** at the bottom of the library sidebar. It shows the new version and its release notes, and installs it only when you confirm, then restarts. Updates are signed, and the signature is verified before anything is installed.

You can also build an installer from source (see below); it is written to `src-tauri/target/release/bundle/nsis/` on Windows and `src-tauri/target/release/bundle/dmg/` on macOS.

Requirements at runtime: Windows 10 or 11 with the WebView2 runtime (included in Windows 11), or macOS on Apple Silicon. Ask AI also needs an API key for your provider, or a local OpenAI-compatible server.

## Keyboard shortcuts

| Key | Action |
|---|---|
| `→` `PageDown` `Space` | Next page |
| `←` `PageUp` | Previous page |
| `Ctrl+F` (macOS: `⌘F`) | Search in the book |
| `Ctrl+G` (macOS: `⌘G`) | Go to page |
| `Esc` | Close the open panel |
| `Enter` / `Shift+Enter` | Ask AI: send / new line |

Mouse wheel turns pages in paged mode.

## Building from source

Prerequisites:

- Node.js 20.19+ or 22.12+ (required by Vite 8)
- Rust 1.90 or newer (stable, `x86_64-pc-windows-msvc` or `aarch64-apple-darwin`)
- Windows: Visual Studio Build Tools 2022 with the "Desktop development with C++" workload. Besides linking, it compiles the bundled C/C++ code: SQLite, sqlite-vec and the tokenizer libraries.
- Windows: WebView2 runtime (bundled with Windows 11)
- macOS: Xcode Command Line Tools (`xcode-select --install`)
- About 5 GB of free disk space for `src-tauri/target`

```bash
npm install
npm run tauri dev      # run with hot reload
npm run tauri build    # produce the installer
```

The first Rust build downloads prebuilt ONNX Runtime binaries (about 350 MB, through the `ort` crate) from `cdn.pyke.io`, verifies them and links them statically. They are cached in `%LOCALAPPDATA%\ort.pyke.io` (macOS: `~/Library/Caches/ort.pyke.io`). To build offline, point `ORT_LIB_LOCATION` at an ONNX Runtime build of your own (see the [ort linking guide](https://ort.pyke.io/setup/linking)).

Checks:

```bash
npm run typecheck
cargo test --manifest-path src-tauri/Cargo.toml
# Downloads the embedding model and checks retrieval quality (optional):
cargo test --manifest-path src-tauri/Cargo.toml --test embedding_model -- --ignored --nocapture
```

Browser mode: `npm run dev` and open http://localhost:1420 in a browser. Outside the Tauri shell the app falls back to an in-memory mock backend with a sample book, which is convenient for UI work. Nothing is persisted in that mode.

## Where your data lives

- Windows: `%APPDATA%\dev.leafbound.app\`
- macOS: `~/Library/Application Support/dev.leafbound.app/`

| Path | Contents |
|---|---|
| `library.json` | Books, categories, reading progress and settings |
| `books\` | Imported EPUB copies |
| `covers\` | Extracted cover images |
| `annotations\` | Highlights and notes, one JSON file per book |
| `assistant.sqlite` | Ask AI: passage, highlight and conversation vectors, and conversation history |
| `models\` | The local embedding model, downloaded on first use of Ask AI |

Removing a book from the library deletes its copy, annotations and everything Ask AI stored for it. Original files are not touched. API keys live in Windows Credential Manager or the macOS Keychain, not in this folder.

## Project layout

```
src/            React frontend: library, reader, settings, i18n
src-tauri/      Rust backend: library store, EPUB metadata and cover extraction, IPC commands,
                and the reading assistant (local embeddings, vector store, LLM client)
scripts/        Helpers: app icon, sample EPUB fixture, demo books for screenshots
```

## Contributing

Issues and pull requests are welcome. Before opening a pull request, format the code (`npm run format` and `cargo fmt --manifest-path src-tauri/Cargo.toml`) and run `npm run typecheck` and `cargo test`. New user-facing strings go into both dictionaries in `src/i18n.tsx`.

## License

MIT © racode246
