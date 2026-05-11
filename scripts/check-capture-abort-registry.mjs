import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const root = process.cwd()
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'admate-abort-registry-'))
const tsc = path.join(root, 'node_modules', 'typescript', 'lib', 'tsc.js')

function run(label, command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    shell: false,
  })

  if (result.status !== 0) {
    console.error(`[check-capture-abort-registry] ${label} failed`)
    process.exitCode = result.status || 1
    return false
  }

  return true
}

try {
  const compiled = run('compile', process.execPath, [
    tsc,
    '--target',
    'ES2022',
    '--module',
    'commonjs',
    '--moduleResolution',
    'node',
    '--strict',
    '--esModuleInterop',
    '--skipLibCheck',
    '--noEmit',
    'false',
    '--outDir',
    outDir,
    '--rootDir',
    root,
    'src/lib/capture/abort-registry.ts',
    'src/lib/capture/abort-route-helpers.ts',
    'src/lib/capture/capture-execution-retry.ts',
    'tests/capture/fake-engine-abort.test.ts',
    'tests/capture/fake-route-abort.test.ts',
  ])

  if (compiled) {
    const engineOk = run(
      'fake engine assertions',
      process.execPath,
      [path.join(outDir, 'tests', 'capture', 'fake-engine-abort.test.js')],
    )
    if (engineOk) {
      run(
        'fake route assertions',
        process.execPath,
        [path.join(outDir, 'tests', 'capture', 'fake-route-abort.test.js')],
      )
    }
  }
} finally {
  fs.rmSync(outDir, { force: true, recursive: true })
}

if (!process.exitCode) {
  console.log('[check-capture-abort-registry] ok')
}
