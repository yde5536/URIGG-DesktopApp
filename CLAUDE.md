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
- Terminal commands (v0.1.5, chosen by the user 2026-11-03) in three chapters: 일상 (timer, alarm, pomo, study, todo/done, memo, calc + today, dday, fetch, open, help, clear, lock), 보안 공부 (b64, url, hex, rot, decode, hash, jwt, cidr, chmod, ip, ping), 찾기 (find, cve, vuln, ctf, kw, g). Pure helpers in `ui/js/tools.js` (no eval, MD5 hand-written), help text in `ui/js/cmd-docs.js` (a new command needs an entry there too), wiring in app.js. Commands tab (sidebar, `open cmds`) lists chapters with one-line descriptions; clicking shows usage/options/examples; clicking an example fills the terminal input. Timers/alarms/pomodoro end with a **silent glass card** rising in the centre stage (user asked: card in the terminal, no sound); `+5분` snooze, Esc dismisses. Timers, study time, memos, todos live in localStorage on this PC only. Offered but not built: alarm sound, Windows notifications, quiz/man/port/cheat, courier tracking (user declined).
- Sidebar tabs (v0.1.8): News, KEV, Vuln, CTF, Tools (live encoders/hashes + base/subnet/chmod, `keep` so typing is not wiped), Network, Weather (Open-Meteo forecast + air quality, no key; location from `/api/net` lat/lon or a city typed in the tab, stored in settings), Todo (today's calendar events + clickable todos), Memo (cards + search), Activity (grass + recent commits read per repo from GitHub because public events dropped commit messages in 2025; bot commits filtered), System (Rust `system_info` in `src-tauri/src/system.rs`: sysinfo 0.33 + windows-sys battery, polled every 2 s while open), Programs (this hub on top, other programs below), Commands. Panel hooks: `bind(body)`, `onOpen`, `onClose`, `keep`. Styles for these in `ui/panels.css`. D-day name autocomplete from calendar events, same as the website.

## Build and release

- Local: `npm run preview` (browser preview at :4183, no Tauri APIs), `npm run dev` (real window), `npm run build` (installer; needs `TAURI_SIGNING_PRIVATE_KEY` set to the key in `%USERPROFILE%\.tauri\urigg-hub.key`).
- Release: bump the version in `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` and `package.json`, push a tag `vX.Y.Z`; `.github/workflows/release.yml` builds the NSIS installer and `latest.json`. Needs repo secret `TAURI_SIGNING_PRIVATE_KEY` (contents of the private key file; no password). The updater endpoint is `releases/latest/download/latest.json`. Also bump the `urigg-hub` entry in `src-tauri/Cargo.lock`.
- Version numbers (agreed with the user 2026-11-03): new tab or feature → minor (0.2.0, 0.3.0…), small fix → patch (0.2.1, 0.2.2…). Stay on 0.x while things still change; go to 1.0.0 when the user has used it and nothing big is left to change. 0.1.0–0.1.10 were all shipped as patches the first day.
- The private key lives only in `%USERPROFILE%\.tauri\` on the laptop where it was generated (2026-11-03). If it is lost, generate a new pair, put the new public key in `tauri.conf.json` and reinstall once by hand.
