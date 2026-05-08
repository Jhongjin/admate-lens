---
name: lens-youtube-capture-builder
description: Use when building, fixing, or QAing AdMate Lens YouTube capture surfaces including in-stream skip/non-skip/bumper, mobile AOS/iOS views, in-feed home/search/related videos, Shorts, Masthead, Demand Gen YouTube Feed/Shorts, YouTube synthetic rendering, oEmbed fallback, skip button timing, yellow progress bar, thumbnails, and anti-bot capture behavior.
---

# Lens YouTube Capture Builder Skill

Use this skill for YouTube and Demand Gen YouTube output work.

## Required Reading

1. `.ai/MEMORY.md`
2. `.ai/RULES.md`
3. `docs/strategy/AdMate_Lens_YouTube_Product_Coverage_Backlog_v1.md`

## Key Files

```text
src/lib/capture/youtube-ad-types.ts
src/lib/capture/channels/youtube-capture.ts
src/lib/capture/channels/youtube-infeed-inpage.ts
src/lib/capture/channels/youtube-preroll-inpage.ts
src/lib/capture/channels/youtube-shorts-synthetic.ts
src/lib/capture/channels/youtube-masthead-synthetic.ts
src/app/components/CaptureForm.tsx
src/app/components/CaptureList.tsx
src/app/api/captures/route.ts
src/app/api/captures/execute/route.ts
```

## Product Rules

- In-stream skip must show the skip button only at the documented timing.
- Non-skip and bumper must not show skip controls.
- Yellow progress bar timing must match video ad state.
- In-feed cards must match YouTube native card geometry, thumbnail handling, title/channel text, and menu icon placement.
- Shorts must preserve mobile 9:16 behavior and vertical UI expectations.
- Demand Gen 1차 output is YouTube Feed and YouTube Shorts, while metadata must distinguish Demand Gen from ordinary YouTube.
- Display/Overlay are legacy and must not be re-exposed without a separate modern rebuild task.

## Workflow

1. Determine exact YouTube surface and device.
2. Confirm current public/internal/legacy status from the coverage doc.
3. Report candidate files and output fidelity risks before editing.
4. Prefer reusing existing renderer paths when adding Demand Gen YouTube variants.
5. Keep DB schema changes out unless explicitly approved; prefer metadata extension.
6. Run `npm run build` and `npm run lint`.
7. Verify output visually when possible.

## Non-negotiable Rules

- Do not apply AdMate theme to YouTube output UI.
- Do not expose legacy display/overlay by toggling a form option.
- Do not reduce thumbnail quality priority such as `maxresdefault` fallback behavior without approval.
- Do not output secrets or `.env.local` values.
