import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const root = process.cwd()
const manifestDir = path.join(root, 'tests', 'golden', 'manifests')

function fail(message) {
  console.error(`[check-golden-dimensions] ${message}`)
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
  const expectedWidth = Number(manifest.golden?.width)
  const expectedHeight = Number(manifest.golden?.height)
  if (!Number.isFinite(expectedWidth) || expectedWidth <= 0) fail(`${surface}: golden.width must be positive`)
  if (!Number.isFinite(expectedHeight) || expectedHeight <= 0) fail(`${surface}: golden.height must be positive`)

  if (manifest.sampleState === 'pending-sample' || manifest.sampleState === 'external-only') {
    console.log(`[check-golden-dimensions] skipped ${surface} (${manifest.sampleState})`)
    skipped += 1
    continue
  }

  const imagePath = path.join(root, manifest.golden?.imagePath ?? '')
  if (!fs.existsSync(imagePath)) {
    fail(`${surface}: missing approved golden image ${manifest.golden?.imagePath}`)
    continue
  }

  const metadata = await sharp(imagePath).metadata()
  if (metadata.width !== expectedWidth || metadata.height !== expectedHeight) {
    fail(`${surface}: dimension ${metadata.width}x${metadata.height} != expected ${expectedWidth}x${expectedHeight}`)
  }
  checked += 1
}

if (!process.exitCode) {
  console.log(`[check-golden-dimensions] ok (${checked} checked, ${skipped} skipped)`)
}
