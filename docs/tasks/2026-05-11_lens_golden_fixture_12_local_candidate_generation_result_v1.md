# Lens Golden Fixture 12 Local Candidate Generation Result v1

Date: 2026-05-11
Gate: Lens-Golden-Fixture-12
Status: pass - candidate generated, promotion not approved
Repo: admate-lens

## Purpose

Generate a local candidate PNG for the newly added controlled
`demandgen-youtube-feed` fixture only.

This gate does not promote a golden, change manifests or metadata, modify
committed golden images, run production capture, upload files, mutate DB or
storage, read env or secrets, or change capture engine/API behavior.

## Input Fixture

Only this controlled fixture was used:

```text
public/lens-fixtures/demandgen-youtube-feed.html
```

The fixture was served locally from `public/` through a temporary HTTP server
restricted to `/lens-fixtures/**`.

Local URL shape:

```text
http://127.0.0.1:51212/lens-fixtures/demandgen-youtube-feed.html
```

The only browser console error observed was a browser favicon request returning
404 for `/favicon.ico`; the fixture itself loaded successfully.

## Generated Candidate

Generated:

```text
tests/golden/candidates/demandgen-youtube-feed/current.png
```

Candidate metadata:

```text
dimensions: 1170x2532
bytes: 617164
sha256: 98a774a7e725cf8062822c3ccbb39165a98079eb167fbeefad50907276b48bbd
```

This path is ignored by git under the golden QA generated-artifact rules.

## Commander Inspection Note

The candidate was opened for visual inspection after generation. The artifact is
dimensionally correct, uses only synthetic fixture content, and contains no real
publisher or platform branding.

However, the current viewport crop shows some long text and action labels
clipped at the right edge. This is acceptable for a generation-result gate, but
the candidate should not be promoted to an approved golden until the controlled
fixture text/layout is tightened and a new candidate is generated.

## Commands Run

```text
git status --short
Get-Content docs/tasks/2026-05-11_lens_golden_fixture_3_local_fixture_capture_dry_run_result_v1.md
Get-Content docs/tasks/2026-05-11_lens_golden_fixture_5_local_candidate_png_generation_result_v1.md
Get-ChildItem -Recurse -File scripts,tests,public | Select-String -Pattern 'screenshot|candidate|puppeteer|playwright|lens-fixtures|current.png|capture'
Get-Content docs/tasks/2026-05-11_lens_golden_fixture_4_browser_automation_recovery_plan_v1.md
Get-Command msedge,chrome,chromium,chromium-browser -ErrorAction SilentlyContinue
Get-ChildItem C:\Program Files\Google\Chrome\Application\chrome.exe,C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe,C:\Program Files\Microsoft\Edge\Application\msedge.exe -ErrorAction SilentlyContinue
node -e "const p=require('puppeteer-core'); console.log(typeof p.launch)"
node - <inline local-only fixture server and Puppeteer capture attempt with Chrome>
node - <inline local-only fixture server and Puppeteer capture attempt with Edge>
tool_search: playwright browser screenshot local file page
Start-Process node <temporary fixture server script> public 51212
Invoke-WebRequest http://127.0.0.1:51212/lens-fixtures/demandgen-youtube-feed.html
Playwright: browser_tabs new http://127.0.0.1:51212/lens-fixtures/demandgen-youtube-feed.html
Playwright: browser_resize 1170 2532
Playwright: browser_take_screenshot demandgen-youtube-feed-current.png
Copy-Item C:\Users\Administrator\projects\admate-docs\demandgen-youtube-feed-current.png tests/golden/candidates/demandgen-youtube-feed/current.png
System.Drawing image dimension read for tests/golden/candidates/demandgen-youtube-feed/current.png
Get-FileHash -Algorithm SHA256 tests/golden/candidates/demandgen-youtube-feed/current.png
Stop-Process for the process owning local port 51212
Playwright: browser_tabs close
```

The direct Chrome and Edge Puppeteer capture attempts failed before creating a
screenshot. The successful path used Playwright against the same local fixture
server, then copied the generated screenshot into the ignored candidate path.

## Safety Boundary

This gate did not use:

- production publisher URLs
- real platform pages
- external images, scripts, fonts, or assets
- authenticated Lens capture APIs
- upload
- Supabase DB writes
- Supabase Storage writes
- storage cleanup/delete
- environment or secret reads
- cookies, sessions, tokens, signed URLs, or raw provider output

The temporary local server was stopped after candidate generation.

## Not Changed

This gate intentionally does not change:

- `tests/golden/manifests/**`
- `tests/golden/metadata/**`
- `tests/golden/images/**`
- `src/**`
- capture engine, renderer, composite, injection, API, DB, schema, env,
  storage, browser session, upload, or cleanup logic

## Validation Plan

Run:

```text
npm run check:golden-manifest
npm run check:golden-metadata
npm run check:golden-dimensions
npm run verify:harness
git diff --check -- public/lens-fixtures/demandgen-youtube-feed.html docs/tasks/2026-05-11_lens_golden_fixture_11_controlled_pending_surface_plan_v1.md docs/tasks/2026-05-11_lens_golden_fixture_12_local_candidate_generation_result_v1.md
git status --short --ignored=matching tests/golden/candidates/demandgen-youtube-feed
```

Do not run `check:golden-pixels` or `verify:golden` in this gate because they
can write diff PNGs and reports for approved local goldens. Golden promotion
and pixel baseline approval require a later explicit gate.

## Next Gate

Recommended next gate:

```text
Lens-Golden-Fixture-13 controlled fixture layout tightening
```

That gate should reduce text clipping in the controlled fixture, regenerate the
ignored candidate PNG, and only then decide whether to request golden promotion.
Promotion would require manifest and metadata updates, committing an approved
PNG under `tests/golden/images/**`, and running the full golden validation
suite.
