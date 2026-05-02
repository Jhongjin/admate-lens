export const PUBLIC_YOUTUBE_AD_TYPES = [
  "preroll",
  "bumper",
  "mobile-preroll-aos",
  "mobile-preroll-ios",
  "mobile-bumper-aos",
  "mobile-bumper-ios",
  "shorts-feed",
  "masthead-home",
  "infeed-home",
  "mobile-infeed-home",
  "infeed-search",
  "infeed-watch-next",
] as const;

export const INTERNAL_YOUTUBE_AD_TYPES = [
] as const;

export const LEGACY_YOUTUBE_AD_TYPES = [
  "display",
  "overlay",
] as const;

export const EXECUTABLE_YOUTUBE_AD_TYPES = [
  ...PUBLIC_YOUTUBE_AD_TYPES,
  ...INTERNAL_YOUTUBE_AD_TYPES,
] as const;

export type PublicYouTubeAdType = (typeof PUBLIC_YOUTUBE_AD_TYPES)[number];
export type InternalYouTubeAdType = (typeof INTERNAL_YOUTUBE_AD_TYPES)[number];
export type LegacyYouTubeAdType = (typeof LEGACY_YOUTUBE_AD_TYPES)[number];
export type ExecutableYouTubeAdType = (typeof EXECUTABLE_YOUTUBE_AD_TYPES)[number];
export type YouTubeAdType =
  | PublicYouTubeAdType
  | InternalYouTubeAdType
  | LegacyYouTubeAdType;

const publicYouTubeAdTypeSet = new Set<string>(PUBLIC_YOUTUBE_AD_TYPES);
const internalYouTubeAdTypeSet = new Set<string>(INTERNAL_YOUTUBE_AD_TYPES);
const legacyYouTubeAdTypeSet = new Set<string>(LEGACY_YOUTUBE_AD_TYPES);
const executableYouTubeAdTypeSet = new Set<string>(EXECUTABLE_YOUTUBE_AD_TYPES);

export function isPublicYouTubeAdType(value: unknown): value is PublicYouTubeAdType {
  return typeof value === "string" && publicYouTubeAdTypeSet.has(value);
}

export function isInternalYouTubeAdType(value: unknown): value is InternalYouTubeAdType {
  return typeof value === "string" && internalYouTubeAdTypeSet.has(value);
}

export function isLegacyYouTubeAdType(value: unknown): value is LegacyYouTubeAdType {
  return typeof value === "string" && legacyYouTubeAdTypeSet.has(value);
}

export function isExecutableYouTubeAdType(value: unknown): value is ExecutableYouTubeAdType {
  return typeof value === "string" && executableYouTubeAdTypeSet.has(value);
}
