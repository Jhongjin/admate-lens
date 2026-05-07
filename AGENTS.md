# AGENTS.md

## 1. Project Identity

This repo is AdMate Lens, the capture and evidence automation product in the AdMate ecosystem.

AdMate Lens generates high-quality advertising placement screenshots and report evidence images for media surfaces such as YouTube, GDN, Naver, and Kakao.

Core principle:

```text
Capture output quality and media-screen fidelity are the product.
```

## 2. Primary Routes and Areas

UI:

- `src/app/page.tsx`
- `src/app/components/CaptureForm.tsx`
- `src/app/components/CaptureList.tsx`

APIs:

- `src/app/api/captures/route.ts`
- `src/app/api/captures/execute/route.ts`
- `src/app/api/upload/route.ts`
- `src/app/api/yt-storyboard/route.ts`

Capture engine:

- `src/lib/capture/channels/`
- `src/lib/capture/engine/`
- `src/lib/capture/injection/`
- `src/lib/capture/utils/`

## 3. Required Reading

Before making code or design changes, read:

1. `README.md`
2. `.ai/MEMORY.md`
3. `.ai/RULES.md`
4. `.ai/PLAN.md`
5. `docs/strategy/05_AdMate_Product_Map_v1.md`
6. `docs/strategy/AdMate_Lens_YouTube_Product_Coverage_Backlog_v1.md`
7. `docs/strategy/AdMate_Lens_Naver_Mobile_Product_Coverage_v1.md`
8. `docs/strategy/AdMate_Lens_Kakao_Mobile_Product_Coverage_v1.md`
9. `docs/design/openclaw-theme-reference.md`

Central source of truth:

```text
D:\Projects\AdMate\admate-docs
```

## 4. Repo-local Skills

Available repo-local skills live under `.agents/skills/`.

Primary Lens skills:

- `admate-lens-capture` - overall Lens workflow and operator UI/capture boundary
- `lens-capture-fidelity-qa` - output quality, pixel matching, visual regression risk
- `lens-youtube-capture-builder` - YouTube, Shorts, Masthead, Demand Gen YouTube surfaces
- `lens-gdn-capture-builder` - GDN slot detection, creative injection, publisher page captures
- `lens-mobile-native-capture-builder` - Naver/Kakao mobile native synthetic surfaces

Cross-repo collaboration skills:

- `admate-docs-director`
- `openclaw-agent-core`
- `admate-homepage-command-center`
- `admate-compass-rag`
- `admate-foresight-planning`

Use the most specific Lens skill for capture output work. Use `lens-capture-fidelity-qa` whenever the task affects generated image quality.

## 5. Product Naming Rules

Use these names exactly:

- AdMate Lens
- AdMate Compass
- AdMate Sentinel
- AdMate Foresight
- AdMate Agent Core

Do not present these as final public names:

- Capture Pro (historical/internal name for the current AdMate Lens)
- AdMate Guide
- Planner
- Sentinel beta

## 6. Capture Fidelity Rules

These rules are strict.

- Capture output, ad preview, and media synthetic UI must match the real media surface.
- Do not apply AdMate/Openclaw theme to generated capture output.
- Do not adjust spacing, typography, CTA, icons, frames, progress bars, or status bars without a reference basis.
- Do not reduce DPR, resolution, Sharp composition quality, or thumbnail quality priority without explicit approval.
- Do not expose legacy surfaces as public products without modern QA.
- Verify generated output visually when possible and report the comparison basis.

## 7. Operator UI Rules

AdMate/Openclaw theme may be applied to:

- admin/operator screen
- input forms
- capture request list
- job history
- settings
- result management UI

Do not remove existing form fields, product options, metadata, or compatibility mappings without approval.

## 8. Surface Rules

YouTube:

- Keep Display/Overlay as legacy unless a modern rebuild is explicitly requested.
- Demand Gen first scope is YouTube Feed and YouTube Shorts.
- Distinguish Demand Gen metadata from ordinary YouTube output.

Naver:

- Preserve product-level surfaces such as smart channel, feed, native banner, and image banner.
- Normalize legacy `naver-mobile-feed` to `naver-feed-mobile`.

Kakao:

- Preserve bizboard, display native, display catalog, and product catalog surfaces.
- Normalize legacy `kakao-mobile-feed` to `kakao-display-native`.

## 9. Technical Stack

This is a Next.js App Router project with TypeScript, Puppeteer Core, Sparticuz Chromium, Supabase, and Sharp.

Expected commands:

```bash
npm install
npm run dev
npm run build
npm run lint
```

`npm run lint` currently runs TypeScript checking:

```text
tsc --noEmit
```

## 10. Non-Negotiable Rules

- Do not output `.env`, API keys, tokens, credentials, or secret values.
- Do not commit `.env.local`.
- Do not expose Supabase service role keys to the browser.
- Do not add real advertiser, campaign, or sensitive operational data.
- Do not change DB schema without reporting impact first.
- Do not commit or push without explicit user approval.
- Do not modify user changes you did not make.

## 11. Work Report Format

Before edits, report:

1. Capture output area vs operator UI area
2. Candidate files
3. Fidelity risks
4. Compatibility risks
5. Implementation plan
6. Test/QA plan

After changes, report:

1. Changed files
2. Surfaces affected
3. Output quality verification
4. Build/type-check result
5. Remaining risks
6. Rollback method
7. Recommended commit message
