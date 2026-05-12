import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const root = process.cwd()
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const manifestDir = path.join(root, 'tests', 'golden', 'manifests')

function runCheck(name, args) {
  const command = process.platform === 'win32' ? (process.env.ComSpec || 'cmd.exe') : npmCommand
  const commandArgs = process.platform === 'win32'
    ? ['/d', '/s', '/c', `npm ${args.join(' ')}`]
    : args
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    encoding: 'utf8',
    stdio: 'pipe',
  })

  const stdout = (result.stdout || '').trim()
  const stderr = (result.stderr || '').trim()
  if (stdout) console.log(stdout)
  if (stderr) console.error(stderr)

  return {
    name,
    status: result.status === 0 ? 'pass' : 'fail',
    exitCode: result.status,
  }
}

function readManifests() {
  if (!fs.existsSync(manifestDir)) {
    return {
      total: 0,
      sampleStates: {},
      surfaces: [],
      errors: [],
    }
  }

  const errors = []
  const manifests = fs
    .readdirSync(manifestDir)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => {
      const file = path.join(manifestDir, name)
      try {
        const data = JSON.parse(fs.readFileSync(file, 'utf8'))
        return {
          surface: data.surface || path.basename(name, '.json'),
          sampleState: data.sampleState || 'unknown',
        }
      } catch (error) {
        errors.push({
          file: path.relative(root, file),
          message: error instanceof Error ? error.message : String(error),
        })
        return {
          surface: path.basename(name, '.json'),
          sampleState: 'invalid',
        }
      }
    })

  const sampleStates = manifests.reduce((counts, manifest) => {
    counts[manifest.sampleState] = (counts[manifest.sampleState] || 0) + 1
    return counts
  }, {})

  return {
    total: manifests.length,
    sampleStates,
    surfaces: manifests,
    errors,
  }
}

const checks = [
  runCheck('verify:harness', ['run', 'verify:harness']),
  runCheck('check:golden-manifest', ['run', 'check:golden-manifest']),
  runCheck('check:golden-metadata', ['run', 'check:golden-metadata']),
  runCheck('check:golden-dimensions', ['run', 'check:golden-dimensions']),
]

const report = {
  harness: 'AdMate Lens harness report v1',
  checks,
  golden: readManifests(),
  notes: [
    'This report does not execute capture, upload, browser screenshot, or external browser flows.',
    'Pending golden samples are reported as placeholders and do not require PNG files.',
    'Golden PNG generation, promotion, replacement, and image mutation are intentionally excluded.',
    'Pixel diff is intentionally excluded because approved samples can create diff PNG and JSON artifacts.',
  ],
}

console.log(JSON.stringify(report, null, 2))

if (checks.some((check) => check.status !== 'pass')) {
  process.exitCode = 1
}
