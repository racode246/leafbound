// OpenAI-compatible /v1/chat/completions server for the app suite. Streams a
// canned answer citing [#1] and [H1] and records every request in memory.
//
// Search-passage (HyDE) requests are recognised by their system prompt and
// answered with the question itself; `failSearchPassage(true)` makes them
// return HTTP 500 to exercise the fallback to searching with the question.
import { createServer } from 'node:http'

export function startFakeLlm(port) {
  const requests = []
  let failHyde = false

  const stream = async (res, text) => {
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    res.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { role: 'assistant' } }] })}\n\n`)
    for (const piece of text.match(/.{1,5}/gsu)) {
      await new Promise((r) => setTimeout(r, 10))
      res.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: piece } }] })}\n\n`)
    }
    res.write('data: [DONE]\n\n')
    res.end()
  }

  const server = createServer((req, res) => {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', async () => {
      if (req.method !== 'POST' || !req.url.endsWith('/chat/completions')) {
        res.writeHead(404).end('{"error":{"message":"not found"}}')
        return
      }
      const parsed = JSON.parse(body)
      const hyde = parsed.messages[0]?.content.startsWith('You help search inside the book')
      requests.push({ n: requests.length + 1, hyde, authorization: req.headers.authorization ?? null, body: parsed })
      const question = parsed.messages.at(-1).content
      if (hyde) {
        if (failHyde) {
          res.writeHead(500, { 'content-type': 'application/json' }).end('{"error":{"message":"search passage disabled"}}')
          return
        }
        await stream(res, question)
        return
      }
      await stream(res, `回答${requests.length}: 「${question}」について、本文では次のように書かれています [#1]。あなたのハイライトも参考にしました [H1]。`)
    })
  })

  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () =>
      resolve({
        url: `http://127.0.0.1:${port}/v1`,
        requests,
        failSearchPassage: (on) => (failHyde = on),
        close: () => new Promise((r) => server.close(r))
      })
    )
  })
}
