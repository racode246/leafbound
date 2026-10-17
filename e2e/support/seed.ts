// Prepares the E2E app's data directory before launch: a clean slate, settings in
// library.json (UI language, Ask AI pointed at the fake LLM) and the embedding model.
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { appData, localAppData, MODEL_DIR_NAME } from './env.ts'

export interface Seed {
  language: 'en' | 'ja'
  llmUrl: string
  /** Copy the embedding model in (Ask AI tests). */
  model: boolean
}

const hasModel = (dir: string | undefined): dir is string =>
  !!dir && existsSync(dir) && readdirSync(dir).some((f) => f.endsWith('.onnx'))

/** Where to take the model from: the CI cache, or the developer's installed app. */
export function modelSource(): string | null {
  const candidates = [process.env.E2E_MODEL_DIR, join(process.env.APPDATA ?? '', 'dev.leafbound.app', 'models', MODEL_DIR_NAME)]
  return candidates.find(hasModel) ?? null
}

export function removeAppData(): void {
  for (const dir of [appData, localAppData]) {
    // WebView2 may hold files for a moment after the app exits.
    for (let i = 0; i < 20 && existsSync(dir); i++) {
      try {
        rmSync(dir, { recursive: true, force: true })
      } catch {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250)
      }
    }
  }
}

export function seed({ language, llmUrl, model }: Seed): void {
  removeAppData()
  mkdirSync(appData, { recursive: true })
  // Every Settings field is written: a partial object would not parse and the app
  // would silently fall back to defaults.
  const settings = {
    view: 'grid',
    flow: 'paginated',
    spread: 'auto',
    theme: 'light',
    fontFamily: 'publisher',
    fontSize: 18,
    lineHeight: 1.7,
    language,
    assistant: { provider: 'openai', model: 'fake-model', baseUrl: llmUrl }
  }
  writeFileSync(join(appData, 'library.json'), JSON.stringify({ version: 1, books: [], categories: [], settings }))
  if (model) {
    const source = modelSource()
    if (source) cpSync(source, join(appData, 'models', MODEL_DIR_NAME), { recursive: true })
  }
}

/** After a run that downloaded the model, fill the CI cache directory. */
export function keepDownloadedModel(): void {
  const cache = process.env.E2E_MODEL_DIR
  const downloaded = join(appData, 'models', MODEL_DIR_NAME)
  if (cache && hasModel(downloaded) && !hasModel(cache)) cpSync(downloaded, cache, { recursive: true })
}
