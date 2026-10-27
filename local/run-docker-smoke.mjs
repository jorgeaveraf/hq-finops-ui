import { execFileSync } from 'node:child_process'

const root = new URL('..', import.meta.url)
const compose = ['compose', '-f', 'compose.smoke.local.yml']

execFileSync('docker', [...compose, 'up', '-d', '--build'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, DOCKER_BUILDKIT: '0' },
})

let ready = false
for (let attempt = 0; attempt < 30; attempt += 1) {
  try {
    const response = await fetch('http://localhost:5174/automations/')
    if (response.ok) {
      ready = true
      break
    }
  } catch {
    // The isolated Vite container is still starting.
  }
  await new Promise((resolve) => setTimeout(resolve, 1000))
}

if (!ready) throw new Error('The isolated smoke UI did not become ready on localhost:5174')

execFileSync(process.execPath, ['local/docker-smoke.mjs'], { cwd: root, stdio: 'inherit' })
