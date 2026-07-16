import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { dispatchToEngine } from '../src/events/dispatchToEngine.js'

const silenceConsoleError = async (fn) => {
  const original = console.error
  console.error = () => {}

  try {
    return await fn()
  } finally {
    console.error = original
  }
}

describe('dispatchToEngine', () => {
  it('runs local engine actions and returns their result', async () => {
    const room = {
      engine: {
        questionProgress: () => ({ current: 1, total: 2 }),
      },
    }

    const result = await dispatchToEngine(room, {}, 'game-1', 'questionProgress', [], true)

    assert.deepEqual(result, { current: 1, total: 2 })
  })

  it('lets local engine action failures reach the socket safeHandler boundary', async () => {
    const room = {
      engine: {
        explode: async () => {
          throw new Error('boom')
        },
      },
    }

    await assert.rejects(
      dispatchToEngine(room, {}, 'game-1', 'explode', [], true),
      /boom/,
    )
  })

  it('returns the first non-null remote rpc response', async () => {
    const io = {
      serverSideEmitWithAck: async (event, payload) => {
        assert.equal(event, 'engine:action:rpc')
        assert.deepEqual(payload, { gameId: 'game-1', action: 'questionProgress', args: [] })
        return [null, { current: 2, total: 4 }]
      },
    }

    const result = await dispatchToEngine(
      { engine: null },
      io,
      'game-1',
      'questionProgress',
      [],
      true,
    )

    assert.deepEqual(result, { current: 2, total: 4 })
  })

  it('times out stalled remote rpc calls', async () => {
    const io = {
      serverSideEmitWithAck: () => new Promise(() => {}),
    }

    const started = Date.now()
    const result = await silenceConsoleError(() =>
      dispatchToEngine(
        { engine: null },
        io,
        'game-1',
        'questionProgress',
        [],
        true,
        { timeoutMs: 10 },
      ),
    )

    assert.equal(result, null)
    assert.ok(Date.now() - started < 1_000)
  })

  it('routes fire-and-forget actions to other nodes', async () => {
    const emitted = []
    const io = {
      serverSideEmit: (...args) => emitted.push(args),
    }

    const result = await dispatchToEngine({ engine: null }, io, 'game-1', 'receiveAnswer', ['p1', 0])

    assert.equal(result, undefined)
    assert.deepEqual(emitted, [
      ['engine:action', { gameId: 'game-1', action: 'receiveAnswer', args: ['p1', 0] }],
    ])
  })
})
