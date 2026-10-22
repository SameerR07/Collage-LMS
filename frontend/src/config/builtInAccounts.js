/* =========================================================
   Permanent built-in accounts (local mode — before Firebase).
   They always exist, cannot be deleted from the app, and skip
   approval. Passwords are NOT written here, only a salted
   PBKDF2-SHA-256 hash, so reading this file does not reveal them.

   To change a password:
     npm run hash-password -- "New Password 123"
   then paste the printed salt and hash over the old ones.
========================================================= */

export const BUILT_IN_ACCOUNTS = [
  {
    uid: 'builtin-admin',
    role: 'admin',
    name: 'GJIMT Admin',
    email: 'admin@gjimt.ac.in',
    salt: '2a28ddb4e4d2643c9fb6cbc96ab521db',
    hash: '8b3fbe50fdb0b7e24720f470997065793c3792c102f596c850cc4f78f98e656b',
    iterations: 150000,
  },
  {
    uid: 'builtin-placement-cell',
    role: 'placement',
    name: 'Placement Cell',
    email: 'placementcell@gjimt.ac.in',
    salt: 'e3f1021bd89150e04a3793dc2f5354d5',
    hash: '4bc12dd083cb18bec4d160fecdd414d4a9b0c0f8dc0616388d179e4e68299cdb',
    iterations: 150000,
  },
]
