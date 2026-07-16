// Minimal in-memory event emitter with the same on/off/emit surface the game
// screens use on the socket — useSocketEvent subscribes to this during a demo
// run, so screens replay a simulated game without a server.
export const createDemoBus = () => {
  const handlers = new Map()

  return {
    on(event, handler) {
      if (!handlers.has(event)) {
        handlers.set(event, new Set())
      }

      handlers.get(event).add(handler)
    },

    off(event, handler) {
      handlers.get(event)?.delete(handler)
    },

    emit(event, ...args) {
      for (const handler of [...(handlers.get(event) ?? [])]) {
        handler(...args)
      }
    },
  }
}
