import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Downloads the Twemoji SVG assets used by the app's emoji picker into
// src/assets/emoji/, so emojis work offline (desktop build, export images).
// Follow-up runs skip files that already exist -> clear the folder to refresh.
// Twemoji artwork is distributed under the CC-BY 4.0 license; the app links
// to https://github.com/jdecked/twemoji for attribution.

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outputDir = path.join(projectRoot, 'src', 'assets', 'emoji')
const version = '17.0.3'
const sources = (name) => [
  `https://cdn.jsdelivr.net/gh/jdecked/twemoji@${version}/assets/svg/${name}.svg`,
  `https://raw.githubusercontent.com/jdecked/twemoji/v${version}/assets/svg/${name}.svg`,
]

const appSource = readFileSync(path.join(projectRoot, 'src', 'App.jsx'), 'utf8')
const emojis = [...appSource.matchAll(/emoji:\s*'([^']+)'/g)].map((match) => match[1])
if (!emojis.length) throw new Error('No emoji entries were found in src/App.jsx.')

// Same codepoint scheme as the EmojiGlyph component in src/App.jsx.
const assetName = (emoji) => [...emoji]
  .map((character) => character.codePointAt(0).toString(16))
  .filter((codepoint) => codepoint !== 'fe0f')
  .join('-')

const download = async (url) => {
  const response = await fetch(url, { headers: { 'user-agent': 'waraqa' } })
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
  return response.text()
}

mkdirSync(outputDir, { recursive: true })
let downloaded = 0
let skipped = 0
for (const emoji of [...new Set(emojis)]) {
  const name = assetName(emoji)
  const target = path.join(outputDir, `${name}.svg`)
  if (existsSync(target)) {
    skipped += 1
    continue
  }
  let svg = null
  let lastError = null
  for (const source of sources(name)) {
    try {
      svg = await download(source)
      break
    } catch (error) {
      lastError = error
    }
  }
  if (!svg) {
    console.error(`Failed ${emoji} (${name}.svg): ${lastError?.message || 'unknown error'}`)
    continue
  }
  writeFileSync(target, svg)
  downloaded += 1
}
console.log(`${downloaded} downloaded, ${skipped} already present (${outputDir})`)
