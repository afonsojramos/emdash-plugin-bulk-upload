import { BUILT_IN_LANGUAGES } from "./locales.ts"

export const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/

export function isValidMonth(value: string): boolean {
  return MONTH_PATTERN.test(value.trim())
}

const ISO_DATE_PATTERN =
  /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])(?:T.*)?$/

/** Coerce a stored value to `YYYY-MM`, accepting legacy full ISO dates. */
export function normalizeMonth(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  if (MONTH_PATTERN.test(trimmed)) return trimmed
  const legacy = trimmed.match(ISO_DATE_PATTERN)
  return legacy ? `${legacy[1]}-${legacy[2]}` : undefined
}

export function currentMonth(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
}

export function defaultTitleFromFilename(filename: string): string {
  const withoutExtension = filename.replace(/\.[^.]+$/, "")
  const words = withoutExtension
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  return words
    ? words.charAt(0).toLocaleUpperCase() + words.slice(1)
    : "Untitled"
}

/** Structural subset of the media record returned by Emdash's upload API. */
export interface UploadedMedia {
  id: string
  filename: string
  mimeType: string
  url: string
  storageKey?: string
  width?: number
  height?: number
  blurhash?: string
  dominantColor?: string
  provider?: string
  meta?: Record<string, unknown>
}

/** Match the value produced by Emdash's built-in image picker. */
export function imageFieldValue(media: UploadedMedia, alt: string) {
  const isLocal = !media.provider || media.provider === "local"
  return {
    id: media.id,
    provider: media.provider || "local",
    previewUrl: isLocal ? undefined : media.url,
    alt,
    width: media.width,
    height: media.height,
    filename: media.filename,
    mimeType: media.mimeType,
    blurhash: media.blurhash,
    dominantColor: media.dominantColor,
    meta: isLocal
      ? { ...media.meta, storageKey: media.storageKey }
      : media.meta,
  }
}

export interface BulkUploadLabels {
  eyebrow: string
  title: string
  intro: string
  defaults: string
  translations: string
  files: string
  drop: string
  chooseFiles: string
  hint: string
  /** Suffix of the file-count badge, e.g. "12 files". */
  count: string
  itemTitle: string
  queued: string
  uploading: string
  creating: string
  done: string
  error: string
  remove: string
  import: string
  retry: string
  importing: string
  /** `{locale}` is replaced with the uppercased entry locale. */
  edit: string
  loadError: string
  reload: string
  incomplete: string
  /** `{count}` is replaced with the number of files that were not accepted. */
  skipped: string
}

export const DEFAULT_LABELS: BulkUploadLabels = {
  eyebrow: "",
  title: "Bulk upload",
  intro:
    "Create a reviewed draft for every file. Nothing is published automatically.",
  defaults: "Shared details",
  translations: "Create linked translation drafts",
  files: "Files",
  drop: "Drop files here",
  chooseFiles: "Choose files",
  hint: "You can adjust the details of every file below.",
  count: "files",
  itemTitle: "Title",
  queued: "Ready",
  uploading: "Uploading",
  creating: "Creating drafts",
  done: "Drafts created",
  error: "Needs retry",
  remove: "Remove",
  import: "Create drafts",
  retry: "Retry failed items",
  importing: "Working…",
  edit: "Edit {locale} draft",
  loadError: "Could not load options.",
  reload: "Try again",
  incomplete:
    "Complete the shared details and every file before creating drafts.",
  skipped: "Skipped {count} unsupported files.",
}

/**
 * A plain string, or a map of admin locale to string. Lookup tries the full
 * locale code, then its base language, then English.
 */
export type LocalizedText = string | Record<string, string>

export function baseLanguage(locale: string): string {
  return locale.split("-")[0] || locale
}

export function resolveText(
  text: LocalizedText | undefined,
  lang: string,
  fallback = "",
): string {
  if (text == null) return fallback
  if (typeof text === "string") return text
  return (
    text[lang] ??
    text[baseLanguage(lang)] ??
    text.en ??
    Object.values(text)[0] ??
    fallback
  )
}

export function resolveLabels(
  languages: Record<string, Partial<BulkUploadLabels>> | undefined,
  lang: string,
): BulkUploadLabels {
  const base = baseLanguage(lang)
  return {
    ...DEFAULT_LABELS,
    ...BUILT_IN_LANGUAGES[base],
    ...BUILT_IN_LANGUAGES[lang],
    ...languages?.[base],
    ...languages?.[lang],
  }
}

export interface LabeledEntry {
  id: string
  slug?: string | null
  data: Record<string, unknown>
}

export function contentLabel(
  entry: LabeledEntry,
  labelKeys: string[] = ["name", "title"],
): string {
  for (const key of labelKeys) {
    const value = entry.data[key]
    if (typeof value === "string" && value.trim()) return value
  }
  return entry.slug || entry.id
}
