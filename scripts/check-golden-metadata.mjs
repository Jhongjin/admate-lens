import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const manifestDir = path.join(root, 'tests', 'golden', 'manifests')
const allowedResultCategories = new Set([
  'ad_capture_ok',
  'ad_capture_review_needed',
  'ad_area_not_found',
  'ad_out_of_viewport',
])

function fail(message) {
  console.error(`[check-golden-metadata] ${message}`)
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
    return /https?:\/\/|www\.|api[_-]?key|token|secret|credential|password|campaign|advertiser/i.test(value)
  }
  if (Array.isArray(value)) return value.some(hasSensitiveText)
  if (isObject(value)) return Object.values(value).some(hasSensitiveText)
  return false
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function isValidIsoDate(value) {
  return isNonEmptyString(value) && !Number.isNaN(Date.parse(value))
}

function isPositiveNumber(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) && numeric > 0
}

function validateMetadataEnvelope(manifest, metadataEnvelope) {
  const surface = manifest.surface
  if (!isObject(metadataEnvelope)) {
    fail(`${surface}: metadata fixture must be an object`)
    return null
  }
  if (metadataEnvelope.schemaVersion !== 1) fail(`${surface}: metadata schemaVersion must be 1`)
  if (metadataEnvelope.surface !== surface) fail(`${surface}: metadata surface mismatch`)
  if (metadataEnvelope.sampleState !== manifest.sampleState) fail(`${surface}: metadata sampleState mismatch`)
  if (!['placeholder', 'approved'].includes(metadataEnvelope.fixtureKind)) {
    fail(`${surface}: fixtureKind must be placeholder or approved`)
  }
  if (!isObject(metadataEnvelope.metadata)) {
    fail(`${surface}: metadata field must be an object`)
    return null
  }
  if (hasSensitiveText(metadataEnvelope)) {
    fail(`${surface}: metadata fixture contains URL-like or sensitive text`)
  }
  return metadataEnvelope.metadata
}

function validateCaptureMetadata(manifest, metadata) {
  const surface = manifest.surface
  for (const field of manifest.requiredMetadata ?? []) {
    const value = getValue(metadata, field)
    if (value === undefined || value === null || value === '') {
      fail(`${surface}: missing required metadata field ${field}`)
    }
  }

  for (const [field, expected] of Object.entries(manifest.expectedMetadata ?? {})) {
    const actual = getValue(metadata, field)
    if (actual !== expected) {
      fail(`${surface}: expected metadata ${field}=${expected}, got ${actual}`)
    }
  }

  if (!isValidIsoDate(metadata.capturedAt)) fail(`${surface}: capturedAt must be an ISO timestamp`)
  if (!isPositiveNumber(metadata.durationMs)) fail(`${surface}: durationMs must be a positive number`)
  if (!allowedResultCategories.has(metadata.resultCategory)) {
    fail(`${surface}: invalid resultCategory ${metadata.resultCategory}`)
  }
  if (!isObject(metadata.diagnostics)) fail(`${surface}: diagnostics must be an object`)
  if (!isObject(metadata.diagnostics?.captureQuality)) {
    fail(`${surface}: diagnostics.captureQuality must be an object`)
  }
  if (metadata.diagnostics?.captureQuality?.needsReview !== false) {
    fail(`${surface}: placeholder golden metadata must start with needsReview=false`)
  }
  if (!Array.isArray(metadata.diagnostics?.captureQuality?.flags)) {
    fail(`${surface}: captureQuality.flags must be an array`)
  }
  if (!isObject(metadata.runtime)) fail(`${surface}: runtime must be an object`)
  if (!isNonEmptyString(metadata.runtime?.provider)) fail(`${surface}: runtime.provider missing`)
  if (!isValidIsoDate(metadata.runtime?.capturedAt)) fail(`${surface}: runtime.capturedAt must be an ISO timestamp`)
  if (!isPositiveNumber(metadata.runtime?.durationMs)) fail(`${surface}: runtime.durationMs must be a positive number`)
}

if (!fs.existsSync(manifestDir)) {
  fail(`missing manifest directory ${path.relative(root, manifestDir)}`)
  process.exit()
}

const manifestFiles = fs
  .readdirSync(manifestDir)
  .filter((name) => name.endsWith('.json'))
  .map((name) => path.join(manifestDir, name))
  .sort()

let checked = 0
for (const manifestFile of manifestFiles) {
  const manifest = readJson(manifestFile)
  if (!manifest) continue
  const metadataPath = path.join(root, manifest.golden?.metadataPath ?? '')
  if (!fs.existsSync(metadataPath)) {
    fail(`${manifest.surface}: missing metadata fixture ${manifest.golden?.metadataPath}`)
    continue
  }
  const metadataEnvelope = readJson(metadataPath)
  const metadata = metadataEnvelope ? validateMetadataEnvelope(manifest, metadataEnvelope) : null
  if (!metadata) continue
  validateCaptureMetadata(manifest, metadata)
  checked += 1
}

if (!process.exitCode) {
  console.log(`[check-golden-metadata] ok (${checked} metadata fixtures)`)
}
