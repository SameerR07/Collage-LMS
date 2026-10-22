# Firebase setup — exact steps

This project is already coded for Firebase Authentication and Firestore. Only the Firebase project-specific configuration must be supplied by the college account owner.

## A. Create project

Open the Firebase console and create a project for the Placement LMS.

## B. Register the web app

From Project Overview, add a Web app and copy its configuration object. Firebase's official web setup uses this registration/configuration flow.

## C. Enable Email/Password

Authentication → Sign-in method → Email/Password → Enable.

Create the demo account under Authentication → Users:

```text
Email: demo.placement@gjimt.ac.in
Password: GJIMT@2026!
```

## D. Enable Google

Authentication → Sign-in method → Google → Enable.

Choose the college project support email where Firebase asks for it and save.

## E. Authorised domains

Authentication → Settings → Authorised domains.

For local testing, keep the development host shown by your Firebase/Vite setup. For deployment, add your production domain.

## F. Add the config to the project

Copy `env/frontend.env.example` to `env/frontend.env` and fill:

```env
VITE_FIREBASE_API_KEY=YOUR_API_KEY
VITE_FIREBASE_AUTH_DOMAIN=YOUR_PROJECT.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=YOUR_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET=YOUR_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID=YOUR_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID=YOUR_APP_ID
```

Restart Vite after this file is saved.

## G. Create Firestore

Firestore Database → Create database.

Start in a controlled mode and publish the included rules only after reviewing the college access model.

The app uses these collections:

- `students`
- `internships`
- `placements`
- `visits`
- `talks`

The application seeds the included demo records if a collection is empty and the signed-in user has permission to write.

## H. Test

Run:

```bash
npm run dev
```

Test both:

1. Email/password demo login.
2. Continue with Google.

Then add/edit/delete a student and confirm the Firestore collection changes.

## I. Production security

The included rule is intentionally simple for a classroom/demo build:

```text
allow read, write: if request.auth != null;
```

For institutional deployment, replace this with role-based authorization and least-privilege access. Do not use the demo password as a real staff password.
