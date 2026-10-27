import { execFileSync } from 'node:child_process'

const mode = process.argv[2]
if (!['mixed', 'all-connected'].includes(mode)) {
  process.stderr.write('Usage: node local/set-local-mock-mode.mjs <mixed|all-connected>\n')
  process.exit(2)
}

// The mock has no published port. This command runs inside its internal Docker network.
const request = `fetch('http://127.0.0.1:8000/__fixture/mode/${mode}', {
  method: 'POST', headers: { 'x-api-key': 'local-mock-key' }
}).then(async (response) => {
  if (!response.ok) throw new Error('Mock mode change failed: ' + response.status)
  console.log(JSON.stringify(await response.json()))
}).catch((error) => { console.error(error); process.exitCode = 1 })`

execFileSync('docker', [
  'compose', '-f', 'compose.smoke.local.yml', 'exec', '-T', 'mock-gateway',
  'node', '-e', request,
], { cwd: new URL('..', import.meta.url), stdio: 'inherit' })
