import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { describe, it } from 'node:test'
import {
  registerEngineActionHandlers,
  runEngineAction,
} from '../src/events/registerEngineActionHandlers.js'

const immediate = () => new Promise((resolve) => setImmediate(resolve))

const withSilencedConsoleError = async (fn) => {
  const original = console.error
  const errors = []
  console.error = (...args) => errors.push(args)

  try {
    const result = await fn(errors)
    return { result, errors }
  } finally {
    console.error = original
  }
}

const roomManagerWithEngine = (engine) => ({
  getRoom: (gameId) => (gameId === 'game-1' ? { engine } : undefined),
})

describe('runEngineAction', () => {
  it('awaits async engine actions and preserves this binding', async () => {
    const engine = {
      value: 41,
      async add(amount) {
        return this.value + amount
      },
    }

    const result = await runEngineAction(roomManagerWithEngine(engine), {
      gameId: 'game-1',
      action: 'add',
      args: [1],
    })

    assert.equal(result, 42)
  })

  it('returns null for unknown rooms and actions', async () => {
    const roomManager = roomManagerWithEngine({ known: () => true })

    assert.equal(
      await runEngineAction(roomManager, { gameId: 'missing', action: 'known' }),
      null,
    )
    assert.equal(
      await runEngineAction(roomManager, { gameId: 'game-1', action: 'missing' }),
      null,
    )
  })
})

describe('registerEngineActionHandlers', () => {
  it('responds to remote rpc calls with the engine result', async () => {
    const io = new EventEmitter()
    const engine = {
      questionProgress: () => ({ current: 1, total: 3 }),
    }
    registerEngineActionHandlers({ io, roomManager: roomManagerWithEngine(engine) })

    const result = await new Promise((resolve) => {
      io.emit(
        'engine:action:rpc',
        { gameId: 'game-1', action: 'questionProgress', args: [] },
        resolve,
      )
    })

    assert.deepEqual(result, { current: 1, total: 3 })
  })

  it('returns null for failed remote rpc calls', async () => {
    const io = new EventEmitter()
    const engine = {
      fail: async () => {
        throw new Error('boom')
      },
    }
    registerEngineActionHandlers({ io, roomManager: roomManagerWithEngine(engine) })

    const { result, errors } = await withSilencedConsoleError(
      () =>
        new Promise((resolve) => {
          io.emit('engine:action:rpc', { gameId: 'game-1', action: 'fail' }, resolve)
        }),
    )

    assert.equal(result, null)
    assert.equal(errors.length, 1)
  })

  it('contains failed fire-and-forget remote actions', async () => {
    const io = new EventEmitter()
    const engine = {
      fail: async () => {
        throw new Error('boom')
      },
    }
    registerEngineActionHandlers({ io, roomManager: roomManagerWithEngine(engine) })

    const { errors } = await withSilencedConsoleError(async () => {
      io.emit('engine:action', { gameId: 'game-1', action: 'fail' })
      await immediate()
    })

    assert.equal(errors.length, 1)
  })
})
