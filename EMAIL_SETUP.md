# Email setup — all LMS emails

One sending account sends every email the LMS makes:

| Email | Goes to | When |
|---|---|---|
| Placement drive details | eligible students | the Placement Cell saves a drive with **Save & email** |
| Drive update | the same students | a drive is edited and **Email the updated details** is ticked |
| 6-digit code | the student | creating a student account, or *Forgot password* |
| Welcome — account ready | the student | a student account is created (linked to Master Data, or asked to register) |
| Registration received | the student | a student whose email wasn't in Master Data completes registration |
| New student registered | the Placement Cell (`PLACEMENT_CELL_EMAIL`) | the same moment — so the new record can be checked |
| Application received | the student | the student applies for a drive |
| Application update | the student | the Placement Cell changes the status (Shortlisted / Selected / Not selected), rounds cleared or adds a message |
| Attendance session | expected students | a session is created with “Email the students” ticked |

The app works before email is set up. Everything is saved, and the emails wait in a queue:

- drive emails: open the drive and press **Send waiting emails**;
- all other emails: open **Emails** in the menu and press **Send waiting** (they also go out by themselves the next time the Placement Cell or Admin opens the LMS).

The 6-digit codes are the only emails that can't wait: until email is set up, student accounts are created without the code step, and *Forgot password* asks the student to contact the Placement Cell.

## 1. Get a password for the sending account

**Gmail or Google Workspace (recommended)**

Your normal Gmail password will not work here. Gmail needs an *App Password*:

1. Sign in to the Gmail account that should send the emails, for example a placement cell Gmail.
2. Open **Google Account → Security** and turn on **2-Step Verification**.
3. On the same page, open **App passwords**. Create one called `GJIMT LMS`.
4. Google shows a 16-letter password, like `abcd efgh ijkl mnop`. Copy it.

**College email server**

Ask your IT team for the SMTP host, the port, and a username and password.

## 2. Put the settings in `env/backend.env`

1. In the project folder, copy `env/backend.env.example` to `env/backend.env`.
2. Fill in these two lines:

```
SMTP_USER=yourplacementcell@gmail.com
SMTP_PASS=abcd efgh ijkl mnop
```

For a non-Gmail server, also set `SMTP_HOST` and `SMTP_PORT`. Use `SMTP_SECURE=false` for port 587.

Two optional lines:

```
PLACEMENT_CELL_EMAIL=placementcell@gjimt.ac.in
APP_URL=https://lms.gjimt.ac.in
```

- `PLACEMENT_CELL_EMAIL` — who gets the “New student registered” alerts (several addresses: separate with commas). Without it, the alerts go to `SMTP_USER`.
- `APP_URL` — the address where students open the LMS. When set, student emails get an **Open the student portal** button. Leave it out while the LMS only runs on one computer.

`env/backend.env` is private:

- it is in `.gitignore`, so it is never committed;
- it is never sent to the browser;
- don't share it or paste it anywhere public.

## 3. Check it works

```
npm run mail-check
```

You should see `✓ Email works: …`. If you see a message about the password not being accepted, make sure you used the App Password and not the normal password.

## 4. Use it

Start the app as usual:

```
npm run dev
```

The email service runs inside it automatically. If the app was already running, it picks up the new settings by itself.

The Drive page shows **Email ready — sends as pl••••@gmail.com** when everything is set.

## Good to know

- **Gmail sending limits:** about 500 emails a day for a normal Gmail account, and about 2,000 for Google Workspace. Big batches beyond that will show as *Failed*. Use **Retry failed** the next day.
- **Speed:** each student gets their own email, with a short pause between emails. You can change the pause with `MAIL_DELAY_MS`.
- **Hosting the built app:** for example with Firebase Hosting, the email service has to run somewhere too. Run `npm run mail-server` on a server, route `/api/mail` to it, and set `MAIL_API_TOKEN` (and `VITE_MAIL_API_TOKEN` for the app) so only your app can use it.
- **Safety:** the email service only sends the LMS's own templates (drive details, codes, the student emails above) — it can't be used to send free text. “New student registered” alerts only ever go to `PLACEMENT_CELL_EMAIL`. Before putting the LMS on the internet for students, the mail server should also check who is signed in (Firebase ID token) — ask for this when you host it.
