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

## Build the Windows desktop app

```sh
npm install
npm run build:desktop
```

The build creates two x64 files in `release/`:

- `Waraqa-Setup.exe` installs the app and adds Start Menu and desktop shortcuts.
- `Waraqa-Portable.exe` runs without installation.

Projects are saved locally on the computer. Use the app's JSON export and import to move projects between browser and desktop versions.
