# GJIMT Placement LMS — Start Here (Hinglish Guide)

Yeh project teacher ke demo ko base bana kar ready kiya gaya hai. Login page modern hai, GJIMT + NAAC branding included hai, aur dashboard ke original 6 modules proper routes ke saath working hain.

## 1. ZIP extract karo

ZIP ko extract karke folder VS Code mein open karo.

Example:

```text
E:\gjimt-placement-lms
```

## 2. Node.js check karo

VS Code terminal/PowerShell mein:

```powershell
node -v
npm -v
```

Node.js installed na ho to Node.js LTS install karo.

## 3. Dependencies install karo

Project ke root folder mein:

```powershell
npm install
```

## 4. App start karo

```powershell
npm run dev
```

Browser mein Vite ka address open karo. Normally:

```text
http://localhost:5173
```

## 5. Login — Firebase ke bina bhi chalega

Admin aur Placement Cell ka email/password `credentials/login-details.txt` mein hai (sirf is computer par — kisi ko share mat karo).
Students apna account khud banate hain (ya "Continue with Google").

Is mode mein sample students, internships, placement drives, industrial visits aur alumni talks LocalStorage mein automatically load ho jayenge.

## 6. Dashboard mein kya working hai

Login ke baad:

- Internship Coordinator → add/edit/delete/search/filter/export.
- Placement Coordinator → drives manage.
- Industrial Visits → visits manage.
- Industry / Alumni Talk → sessions manage.
- Master Data → student records manage.
- Add Student Data → proper student creation form.
- Reports → charts + full Excel export.
- Settings → theme, auth status aur local demo reset.

## 7. Real Google Login enable karna

Real Google login browser mein chalane ke liye Firebase project banana hoga. Code already Firebase ke saath wired hai.

### Firebase Console

1. Firebase Console open karo.
2. New project create karo.
3. Project Overview → Web icon (`</>`) select karo.
4. Web app register karo.
5. Authentication → Sign-in method kholo.
6. **Email/Password** enable karo.
7. **Google** provider enable karo.
8. Authentication users mein demo user banao:

```text
Email: demo.placement@gjimt.ac.in
Password: GJIMT@2026!
```

9. Firestore Database create karo.
10. Project Settings → Your apps → Web app config se values copy karo.

## 8. `env/frontend.env` banao

`env/frontend.env.example` ki copy bana kar naam rakho:

```text
env/frontend.env
```

Usmein values bhar do:

```env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_DEMO_EMAIL=demo.placement@gjimt.ac.in
VITE_DEMO_PASSWORD=GJIMT@2026!
```

Phir Vite server restart karo:

```powershell
Ctrl + C
npm run dev
```

## 9. Google Login test

Login page par **Continue with Google** click karo.

Google account choose karo. Firebase auth hone ke baad dashboard open ho jayega.

Agar popup browser ne block kiya ho, app redirect flow use karega.

## 10. Firestore data

Firebase connected hone ke baad pehli baar dashboard/module open karte hi empty collections mein sample records seed ho sakte hain. Uske baad Add/Edit/Delete Firestore par save honge.

Collections:

```text
students
internships
placements
visits
talks
```

## 11. Firestore rules

Included file:

```text
firestore.rules
```

Demo ke liye authenticated users ko access diya gaya hai. Real college deployment se pehle role-based rules zaroor lagana.

## 12. Production build

```powershell
npm run build
npm run preview
```

## 13. Agar changes karne hain

Main files:

```text
frontend/src/pages/Login.jsx           -> Login UI/flow
frontend/src/pages/Dashboard.jsx       -> Main dashboard
frontend/src/config/modules.js         -> Modules + fields
frontend/src/lib/dataStore.js          -> Firestore/LocalStorage data layer
frontend/src/context/AuthContext.jsx   -> Firebase/Google/Email login
frontend/src/App.css                   -> Complete UI design
frontend/src/data/seedData.js          -> Demo records
backend/mailApi.mjs                    -> Emails (sending)
env/backend.env                        -> Email App Password, Google Client ID
```

`frontend/public/gjimt-brand.png` mein supplied GJIMT + NAAC logo asset already included hai.

## 14. Teacher ko demo dikhate waqt

Firebase setup se pehle bhi app demo ho jayega. Demo credentials se login karke dashboard, modules, CRUD, reports, Excel export, dark mode aur mobile layout dikha sakte ho.

## 15. Firebase Hosting (optional deployment)

Build ke baad:

```powershell
npm run build
```

Firebase CLI authenticated ho to:

```powershell
firebase deploy --only hosting,firestore:rules
```

`firebase.json` mein SPA rewrite already included hai, isliye React routes refresh hone par bhi application route par return karenge.
