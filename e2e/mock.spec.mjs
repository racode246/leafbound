// Browser build against the in-memory mock backend (src/lib/mockApi.ts), driven
// in headless Edge with an English UI. Covers the reader footer (page jump and
// seek), sticky panel headers and the Ask AI panel's flow without a real LLM.
import { sleep } from './lib/cdp.mjs'

const toFullWidth = (n) => String(n).replace(/\d/g, (d) => String.fromCharCode(d.charCodeAt(0) + 0xfee0))

async function openSampleBook(s, baseUrl) {
  await s.send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 800, deviceScaleFactor: 1, mobile: false })
  await s.send('Page.navigate', { url: `${baseUrl}/?rafShim=1` })
  await s.waitFor(`!!document.querySelector('.card-cover')`)
  await s.ev(`localStorage.clear(); document.querySelector('.card-cover').click()`)
  await s.waitFor(`!!document.querySelector('.reader-view iframe') && !document.querySelector('.reader-overlay')`)
}

const footer = (s) =>
  s.ev(`(() => {
    const f = document.querySelector('.reader-foot')
    return {
      page: Number(f.querySelector('.page-jump input').value),
      total: Number(f.querySelector('.page-jump span').textContent.replace(/\\D/g, '')),
      seek: Number(f.querySelector('.seek input').value)
    }
  })()`)

async function pageNavigation(s) {
  console.log('page navigation')
  await s.waitFor(`!document.querySelector('.page-jump input').disabled`, 60000)
  const { total } = await footer(s)
  s.check(total > 1, `page count is known (${total})`)

  const target = Math.max(2, Math.floor(total / 2))
  await s.ev(`(() => {
    const el = document.querySelector('.page-jump input')
    el.focus()
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${JSON.stringify(toFullWidth(target))})
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.form.requestSubmit()
  })()`)
  await sleep(1500)
  s.check((await footer(s)).page === target, `jump to page ${target} typed with full-width digits`)

  await s.ev(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))`)
  await sleep(1000)
  s.check((await footer(s)).page >= target, 'ArrowRight moves forward from the jumped-to page')

  const dragTo = Math.max(1, Math.round(total * 0.8))
  await s.ev(`(() => {
    const el = document.querySelector('.seek input')
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, '${dragTo}')
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })()`)
  await sleep(300)
  s.check(await s.ev(`!!document.querySelector('.seek-tip')`), 'dragging the progress bar shows the target page tip')
  await s.ev(`document.querySelector('.seek input').dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))`)
  await sleep(1500)
  const after = await footer(s)
  s.check(Math.abs(after.page - dragTo) <= 1, `releasing the progress bar goes to page ${dragTo} (now ${after.page})`)

  await s.ev(`document.activeElement?.blur(); window.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', ctrlKey: true, bubbles: true }))`)
  s.check(await s.ev(`document.activeElement === document.querySelector('.page-jump input')`), 'Ctrl+G focuses the page box')
}

async function stickyPanelHeader(s) {
  console.log('sticky panel header')
  await s.ev(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', ctrlKey: true, bubbles: true }))`)
  await s.waitFor(`!!document.querySelector('.search-panel input')`)
  await s.type('.search-panel input', '吾輩')
  await s.ev(`document.querySelector('.search-panel form').requestSubmit()`)
  await s.waitFor(`document.querySelectorAll('.search-hit').length > 0`, 60000)
  await sleep(500)
  const m = await s.ev(`(async () => {
    const p = document.querySelector('.search-panel')
    p.scrollTop = 400
    await new Promise((r) => setTimeout(r, 300))
    const pr = p.getBoundingClientRect(), hr = p.querySelector('.panel-sticky').getBoundingClientRect()
    return { scrolled: p.scrollTop > 0, panelTop: pr.top, headTop: hr.top }
  })()`)
  s.check(m.scrolled, 'search results scroll')
  s.check(Math.abs(m.headTop - m.panelTop) <= 1, `search header stays at the panel top (${m.headTop} vs ${m.panelTop})`)
  await s.ev(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)
}

async function askAiMock(s) {
  console.log('Ask AI (mock backend)')
  const answering = `[...document.querySelectorAll('.assistant-input button')].some((b) => b.textContent === 'Stop')`
  await s.clickText('.bar-button', 'Ask AI')
  await s.waitFor(`!!document.querySelector('.assistant-panel .ai-card button.primary')`)
  s.check(await s.ev(`document.querySelector('.assistant-input textarea').disabled`), 'input is disabled until the model is ready')
  await s.ev(`document.querySelector('.assistant-panel .ai-card button.primary').click()`)
  await s.waitFor(`!!document.querySelector('.assistant-panel progress')`)
  s.check(true, 'download progress is shown after consent')
  await s.waitFor(`!document.querySelector('.assistant-input textarea').disabled && !document.querySelector('.assistant-panel .ai-progress')`)
  s.check(true, 'model ready and book indexed')
  s.check(await s.ev(`!!document.querySelector('.assistant-panel .ai-card')`), 'missing Anthropic key is pointed out')

  await s.type('.assistant-input textarea', 'Who is the narrator?')
  await s.ev(`document.querySelector('.assistant-input').requestSubmit()`)
  await s.waitFor(`!!document.querySelector('.assistant-panel .ai-error')`)
  s.check((await s.ev(`document.querySelector('.assistant-panel .ai-error').textContent`)).includes('API key'), 'NO_API_KEY is shown translated')
  s.check(await s.ev(`document.querySelector('.assistant-input textarea').value === 'Who is the narrator?'`), 'question is restored after an error')

  await s.ev(`document.querySelector('.assistant-head-actions button[aria-label="AI settings"]').click()`)
  await s.waitFor(`!!document.querySelector('.assistant-settings input[type=password]')`)
  await s.type('.assistant-settings input[type=password]', 'sk-x')
  await s.ev(`document.querySelector('.assistant-settings input[type=password]').form.requestSubmit()`)
  await s.waitFor(`document.querySelector('.assistant-settings h3 .value')?.textContent === 'Saved'`)
  s.check(await s.ev(`document.querySelector('.assistant-settings input[type=password]').value === ''`), 'key field is cleared after saving')
  await s.clickText('.assistant-settings button', 'Done')

  await s.ev(`document.querySelector('.assistant-input').requestSubmit()`)
  await s.waitFor(answering)
  await sleep(300)
  s.check((await s.ev(`document.querySelector('.assistant-panel .ai-turn .ai-answer').textContent`)).length > 0, 'answer streams in')
  await s.ev(`[...document.querySelectorAll('.assistant-input button')].find((b) => b.textContent === 'Stop').click()`)
  await s.waitFor(`!${answering}`)
  s.check(await s.ev(`document.querySelectorAll('.assistant-panel .ai-turn').length === 0 && !document.querySelector('.assistant-panel .ai-error')`), 'Stop discards the partial answer without an error')

  await s.ev(`document.querySelector('.assistant-input').requestSubmit()`)
  await s.waitFor(`document.querySelectorAll('.assistant-panel .ai-turn').length === 1 && !${answering}`)
  s.check(true, 'full answer arrives')
  await s.clickText('.bar-button', 'Contents')
  await s.clickText('.bar-button', 'Ask AI')
  s.check(await s.ev(`document.querySelectorAll('.assistant-panel:not([hidden]) .ai-turn').length === 1`), 'conversation survives switching panels')
}

export default async function mockSuite(s, { baseUrl }) {
  await openSampleBook(s, baseUrl)
  await pageNavigation(s)
  await stickyPanelHeader(s)
  await askAiMock(s)
}
