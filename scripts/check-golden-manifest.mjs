import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const manifestDir = path.join(root, 'tests', 'golden', 'manifests')
const requiredSurfaces = [
  'youtube-pc-instream-skip',
  'youtube-shorts',
  'demandgen-youtube-feed',
  'gdn-pc-display',
  'naver-smart-channel-mobile',
  'kakao-bizboard',
]
const allowedStates = new Set(['pending-sample', 'approved', 'external-only'])
const allowedSensitivity = new Set(['repo-safe-placeholder', 'repo-safe', 'external-sensitive'])
const allowedChannels = new Set(['youtube', 'gdn', 'naver', 'kakao'])

function fail(message) {
  console.error(`[check-golden-manifest] ${message}`)
  process.exitCode = 1
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (error) {
    fail(`invalid JSON ${path.relative(root, file)}: ${error instanceof Error ? error.message : String(error)}`)
    return null
  }
}

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getValue(object, dottedPath) {
  return dottedPath.split('.').reduce((value, key) => {
    if (!isObject(value)) return undefined
    return value[key]
  }, object)
}

function hasSensitiveText(value) {
  if (typeof value === 'string') {
    return /https?:\/\/|www\.|api[_-]?key|token|secret|credential|password/i.test(value)
  }
  if (Array.isArray(value)) return value.some(hasSensitiveText)
  if (isObject(value)) return Object.values(value).some(hasSensitiveText)
  return false
}

function requireString(manifest, field, surface) {
  const value = getValue(manifest, field)
  if (typeof value !== 'string' || value.trim() === '') {
    fail(`${surface}: ${field} must be a non-empty string`)
  }
}

function requirePositiveNumber(manifest, field, surface) {
  const value = Number(getValue(manifest, field))
  if (!Number.isFinite(value) || value <= 0) {
    fail(`${surface}: ${field} must be a positive number`)
  }
}

function validateManifest(manifest, file) {
  const fallbackSurface = path.basename(file, '.json')
  const surface = typeof manifest?.surface === 'string' ? manifest.surface : fallbackSurface

  if (!isObject(manifest)) {
    fail(`${fallbackSurface}: manifest must be an object`)
    return null
  }
  if (manifest.schemaVersion !== 1) fail(`${surface}: schemaVersion must be 1`)
  if (surface !== fallbackSurface) fail(`${surface}: filename must match surface id`)
  if (!allowedChannels.has(manifest.channel)) fail(`${surface}: unsupported channel ${manifest.channel}`)
  if (!allowedStates.has(manifest.sampleState)) fail(`${surface}: unsupported sampleState ${manifest.sampleState}`)
  if (!allowedSensitivity.has(manifest.sensitivity)) fail(`${surface}: unsupported sensitivity ${manifest.sensitivity}`)

  for (const field of [
    'surface',
    'channel',
    'productFamily',
    'productSurface',
    'golden.imagePath',
    'golden.metadataPath',
    'candidate.imagePath',
    'candidate.outputDir',
    'candidate.source',
    'diff.outputDir',
    'diff.reportPath',
    'diff.diffImagePath',
  ]) {
    requireString(manifest, field, surface)
  }

  for (const field of [
    'golden.width',
    'golden.height',
    'diff.maxPixelDiffRatio',
    'diff.maxMeanDelta',
    'diff.pixelDeltaThreshold',
  ]) {
    requirePositiveNumber(manifest, field, surface)
  }

  if (manifest.diff?.failOnDimensionMismatch !== true) {
    fail(`${surface}: diff.failOnDimensionMismatch must be true`)
  }
  if (!Array.isArray(manifest.requiredMetadata) || manifest.requiredMetadata.length === 0) {
    fail(`${surface}: requiredMetadata must be a non-empty array`)
  }
  if (!isObject(manifest.expectedMetadata)) {
    fail(`${surface}: expectedMetadata must be an object`)
  }
  if (hasSensitiveText(manifest)) {
    fail(`${surface}: manifest contains URL-like or sensitive text`)
  }

  return surface
}

if (!fs.existsSync(manifestDir)) {
  fail(`missing manifest directory ${path.relative(root, manifestDir)}`)
  process.exit()
}

const files = fs
  .readdirSync(manifestDir)
  .filter((name) => name.endsWith('.json'))
  .map((name) => path.join(manifestDir, name))
  .sort()

const seen = new Set()
let pendingCount = 0
for (const file of files) {
  const manifest = readJson(file)
  if (!manifest) continue
  const surface = validateManifest(manifest, file)
  if (!surface) continue
  seen.add(surface)
  if (manifest.sampleState === 'pending-sample') pendingCount += 1
}

for (const surface of requiredSurfaces) {
  if (!seen.has(surface)) fail(`missing required surface manifest ${surface}`)
}

if (!process.exitCode) {
  console.log(`[check-golden-manifest] ok (${seen.size} manifests, ${pendingCount} pending-sample)`)
}
