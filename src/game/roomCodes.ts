const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ'
const CODE_RE = new RegExp(`^[${ALPHABET}]{4}$`)

export function generateRoomCode(rand: () => number = Math.random): string {
  let code = ''
  for (let i = 0; i < 4; i++) {
    code += ALPHABET[Math.min(ALPHABET.length - 1, Math.floor(rand() * ALPHABET.length))]
  }
  return code
}

export function isValidRoomCode(s: string): boolean {
  return CODE_RE.test(s)
}

export function codeFromHash(hash: string): string | null {
  const candidate = hash.replace(/^#/, '').toUpperCase()
  return isValidRoomCode(candidate) ? candidate : null
}
