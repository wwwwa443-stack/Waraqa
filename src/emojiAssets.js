// Twemoji SVG artwork (CC-BY 4.0, https://github.com/jdecked/twemoji) is bundled
// locally so emojis render and export correctly while offline.
// scripts/fetch-emoji.mjs refreshes these files from nodeEmojis in App.jsx.
const emojiFiles = import.meta.glob('./assets/emoji/*.svg', { query: '?raw', import: 'default', eager: true })

const iconsByCodepoints = new Map(
  Object.entries(emojiFiles).map(([file, svg]) => [file.split('/').pop().replace('.svg', ''), svg]),
)

export function emojiDataUrl(emoji) {
  const codepoints = [...emoji]
    .map((character) => character.codePointAt(0).toString(16))
    .filter((codepoint) => codepoint !== 'fe0f')
    .join('-')
  const svg = iconsByCodepoints.get(codepoints)
  return svg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` : ''
}
