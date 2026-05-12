import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const root = process.cwd()
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'admate-batch-guards-'))
const tsc = path.join(root, 'node_modules', 'typescript', 'lib', 'tsc.js')
const tsconfigPath = path.join(outDir, 'tsconfig.json')

function run(label, command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    shell: false,
  })

  if (result.status !== 0) {
    console.error(`[check-capture-batch-guards] ${label} failed`)
    process.exitCode = result.status || 1
    return false
  }

  return true
}

function assertRouteUsesSharedSourceKey() {
  const routePath = path.join(root, 'src', 'app', 'api', 'captures', 'route.ts')
  const source = fs.readFileSync(routePath, 'utf8')
  const helperIndex = source.indexOf('function dedupeNormalizedUrls')
  const useIndex = source.indexOf('normalizeCaptureSourceUrlKey(url)', helperIndex)
  if (helperIndex === -1 || useIndex === -1) {
    console.error(
      '[check-capture-batch-guards] creation-time URL dedupe must use normalizeCaptureSourceUrlKey',
    )
    process.exitCode = 1
    return false
  }
  return true
}

function assertIncludes(source, snippets, message) {
  const missing = snippets.filter((snippet) => !source.includes(snippet))
  if (missing.length > 0) {
    console.error(`[check-capture-batch-guards] ${message}`)
    for (const snippet of missing) {
      console.error(`  missing: ${snippet}`)
    }
    process.exitCode = 1
    return false
  }
  return true
}

function assertUxStaticClarityContracts() {
  const formPath = path.join(root, 'src', 'app', 'components', 'CaptureForm.tsx')
  const listPath = path.join(root, 'src', 'app', 'components', 'CaptureList.tsx')
  const form = fs.readFileSync(formPath, 'utf8')
  const list = fs.readFileSync(listPath, 'utf8')

  const checks = [
    assertIncludes(
      form,
      [
        'function summarizeDedupeHttpUrls',
        'duplicateCount',
        '중복 URL ${dedupeSummary.duplicateCount}개는 같은 배치에서 제외했습니다.',
        '캡처 이력에는 이전 배치 기록도 함께 표시됩니다.',
        '같은 배치 안의 동일 URL은 한 번만 요청됩니다.',
        '중복 URL {selectedPublisherDedupeSummary.duplicateCount}개는 제출 시 같은 배치에서 제외됩니다.',
      ],
      'same-batch dedupe summary copy must remain explicit',
    ),
    assertIncludes(
      list,
      [
        '최근 30개 전체 이력입니다. 같은 매체가 보여도 현재 배치 중복으로 단정하지 않습니다.',
        '새 배치와 이전 이력이 함께 표시됩니다.',
      ],
      'current batch versus older history copy must remain explicit',
    ),
    assertIncludes(
      list,
      [
        'return "중단 요청"',
        'return "처리 중인 캡처에 중단 요청"',
        '중단 요청 후에도 현재 브라우저 작업이 잠시 이어질 수 있습니다.',
      ],
      'cancel UI must stay framed as a best-effort stop request',
    ),
    assertIncludes(
      list,
      [
        '내부 캡처 ID',
        '내부 surface',
        '참조 URL',
        '이미지 URL(복사용)',
        '저장 경로(내부용)',
        '내부 검수 점수',
        'URL과 저장 경로는 운영 확인용 복사 정보입니다.',
      ],
      'viewer metadata labels must preserve internal/review/copy boundaries',
    ),
    assertIncludes(
      list,
      [
        'group flex flex-col gap-3 p-4 cursor-pointer transition-all duration-200 sm:flex-row sm:items-center sm:gap-4',
        'flex w-full items-center justify-end gap-1 sm:w-auto sm:flex-shrink-0',
        'whitespace-nowrap',
        'break-all text-right',
        'grid shrink-0 grid-cols-2 gap-2',
        'sm:grid-cols-4',
      ],
      'mobile and long-URL overflow guards must remain present',
    ),
  ]

  return checks.every(Boolean)
}

function installAliasShim() {
  const aliasRoot = path.join(outDir, 'node_modules', '@', 'lib', 'capture', 'channels', 'gdn')
  fs.mkdirSync(aliasRoot, { recursive: true })
  fs.copyFileSync(
    path.join(outDir, 'src', 'lib', 'capture', 'channels', 'gdn', 'host-strategies.js'),
    path.join(aliasRoot, 'host-strategies.js'),
  )
}

try {
  fs.writeFileSync(
    tsconfigPath,
    JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022',
          module: 'commonjs',
          moduleResolution: 'node',
          strict: true,
          esModuleInterop: true,
          skipLibCheck: true,
          noEmit: false,
          outDir,
          rootDir: root,
          baseUrl: root,
          paths: {
            '@/*': ['src/*'],
          },
          lib: ['ES2022', 'DOM'],
        },
        files: [
          path.join(root, 'src/lib/capture/injection/ad-slot-detector.ts'),
          path.join(root, 'src/lib/capture/channels/gdn/host-strategies.ts'),
          path.join(root, 'src/lib/capture/batch-execution-guards.ts'),
          path.join(root, 'tests/capture/batch-execution-guards.test.ts'),
        ],
      },
      null,
      2,
    ),
  )

  const compiled = run('compile', process.execPath, [
    tsc,
    '-p',
    tsconfigPath,
  ])

  if (compiled && assertRouteUsesSharedSourceKey() && assertUxStaticClarityContracts()) {
    installAliasShim()
    run(
      'batch execution guard assertions',
      process.execPath,
      [path.join(outDir, 'tests', 'capture', 'batch-execution-guards.test.js')],
    )
  }
} finally {
  fs.rmSync(outDir, { force: true, recursive: true })
}

if (!process.exitCode) {
  console.log('[check-capture-batch-guards] ok')
}
