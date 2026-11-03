# URIGG-DesktopApp — notes for Claude

The **허브 (hub)**: a Windows desktop app titled "Security.log HUB" for the user's home PC (3440×1440 at 125 %, used as a normal window, not as wallpaper). Read `../URIGG-WebSite/CLAUDE.md` (the user, names, design rules) and `../URIGG-Brand/UNIVERSE.md` (why the hub is built this way, the approved design) first. The approved mockup is `../URIGG-Brand/mockups/hub/`.

- The user speaks Korean; reply in Korean, plainly. Claude does the development; the user does account steps (GitHub secrets etc.), explained screen by screen.
- Never put the user's real name or school anywhere. Never commit secrets.

## Stack

- Tauri 2 (Rust in `src-tauri/`), plain HTML/CSS/JS in `ui/` (no bundler, `withGlobalTauri`). Custom glass title bar (`decorations: false`, `data-tauri-drag-region`).
- Plugins: single-instance, window-state, opener (external links open in the default browser), autostart, updater, process. Tray icon with 열기 / 새로고침 / 종료. Rust command `check_update`.
- Data: public data from `https://urigg.pages.dev/api/{news,kev,ctf,github,blog,net}?v=hub2` (the website sends CORS `*`); private data (events, ddays) from the same Supabase project as the Cowork Calendar, via `ui/js/auth.js`.
- Login: lock screen first. First run: email + password (Supabase), then a 6-digit PIN (salted SHA-256 in localStorage, never sent anywhere; 5 wrong tries → password again). Session is stored under `sb-dfvcgacadkaglgtooxdy-auth-token` in supabase-js format, so the bundled calendar widget (`ui/calendar`, same origin) is logged in too. Auto-lock after 30 min idle (setting), Ctrl+L.
- Settings (localStorage `urigg-hub-settings`): window size preset, close button → tray or quit, autostart, idle lock, auto update.

## Structure (C: copy and diverge)

- `ui/hub.css` started as the mockup's CSS; `ui/app.css` adds app-only bits. `ui/js/app.js` holds the screen; its `PANELS` list drives the sidebar, `open <id>`, Tab completion and the fly-in animation — add a panel by adding one entry.
- **Manual sync**: `npm run sync` copies the shared-file list in `scripts/sync.mjs` (brand tokens/components/logos, keywords.json, vulns.json, the calendar widget) from `../URIGG-WebSite` and `../URIGG-Brand`. Remove a file from the list to let the hub own it. The user asks "앱 동기화해 줘"; show the diff, then release.
- Terminal commands (v0.1.5, chosen by the user 2026-11-03) in three chapters: 일상 (timer, alarm, pomo, study, todo/done, memo, calc + today, dday, fetch, open, help, clear, lock), 보안 공부 (b64, url, hex, rot, decode, hash, jwt, cidr, chmod, ip, ping), 찾기 (find, cve, vuln, ctf, kw, g). Pure helpers in `ui/js/tools.js` (no eval, MD5 hand-written), help text in `ui/js/cmd-docs.js` (a new command needs an entry there too), wiring in app.js. Commands tab (sidebar, `open cmds`) lists chapters with one-line descriptions; clicking shows usage/options/examples; clicking an example fills the terminal input. Timers/alarms/pomodoro end with a **silent glass card** rising in the centre stage (user asked: card in the terminal, no sound); `+5분` snooze, Esc dismisses. Timers, alarms, pomodoro and study time live in localStorage on this PC only; **todos and memos sync across PCs** (v0.2.0) through Supabase table `hub_items` (`db/hub_items.sql`, owner-only RLS) by `ui/js/sync.js`: local first, changed items pushed 400 ms after a save, pulled on login/refresh (30 min) and when the window becomes visible; a per-kind snapshot in localStorage (`urigg-hub-sync-todo/memo`) tells "deleted on another PC" from "not uploaded yet". If the table is missing (404) it stays local silently. Old items get an id on first run and upload then. Offered but not built: alarm sound, Windows notifications, quiz/man/port/cheat, courier tracking (user declined).
- Sidebar tabs (v0.1.8): News, KEV, Vuln, CTF, Tools (live encoders/hashes + base/subnet/chmod, `keep` so typing is not wiped), Network, Weather (Open-Meteo forecast + air quality, no key; location from `/api/net` lat/lon or a city typed in the tab, stored in settings), Todo (today's calendar events + clickable todos), Memo (cards + search), Activity (grass + recent commits read per repo from GitHub because public events dropped commit messages in 2025; bot commits filtered), System (Rust `system_info` in `src-tauri/src/system.rs`: sysinfo 0.33 + windows-sys battery, polled every 2 s while open), Programs (this hub on top, other programs below), Commands. Panel hooks: `bind(body)`, `onOpen`, `onClose`, `keep`. Styles for these in `ui/panels.css`. D-day name autocomplete from calendar events, same as the website.
- Sidebar order (v0.1.13, user asked for similar tabs together, not by importance): `DOCK_GROUPS` in app.js with small group labels — 오늘 (Todo, Weather, Memo) · 보안 (News, KEV, Vuln, CTF, Tools) · 기록 · PC (Activity, Network, System) · 허브 (Programs, Commands). Items keep full size; the list scrolls when it does not fit (user's choice).
- Basic commands added in v0.1.7: update, version, reload, settings, history, date, uptime, whoami, echo, hide (= exit, to tray), quit.
- Main D-day (top left): big number with the name underneath, name clamped to two lines. Timeline redraws on the minute boundary.

## Picking up on another PC (e.g. the home PC)

- `git pull` in all three sibling repos (URIGG-WebSite, URIGG-Brand, URIGG-DesktopApp). Everything up to v0.1.13 is pushed.
- UI work needs only Node: `node ../URIGG-WebSite/scripts/dev/serve.mjs ui 4183` (or `npm run preview`) and the screenshot scripts. Releases are built and signed by GitHub Actions from a tag, so the home PC does **not** need the signing key or Rust for normal work.
- To run the real window locally (`npm run dev`) or `cargo check` the Rust side, install Rust (winget Rustup) and the VS 2022 C++ build tools; the first build takes ~30 min on a slow PC.

## Open threads (2026-11-03, end of the laptop session)

- Not yet confirmed by the user in the real app: auto-update from an installed version, the System tab (only testable inside Tauri), Weather location (IP lookup gave "Naju"; the user can type a city in the tab).
- Daily-life tab ideas offered, waiting for the user to choose: Week (calendar Mon–Sun), Study (pomo/study records), Habit (daily check + streak grass), Travel (Japan trip on 1/18: yen rate, Tokyo weather, packing list), Rate (FX), Money (spending log, monthly budget), Subs (subscription due dates), YouTube (channel RSS, no key), Journal (one line a day), Sleep. Claude recommended Week, Study, Habit, Travel. Records would be localStorage unless the user wants a Supabase table (sync with the home PC).
- Todo/memo/timers/study live in localStorage per PC, so the home PC hub starts empty for those. Sync: the user first declined, then asked for it the same day (2026-11-03); built in v0.2.0 for todos and memos only (timers/alarms/study stay per PC).

## Build and release

- Local: `npm run preview` (browser preview at :4183, no Tauri APIs), `npm run dev` (real window), `npm run build` (installer; needs `TAURI_SIGNING_PRIVATE_KEY` set to the key in `%USERPROFILE%\.tauri\urigg-hub.key`).
- Release: bump the version in `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` and `package.json`, push a tag `vX.Y.Z`; `.github/workflows/release.yml` builds the NSIS installer and `latest.json`. Needs repo secret `TAURI_SIGNING_PRIVATE_KEY` (contents of the private key file; no password). The updater endpoint is `releases/latest/download/latest.json`. Also bump the `urigg-hub` entry in `src-tauri/Cargo.lock`.
- Version numbers (agreed with the user 2026-11-03): new tab or feature → minor (0.2.0, 0.3.0…), small fix → patch (0.2.1, 0.2.2…). Stay on 0.x while things still change; go to 1.0.0 when the user has used it and nothing big is left to change. 0.1.0–0.1.10 were all shipped as patches the first day.
- The private key lives only in `%USERPROFILE%\.tauri\` on the laptop where it was generated (2026-11-03). If it is lost, generate a new pair, put the new public key in `tauri.conf.json` and reinstall once by hand.
