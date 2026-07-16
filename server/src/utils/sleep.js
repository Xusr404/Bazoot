/** Resolves after the given number of seconds (matches source timing semantics). */
export const sleep = (seconds) =>
  new Promise((resolve) => {
    setTimeout(resolve, seconds * 1000)
  })
