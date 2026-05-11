import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const fixtureDir = path.join(root, 'public', 'lens-fixtures')
const manifestDir = path.join(root, 'tests', 'golden', 'manifests')

const forbiddenVisibleNames = [
  'youtube',
  'naver',
  'kakao',
  'google',
  'facebook',
  'instagram',
  'tiktok',
  'twitter',
  'donga',
  'yna',
]

const allowedSafetyWords = /\b(no|avoid|avoids|without|not|synthetic|sample|fixture|generic|repo-safe|local)\b/i
const sensitivePatterns = [
  /\bapi[_-]?key\b/i,
  /\baccess[_-]?token\b/i,
  /\bbearer\s+[a-z0-9._-]+/i,
  /\bcookie\b/i,
  /\bset-cookie\b/i,
  /\bcredential/i,
  /\bpassword\b/i,
  /\bsecret\b/i,
  /\bsigned[_-]?url\b/i,
  /\bsession[_-]?id\b/i,
  /\baccount[_-]?id\b/i,
  /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/i,
]

function fail(message) {
  console.error(`[check-fixture-contracts] ${message}`)
  process.exitCode = 1
}

function relative(file) {
  return path.relative(root, file).replaceAll(path.sep, '/')
}

function stripTagBlocks(html, tagName) {
  return html.replace(new RegExp(`<${tagName}\\b[^>]*>[\\s\\S]*?<\\/${tagName}>`, 'gi'), '')
}

function getVisibleText(html) {
  const bodyMatch = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)
  const body = bodyMatch ? bodyMatch[1] : html
  const withoutBlocks = ['style', 'script', 'svg', 'noscript', 'template'].reduce(
    (text, tag) => stripTagBlocks(text, tag),
    body,
  )
  return withoutBlocks
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

function getSentences(text) {
  return text
    .split(/[.!?]\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
}

function validateLocalReference(file, html, attribute) {
  const pattern = new RegExp(`${attribute}\\s*=\\s*["']([^"']+)["']`, 'gi')
  for (const match of html.matchAll(pattern)) {
    const value = match[1].trim()
    if (
      value.startsWith('#') ||
      value.startsWith('/') ||
      value.startsWith('./') ||
      value.startsWith('../') ||
      value.startsWith('data:')
    ) {
      continue
    }
    fail(`${relative(file)}: ${attribute} must be local-only (${value})`)
  }
}

function validateFixture(file) {
  const html = fs.readFileSync(file, 'utf8')
  const rel = relative(file)

  if (!/^<!doctype html>/i.test(html.trim())) {
    fail(`${rel}: fixture must start with <!doctype html>`)
  }
  if (/<script\b/i.test(html)) {
    fail(`${rel}: script tags are not allowed`)
  }
  if (/https?:\/\//i.test(html) || /\/\/[a-z0-9.-]+\.[a-z]{2,}/i.test(html)) {
    fail(`${rel}: external URLs are not allowed`)
  }
  if (/@import\b/i.test(html)) {
    fail(`${rel}: CSS @import is not allowed`)
  }
  if (/<link\b/i.test(html)) {
    fail(`${rel}: link tags are not allowed in local fixtures`)
  }
  if (!/\bdata-ad-slot\s*=/.test(html)) {
    fail(`${rel}: missing stable data-ad-slot marker`)
  }

  for (const attribute of ['src', 'href', 'action', 'formaction', 'poster']) {
    validateLocalReference(file, html, attribute)
  }

  for (const pattern of sensitivePatterns) {
    if (pattern.test(html)) {
      fail(`${rel}: sensitive or credential-like pattern matched ${pattern}`)
    }
  }

  const visibleText = getVisibleText(html)
  const sentences = getSentences(visibleText)
  for (const name of forbiddenVisibleNames) {
    const sentence = sentences.find((item) => new RegExp(`\\b${name}\\b`, 'i').test(item))
    if (sentence && !allowedSafetyWords.test(sentence)) {
      fail(`${rel}: visible real platform/publisher-like name "${name}" is not in a safety sentence`)
    }
  }
}

function validateManifestCoverage() {
  if (!fs.existsSync(manifestDir)) {
    fail(`missing manifest directory ${relative(manifestDir)}`)
    return
  }

  const files = fs
    .readdirSync(manifestDir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => path.join(manifestDir, name))
    .sort()

  for (const file of files) {
    let manifest
    try {
      manifest = JSON.parse(fs.readFileSync(file, 'utf8'))
    } catch (error) {
      fail(`${relative(file)}: invalid JSON (${error instanceof Error ? error.message : String(error)})`)
      continue
    }

    if (manifest?.sampleState !== 'approved' || manifest?.sensitivity !== 'repo-safe') {
      continue
    }

    const notes = typeof manifest.notes === 'string' ? manifest.notes : ''
    if (!/(static local fixture|controlled static local fixture|reviewed exception)/i.test(notes)) {
      fail(`${relative(file)}: approved repo-safe manifest needs a fixture source note or reviewed exception`)
    }
  }
}

if (!fs.existsSync(fixtureDir)) {
  fail(`missing fixture directory ${relative(fixtureDir)}`)
} else {
  const files = fs
    .readdirSync(fixtureDir)
    .filter((name) => name.endsWith('.html'))
    .map((name) => path.join(fixtureDir, name))
    .sort()

  if (files.length === 0) {
    fail(`no fixture HTML files found in ${relative(fixtureDir)}`)
  }

  for (const file of files) {
    validateFixture(file)
  }

  validateManifestCoverage()

  if (!process.exitCode) {
    console.log(`[check-fixture-contracts] ok (${files.length} fixture pages)`)
  }
}
