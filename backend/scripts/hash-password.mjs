// Make a salt + hash for a built-in account password.
//   npm run hash-password -- "New Password 123"
// Paste the two values into frontend/src/config/builtInAccounts.js (salt and hash) for that account.
import { ITERATIONS, hashPassword, toHex } from '../../frontend/src/lib/localAccounts.js'

const password = process.argv[2]
if (!password || password.length < 8) {
  console.error('Give the new password in quotes (at least 8 characters):  npm run hash-password -- "New Password 123"')
  process.exit(1)
}
const salt = crypto.getRandomValues(new Uint8Array(16))
const hash = await hashPassword(password, salt, ITERATIONS)
console.log(JSON.stringify({ salt: toHex(salt), hash, iterations: ITERATIONS }, null, 2))
