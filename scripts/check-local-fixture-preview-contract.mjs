import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const files = {
  session: 'src/lib/auth/lens-session.ts',
  fixtures: 'src/lib/capture/local-fixture-captures.ts',
  captures: 'src/app/api/captures/route.ts',
  execute: 'src/app/api/captures/execute/route.ts',
  upload: 'src/app/api/upload/route.ts',
  captureList: 'src/app/components/CaptureList.tsx',
  globals: 'src/app/globals.css',
  doc: 'docs/tasks/2026-05-15_lens_local_preview_unblock_audit_v1.md',
  packageJson: 'package.json',
}

function fail(message) {
  console.error(`[check-local-fixture-preview-contract] ${message}`)
  process.exitCode = 1
}

function read(file) {
  const fullPath = path.join(root, file)
  if (!fs.existsSync(fullPath)) {
    fail(`missing ${file}`)
    return ''
  }
  return fs.readFileSync(fullPath, 'utf8')
}

function assertIncludes(text, needle, label) {
  if (!text.includes(needle)) fail(`${label} missing ${needle}`)
}

function assertOrder(text, before, after, label) {
  const beforeIndex = text.indexOf(before)
  const afterIndex = text.indexOf(after)
  if (beforeIndex < 0) fail(`${label} missing ${before}`)
  if (afterIndex < 0) fail(`${label} missing ${after}`)
  if (beforeIndex >= 0 && afterIndex >= 0 && beforeIndex > afterIndex) {
    fail(`${label} must check ${before} before ${after}`)
  }
}

function assertRouteGuard(text, routeLabel, fixtureMessage) {
  assertIncludes(text, 'requireLensSession(request)', `${routeLabel} session boundary`)
  assertIncludes(text, 'canUseLocalLensFixtureMode()', `${routeLabel} fixture guard`)
  assertIncludes(text, 'code: "local_fixture_read_only"', `${routeLabel} read-only code`)
  assertIncludes(text, fixtureMessage, `${routeLabel} fixture block message`)
  assertOrder(text, 'requireLensSession(request)', 'canUseLocalLensFixtureMode()', `${routeLabel} guard order`)
  assertOrder(text, 'canUseLocalLensFixtureMode()', 'createServerClient()', `${routeLabel} DB boundary`)
}

const sessionText = read(files.session)
const fixtureText = read(files.fixtures)
const capturesText = read(files.captures)
const executeText = read(files.execute)
const uploadText = read(files.upload)
const captureListText = read(files.captureList)
const globalsText = read(files.globals)
const docText = read(files.doc)
const packageJson = JSON.parse(read(files.packageJson) || '{}')

for (const needle of [
  'process.env.NODE_ENV !== "production"',
  'process.env.IS_LOCAL === "true"',
  'process.env.LENS_LOCAL_AUTH_BYPASS === "true"',
  'process.env.LENS_LOCAL_FIXTURE_MODE === "true"',
  'export function canUseLocalLensAuthBypass()',
  'export function canUseLocalLensFixtureMode()',
  'httpOnly: true',
  'sameSite: "lax"',
  'secure: false',
]) {
  assertIncludes(sessionText, needle, 'lens session guard')
}

assertOrder(
  sessionText,
  'process.env.NODE_ENV !== "production"',
  'process.env.LENS_LOCAL_AUTH_BYPASS === "true"',
  'local auth bypass production guard',
)
assertOrder(
  sessionText,
  'process.env.NODE_ENV !== "production"',
  'process.env.LENS_LOCAL_FIXTURE_MODE === "true"',
  'local fixture production guard',
)

for (const needle of [
  'localFixtureCaptures',
  'listLocalFixtureCaptures',
  'fixture: true',
  'runtime: { provider: "local-fixture" }',
  'data:image/svg+xml',
]) {
  assertIncludes(fixtureText, needle, 'local fixture captures')
}

assertIncludes(capturesText, 'listLocalFixtureCaptures({ status, limit, offset })', 'captures fixture read')
assertIncludes(capturesText, 'Local fixture mode blocks capture creation and real capture execution.', 'captures POST fixture block')
assertIncludes(capturesText, 'Local fixture mode blocks capture cancellation.', 'captures PATCH fixture block')
assertIncludes(capturesText, 'Local fixture mode blocks capture deletion.', 'captures DELETE fixture block')
assertRouteGuard(capturesText, 'captures route', 'Local fixture mode blocks capture creation and real capture execution.')

assertRouteGuard(executeText, 'execute route', 'Local fixture mode blocks real capture execution.')
assertRouteGuard(uploadText, 'upload route', 'Local fixture mode blocks storage uploads.')
assertOrder(uploadText, 'canUseLocalLensFixtureMode()', 'request.formData()', 'upload form-data boundary')

for (const needle of [
  'getVisualInspectionDecision',
  'visualInspectionRows',
  'naturalImageSize',
  '원본 픽셀',
  'viewer 원본 픽셀',
  'viewerOriginalPixels',
  'viewer 판독값',
  'sanitizeEvidenceBundleUrl',
  'evidenceBundleRows',
  'Capture bundle',
  '캡처 묶음',
  '시각 검수 단계',
  'Visual review',
  'Fixture read-only',
  '재촬영 검토',
  '화면 결과 대기',
]) {
  assertIncludes(captureListText, needle, 'capture detail visual QA gate')
}

for (const needle of [
  '.lens-visual-qa-gate',
  '.lens-visual-qa-grid',
  '.lens-visual-qa-cell',
  '.lens-evidence-bundle',
  '.lens-evidence-bundle__grid',
  '.lens-evidence-bundle__payload',
]) {
  assertIncludes(globalsText, needle, 'visual QA gate styles')
}

for (const needle of [
  'Use the local-only fixture mode',
  'No production bypass should exist.',
  'capture creation, cancellation, deletion, upload, and execute routes return read-only fixture errors',
  'No DB, storage, auth-provider, capture execution, or secret-reading behavior is required',
]) {
  assertIncludes(docText, needle, 'fixture audit doc')
}

if (packageJson.scripts?.['check:local-fixture-preview'] !== 'node scripts/check-local-fixture-preview-contract.mjs') {
  fail('package script check:local-fixture-preview is missing or changed')
}

if (!String(packageJson.scripts?.['verify:offline-smoke'] || '').includes('check:local-fixture-preview')) {
  fail('verify:offline-smoke must include check:local-fixture-preview')
}

if (!process.exitCode) console.log('[check-local-fixture-preview-contract] ok')
