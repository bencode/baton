import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

// scrypt password hashing — no external dep, runtime Node. Stored form is
// "<saltHex>:<hashHex>"; verify re-derives with the stored salt and compares in
// constant time. scryptSync is fine here (login is rare, off the hot path).
const KEYLEN = 64

export const hashPassword = (password: string): string => {
  const salt = randomBytes(16)
  return `${salt.toString('hex')}:${scryptSync(password, salt, KEYLEN).toString('hex')}`
}

export const verifyPassword = (password: string, stored: string): boolean => {
  const [saltHex, hashHex] = stored.split(':')
  if (!saltHex || !hashHex) return false
  const expected = Buffer.from(hashHex, 'hex')
  const actual = scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}
