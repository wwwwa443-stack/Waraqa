import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const releaseDir = path.join(projectRoot, 'release')

function run(command, args, cwd = projectRoot, env = process.env) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', env })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status || 1)
}

run(process.execPath, ['node_modules/vite/bin/vite.js', 'build'])
run(process.execPath, ['node_modules/@capacitor/cli/bin/capacitor', 'sync', 'android'])
const javaExecutable = process.env.JAVA_HOME
  ? path.join(process.env.JAVA_HOME, 'bin', process.platform === 'win32' ? 'java.exe' : 'java')
  : 'java'
run(javaExecutable, [
  '-classpath', path.join(projectRoot, 'android', 'gradle', 'wrapper', 'gradle-wrapper.jar'),
  'org.gradle.wrapper.GradleWrapperMain', 'assembleDebug',
], path.join(projectRoot, 'android'), process.env)

mkdirSync(releaseDir, { recursive: true })
copyFileSync(
  path.join(projectRoot, 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk'),
  path.join(releaseDir, 'Waraqa-Android.apk'),
)
console.log(`Android APK copied to ${path.join(releaseDir, 'Waraqa-Android.apk')}`)
