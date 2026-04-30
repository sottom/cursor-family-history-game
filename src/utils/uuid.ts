function fallbackUuidV4(): string {
  const template = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'
  return template.replace(/[xy]/g, (char) => {
    const random = Math.random() * 16
    const value = char === 'x' ? random : (random % 4) + 8
    return Math.floor(value).toString(16)
  })
}

/** Cross-environment UUID helper for browsers that lack `crypto.randomUUID`. */
export function makeUuid(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID()
  }
  return fallbackUuidV4()
}
