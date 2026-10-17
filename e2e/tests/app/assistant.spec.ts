// Ask AI against the fake LLM in the real app: what goes into the prompt (current
// chapter, retrieved passages, highlights, window, earlier conversations), a question
// quoting a selection, the API key path, and the fallback when the search-passage
// request fails.
//
// Works with and without the search-passage (HyDE) step: each question must make
// exactly one answer request, optionally preceded by one search-passage request.
import { expect, test, type App } from '../../support/app.ts'
import type { LlmRequest } from '../../support/fake-llm.ts'
import { Assistant, Library, type Reader } from '../../support/pages.ts'

const BOOK = '古本屋のミケ'

test.use({ seedOptions: { language: 'en', model: true } })

async function openAssistant(app: App): Promise<{ reader: Reader; ai: Assistant }> {
  const reader = await new Library(app.page).open(BOOK)
  const ai = new Assistant(app.page)
  return { reader, ai }
}

async function ask(app: App, ai: Assistant, question: string): Promise<LlmRequest> {
  const before = app.llm.requests.length
  await ai.ask(question)
  return answerRequest(app, before, question)
}

/** The one answer request made since `before` (after an optional search-passage request). */
function answerRequest(app: App, before: number, question: string): LlmRequest {
  const mine = app.llm.requests.slice(before)
  const answers = mine.filter((r) => !r.searchPassage)
  expect(answers, `one answer request for "${question}"`).toHaveLength(1)
  expect(mine.length - answers.length, 'at most one search-passage request').toBeLessThanOrEqual(1)
  if (mine.length === 2) expect(mine[0].searchPassage, 'the search passage comes first').toBe(true)
  return answers[0]
}

const system = (r: LlmRequest) => r.body.messages[0].content

/** The library id of the test book. */
async function bookId(app: App): Promise<string> {
  const { books } = await app.invoke<{ books: { id: string; title: string }[] }>('get_library')
  const book = books.find((b) => b.title === BOOK)
  if (!book) throw new Error(`${BOOK} is not in the library`)
  return book.id
}

test('builds the prompt from the chapter, passages, highlights and the conversation window', async ({
  app
}) => {
  const { reader, ai } = await openAssistant(app)
  await reader.openChapter('第三章 カレーの作り方')
  await reader.highlightWithNote('隠し味', 'カレーの秘密の材料')

  await ai.open()
  await ai.waitUntilReady()
  const status = await app.invoke<{ indexedSections: number[] }>('assistant_status', {
    bookId: await bookId(app)
  })
  expect(status.indexedSections).toHaveLength(4)

  // Q1 on chapter 3: the chapter itself, the highlight and its note.
  let r = await ask(app, ai, 'カレーの隠し味は何？')
  expect(r.body.messages).toHaveLength(2)
  expect(system(r)).toMatch(/<current_chapter>[\s\S]*りんご/)
  expect(system(r)).toMatch(/<highlights>[\s\S]*隠し味[\s\S]*カレーの秘密の材料/)
  expect(system(r), 'the chapter sent in full is not repeated as passages').not.toMatch(
    /\(chapter: 第三章/
  )
  expect(r.authorization).toBeNull()

  // Q2 follows up within the window.
  r = await ask(app, ai, 'それはなぜ？')
  expect(r.body.messages).toHaveLength(4)
  expect(r.body.messages[1].content).toBe('カレーの隠し味は何？')

  // Q3 from chapter 1 about chapter 4: retrieval finds the lighthouse.
  await reader.openChapter('第一章 猫のミケ')
  r = await ask(app, ai, '灯台の光は何秒ごとに回る？')
  const passages = system(r).match(/<passages>([\s\S]*?)<\/passages>/)?.[1] ?? ''
  expect(passages).toMatch(/^\[#1\] \(chapter: 第四章 灯台\)/m)
  expect(system(r)).toMatch(/<current_chapter>[\s\S]*三毛猫/)

  // The window keeps 5 exchanges; older ones come back as earlier conversations.
  for (const q of [
    'ミケの好物は？',
    '佐伯さんの昔の仕事は？',
    '千夏は何を焦がした？',
    '詩集は誰からもらった？'
  ])
    await ask(app, ai, q)
  r = await ask(app, ai, 'カレーの隠し味をもう一度教えて')
  expect(r.body.messages).toHaveLength(12)
  expect(r.body.messages[1].content).toBe('灯台の光は何秒ごとに回る？')
  expect(system(r)).toMatch(/<earlier_conversations>[\s\S]*Q: カレーの隠し味は何？/)
  await expect(ai.turns).toHaveCount(8)

  // A citation jumps to its passage.
  await reader.openChapter('第一章 猫のミケ')
  await ai.open()
  await ai.turns.nth(2).locator('.ai-cite').first().click()
  await expect(reader.chapter).toContainText('第四章')
})

test('asks about a selection from the selection menu in the paged and scrolled layouts', async ({
  app
}) => {
  const { reader, ai } = await openAssistant(app)
  await ai.open()
  await ai.waitUntilReady()

  for (const [flow, paragraph] of [
    ['Paged (horizontal)', '隠し味は、すりおろしたりんごと少量のインスタントコーヒーである。（1）'],
    // Near the chapter start, so it is on screen (and the menu with it) in both layouts.
    ['Scroll (vertical)', 'スパイスはクミン、コリアンダー、ターメリックの三種類だけを使う。（1）']
  ] as const) {
    if (flow !== 'Paged (horizontal)') await reader.setFlow(flow)
    await reader.openChapter('第三章 カレーの作り方')
    await reader.selectParagraph(paragraph)
    await reader.askAboutSelection()

    // The quote is in the input with the caret after it: the reader types the question.
    const quote = `"${paragraph}" — `
    await expect(ai.panel).toBeVisible()
    await expect(ai.input).toHaveValue(quote)
    await expect(ai.input).toBeFocused()
    await app.page.keyboard.type('what does this mean?')
    const question = `${quote}what does this mean?`
    await expect(ai.input).toHaveValue(question)

    const before = app.llm.requests.length
    await ai.send()
    const r = answerRequest(app, before, question)
    expect(r.body.messages.at(-1), `${flow}: the quote is sent with the question`).toEqual({
      role: 'user',
      content: question
    })
    await expect(ai.turns.last().locator('.ai-question')).toHaveText(question)
  }
})

test('stores the API key outside the webview, starts a new chat and keeps history', async ({
  app
}) => {
  const { ai } = await openAssistant(app)
  await ai.open()
  await ai.waitUntilReady()

  const keys = await app.invoke<Record<string, boolean>>('assistant_set_api_key', {
    provider: 'openai',
    key: 'sk-leafbound-e2e'
  })
  expect(keys.openai).toBe(true)
  expect(JSON.stringify(keys)).not.toContain('sk-')

  await ask(app, ai, 'ミケは雨の日どこで寝る？')
  await ai.panel.getByRole('button', { name: 'New chat' }).click()
  await expect(ai.turns).toHaveCount(0)
  const r = await ask(app, ai, '千夏はミケを何と呼ぶ？')
  expect(r.body.messages, 'a new chat sends no window').toHaveLength(2)
  expect(r.authorization).toBe('Bearer sk-leafbound-e2e')

  const history = await app.invoke<{ exchanges: { question: string }[] }>('assistant_history', {
    bookId: await bookId(app)
  })
  expect(history.exchanges.map((e) => e.question)).toEqual(['千夏はミケを何と呼ぶ？'])

  const deleted = await app.invoke<Record<string, boolean>>('assistant_delete_api_key', {
    provider: 'openai'
  })
  expect(deleted.openai).toBe(false)
})

test('falls back to searching with the question when the search passage fails', async ({ app }) => {
  const { reader, ai } = await openAssistant(app)
  await ai.open()
  await ai.waitUntilReady()
  await ask(app, ai, 'ミケの好物は？')
  test.skip(!app.llm.requests.some((r) => r.searchPassage), 'this build has no search-passage step')

  app.llm.failSearchPassage(true)
  await reader.openChapter('第一章 猫のミケ')
  const r = await ask(app, ai, '灯台の光は何秒ごとに回る？')
  expect(system(r)).toMatch(/<passages>[\s\S]*\(chapter: 第四章 灯台\)/)
  await expect(ai.turns).toHaveCount(2)
})
