import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const packagePath = path.join(root, 'package.json')
const reportPath = path.join(root, 'scripts', 'report-harness.mjs')

function fail(message) {
  console.error(`[check-harness-report-contract] ${message}`)
  process.exitCode = 1
}

function readText(file) {
  return fs.readFileSync(file, 'utf8')
}

function requireIncludes(source, snippets, label) {
  for (const snippet of snippets) {
    if (!source.includes(snippet)) {
      fail(`${label} must include ${snippet}`)
    }
  }
}

function requireExcludes(source, snippets, label) {
  for (const snippet of snippets) {
    if (source.includes(snippet)) {
      fail(`${label} must not include ${snippet}`)
    }
  }
}

const pkg = JSON.parse(readText(packagePath))
const scripts = pkg.scripts || {}
const reportSource = readText(reportPath)

requireIncludes(
  reportSource,
  [
    "runCheck('verify:harness'",
    "runCheck('check:golden-manifest'",
    "runCheck('check:golden-metadata'",
    "runCheck('check:golden-dimensions'",
    'does not execute capture, upload, browser screenshot, or external browser flows',
    'Golden PNG generation, promotion, replacement, and image mutation are intentionally excluded.',
    'Pixel diff is intentionally excluded',
  ],
  'scripts/report-harness.mjs',
)

requireExcludes(
  reportSource,
  [
    "runCheck('verify:golden'",
    "runCheck('check:golden-pixels'",
    "runCheck('check-golden-pixels'",
    "runCheck('check:capture-dimensions'",
    'puppeteer',
    'chromium',
    'screenshot(',
    "runCheck('upload",
  ],
  'scripts/report-harness.mjs executable checks',
)

if (scripts['verify:harness'] !== 'npm run check:surface-registry && npm run check:capture-metadata && npm run check:fixture-contracts') {
  fail('verify:harness must remain the static fixture/metadata/surface aggregate')
}

const offlineSmoke = scripts['verify:offline-smoke'] || ''
requireIncludes(
  offlineSmoke,
  ['npm run check:abort-registry', 'npm run check:capture-batch-guards', 'npm run verify:harness'],
  'verify:offline-smoke',
)
requireExcludes(
  offlineSmoke,
  ['verify:golden', 'check:golden-pixels', 'check-golden-pixels', 'check:capture-dimensions'],
  'verify:offline-smoke',
)

if (scripts['harness:report'] !== 'node scripts/report-harness.mjs') {
  fail('harness:report must execute only scripts/report-harness.mjs')
}

if (!process.exitCode) {
  console.log('[check-harness-report-contract] ok')
}
