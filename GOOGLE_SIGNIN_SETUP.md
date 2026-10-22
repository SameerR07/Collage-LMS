# “Continue with Google” — setup

Students can sign in to the student portal with their Google account: no password to remember, and Google has already confirmed the email. As with email sign-up, **the same email as in Master Data = the same student**; a new email is asked for the full registration details.

You only need a free **OAuth Client ID** from Google (about 10 minutes, once). No client *secret* is needed — don't share or paste one anywhere.

## 1. Create a Google Cloud project
1. Open <https://console.cloud.google.com/> and sign in with the college account (e.g. the placement Gmail).
2. At the top, open the project picker → **New project** → name it `GJIMT Placement LMS` → **Create**, and select it.

## 2. Fill in the sign-in screen (Google Auth Platform)
1. Open <https://console.cloud.google.com/auth/overview> → **Get started**.
2. **App information:** App name `GJIMT Placement LMS`, User support email = the college Gmail.
3. **Audience:** choose **External** (students use their own Gmail).
4. **Contact information:** the college Gmail → agree → **Create**.
5. Optional, under **Branding:** add the GJIMT logo and the college website.

The LMS only asks Google for name, email and photo (the basic sign-in permissions), so students won't see an "unverified app" warning and no Google review is needed. When the LMS goes live you can still press **Publish app** under **Audience**.

## 3. Create the Client ID
1. Open <https://console.cloud.google.com/auth/clients> → **Create client**.
2. **Application type:** Web application. **Name:** `LMS web`.
3. **Authorized JavaScript origins** → add both:
   - `http://localhost`
   - `http://localhost:5173`

   Later, when the LMS is on a website, add that address too (e.g. `https://lms.gjimt.ac.in`). Use exactly the address shown in the browser bar (no path, no `/` at the end). If you open the LMS by another address (e.g. `http://127.0.0.1:5173` or the computer's network IP), add that address as well.
4. **Authorized redirect URIs:** leave empty.
5. **Create** → copy the **Client ID** (looks like `1234567890-abc123….apps.googleusercontent.com`).

## 4. Put it in the LMS
1. Open `env/backend.env` (the same file as the email settings) and add:
   ```
   GOOGLE_CLIENT_ID=1234567890-abc123....apps.googleusercontent.com
   ```
2. Restart `npm run dev` (Ctrl+C, then `npm run dev`).
3. Open the login page → **Login as Student** → the **Continue with Google** button appears under Sign in (and **Sign up with Google** under Create account).

The Client ID isn't secret (it is visible in the page), so it's fine to send it to whoever maintains the LMS.

## How it behaves
- First time with Google → a student account is opened automatically (email already verified) → linked to Master Data or sent to Registration. A welcome email goes out.
- Next times → straight into the portal. Google-opened accounts have no LMS password; the student can set one any time with **Forgot password?**.
- A Placement Cell or Admin email can't sign in through the student portal (they get a clear message).
- The LMS server checks every Google answer (Google's signature, this Client ID, not expired, verified email) before trusting it. Admin → Users shows a **Google** tag on these accounts; the Activity log records "Continue with Google".

## If something goes wrong
Quick test from the project folder: `npm run google-check` (needs the internet).

| What you see | What to do |
|---|---|
| No Google button | `GOOGLE_CLIENT_ID` missing or mistyped in `env/backend.env`, or `npm run dev` wasn't restarted. The computer must be online. |
| Google popup says **Error 400: origin_mismatch** / "not a valid origin" | Add the exact address from the browser bar to **Authorized JavaScript origins** (step 3). Changes can take a few minutes. |
| "This Google sign-in was made for a different app" | The Client ID in `env/backend.env` is from another project — copy it again. |
| "The LMS could not reach Google to check this sign-in (…)" (older versions: **fetch failed**) | The computer running `npm run dev` could not download Google's keys. Run `npm run google-check` — it says why. A code with **CERT** in it means an antivirus is checking HTTPS: the LMS now trusts the computer's own certificates automatically; if it still fails, allow Node.js in the antivirus. **ENOTFOUND** = no internet. **ETIMEDOUT / ECONNRESET** = the network blocks it — try a phone hotspot. |
