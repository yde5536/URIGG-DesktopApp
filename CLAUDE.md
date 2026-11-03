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
- Terminal commands are placeholders; the user will decide the real set later.

## Build and release

- Local: `npm run preview` (browser preview at :4183, no Tauri APIs), `npm run dev` (real window), `npm run build` (installer; needs `TAURI_SIGNING_PRIVATE_KEY` set to the key in `%USERPROFILE%\.tauri\urigg-hub.key`).
- Release: bump the version in `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` and `package.json`, push a tag `vX.Y.Z`; `.github/workflows/release.yml` builds the NSIS installer and `latest.json`. Needs repo secret `TAURI_SIGNING_PRIVATE_KEY` (contents of the private key file; no password). The updater endpoint is `releases/latest/download/latest.json`.
- The private key lives only in `%USERPROFILE%\.tauri\` on the laptop where it was generated (2026-11-03). If it is lost, generate a new pair, put the new public key in `tauri.conf.json` and reinstall once by hand.
