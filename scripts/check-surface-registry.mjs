import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const requiredSurfaceGroups = [
  {
    label: 'Naver mobile',
    surfaces: [
      'naver-smart-channel-mobile',
      'naver-feed-mobile',
      'naver-native-banner-feed',
      'naver-image-banner-mobile',
    ],
  },
  {
    label: 'Kakao mobile',
    surfaces: [
      'kakao-bizboard',
      'kakao-display-native',
      'kakao-display-catalog',
      'kakao-product-catalog',
    ],
  },
  {
    label: 'Demand Gen first scope',
    surfaces: [
      'demandgen-youtube-feed',
      'demandgen-youtube-shorts',
      'youtube-feed',
      'youtube-shorts',
      'demand-gen',
    ],
  },
  {
    label: 'GDN viewport modes',
    surfaces: ['gdn-pc', 'gdn-mobile', 'gdnViewportMode'],
  },
]
const legacyMappings = [
  ['naver-mobile-feed', 'naver-feed-mobile'],
  ['kakao-mobile-feed', 'kakao-display-native'],
]
const filesToScan = [
  'src/lib/capture/youtube-ad-types.ts',
  'src/lib/capture/channels/mobile-native-capture.ts',
  'src/lib/capture/channels/mobile-synthetic-infeed.ts',
  'src/app/components/CaptureForm.tsx',
  'src/app/components/CaptureList.tsx',
  'src/app/api/captures/route.ts',
  'src/app/api/captures/execute/route.ts',
]

function fail(message) {
  console.error(`[check-surface-registry] ${message}`)
  process.exitCode = 1
}

const corpus = filesToScan
  .map(file => {
    const target = path.join(root, file)
    if (!fs.existsSync(target)) {
      fail(`missing scan file ${file}`)
      return ''
    }
    return fs.readFileSync(target, 'utf8')
  })
  .join('\n')

for (const group of requiredSurfaceGroups) {
  for (const surface of group.surfaces) {
    if (!corpus.includes(surface)) {
      fail(`missing required surface ${surface} (${group.label})`)
    }
  }
}

for (const [legacy, canonical] of legacyMappings) {
  if (!corpus.includes(legacy)) fail(`missing legacy surface ${legacy}`)
  if (!corpus.includes(canonical)) fail(`missing canonical surface ${canonical}`)
}

const youtubeRequirements = [
  { label: 'PC skip in-stream', token: 'preroll' },
  { label: 'bumper', token: 'bumper' },
  { label: 'AOS in-stream', token: 'mobile-preroll-aos' },
  { label: 'iOS in-stream', token: 'mobile-preroll-ios' },
  { label: 'Shorts feed', token: 'shorts-feed' },
  { label: 'Masthead home', token: 'masthead-home' },
  { label: 'PC home in-feed', token: 'infeed-home' },
  { label: 'mobile home in-feed', token: 'mobile-infeed-home' },
  { label: 'search in-feed', token: 'infeed-search' },
  { label: 'watch-next in-feed', token: 'infeed-watch-next' },
]
const youtubeFile = path.join(root, 'src/lib/capture/youtube-ad-types.ts')
if (fs.existsSync(youtubeFile)) {
  const youtubeText = fs.readFileSync(youtubeFile, 'utf8').toLowerCase()
  for (const requirement of youtubeRequirements) {
    if (!youtubeText.includes(requirement.token)) {
      fail(`youtube type reference missing ${requirement.label}`)
    }
  }
  for (const legacy of ['display', 'overlay']) {
    if (!youtubeText.includes(`"${legacy}"`)) {
      fail(`youtube legacy reference missing ${legacy}`)
    }
  }
} else {
  fail('missing src/lib/capture/youtube-ad-types.ts')
}

if (!process.exitCode) {
  const totalSurfaces = requiredSurfaceGroups.reduce(
    (sum, group) => sum + group.surfaces.length,
    0,
  )
  console.log(
    `[check-surface-registry] ok (${totalSurfaces} surface tokens, ${legacyMappings.length} legacy mappings, ${youtubeRequirements.length} youtube types)`,
  )
}
