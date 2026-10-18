# End-to-end tests

Playwright Test, in four layers with the rest of the test suite:

| Layer | Tool | Covers | Where |
|---|---|---|---|
| Rust unit/integration | `cargo test` | storage, retrieval, prompts, SSE | CI |
| Frontend unit | Vitest (`npm test`) | pure TypeScript (chunking, i18n dictionaries) | CI |
| **mock** | Playwright's Chromium with a Windows user agent (`npx playwright install chromium` once) | UI behaviour against the in-memory mock backend (`src/lib/mockApi.ts`) | CI |
| **webkit** | Playwright's WebKit with a macOS user agent | The book iframe on WKWebView's engine: keys, selection (`npx playwright install webkit` once) | local |
| **app** | Playwright over WebView2 CDP | the real app: import, persistence across restarts, Ask AI wiring with a fake LLM, API keys, the Content Security Policy | CI |
| **live** | Playwright, real LLM key | answer quality; run locally only, when working on a related issue | local |

## Running

```bash
npm run e2e          # mock, then app
npm run e2e:mock     # starts Vite on its own port, runs headless Chromium
npm run e2e:webkit   # the same mock build in WebKit, as on macOS
npm run e2e:app      # builds the app once (debug, E2E identifier, hidden window), then runs the tests one at a time
npm run e2e:live     # local only; needs an API key stored in the E2E app
```

Both suites run headless; add `-- --headed` to watch (for the app this builds a visible window). `E2E_SKIP_BUILD=1` reuses the last app build when it was made in the same mode. Reports go to `e2e/report/`, traces and app logs to `e2e/results/`.

## How the app project is isolated

- The app is built with its own identifier (`dev.leafbound.e2e`): separate data folder, single-instance lock, WebView2 profile and Credential Manager entries. The tests check that the installed app's keys are untouched.
- WebView2's debugging port is set through the window's `additionalBrowserArgs` in the E2E build config.
- Each test seeds a fresh data folder (`support/seed.ts`), launches the app with the test book, and removes everything afterwards. `app.relaunch()` restarts on the same data.
- The identifier is compiled in, so app tests run with one worker. Worktrees made by `.claude/scripts/wt-new.ps1` get their own identifier and ports from `.wt.json`, so several worktrees can run the suites at once.
- The E2E build checks for updates at a fake update server on a fixed port per slot (`support/fake-updates.ts`), with http allowed and a test public key (`fixtures/updater/test-key.pub`) instead of the release key. It only ever serves updates that must not install.
- Ask AI talks to a fake OpenAI-compatible server (`support/fake-llm.ts`); the real embedding model is copied in from `E2E_MODEL_DIR` or the installed app, or downloaded on first use.

## Writing tests

- Use the page objects in `support/pages.ts`; add locators there rather than in tests. Prefer roles and labels.
- App tests run with the English UI (`seedOptions.language`), so locators can use English names.
- Put a test in the lowest layer that can show the behaviour; use the app project for what needs the Rust side.
