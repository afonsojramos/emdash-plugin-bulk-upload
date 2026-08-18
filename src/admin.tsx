import {
  apiFetch,
  createContent,
  fetchContentList,
  fetchManifest,
  fetchTerms,
  parseApiResponse,
  uploadMedia,
  useLocale,
  type ContentItem,
  type MediaItem,
  type TaxonomyTerm,
} from "@emdash-cms/admin"
import { Badge, type BadgeVariant } from "@cloudflare/kumo/components/badge"
import { Banner } from "@cloudflare/kumo/components/banner"
import { Button, LinkButton } from "@cloudflare/kumo/components/button"
import { Checkbox } from "@cloudflare/kumo/components/checkbox"
import { Empty } from "@cloudflare/kumo/components/empty"
import { Input } from "@cloudflare/kumo/components/input"
import { LayerCard } from "@cloudflare/kumo/components/layer-card"
import { Select } from "@cloudflare/kumo/components/select"
import { Text } from "@cloudflare/kumo/components/text"
import type { PluginAdminExports } from "emdash"
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentType,
} from "react"
import {
  contentLabel,
  currentMonth,
  defaultTitleFromFilename,
  isValidMonth,
  normalizeMonth,
  resolveLabels,
  resolveText,
  type BulkUploadLabels,
  type LocalizedText,
} from "./shared.ts"

export type {
  BulkUploadLabels,
  LocalizedText,
  UploadedMedia,
} from "./shared.ts"
export {
  contentLabel,
  DEFAULT_LABELS,
  defaultTitleFromFilename,
  imageFieldValue,
  normalizeMonth,
} from "./shared.ts"
export { BUILT_IN_LANGUAGES } from "./locales.ts"

export interface SharedCollectionField {
  kind: "collection"
  /** Key under which the selected entry id appears in `buildData`'s `shared` map. */
  name: string
  label: LocalizedText
  placeholder?: LocalizedText
  /** Collection to load options from (in the primary locale). */
  collection: string
  /** Data keys tried in order for the option label. Defaults to `["name", "title"]`. */
  labelKeys?: string[]
  /** Drop entries from the options list. */
  filter?: (entry: ContentItem) => boolean
  /** Override the rendered option label. `lang` is the full admin locale code. */
  optionLabel?: (entry: ContentItem, lang: string) => string
  /** Adds a "none" option and makes the field optional. */
  noneLabel?: LocalizedText
}

export interface SharedTaxonomyField {
  kind: "taxonomy"
  /** Taxonomy assigned to each created primary entry. Not part of `buildData`. */
  name: string
  label: LocalizedText
  placeholder?: LocalizedText
  taxonomy: string
  /** Term preselected by slug; falls back to the first term. */
  defaultSlug?: string
  /** Allow importing with no term selected. Empty taxonomies never block. */
  optional?: boolean
}

export type SharedField = SharedCollectionField | SharedTaxonomyField

export interface RowField {
  /** Key under which the value appears in `buildData`'s `row` map. */
  name: string
  label: LocalizedText
  /** `month` renders a month picker, validates `YYYY-MM`, and defaults to the current month. */
  type?: "text" | "month"
  defaultValue?: () => string
  /** Required fields block the import while empty or invalid. Defaults to true. */
  required?: boolean
}

export interface BuildDataInput {
  media: MediaItem
  title: string
  /** Per-row field values keyed by `RowField.name`. */
  row: Record<string, string>
  /** Selected entry ids keyed by `SharedCollectionField.name` (empty string when none). */
  shared: Record<string, string>
}

export interface BulkUploadAdminConfig {
  /** Collection the drafts are created in. */
  collection: string
  /** Locale of the primary drafts. Defaults to the site's default locale. */
  primaryLocale?: string
  /**
   * Locales that get linked translation drafts. Defaults to every other
   * configured site locale; pass `[]` to disable translations.
   */
  translationLocales?: string[]
  /** Initial state of the translation checkbox. Defaults to true. */
  translationsDefault?: boolean
  sharedFields?: SharedField[]
  rowFields?: RowField[]
  /** Map an uploaded file to the entry's `data` payload. */
  buildData: (input: BuildDataInput) => Record<string, unknown>
  titleFromFilename?: (filename: string) => string
  /** File input accept attribute. Defaults to `image/*`. */
  accept?: string
  /** CSS aspect-ratio of the preview thumbnails. Defaults to `1 / 1`. */
  previewAspectRatio?: string
  /** Per-language label overrides, merged over the English defaults. */
  languages?: Record<string, Partial<BulkUploadLabels>>
  /** Admin page path; must match the descriptor's page path. Defaults to `/bulk-upload`. */
  path?: string
}

type UploadStatus = "queued" | "uploading" | "creating" | "done" | "error"

interface UploadRow {
  id: string
  file: File
  title: string
  values: Record<string, string>
  status: UploadStatus
  error?: string
  media?: MediaItem
  primaryEntryId?: string
  /** Created translation draft ids keyed by locale. */
  translationIds?: Record<string, string>
}

interface ResolvedLocales {
  primary?: string
  translations: string[]
}

async function loadAllEntries(
  collection: string,
  locale: string | undefined,
): Promise<ContentItem[]> {
  const items: ContentItem[] = []
  let cursor: string | undefined
  do {
    const page = await fetchContentList(collection, {
      cursor,
      limit: 100,
      locale,
    })
    items.push(...page.items)
    cursor = page.nextCursor
  } while (cursor)
  return items
}

async function assignTerms(
  collection: string,
  entryId: string,
  taxonomy: string,
  termIds: string[],
): Promise<void> {
  const response = await apiFetch(
    `/_emdash/api/content/${collection}/${entryId}/terms/${taxonomy}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ termIds }),
    },
  )
  await parseApiResponse(response, `Failed to assign the ${taxonomy} terms`)
}

function rowKey(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`
}

function statusVariant(status: UploadStatus): BadgeVariant {
  if (status === "done") return "success"
  if (status === "error") return "error"
  if (status === "uploading" || status === "creating") return "info"
  return "neutral"
}

function initialRowValues(rowFields: RowField[]): Record<string, string> {
  const values: Record<string, string> = {}
  for (const field of rowFields) {
    values[field.name] =
      field.defaultValue?.() ?? (field.type === "month" ? currentMonth() : "")
  }
  return values
}

function isRowFieldValid(field: RowField, value: string): boolean {
  if (field.type === "month") {
    return field.required === false && !value ? true : isValidMonth(value)
  }
  return field.required === false || Boolean(value.trim())
}

const NONE_VALUE = "__none__"

function FilePreview({
  file,
  aspectRatio,
}: {
  file: File
  aspectRatio: string
}) {
  const [src, setSrc] = useState("")

  useEffect(() => {
    if (!file.type.startsWith("image/")) {
      setSrc("")
      return
    }
    const objectUrl = URL.createObjectURL(file)
    setSrc(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [file])

  return (
    <div
      className="w-20 shrink-0 overflow-hidden rounded-lg bg-kumo-tint shadow-sm"
      style={{ aspectRatio }}
    >
      {src ? (
        <img
          src={src}
          alt=""
          className="ebu-preview-outline size-full object-cover"
        />
      ) : (
        <div className="flex size-full items-center justify-center">
          <Text variant="secondary" size="xs">
            {file.name.includes(".")
              ? (file.name.split(".").pop()?.toUpperCase() ?? "")
              : ""}
          </Text>
        </div>
      )}
    </div>
  )
}

export function createBulkUploadPage(
  config: BulkUploadAdminConfig,
): ComponentType {
  const sharedFields = config.sharedFields ?? []
  const rowFields = config.rowFields ?? []
  const collectionFields = sharedFields.filter(
    (field): field is SharedCollectionField => field.kind === "collection",
  )
  const taxonomyFields = sharedFields.filter(
    (field): field is SharedTaxonomyField => field.kind === "taxonomy",
  )
  const titleFromFilename = config.titleFromFilename ?? defaultTitleFromFilename
  const accept = config.accept ?? "image/*"
  const acceptTypes = accept
    .split(",")
    .map((type) => type.trim())
    .filter(Boolean)
  const imagesOnly =
    acceptTypes.length > 0 &&
    acceptTypes.every((type) => type.startsWith("image/"))
  const aspectRatio = config.previewAspectRatio ?? "1 / 1"
  const staticLocales: ResolvedLocales | null =
    config.primaryLocale !== undefined &&
    config.translationLocales !== undefined
      ? {
          primary: config.primaryLocale,
          translations: config.translationLocales,
        }
      : null

  return function BulkUploadPage() {
    const { locale: adminLocale } = useLocale()
    const lang = adminLocale || "en"
    const labels = resolveLabels(config.languages, lang)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const [options, setOptions] = useState<Record<string, ContentItem[]>>({})
    const [terms, setTerms] = useState<Record<string, TaxonomyTerm[]>>({})
    const [shared, setShared] = useState<Record<string, string>>({})
    const [createTranslations, setCreateTranslations] = useState(
      config.translationsDefault ?? true,
    )
    const [rows, setRows] = useState<UploadRow[]>([])
    const [locales, setLocales] = useState<ResolvedLocales | null>(
      staticLocales,
    )
    const [loading, setLoading] = useState(
      sharedFields.length > 0 || staticLocales === null,
    )
    const [loadError, setLoadError] = useState<string | null>(null)
    const [reloadKey, setReloadKey] = useState(0)
    const [skippedCount, setSkippedCount] = useState(0)
    const [isImporting, setIsImporting] = useState(false)
    const [isDragging, setIsDragging] = useState(false)
    const dragDepth = useRef(0)

    useEffect(() => {
      if (sharedFields.length === 0 && staticLocales !== null) return
      let cancelled = false
      setLoading(true)
      setLoadError(null)
      const load = async () => {
        let resolved = staticLocales
        if (!resolved) {
          const manifest = await fetchManifest()
          const primary = config.primaryLocale ?? manifest.i18n?.defaultLocale
          resolved = {
            primary,
            translations:
              config.translationLocales ??
              (manifest.i18n
                ? manifest.i18n.locales.filter((locale) => locale !== primary)
                : []),
          }
        }
        const primary = resolved.primary
        const [collectionResults, taxonomyResults] = await Promise.all([
          Promise.all(
            collectionFields.map(async (field) => {
              const entries = await loadAllEntries(field.collection, primary)
              const filtered = (
                field.filter ? entries.filter(field.filter) : entries
              ).sort((a, b) =>
                contentLabel(a, field.labelKeys).localeCompare(
                  contentLabel(b, field.labelKeys),
                  primary,
                ),
              )
              return [field.name, filtered] as const
            }),
          ),
          Promise.all(
            taxonomyFields.map(async (field) => {
              const items = await fetchTerms(field.taxonomy, {
                locale: primary,
              })
              return [field.name, items] as const
            }),
          ),
        ])
        return { resolved, collectionResults, taxonomyResults }
      }
      load()
        .then(({ resolved, collectionResults, taxonomyResults }) => {
          if (cancelled) return
          setLocales(resolved)
          setOptions(Object.fromEntries(collectionResults))
          setTerms(Object.fromEntries(taxonomyResults))
          setShared((current) => {
            const next = { ...current }
            for (const [name, items] of taxonomyResults) {
              const field = taxonomyFields.find(
                (candidate) => candidate.name === name,
              )
              next[name] =
                next[name] ||
                (items.find((term) => term.slug === field?.defaultSlug)?.id ??
                  items[0]?.id ??
                  "")
            }
            return next
          })
        })
        .catch((error: unknown) => {
          if (!cancelled) {
            setLoadError(error instanceof Error ? error.message : String(error))
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
      return () => {
        cancelled = true
      }
    }, [reloadKey])

    const addFiles = useCallback((files: File[]) => {
      const accepted = imagesOnly
        ? files.filter((file) => file.type.startsWith("image/"))
        : files
      setSkippedCount(files.length - accepted.length)
      setRows((current) => {
        const existing = new Set(current.map((row) => row.id))
        const additions = accepted
          .filter((file) => !existing.has(rowKey(file)))
          .map((file) => ({
            id: rowKey(file),
            file,
            title: titleFromFilename(file.name),
            values: initialRowValues(rowFields),
            status: "queued" as const,
          }))
        return [...current, ...additions]
      })
      if (fileInputRef.current) fileInputRef.current.value = ""
    }, [])

    const patchRow = useCallback((id: string, patch: Partial<UploadRow>) => {
      setRows((current) =>
        current.map((row) => (row.id === id ? { ...row, ...patch } : row)),
      )
    }, [])

    const hasInvalidRows = rows.some(
      (row) =>
        !row.title.trim() ||
        rowFields.some(
          (field) => !isRowFieldValid(field, row.values[field.name] ?? ""),
        ),
    )
    const hasIncompleteShared =
      collectionFields.some(
        (field) => !field.noneLabel && !shared[field.name],
      ) ||
      taxonomyFields.some(
        (field) =>
          !field.optional &&
          !shared[field.name] &&
          (terms[field.name]?.length ?? 0) > 0,
      )
    const canImport =
      !loading &&
      !isImporting &&
      rows.some((row) => row.status !== "done") &&
      !hasIncompleteShared &&
      !hasInvalidRows

    const translationLocales = locales?.translations ?? []

    const importRows = async () => {
      if (!canImport || !locales) return
      setIsImporting(true)
      const pending = rows.filter((row) => row.status !== "done")
      const sharedValues = Object.fromEntries(
        collectionFields.map((field) => [field.name, shared[field.name] ?? ""]),
      )

      for (const initial of pending) {
        const working = { ...initial, error: undefined }
        try {
          if (!working.media) {
            patchRow(working.id, { status: "uploading", error: undefined })
            working.media = await uploadMedia(working.file)
            patchRow(working.id, { media: working.media })
          }

          patchRow(working.id, { status: "creating" })
          const data = config.buildData({
            media: working.media,
            title: working.title.trim(),
            row: working.values,
            shared: sharedValues,
          })

          if (!working.primaryEntryId) {
            const primary = await createContent(config.collection, {
              data,
              status: "draft",
              locale: locales.primary,
            })
            working.primaryEntryId = primary.id
            patchRow(working.id, { primaryEntryId: primary.id })
          }

          for (const field of taxonomyFields) {
            const termId = shared[field.name]
            if (termId) {
              await assignTerms(
                config.collection,
                working.primaryEntryId,
                field.taxonomy,
                [termId],
              )
            }
          }

          if (createTranslations && translationLocales.length > 0) {
            const created = { ...working.translationIds }
            for (const locale of translationLocales) {
              if (!created[locale]) {
                const translation = await createContent(config.collection, {
                  data,
                  status: "draft",
                  locale,
                  translationOf: working.primaryEntryId,
                })
                created[locale] = translation.id
                working.translationIds = created
                patchRow(working.id, { translationIds: { ...created } })
              }
            }
          }

          patchRow(working.id, {
            status: "done",
            error: undefined,
            media: working.media,
            primaryEntryId: working.primaryEntryId,
            translationIds: working.translationIds,
          })
        } catch (error: unknown) {
          patchRow(working.id, {
            status: "error",
            error: error instanceof Error ? error.message : String(error),
            media: working.media,
            primaryEntryId: working.primaryEntryId,
            translationIds: working.translationIds,
          })
        }
      }
      setIsImporting(false)
    }

    const hasErrors = rows.some((row) => row.status === "error")
    const editLabel = (locale: string | undefined) =>
      labels.edit
        .replace("{locale}", locale ? locale.toUpperCase() : "")
        .replace(/\s{2,}/g, " ")

    return (
      <main className="ebu-main">
        <header className="max-w-3xl space-y-2">
          {labels.eyebrow && (
            <p className="ebu-eyebrow text-xs font-semibold uppercase text-kumo-brand">
              {labels.eyebrow}
            </p>
          )}
          <Text
            variant="heading1"
            as="h1"
            DANGEROUS_className="text-balance tracking-tight"
          >
            {labels.title}
          </Text>
          <Text variant="secondary" DANGEROUS_className="max-w-2xl text-pretty">
            {labels.intro}
          </Text>
        </header>

        {loadError && (
          <div className="space-y-3">
            <Banner
              role="alert"
              variant="error"
              title={labels.loadError}
              description={loadError}
            />
            <Button
              type="button"
              variant="secondary"
              onClick={() => setReloadKey((key) => key + 1)}
            >
              {labels.reload}
            </Button>
          </div>
        )}

        {(sharedFields.length > 0 || translationLocales.length > 0) && (
          <LayerCard className="ebu-card space-y-5 p-5">
            <Text variant="heading3" as="h2" DANGEROUS_className="text-balance">
              {labels.defaults}
            </Text>
            <div className="grid gap-5 lg:grid-cols-3">
              {sharedFields.map((field) => {
                if (field.kind === "taxonomy") {
                  return (
                    <Select
                      key={field.name}
                      label={resolveText(field.label, lang)}
                      placeholder={
                        resolveText(field.placeholder, lang) || undefined
                      }
                      items={(terms[field.name] ?? []).map((term) => ({
                        value: term.id,
                        label: term.label,
                      }))}
                      value={shared[field.name] || null}
                      loading={loading}
                      disabled={loading || isImporting}
                      onValueChange={(value) =>
                        setShared((current) => ({
                          ...current,
                          [field.name]: typeof value === "string" ? value : "",
                        }))
                      }
                      size="lg"
                    />
                  )
                }
                const noneItem = field.noneLabel
                  ? [
                      {
                        value: NONE_VALUE,
                        label: resolveText(field.noneLabel, lang),
                      },
                    ]
                  : []
                return (
                  <Select
                    key={field.name}
                    label={resolveText(field.label, lang)}
                    placeholder={
                      resolveText(field.placeholder, lang) || undefined
                    }
                    items={[
                      ...noneItem,
                      ...(options[field.name] ?? []).map((entry) => ({
                        value: entry.id,
                        label: field.optionLabel
                          ? field.optionLabel(entry, lang)
                          : contentLabel(entry, field.labelKeys),
                      })),
                    ]}
                    value={
                      shared[field.name] ||
                      (field.noneLabel ? NONE_VALUE : null)
                    }
                    loading={loading}
                    disabled={loading || isImporting}
                    onValueChange={(value) =>
                      setShared((current) => ({
                        ...current,
                        [field.name]:
                          typeof value === "string" && value !== NONE_VALUE
                            ? value
                            : "",
                      }))
                    }
                    size="lg"
                  />
                )
              })}
              {translationLocales.length > 0 && (
                <div className="ebu-span-full">
                  <Checkbox
                    label={labels.translations}
                    controlFirst
                    checked={createTranslations}
                    disabled={isImporting}
                    onCheckedChange={(checked) =>
                      setCreateTranslations(checked)
                    }
                  />
                </div>
              )}
            </div>
          </LayerCard>
        )}

        <section className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <Text variant="heading3" as="h2" DANGEROUS_className="text-balance">
              {labels.files}
            </Text>
            <Badge variant="secondary" className="tabular-nums">
              {rows.length} {labels.count}
            </Badge>
          </div>
          <div
            onDragEnter={(event) => {
              event.preventDefault()
              dragDepth.current += 1
              setIsDragging(true)
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={() => {
              dragDepth.current -= 1
              if (dragDepth.current <= 0) {
                dragDepth.current = 0
                setIsDragging(false)
              }
            }}
            onDrop={(event) => {
              event.preventDefault()
              dragDepth.current = 0
              setIsDragging(false)
              if (isImporting) return
              addFiles([...event.dataTransfer.files])
            }}
            className={`ebu-dropzone p-1 ${
              isDragging
                ? "bg-kumo-brand/10 ring-2 ring-kumo-brand"
                : "bg-kumo-tint ring ring-kumo-line"
            }`}
          >
            <input
              ref={fileInputRef}
              id="bulk-upload-files"
              type="file"
              accept={accept}
              multiple
              disabled={isImporting}
              className="sr-only"
              onChange={(event) => addFiles([...(event.target.files ?? [])])}
            />
            <Empty
              size="sm"
              title={labels.drop}
              description={labels.hint}
              contents={
                <Button
                  type="button"
                  variant="secondary"
                  disabled={isImporting}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {labels.chooseFiles}
                </Button>
              }
              className="rounded-xl bg-kumo-base"
            />
          </div>

          {skippedCount > 0 && (
            <Banner
              role="status"
              variant="alert"
              description={labels.skipped.replace(
                "{count}",
                String(skippedCount),
              )}
            />
          )}

          {rows.length > 0 ? (
            <div className="space-y-3">
              {rows.map((row, index) => (
                <article key={row.id}>
                  <LayerCard className="space-y-4 p-4">
                    <div className="ebu-row-grid">
                      <FilePreview file={row.file} aspectRatio={aspectRatio} />
                      <div className="min-w-0 space-y-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="tabular-nums">
                            {index + 1}
                          </Badge>
                          <Text variant="secondary" size="xs" truncate>
                            {row.file.name}
                          </Text>
                        </div>
                        <Input
                          id={`bulk-upload-title-${index}`}
                          label={labels.itemTitle}
                          value={row.title}
                          disabled={isImporting || row.status === "done"}
                          onChange={(event) =>
                            patchRow(row.id, { title: event.target.value })
                          }
                        />
                        {row.status === "done" && (
                          <div className="flex flex-wrap gap-2">
                            {row.primaryEntryId && (
                              <LinkButton
                                size="sm"
                                variant="ghost"
                                href={`/_emdash/admin/content/${config.collection}/${row.primaryEntryId}${
                                  locales?.primary
                                    ? `?locale=${locales.primary}`
                                    : ""
                                }`}
                              >
                                {editLabel(locales?.primary)}
                              </LinkButton>
                            )}
                            {Object.entries(row.translationIds ?? {}).map(
                              ([locale, entryId]) => (
                                <LinkButton
                                  key={locale}
                                  size="sm"
                                  variant="ghost"
                                  href={`/_emdash/admin/content/${config.collection}/${entryId}?locale=${locale}`}
                                >
                                  {editLabel(locale)}
                                </LinkButton>
                              ),
                            )}
                          </div>
                        )}
                      </div>
                      <div className="space-y-4">
                        {rowFields.map((field) => (
                          <Input
                            key={field.name}
                            id={`bulk-upload-${field.name}-${index}`}
                            label={resolveText(field.label, lang)}
                            type={field.type === "month" ? "month" : "text"}
                            value={row.values[field.name] ?? ""}
                            disabled={isImporting || row.status === "done"}
                            onChange={(event) => {
                              const value = event.target.value
                              setRows((current) =>
                                current.map((item) =>
                                  item.id === row.id
                                    ? {
                                        ...item,
                                        values: {
                                          ...item.values,
                                          [field.name]: value,
                                        },
                                      }
                                    : item,
                                ),
                              )
                            }}
                          />
                        ))}
                      </div>
                      <div className="ebu-row-status flex min-h-10 items-center justify-between gap-2">
                        <Badge
                          variant={statusVariant(row.status)}
                          appearance="dot"
                        >
                          {labels[row.status]}
                        </Badge>
                        {!row.primaryEntryId && row.status !== "done" && (
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary-destructive"
                            disabled={isImporting}
                            onClick={() =>
                              setRows((current) =>
                                current.filter((item) => item.id !== row.id),
                              )
                            }
                          >
                            {labels.remove}
                          </Button>
                        )}
                      </div>
                    </div>
                    {row.error && (
                      <Banner
                        role="alert"
                        variant="error"
                        description={row.error}
                      />
                    )}
                  </LayerCard>
                </article>
              ))}
            </div>
          ) : null}
        </section>

        <LayerCard className="sticky bottom-4 z-10 flex flex-col gap-3 bg-kumo-base/95 p-4 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <Text
            variant="secondary"
            size="sm"
            DANGEROUS_className="text-pretty tabular-nums"
          >
            {!canImport &&
            !isImporting &&
            rows.some((row) => row.status !== "done")
              ? labels.incomplete
              : `${rows.filter((row) => row.status === "done").length}/${rows.length}`}
          </Text>
          <Button
            type="button"
            variant="primary"
            size="lg"
            loading={isImporting}
            disabled={!canImport}
            onClick={() => void importRows()}
          >
            {isImporting
              ? labels.importing
              : hasErrors
                ? labels.retry
                : labels.import}
          </Button>
        </LayerCard>
      </main>
    )
  }
}

export interface FieldWidgetProps {
  value: unknown
  onChange: (value: unknown) => void
  label: string
  id: string
  required?: boolean
}

export interface MonthYearFieldOptions {
  /** Coerce stored values (for example legacy dates) to `YYYY-MM`; return undefined to clear. */
  normalize?: (value: unknown) => string | undefined
}

export function createMonthYearField(
  options?: MonthYearFieldOptions,
): ComponentType<FieldWidgetProps> {
  const normalize = options?.normalize ?? normalizeMonth

  return function MonthYearField({
    value,
    onChange,
    label,
    id,
    required,
  }: FieldWidgetProps) {
    return (
      <Input
        id={id}
        type="month"
        value={normalize(value) ?? ""}
        required={required}
        label={label}
        size="lg"
        onChange={(event) => onChange(event.target.value || null)}
      />
    )
  }
}

export interface BulkUploadAdminOptions extends BulkUploadAdminConfig {
  monthYearField?: MonthYearFieldOptions | boolean
}

export function createBulkUploadAdmin(
  options: BulkUploadAdminOptions,
): PluginAdminExports {
  const { monthYearField, ...config } = options
  const exports: PluginAdminExports = {
    pages: { [config.path ?? "/bulk-upload"]: createBulkUploadPage(config) },
  }
  if (monthYearField) {
    exports.fields = {
      "month-year": createMonthYearField(
        typeof monthYearField === "object" ? monthYearField : undefined,
      ),
    }
  }
  return exports
}
