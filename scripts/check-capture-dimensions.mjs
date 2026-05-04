import fs from 'node:fs'
import sharp from 'sharp'

const input = process.argv[2] || process.env.CAPTURE_IMAGE_FILE || ''
const minWidth = Number(process.env.CAPTURE_MIN_WIDTH || 320)
const minHeight = Number(process.env.CAPTURE_MIN_HEIGHT || 320)

function fail(message) {
  console.error(`[check-capture-dimensions] ${message}`)
  process.exitCode = 1
}

if (!input) {
  console.log('[check-capture-dimensions] skipped (provide image path as argv or CAPTURE_IMAGE_FILE)')
  process.exit(0)
}

if (!fs.existsSync(input)) {
  fail(`image file not found: ${input}`)
  process.exit()
}

const meta = await sharp(input).metadata()
if (!meta.width || !meta.height) fail('image width/height missing')
if (meta.width < minWidth) fail(`width ${meta.width} is below minimum ${minWidth}`)
if (meta.height < minHeight) fail(`height ${meta.height} is below minimum ${minHeight}`)

if (!process.exitCode) {
  console.log(`[check-capture-dimensions] ok ${meta.width}x${meta.height}`)
}
