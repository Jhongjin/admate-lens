import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const root = process.cwd()
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'admate-batch-guards-'))
const tsc = path.join(root, 'node_modules', 'typescript', 'lib', 'tsc.js')
const tsconfigPath = path.join(outDir, 'tsconfig.json')

function run(label, command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    shell: false,
  })

  if (result.status !== 0) {
    console.error(`[check-capture-batch-guards] ${label} failed`)
    process.exitCode = result.status || 1
    return false
  }

  return true
}

function assertRouteUsesSharedSourceKey() {
  const routePath = path.join(root, 'src', 'app', 'api', 'captures', 'route.ts')
  const source = fs.readFileSync(routePath, 'utf8')
  const helperIndex = source.indexOf('function dedupeNormalizedUrls')
  const useIndex = source.indexOf('normalizeCaptureSourceUrlKey(url)', helperIndex)
  if (helperIndex === -1 || useIndex === -1) {
    console.error(
      '[check-capture-batch-guards] creation-time URL dedupe must use normalizeCaptureSourceUrlKey',
    )
    process.exitCode = 1
    return false
  }
  return true
}

function installAliasShim() {
  const aliasRoot = path.join(outDir, 'node_modules', '@', 'lib', 'capture', 'channels', 'gdn')
  fs.mkdirSync(aliasRoot, { recursive: true })
  fs.copyFileSync(
    path.join(outDir, 'src', 'lib', 'capture', 'channels', 'gdn', 'host-strategies.js'),
    path.join(aliasRoot, 'host-strategies.js'),
  )
}

try {
  fs.writeFileSync(
    tsconfigPath,
    JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022',
          module: 'commonjs',
          moduleResolution: 'node',
          strict: true,
          esModuleInterop: true,
          skipLibCheck: true,
          noEmit: false,
          outDir,
          rootDir: root,
          baseUrl: root,
          paths: {
            '@/*': ['src/*'],
          },
          lib: ['ES2022', 'DOM'],
        },
        files: [
          path.join(root, 'src/lib/capture/injection/ad-slot-detector.ts'),
          path.join(root, 'src/lib/capture/channels/gdn/host-strategies.ts'),
          path.join(root, 'src/lib/capture/batch-execution-guards.ts'),
          path.join(root, 'tests/capture/batch-execution-guards.test.ts'),
        ],
      },
      null,
      2,
    ),
  )

  const compiled = run('compile', process.execPath, [
    tsc,
    '-p',
    tsconfigPath,
  ])

  if (compiled && assertRouteUsesSharedSourceKey()) {
    installAliasShim()
    run(
      'batch execution guard assertions',
      process.execPath,
      [path.join(outDir, 'tests', 'capture', 'batch-execution-guards.test.js')],
    )
  }
} finally {
  fs.rmSync(outDir, { force: true, recursive: true })
}

if (!process.exitCode) {
  console.log('[check-capture-batch-guards] ok')
}
