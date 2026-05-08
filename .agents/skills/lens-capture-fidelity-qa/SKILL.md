---
name: lens-capture-fidelity-qa
description: Use when validating or improving AdMate Lens capture output quality, pixel matching, media-screen fidelity, generated screenshots, DPR/resolution, device frames, typography, spacing, CTA placement, progress bars, status bars, and visual regression risk across YouTube, GDN, Naver, or Kakao capture surfaces.
---

# Lens Capture Fidelity QA Skill

Use this skill when the task is about output quality, not ordinary admin UI.

## Core Principle

The generated capture must look like the real media surface.

Do not apply AdMate/Openclaw branding to capture output, ad previews, synthetic media UI, or pixel-matched surfaces.

## Required Reading

1. `.ai/MEMORY.md`
2. `.ai/RULES.md`
3. `README.md`
4. `docs/strategy/AdMate_Lens_YouTube_Product_Coverage_Backlog_v1.md`
5. `docs/strategy/AdMate_Lens_Naver_Mobile_Product_Coverage_v1.md`
6. `docs/strategy/AdMate_Lens_Kakao_Mobile_Product_Coverage_v1.md`

## QA Workflow

1. Identify the media surface and product type.
2. Identify candidate files and whether they affect output pixels.
3. Define the reference basis:
   - real media screenshot
   - official product guide
   - existing approved output
   - documented surface spec
4. Check these dimensions:
   - viewport and device frame
   - DPR and output resolution
   - typography and font weight
   - spacing and card geometry
   - thumbnail crop and image quality
   - CTA shape, color, and placement
   - status bar, navigation, and tab UI
   - progress bar and skip button timing for video surfaces
   - fallback behavior when scraping/API data fails
5. Report visual differences and risk before editing.
6. After edits, run build/type checks and verify generated output when possible.

## High-risk Areas

```text
src/lib/capture/channels/youtube-*.ts
src/lib/capture/channels/mobile-*.ts
src/lib/capture/channels/gdn-capture.ts
src/lib/capture/utils/frame-composite.ts
public/frames/*.png
```

## Non-negotiable Rules

- Do not guess visual details when a reference is needed.
- Do not reduce DPR, output size, or Sharp composition quality without explicit approval.
- Do not expose legacy YouTube display/overlay surfaces without modern QA.
- Do not break legacy request compatibility.
- Do not output secrets or `.env.local` values.
