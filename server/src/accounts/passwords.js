import crypto from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(crypto.scrypt)
const KEY_LENGTH = 64

// scrypt password hashing (Node built-in, no dependencies). Each password gets
// its own random salt; comparison is constant-time.

/** @returns {Promise<{ salt: string, hash: string }>} hex-encoded */
export const hashPassword = async (password) => {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = (await scrypt(password, salt, KEY_LENGTH)).toString('hex')

  return { salt, hash }
}

/** @returns {Promise<boolean>} */
export const verifyPassword = async (password, salt, expectedHash) => {
  const hash = await scrypt(password, salt, KEY_LENGTH)
  const expected = Buffer.from(expectedHash, 'hex')

  return hash.length === expected.length && crypto.timingSafeEqual(hash, expected)
}
