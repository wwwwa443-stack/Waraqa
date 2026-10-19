const appUrl = new URL(window.location.href)
const entryUrl = new URL(import.meta.url)
const isViteServer = ['5173', '4173'].includes(appUrl.port)
const isBuiltAsset = entryUrl.pathname.includes('/assets/')
const isElectronBuild = appUrl.protocol === 'file:' && appUrl.pathname.toLowerCase().includes('/dist/')

if (isViteServer || isBuiltAsset || isElectronBuild) {
  import('./main.jsx')
} else {
  const devServerUrl = 'http://127.0.0.1:5173/'
  fetch(devServerUrl, { mode: 'no-cors' })
    .then(() => window.location.replace(devServerUrl))
    .catch(() => {
      document.getElementById('root').innerHTML = `
        <main style="max-width:560px;margin:12vh auto;padding:32px;font:16px/1.7 system-ui,sans-serif;color:#263b32;text-align:center">
          <h1>Start the app server first</h1>
          <p>Open a terminal in the project folder, run <code>npm run dev</code>, then open <a href="${devServerUrl}">${devServerUrl}</a>.</p>
        </main>`
    })
}
