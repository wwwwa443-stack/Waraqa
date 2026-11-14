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

## Build the Android phone app

Install JDK 21 and the Android SDK, then set `JAVA_HOME` and `ANDROID_HOME` to
their installation folders. Build the installable APK with:

```sh
npm run build:android
```

The APK is written to `release/Waraqa-Android.apk`. It bundles the app locally,
so it works without an internet connection. This APK is for Android phones;
iPhone installation packages require Apple's macOS build and signing tools.

Workspaces are saved locally and appear on the home screen. Each workspace can contain mind maps, notes, tasks, flowcharts, and interface designs. Use the **UI design** tool to create screens from blank, mobile-app, online-store, and portfolio templates; add and arrange interface elements, preview phone/tablet/desktop sizes, connect screens through elements, and export screens as PNG or designs as JSON. Workspace backups include interface designs; the desktop app also writes each design under `Downloads/warqa/<workspace>/ui-designs`. Existing maps and notes are automatically grouped into a workspace named “مشروعي السابق” on first launch after this update. Use **حفظ نسخة المشروع** from a workspace to export the complete workspace. The desktop app creates a folder under `Downloads/warqa` with a full `workspace.json` backup plus separate item files; select `workspace.json` with **استيراد مشروع** on another device to restore the workspace. Browser and Android versions download a single full-backup JSON file instead. The Android app launches in landscape immersive mode and shows the Waraqa splash logo while starting. Notes fit the available screen height in landscape so the complete page stays visible. Notes support multiple titled pages with independent text, drawings, and images. Drag image files from the desktop onto a page to add them, then use the mouse tool to select, move, resize, or delete images. Use the page list to switch between pages, or collapse it for more writing space. Type `@` in a note text box to select a mind-map project and one of its nodes; mentions appear as clickable node-name chips that open and focus the referenced node.

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
