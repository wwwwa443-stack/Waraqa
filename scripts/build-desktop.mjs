import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const stageDir = path.join(os.tmpdir(), `waraqa-desktop-${process.pid}`)
const releaseDir = path.join(projectRoot, 'release')

function run(script, args) {
  const result = spawnSync(process.execPath, [path.join(projectRoot, script), ...args], {
    cwd: projectRoot,
    stdio: 'inherit',
  })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status || 1)
}

try {
  // electron-builder signs the installer/portable automatically when these
  // environment variables point to a code signing certificate (.pfx).
  if (process.env.CSC_LINK && process.env.CSC_KEY_PASSWORD) {
    console.log('Code signing is configured (CSC_LINK).')
  } else {
    console.log('Code signing is not configured (set CSC_LINK and CSC_KEY_PASSWORD) — builds will stay unsigned.')
  }
  run('node_modules/vite/bin/vite.js', ['build'])
  run('node_modules/electron-builder/cli.js', [
    '--win', 'nsis', 'portable',
    `-c.directories.output=${stageDir}`,
  ])

  const artifacts = readdirSync(stageDir)
  const installer = artifacts.find((name) => /^Waraqa Setup .*\.exe$/i.test(name))
  const portable = artifacts.find((name) => /^Waraqa (?!Setup).*\.exe$/i.test(name))
  if (!installer || !portable) throw new Error('The Windows installer or portable app was not created.')

  mkdirSync(releaseDir, { recursive: true })
  copyFileSync(path.join(stageDir, installer), path.join(releaseDir, 'Waraqa-Setup.exe'))
  copyFileSync(path.join(stageDir, portable), path.join(releaseDir, 'Waraqa-Portable.exe'))
  const blockmap = artifacts.find((name) => name === `${installer}.blockmap`)
  if (blockmap) copyFileSync(path.join(stageDir, blockmap), path.join(releaseDir, 'Waraqa-Setup.exe.blockmap'))

  console.log(`Desktop builds copied to ${releaseDir}`)
} finally {
  rmSync(stageDir, { recursive: true, force: true })
}
