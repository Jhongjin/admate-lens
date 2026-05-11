# Lens Golden Fixture 5 Local Candidate PNG Generation Result v1

Date: 2026-05-11
Gate: Lens-Golden-Fixture-5
Status: pass
Repo: admate-lens

## Purpose

Generate local-only candidate PNGs from the repo-safe Lens fixture pages after
Codex browser automation recovered. Candidate files remain ignored and are not
golden PNGs yet.

## Inputs

Local fixture URLs served from `public/`:

```text
http://127.0.0.1:<local-port>/lens-fixtures/gdn-pc-display.html
http://127.0.0.1:<local-port>/lens-fixtures/youtube-pc-instream-skip.html
```

Fixture files:

```text
public/lens-fixtures/gdn-pc-display.html
public/lens-fixtures/youtube-pc-instream-skip.html
public/lens-fixtures/assets/mock-creative-300x250.svg
public/lens-fixtures/assets/mock-creative-728x90.svg
```

## Generated Candidate Files

Candidate PNGs were written only under ignored golden candidate paths:

```text
tests/golden/candidates/gdn-pc-display/current.png
tests/golden/candidates/youtube-pc-instream-skip/current.png
```

Candidate metadata:

```text
gdn-pc-display:
  dimensions: 1920x1080
  bytes: 232085
  sha256: e5f249d48790467b58957a59ba0ddb3226fcd13d219da128d556cb94693efb6e

youtube-pc-instream-skip:
  dimensions: 1920x1080
  bytes: 473850
  sha256: 7d7028eeb3d87acf920fa58addc71ada5a1ca4b28c726d6e477222914e72dd48
```

## Safety Boundary

The generated PNGs are local fixture candidates only.

This gate did not use:

- production publisher URLs
- real YouTube pages
- authenticated Lens capture APIs
- `src/app/api/captures/route.ts`
- `src/app/api/captures/execute/route.ts`
- `src/app/api/upload/route.ts`
- Supabase DB writes
- Supabase Storage writes
- upload
- storage cleanup/delete
- signed URLs

The temporary local static server was stopped after capture.

## Not Performed

This gate did not perform:

- committed golden PNG creation
- committed candidate PNG creation
- golden manifest promotion to `approved`
- pixel diff approval
- product asset changes
- fixture HTML/SVG changes
- capture engine, renderer, composite, injection, API, DB, schema, env, or
  storage policy changes
- secret, token, cookie, session, signed URL, raw code, or raw provider response
  output

## Verification

Manual/local checks:

```text
Codex browser MCP: available
local fixture server: started for capture and stopped after capture
candidate dimensions: 1920x1080 for both surfaces
git status --short --ignored=matching tests/golden/candidates: ignored candidate directory only
```

Required validation for this document:

```text
git diff --check -- docs/tasks/2026-05-11_lens_golden_fixture_5_local_candidate_png_generation_result_v1.md
npm run check:golden-manifest
npm run check:golden-metadata
npm run check:golden-dimensions
npm run verify:harness
```

## Next Gate

Recommended next gate:

```text
Lens-Golden-Fixture-6 candidate inspection and promotion decision
```

That gate should inspect the ignored candidate PNGs and decide whether to
promote any candidate to a committed golden PNG and manifest `approved` state.
