// OpenAI-compatible /v1/chat/completions server for the app project. Streams a
// canned answer citing [#1] and [H1] and records every request.
//
// Search-passage (HyDE) requests are recognised by their system prompt and
// answered with the question itself; `failSearchPassage(true)` makes them
// return HTTP 500 to exercise the fallback to searching with the question.
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'

export interface LlmRequest {
  n: number
  searchPassage: boolean
  authorization: string | null
  body: { messages: { role: string; content: string }[] }
}

export interface FakeLlm {
  url: string
  requests: LlmRequest[]
  failSearchPassage(on: boolean): void
  close(): Promise<void>
}

export async function startFakeLlm(): Promise<FakeLlm> {
  const requests: LlmRequest[] = []
  let failHyde = false

  const stream = async (res: import('node:http').ServerResponse, text: string) => {
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    res.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { role: 'assistant' } }] })}\n\n`)
    for (const piece of text.match(/.{1,5}/gsu) ?? []) {
      await new Promise((r) => setTimeout(r, 10))
      res.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: piece } }] })}\n\n`)
    }
    res.write('data: [DONE]\n\n')
    res.end()
  }

  const server = createServer((req, res) => {
    let raw = ''
    req.on('data', (c) => (raw += c))
    req.on('end', async () => {
      if (req.method !== 'POST' || !req.url?.endsWith('/chat/completions')) {
        res.writeHead(404).end('{"error":{"message":"not found"}}')
        return
      }
      const body = JSON.parse(raw)
      const searchPassage = String(body.messages[0]?.content ?? '').startsWith('You help search inside the book')
      requests.push({ n: requests.length + 1, searchPassage, authorization: req.headers.authorization ?? null, body })
      const question = body.messages.at(-1).content
      if (searchPassage) {
        if (failHyde) {
          res.writeHead(500, { 'content-type': 'application/json' }).end('{"error":{"message":"search passage disabled"}}')
          return
        }
        await stream(res, question)
        return
      }
      await stream(res, `Answer ${requests.length}: about "${question}" the book says this [#1]. Your highlight helped too [H1].`)
    })
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  return {
    url: `http://127.0.0.1:${port}/v1`,
    requests,
    failSearchPassage: (on) => (failHyde = on),
    close: () => new Promise((resolve) => server.close(() => resolve()))
  }
}
