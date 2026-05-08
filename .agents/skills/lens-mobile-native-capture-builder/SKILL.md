---
name: lens-mobile-native-capture-builder
description: Use when building, fixing, or QAing AdMate Lens mobile native capture surfaces for Naver and Kakao, including Naver smart channel, feed ads, native banner, image banner, Kakao bizboard, display native, display catalog, product catalog, legacy surface normalization, mobile app-like synthetic UI, status bars, tabs, CTAs, cards, catalog rails, and Korean text rendering.
---

# Lens Mobile Native Capture Builder Skill

Use this skill for Naver/Kakao mobile synthetic surfaces.

## Required Reading

1. `.ai/MEMORY.md`
2. `.ai/RULES.md`
3. `docs/strategy/AdMate_Lens_Naver_Mobile_Product_Coverage_v1.md`
4. `docs/strategy/AdMate_Lens_Kakao_Mobile_Product_Coverage_v1.md`

## Key Files

```text
src/lib/capture/channels/mobile-native-capture.ts
src/lib/capture/channels/mobile-synthetic-infeed.ts
src/lib/capture/utils/frame-composite.ts
public/frames/iphone15-frame.png
public/frames/pixel8-frame.png
src/app/components/CaptureForm.tsx
src/app/components/CaptureList.tsx
```

## Surface Rules

Naver 1차 surfaces:

```text
naver-smart-channel-mobile
naver-feed-mobile
naver-native-banner-feed
naver-image-banner-mobile
```

Kakao 1차 surfaces:

```text
kakao-bizboard
kakao-display-native
kakao-display-catalog
kakao-product-catalog
```

Legacy normalization:

```text
naver-mobile-feed -> naver-feed-mobile
kakao-mobile-feed -> kakao-display-native
```

## Workflow

1. Identify Naver or Kakao exact product surface.
2. Confirm whether it is 1차 scope or follow-up candidate.
3. Preserve product-level metadata and labels.
4. Report candidate files and output fidelity risks before editing.
5. Keep mobile UI native to the media platform, not AdMate-themed.
6. Verify Korean text rendering, status bar, tab bar, CTA, card spacing, and catalog rail behavior.
7. Run `npm run build` and `npm run lint`.

## Non-negotiable Rules

- Do not collapse product surfaces back into a generic mobile feed.
- Do not apply AdMate theme to Naver/Kakao output UI.
- Do not remove legacy compatibility.
- Do not output secrets or `.env.local` values.
