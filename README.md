# Clay Scores

A score tracker for rounds of sporting clays. It runs on iPhone and Android,
works with no cell signal, and keeps all data on the phone.

Built from the original design documents in [`docs/`](docs/):

- [`ClayAppFunctionalSpecs.odt`](docs/ClayAppFunctionalSpecs.odt): functional specification with screen mockups
- [`drawDB_ClayAppDiagram.pdf`](docs/drawDB_ClayAppDiagram.pdf): database design
- [`email_example.txt`](docs/email_example.txt): sample of the emailed round results

---

## What kind of app this is

Clay Scores is a **Progressive Web App (PWA)**: a web page that a phone can
install onto its Home Screen. Once installed it:

- opens full-screen with its own icon, like any other app
- works **offline**, because every file is saved on the phone the first time it loads
- stores rounds, shooters and courses **on the phone only** (nothing goes to a server)
- updates itself automatically the next time it's opened with a signal

One codebase serves both iPhone and Android, and there's no app store, fee or
compiling step. If you later want it in the App Store or Google Play, the same
code can be wrapped as a native app with **Capacitor** (see *Future* below).

## The technologies, in plain terms

| Piece | What it is | What it does here |
|---|---|---|
| **HTML / CSS / JavaScript** | The languages every web browser understands | What the app ultimately is when it runs |
| **TypeScript** | JavaScript with *types* (you declare that `targetCount` is a number, for example) | Catches mistakes before the app runs. All source files are `.ts` / `.tsx` |
| **React** | A library for building screens out of reusable *components* | Each screen (Home, Station…) is a function that returns what to draw. When data changes, React redraws only what changed |
| **IndexedDB + Dexie** | IndexedDB is a database built into every phone browser. Dexie is a friendlier way to use it | Holds your five tables (`src/db.ts`) |
| **Vite** | The build tool | Converts the TypeScript/React source into small, fast HTML/JS/CSS files in `dist/` |
| **vite-plugin-pwa** (service worker) | A background script the browser keeps on the phone | Caches the app's files so it opens offline, and makes it installable |
| **Vitest** | A test runner | Runs `src/logic.test.ts`, which checks the scoring rules automatically |
| **Git / GitHub** | Version history and online storage for the code | Every change is a *commit*. You can see, compare or undo any of them |
| **GitHub Actions** | GitHub's servers running a script on every push | Tests, builds and publishes the app (`.github/workflows/deploy.yml`) |
| **GitHub Pages** | Free web hosting from GitHub | The address your phones open and install from |

## How the code is organised

```
src/
  db.ts            Database tables (mirrors drawDB_ClayAppDiagram.pdf)
  logic.ts         Pure rules: pairs of circles, shooter rotation, date format, email text
  actions.ts       Every change to the data: save course/shooter/round, tap a target, breakage
  logic.test.ts    Automatic tests for the above
  router.ts        Which screen to show (the address after '#', e.g. #/round/3/station/2)
  ui.tsx           Shared pieces: top bar, +/- stepper, error box, toast message
  screens/
    Home.tsx         Screen 1
    MasterData.tsx   Manage Courses / Manage Shooters: lists + add/edit screens
    RoundSetup.tsx   Screens 4 & 6 (new round, open round)
    Round.tsx        Screens 7 & 8 (stations overview, individual station) + email
  index.css        The sunlight-readable dark theme
public/            App icons
index.html         The single page that loads everything
vite.config.ts     Build + offline/install settings
```

### Data model

It follows your diagram, with two small adjustments:

- **`targets.results`** is a list of 12 values instead of 12 separate columns
  (`results[0]` is TARGET_1 … `results[11]` is TARGET_12). Each value is
  `HIT`, `MISS`, `NA` (black, not applicable) or `null` (grey, not recorded).
- **`targets.slot`** (squad position 1–5) is stored next to `shooterId`. The spec
  lets the same shooter fill two slots, so the slot keeps their scores separate.

### Rules implemented

- Shooter names are unique, ignoring capitals and extra spaces (`jay` = `Jay`).
- Course + date/time must be unique for a round. Dates are compared to the minute.
- Circles activate in pairs: 1–2 targets → 2 circles, 3–4 → 4, and so on.
- Tap cycle: grey → green **+** (hit) → red **−** (miss) → grey.
- A shooter can't record more results than the station has targets
  (with 7 targets there are 8 circles, but only 7 can be filled).
- Shooting order rotates by station: A,B,C → B,C,A → C,A,B → …
- Lowering a station's targets warns before clearing any recorded results.
- The email follows `email_example.txt`: odd-numbered targets on the top line,
  even-numbered on the bottom, `X` hit, `O` miss, `-` not recorded. Only stations
  with targets set are listed. Breakage lists stations with at least one broken target.

### Small additions beyond the spec

- **Manage Courses / Manage Shooters** (replacing Create New Course/Shooter):
  an alphabetical list with **+ Add New** at the top; tap any entry to correct it.
  Rounds refer to courses and shooters by id, so a correction shows up in every
  existing round and email. Renames still enforce unique shooter names.

- **‹ Station / Station ›** buttons at the bottom of each station, so you can
  walk the course without going back to the grid.
- Station tiles show their state: grey border = not set, amber = in progress,
  green ✓ = every shooter fully recorded.
- **Show email text** on the round screen displays the email with a Copy button,
  for when no mail app is set up.

---

## Testing without a phone install

1. **Claude preview link:** a private test copy published from the chat. Open it
   on a phone or computer. Data you enter there stays in that browser only.
2. **GitHub Pages address** (once set up, see below): the real app. Open it in
   the phone's browser to try it before installing.

## Installing on a phone

Open the app's address, then:

- **iPhone (Safari):** tap the **Share** button (square with an up-arrow) →
  **Add to Home Screen** → **Add**. *This has to be done in Safari.*
- **Android (Chrome):** tap the **⋮** menu → **Add to Home screen** or
  **Install app** → **Install**.

After installing, always open it from the Home Screen icon. On iPhone, the
Home Screen copy keeps its own data, separate from Safari's.

## Your data and backups

Data lives in the phone's app storage. It survives restarts and updates, but
it is **deleted if you remove the app from the Home Screen** or clear the
browser's website data. A backup/restore (export to a file) feature is a
good next addition.

---

## Developer commands (only needed if you want to work on the code yourself)

Install **Node.js 22 LTS** from https://nodejs.org, then in a terminal in this folder:

| Command | What it does |
|---|---|
| `npm install` | Downloads the libraries listed in `package.json` into `node_modules/` (once) |
| `npm run dev` | Runs the app at http://localhost:5173 and reloads instantly as files change |
| `npm test` | Runs the automatic tests |
| `npm run build` | Produces the finished app in `dist/` |
| `npm run build:preview` | Same, without offline support (for the Claude preview link) |

## Future: App Store / Google Play

If the app goes public, [Capacitor](https://capacitorjs.com) wraps this same
code in a native iOS/Android shell. That requires a Mac with Xcode for iPhone
builds, a $99/year Apple Developer account for the App Store, and a one-time
$25 Google Play developer account.
