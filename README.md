# Waraqa

Waraqa is an Arabic mind-mapping app built with React, Vite, and Electron.

## Run as a website

```sh
npm install
npm run dev
```

## Open on a phone

Connect the phone and computer to the same Wi-Fi network, then run:

```sh
npm run dev:mobile
```

Open `http://<computer-ip>:5173` on the phone. Find the computer's IPv4 address with `ipconfig` on Windows.

## Run the desktop app while developing

The desktop shell loads the Vite dev server, so run one terminal with the server:

```sh
npm run dev
```

and a second terminal with the Electron window:

```sh
npm run desktop
```

## Build the Windows desktop app

```sh
npm install
npm run build:desktop
```

Optional: sign both files with a code signing certificate (`.pfx`) by setting two
environment variables before the build. Without them the installers stay unsigned.

```sh
set CSC_LINK=C:\path\to\cert.pfx
set CSC_KEY_PASSWORD=your-key-password
npm run build:desktop
```

The build creates two x64 files in `release/`:

- `Waraqa-Setup.exe` installs the app and adds Start Menu and desktop shortcuts.
- `Waraqa-Portable.exe` runs without installation.

Projects are saved locally on the computer. Use the app's JSON export and import to move projects between browser and desktop versions.

## Project JSON format

Exported project files are JSON with:

- `_metadata` — `app` name, `formatVersion: 1`, and the embedded app logo.
- `title`, `nodes`, `edges` — the React Flow node and edge objects.
- `edgeStyle` (`smoothstep` | `default` | `straight`), `edgeColor` (hex), `edgeWidth` (1–4), `arrowHead` (`closed` | `open` | `none`).

The same shape is used by the app's own JSON import, so a file round-trips cleanly.

Two helpers keep offline support intact:

- `@fontsource/ibm-plex-sans-arabic` bundles the UI font locally.
- `node scripts/fetch-emoji.mjs` re-downloads the Twemoji files bundled in `src/assets/emoji/`
  whenever the emoji list (`nodeEmojis`) in `src/App.jsx` changes. Twemoji artwork
  is used under the CC-BY 4.0 license (https://github.com/jdecked/twemoji).
