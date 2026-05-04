import fs from 'node:fs'
import path from 'node:path'

const defaultFixture = path.join(
  process.cwd(),
  'scripts',
  'fixtures',
  'capture-metadata-smoke.json',
)
const input = process.argv[2] || process.env.CAPTURE_METADATA_FILE || defaultFixture

const allowedResultCategories = new Set([
  'ad_capture_ok',
  'ad_capture_review_needed',
  'ad_area_not_found',
  'ad_out_of_viewport',
])
const allowedYoutubeAdTypes = new Set([
  'preroll',
  'bumper',
  'mobile-preroll-aos',
  'mobile-preroll-ios',
  'mobile-bumper-aos',
  'mobile-bumper-ios',
  'shorts-feed',
  'masthead-home',
  'infeed-home',
  'mobile-infeed-home',
  'infeed-search',
  'infeed-watch-next',
])
const allowedProductSurfaces = {
  'demand-gen': new Set(['youtube-feed', 'youtube-shorts']),
  naver: new Set([
    'naver-smart-channel-mobile',
    'naver-feed-mobile',
    'naver-native-banner-feed',
    'naver-image-banner-mobile',
  ]),
  kakao: new Set([
    'kakao-bizboard',
    'kakao-display-native',
    'kakao-display-catalog',
    'kakao-product-catalog',
  ]),
}

function fail(message) {
  console.error(`[check-capture-output-metadata] ${message}`)
  process.exitCode = 1
}

function warn(message) {
  console.warn(`[check-capture-output-metadata] ${message}`)
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function isFinitePositiveNumber(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) && numeric > 0
}

function isValidIsoDate(value) {
  return isNonEmptyString(value) && !Number.isNaN(Date.parse(value))
}

function validateCaptureQuality(metadata, label) {
  const diagnostics = metadata.diagnostics
  if (diagnostics === null || diagnostics === undefined) {
    warn(`${label}: diagnostics missing; capture quality flags cannot be inspected`)
    return
  }
  if (!isPlainObject(diagnostics)) {
    fail(`${label}: diagnostics must be an object when present`)
    return
  }

  const quality = diagnostics.captureQuality
  if (quality === undefined || quality === null) {
    warn(`${label}: diagnostics.captureQuality missing`)
    return
  }
  if (!isPlainObject(quality)) {
    fail(`${label}: diagnostics.captureQuality must be an object`)
    return
  }
  if (quality.needsReview !== undefined && typeof quality.needsReview !== 'boolean') {
    fail(`${label}: captureQuality.needsReview must be boolean`)
  }
  if (quality.flags !== undefined && !Array.isArray(quality.flags)) {
    fail(`${label}: captureQuality.flags must be an array`)
  }
  if (quality.score !== undefined) {
    const score = Number(quality.score)
    if (!Number.isFinite(score) || score < 0 || score > 100) {
      fail(`${label}: captureQuality.score must be 0..100`)
    }
  }
}

function validateProductMetadata(metadata, label) {
  const productFamily = metadata.productFamily
  const productSurface = metadata.productSurface
  const youtubeAdType = metadata.youtubeAdType

  const hasProductIdentity =
    isNonEmptyString(productFamily) ||
    isNonEmptyString(productSurface) ||
    isNonEmptyString(youtubeAdType) ||
    isNonEmptyString(metadata.gdnViewportMode)
  if (!hasProductIdentity) {
    fail(`${label}: missing product identity (productFamily/productSurface/youtubeAdType/gdnViewportMode)`)
  }

  if (isNonEmptyString(youtubeAdType) && !allowedYoutubeAdTypes.has(youtubeAdType)) {
    fail(`${label}: unsupported or legacy youtubeAdType ${youtubeAdType}`)
  }

  if (isNonEmptyString(productFamily)) {
    const allowedSurfaces = allowedProductSurfaces[productFamily]
    if (allowedSurfaces && !allowedSurfaces.has(productSurface)) {
      fail(`${label}: invalid productSurface ${productSurface} for ${productFamily}`)
    }
  }

  if (metadata.gdnViewportMode !== undefined && !['pc', 'mobile'].includes(metadata.gdnViewportMode)) {
    fail(`${label}: gdnViewportMode must be pc or mobile`)
  }
}

function validateRuntime(metadata, label) {
  const runtime = metadata.runtime
  if (runtime === undefined || runtime === null) {
    fail(`${label}: completed metadata must include runtime`)
    return
  }
  if (!isPlainObject(runtime)) {
    fail(`${label}: runtime must be an object`)
    return
  }
  if (!isNonEmptyString(runtime.provider)) {
    fail(`${label}: runtime.provider missing`)
  }
  if (!isValidIsoDate(runtime.capturedAt)) {
    fail(`${label}: runtime.capturedAt must be a valid ISO timestamp`)
  }
  if (!isFinitePositiveNumber(runtime.durationMs)) {
    fail(`${label}: runtime.durationMs must be a positive number`)
  }
}

function validateCompletedMetadata(metadata, label) {
  if (!isValidIsoDate(metadata.capturedAt)) {
    fail(`${label}: capturedAt must be a valid ISO timestamp`)
  }
  if (!isFinitePositiveNumber(metadata.durationMs)) {
    fail(`${label}: durationMs must be a positive number`)
  }
  if (!allowedResultCategories.has(metadata.resultCategory)) {
    fail(`${label}: invalid resultCategory ${metadata.resultCategory}`)
  }
  validateRuntime(metadata, label)
  validateCaptureQuality(metadata, label)
}

function validateFailedMetadata(metadata, label) {
  if (!isNonEmptyString(metadata.failureCategory)) {
    fail(`${label}: failureCategory missing`)
  }
  if (!isNonEmptyString(metadata.failureCode)) {
    fail(`${label}: failureCode missing`)
  }
  if (!isValidIsoDate(metadata.failedAt)) {
    fail(`${label}: failedAt must be a valid ISO timestamp`)
  }
}

function validateMetadata(metadata, index) {
  const label = `record ${index + 1}`
  if (!isPlainObject(metadata)) {
    fail(`${label}: metadata must be an object`)
    return
  }

  validateProductMetadata(metadata, label)

  const isCompleted = metadata.resultCategory !== undefined || metadata.capturedAt !== undefined
  const isFailed =
    metadata.failureCategory !== undefined ||
    metadata.failureCode !== undefined ||
    metadata.failedAt !== undefined

  if (!isCompleted && !isFailed) {
    fail(`${label}: metadata must describe a completed or failed capture result`)
  }
  if (isCompleted) validateCompletedMetadata(metadata, label)
  if (isFailed) validateFailedMetadata(metadata, label)

  if (metadata.progress !== undefined) {
    const progress = Number(metadata.progress)
    if (!Number.isFinite(progress) || progress < 0 || progress > 100) {
      fail(`${label}: progress must be 0..100`)
    }
  }
}

if (!input || !fs.existsSync(input)) {
  fail(`metadata file not found: ${input}`)
  process.exit()
}

let parsed
try {
  parsed = JSON.parse(fs.readFileSync(input, 'utf8'))
} catch (error) {
  fail(`metadata JSON parse failed: ${error instanceof Error ? error.message : String(error)}`)
  process.exit()
}

const records = Array.isArray(parsed) ? parsed : [parsed]
if (records.length === 0) {
  fail('metadata fixture must include at least one record')
}

records.forEach(validateMetadata)

if (!process.exitCode) {
  console.log(`[check-capture-output-metadata] ok (${records.length} record${records.length === 1 ? '' : 's'})`)
}
