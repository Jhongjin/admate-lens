---
name: lens-gdn-capture-builder
description: Use when building, fixing, or QAing AdMate Lens Google Display Network capture surfaces, publisher page capture, ad slot detection, creative injection, responsive display ads, desktop/mobile frames, dynamic resizing, Puppeteer behavior, and GDN screenshot output quality.
---

# Lens GDN Capture Builder Skill

Use this skill for Google Display Network and publisher page injection work.

## Key Files

```text
src/lib/capture/channels/gdn-capture.ts
src/lib/capture/injection/ad-slot-detector.ts
src/lib/capture/injection/creative-injector.ts
src/lib/capture/engine/puppeteer-engine.ts
src/app/api/captures/execute/route.ts
```

## Workflow

1. Identify the publisher URL, target device, and ad slot behavior.
2. Determine whether the task is slot detection, creative injection, screenshot quality, or layout stability.
3. Report candidate files and risks before editing.
4. Preserve page readability and realistic ad placement.
5. Check responsive resizing and mobile/desktop frame assumptions.
6. Run `npm run build` and `npm run lint`.
7. Verify generated output when possible.

## Quality Rules

- Ads should sit in plausible publisher inventory locations.
- Injection must not visibly break publisher layout.
- Capture output must preserve high DPR and legibility.
- Fallback behavior must be clear when slot detection fails.

## Non-negotiable Rules

- Do not output secrets or `.env.local` values.
- Do not hardcode real advertiser-sensitive data.
- Do not weaken failure handling to produce fake success images.
