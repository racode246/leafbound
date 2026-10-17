// The real app (built with an E2E identifier) driven over WebView2 CDP, with Ask
// AI pointed at the fake OpenAI-compatible server. Japanese UI.
//
// Works with and without the search-passage (HyDE) step: every question must
// produce exactly one answer request, optionally preceded by one search-passage
// request; the fallback check runs only when search passages are in use.
import { sleep } from './lib/cdp.mjs'

const BOOK = '古本屋のミケ'

export default async function appSuite(s, { llm }) {
  const inv = (cmd, args) => s.ev(`window.__TAURI_INTERNALS__.invoke(${JSON.stringify(cmd)}, ${JSON.stringify(args ?? {})})`)
  const turns = () => s.ev(`document.querySelectorAll('.assistant-panel .ai-turn').length`)
  const answering = `[...document.querySelectorAll('.assistant-input button')].some((b) => b.textContent === '停止')`
  const openChapter = async (title) => {
    await s.clickText('.bar-button', '目次')
    await s.waitFor(`!!document.querySelector('.toc-item')`)
    await s.clickText('.toc-item', title)
    await s.waitFor(`(document.querySelector('.reader-chapter')?.textContent ?? '').includes(${JSON.stringify(title)})`)
  }
  let searchPassages = 0
  const ask = async (question) => {
    const before = llm.requests.length
    await s.type('.assistant-input textarea', question)
    await s.ev(`document.querySelector('.assistant-input').requestSubmit()`)
    await s.waitFor(`!${answering} && !document.querySelector('.assistant-input textarea').value`, 60000)
    await sleep(200)
    const err = await s.ev(`document.querySelector('.assistant-panel .ai-error')?.textContent ?? null`)
    if (err) throw new Error('assistant error: ' + err)
    const mine = llm.requests.slice(before)
    const answers = mine.filter((r) => !r.hyde)
    const hyde = mine.filter((r) => r.hyde)
    searchPassages += hyde.length
    s.check(answers.length === 1 && hyde.length <= 1 && (hyde.length === 0 || mine[0].hyde), `one answer request for "${question}"`)
    return answers[0]
  }

  await s.waitFor(`!!document.querySelector('.card-cover')`, 60000)
  const lib = await inv('get_library')
  const book = lib.books.find((b) => b.title === BOOK)
  s.check(!!book, 'test book imported from the command line')
  await inv('save_settings', {
    settings: { ...lib.settings, language: 'ja', assistant: { provider: 'openai', model: 'fake-model', baseUrl: llm.url } }
  })
  await s.ev(`location.reload()`)
  await sleep(1000)
  await s.waitFor(`!!document.querySelector('.card-cover')`)
  await s.ev(`[...document.querySelectorAll('.card')].find((c) => c.textContent.includes(${JSON.stringify(BOOK)})).querySelector('.card-cover').click()`)
  await s.waitFor(`!!document.querySelector('.reader-view iframe') && !document.querySelector('.reader-overlay')`)

  console.log('highlight with a note')
  await openChapter('第三章 カレーの作り方')
  await sleep(500)
  await s.ev(`(() => {
    const doc = document.querySelector('.reader-view iframe').contentDocument
    const p = [...doc.querySelectorAll('p')].find((e) => e.textContent.startsWith('隠し味'))
    const r = doc.createRange(); r.selectNodeContents(p)
    const sel = doc.getSelection(); sel.removeAllRanges(); sel.addRange(r)
    doc.dispatchEvent(new Event('selectionchange'))
  })()`)
  await s.waitFor(`!!document.querySelector('.selection-menu')`)
  await s.ev(`document.querySelector('.selection-menu .selection-note').click()`)
  await s.waitFor(`!!document.querySelector('.annotation-editor textarea')`)
  await s.type('.annotation-editor textarea', 'カレーの秘密の材料')
  await s.clickText('.annotation-editor button', '保存')
  await sleep(300)
  s.check((await inv('get_annotations', { id: book.id })).length === 1, 'highlight saved')

  console.log('Ask AI: model and index')
  await s.clickText('.bar-button', 'AI に質問')
  await s.waitFor(`!!document.querySelector('.assistant-panel')`)
  const consent = `document.querySelector('.assistant-panel .ai-card button.primary')`
  await s.waitFor(`!!${consent} || !document.querySelector('.assistant-input textarea').disabled`, 60000)
  if (await s.ev(`!!${consent} && ${consent}.textContent.includes('ダウンロード')`)) {
    console.log('  (model not present: downloading it, ~135 MB)')
    await s.ev(`${consent}.click()`)
  }
  await s.waitFor(`!document.querySelector('.assistant-input textarea').disabled && !document.querySelector('.assistant-panel .ai-progress')`, 600000)
  const status = await inv('assistant_status', { bookId: book.id })
  s.check(status.indexedSections.length === 4, 'all 4 spine sections indexed')

  console.log('Ask AI: questions')
  let r = await ask('カレーの隠し味は何？')
  let sys = r.body.messages[0].content
  s.check(r.body.messages.length === 2, 'Q1: system + question only')
  s.check(/<current_chapter>[\s\S]*りんご/.test(sys), 'Q1: current chapter text included')
  s.check(/<highlights>[\s\S]*隠し味[\s\S]*カレーの秘密の材料/.test(sys), 'Q1: highlight and note retrieved')
  s.check(!/\(chapter: 第三章/.test(sys), 'Q1: the fully included chapter is not repeated as passages')
  s.check(r.authorization === null, 'Q1: no Authorization header without a key')

  r = await ask('それはなぜ？')
  s.check(r.body.messages.length === 4 && r.body.messages[1].content === 'カレーの隠し味は何？', 'Q2: previous exchange in the window')

  await openChapter('第一章 猫のミケ')
  r = await ask('灯台の光は何秒ごとに回る？')
  sys = r.body.messages[0].content
  const passages = sys.match(/<passages>([\s\S]*?)<\/passages>/)?.[1] ?? ''
  s.check(/^\[#1\] \(chapter: 第四章 灯台\)/m.test(passages), 'Q3: top passage comes from the lighthouse chapter')
  s.check(/<current_chapter>[\s\S]*三毛猫/.test(sys), 'Q3: current chapter is chapter 1')

  for (const q of ['ミケの好物は？', '佐伯さんの昔の仕事は？', '千夏は何を焦がした？', '詩集は誰からもらった？']) await ask(q)
  r = await ask('カレーの隠し味をもう一度教えて')
  const msgs = r.body.messages
  s.check(msgs.length === 12, `Q8: window holds exactly 5 exchanges (${msgs.length} messages)`)
  s.check(msgs[1].content === '灯台の光は何秒ごとに回る？', 'Q8: window starts at Q3')
  s.check(/<earlier_conversations>[\s\S]*Q: カレーの隠し味は何？/.test(msgs[0].content), 'Q8: Q1 comes back as an earlier conversation')
  s.check((await turns()) === 8, 'UI shows 8 turns')
  await s.shot('app-chat.png')

  await openChapter('第一章 猫のミケ')
  await s.ev(`[...document.querySelectorAll('.assistant-panel .ai-turn')].at(2).querySelector('.ai-cite').click()`)
  await s.waitFor(`(document.querySelector('.reader-chapter')?.textContent ?? '').includes('第四章')`, 10000)
  s.check(true, 'citation [#1] jumps to chapter 4')

  console.log('API key, new chat, history')
  const keys = await inv('assistant_set_api_key', { provider: 'openai', key: 'sk-leafbound-e2e' })
  s.check(keys.openai === true && !JSON.stringify(keys).includes('sk-'), 'key stored; status carries no key material')
  await s.clickText('.assistant-head-actions button', '新しい会話')
  s.check((await turns()) === 0, 'new chat clears the view')
  r = await ask('ミケは雨の日どこで寝る？')
  s.check(r.body.messages.length === 2, 'new chat sends no window')
  s.check(r.authorization === 'Bearer sk-leafbound-e2e', 'key sent as a Bearer token')
  const history = await inv('assistant_history', { bookId: book.id })
  s.check(history.exchanges.length === 1 && history.exchanges[0].question === 'ミケは雨の日どこで寝る？', 'history returns the latest chat')

  if (searchPassages > 0) {
    console.log('search-passage fallback')
    llm.failSearchPassage(true)
    r = await ask('灯台の光は何秒ごとに回る？')
    s.check(/<current_chapter>[\s\S]*灯台[\s\S]*<passages>/.test(r.body.messages[0].content), 'fallback: passages found with the question')
    s.check((await turns()) === 2, 'fallback: answer shown')
    llm.failSearchPassage(false)
  } else {
    console.log('  (no search-passage requests: fallback check skipped)')
  }

  const deleted = await inv('assistant_delete_api_key', { provider: 'openai' })
  s.check(deleted.openai === false, 'key deleted')
}
