import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const root = process.cwd()
const manifestDir = path.join(root, 'tests', 'golden', 'manifests')

function fail(message) {
  console.error(`[check-golden-pixels] ${message}`)
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

async function readRgba(imagePath) {
  const image = sharp(imagePath).ensureAlpha()
  const metadata = await image.metadata()
  const buffer = await image.raw().toBuffer()
  return { buffer, width: metadata.width, height: metadata.height }
}

async function writeDiffImage(diffPath, diffPixels, width, height) {
  fs.mkdirSync(path.dirname(diffPath), { recursive: true })
  await sharp(Buffer.from(diffPixels), {
    raw: { width, height, channels: 4 },
  }).png().toFile(diffPath)
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
let skipped = 0
for (const manifestFile of manifestFiles) {
  const manifest = readJson(manifestFile)
  if (!manifest) continue
  const surface = manifest.surface ?? path.basename(manifestFile, '.json')

  if (manifest.sampleState === 'pending-sample' || manifest.sampleState === 'external-only') {
    console.log(`[check-golden-pixels] skipped ${surface} (${manifest.sampleState})`)
    skipped += 1
    continue
  }

  const goldenPath = path.join(root, manifest.golden?.imagePath ?? '')
  const candidatePath = path.join(root, manifest.candidate?.imagePath ?? '')
  if (!fs.existsSync(goldenPath)) {
    fail(`${surface}: missing golden image ${manifest.golden?.imagePath}`)
    continue
  }
  if (!fs.existsSync(candidatePath)) {
    fail(`${surface}: missing candidate image ${manifest.candidate?.imagePath}`)
    continue
  }

  const golden = await readRgba(goldenPath)
  const candidate = await readRgba(candidatePath)
  if (golden.width !== candidate.width || golden.height !== candidate.height) {
    if (manifest.diff?.failOnDimensionMismatch === true) {
      fail(`${surface}: dimension mismatch golden=${golden.width}x${golden.height} candidate=${candidate.width}x${candidate.height}`)
      continue
    }
  }

  const pixelCount = golden.width * golden.height
  const pixelDeltaThreshold = Number(manifest.diff?.pixelDeltaThreshold ?? 12)
  const diffPixels = new Uint8ClampedArray(pixelCount * 4)
  let changedPixels = 0
  let totalDelta = 0

  for (let index = 0; index < golden.buffer.length; index += 4) {
    const dr = Math.abs(golden.buffer[index] - candidate.buffer[index])
    const dg = Math.abs(golden.buffer[index + 1] - candidate.buffer[index + 1])
    const db = Math.abs(golden.buffer[index + 2] - candidate.buffer[index + 2])
    const delta = dr + dg + db
    totalDelta += delta / 3
    if (delta > pixelDeltaThreshold) changedPixels += 1
    diffPixels[index] = delta > pixelDeltaThreshold ? 255 : 0
    diffPixels[index + 1] = 0
    diffPixels[index + 2] = delta > pixelDeltaThreshold ? 0 : 255
    diffPixels[index + 3] = 180
  }

  const changedPixelRatio = changedPixels / pixelCount
  const meanDelta = totalDelta / pixelCount
  const maxPixelDiffRatio = Number(manifest.diff?.maxPixelDiffRatio)
  const maxMeanDelta = Number(manifest.diff?.maxMeanDelta)
  const diffImagePath = path.join(root, manifest.diff?.diffImagePath ?? '')
  const reportPath = path.join(root, manifest.diff?.reportPath ?? '')

  await writeDiffImage(diffImagePath, diffPixels, golden.width, golden.height)
  fs.mkdirSync(path.dirname(reportPath), { recursive: true })
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        surface,
        width: golden.width,
        height: golden.height,
        changedPixelRatio,
        maxPixelDiffRatio,
        meanDelta,
        maxMeanDelta,
        passed: changedPixelRatio <= maxPixelDiffRatio && meanDelta <= maxMeanDelta,
      },
      null,
      2,
    ),
  )

  if (changedPixelRatio > maxPixelDiffRatio) {
    fail(`${surface}: changedPixelRatio ${changedPixelRatio} exceeds ${maxPixelDiffRatio}`)
  }
  if (meanDelta > maxMeanDelta) {
    fail(`${surface}: meanDelta ${meanDelta} exceeds ${maxMeanDelta}`)
  }
  checked += 1
}

if (!process.exitCode) {
  console.log(`[check-golden-pixels] ok (${checked} checked, ${skipped} skipped)`)
}
