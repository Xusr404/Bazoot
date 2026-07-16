const CLIENT_ID_PATTERN = /^[A-Za-z0-9._:-]{1,160}$/

export const isValidClientId = (clientId) =>
  typeof clientId === 'string' && CLIENT_ID_PATTERN.test(clientId)
