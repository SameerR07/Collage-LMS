# Settings (env)

| File | What it holds | Private? |
|---|---|---|
| `backend.env` | Email sending account and its App Password (`SMTP_…`), Google Client ID, Placement Cell alert address | **Yes** — never share or commit |
| `backend.env.example` | Blank copy of `backend.env` with explanations | No |
| `frontend.env` | Firebase settings (only if you connect Firebase) | Keep private |
| `frontend.env.example` | Blank copy of `frontend.env` | No |

- After editing `backend.env`, run `npm run mail-check` to test the email. The LMS picks up changes without a restart.
- After creating or editing `frontend.env`, restart `npm run dev`.
- `backend.env` and `frontend.env` are listed in `.gitignore`.
