import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  contentLabel,
  currentMonth,
  DEFAULT_LABELS,
  defaultTitleFromFilename,
  imageFieldValue,
  isValidMonth,
  normalizeMonth,
  resolveLabels,
  resolveText,
} from "../src/shared.ts"
import { BUILT_IN_LANGUAGES } from "../src/locales.ts"

describe("defaultTitleFromFilename", () => {
  it("strips the extension and humanizes separators", () => {
    assert.equal(
      defaultTitleFromFilename("massa-critica_junho 2024.jpg"),
      "Massa critica junho 2024",
    )
  })

  it("capitalizes the first letter", () => {
    assert.equal(defaultTitleFromFilename("poster.png"), "Poster")
  })

  it("falls back for empty names", () => {
    assert.equal(defaultTitleFromFilename(".png"), "Untitled")
  })
})

describe("isValidMonth", () => {
  it("accepts YYYY-MM", () => {
    assert.equal(isValidMonth("2026-08"), true)
    assert.equal(isValidMonth("2026-12"), true)
  })

  it("rejects invalid months and full dates", () => {
    assert.equal(isValidMonth("2026-13"), false)
    assert.equal(isValidMonth("2026-08-18"), false)
    assert.equal(isValidMonth("junho 2024"), false)
  })
})

describe("normalizeMonth", () => {
  it("keeps valid months", () => {
    assert.equal(normalizeMonth("2026-08"), "2026-08")
    assert.equal(normalizeMonth(" 2026-08 "), "2026-08")
  })

  it("coerces legacy ISO dates to months", () => {
    assert.equal(normalizeMonth("2024-06-15"), "2024-06")
    assert.equal(normalizeMonth("2024-06-15T10:00:00Z"), "2024-06")
  })

  it("rejects everything else", () => {
    assert.equal(normalizeMonth("junho 2024"), undefined)
    assert.equal(normalizeMonth(42), undefined)
    assert.equal(normalizeMonth(null), undefined)
  })
})

describe("currentMonth", () => {
  it("formats as YYYY-MM", () => {
    assert.equal(currentMonth(new Date(2026, 0, 15)), "2026-01")
    assert.equal(currentMonth(new Date(2026, 11, 1)), "2026-12")
  })
})

describe("imageFieldValue", () => {
  const base = {
    id: "media-1",
    filename: "poster.jpg",
    mimeType: "image/jpeg",
    url: "https://cdn.example.com/poster.jpg",
    storageKey: "uploads/poster.jpg",
    width: 800,
    height: 1200,
  }

  it("keeps the storage key in meta for local media", () => {
    const value = imageFieldValue(base, "Poster")
    assert.equal(value.provider, "local")
    assert.equal(value.previewUrl, undefined)
    assert.deepEqual(value.meta, { storageKey: "uploads/poster.jpg" })
    assert.equal(value.alt, "Poster")
  })

  it("uses the url as preview for remote providers", () => {
    const value = imageFieldValue(
      { ...base, provider: "r2", meta: { bucket: "media" } },
      "Poster",
    )
    assert.equal(value.provider, "r2")
    assert.equal(value.previewUrl, base.url)
    assert.deepEqual(value.meta, { bucket: "media" })
  })
})

describe("resolveText", () => {
  it("passes plain strings through", () => {
    assert.equal(resolveText("Location", "pt"), "Location")
  })

  it("picks the admin language with English fallback", () => {
    assert.equal(resolveText({ en: "Location", pt: "Local" }, "pt"), "Local")
    assert.equal(resolveText({ en: "Location", pt: "Local" }, "fr"), "Location")
    assert.equal(resolveText({ pt: "Local" }, "fr"), "Local")
  })

  it("returns the fallback when undefined", () => {
    assert.equal(resolveText(undefined, "pt", "x"), "x")
  })
})

describe("resolveLabels", () => {
  it("applies built-in language catalogs over the English defaults", () => {
    const labels = resolveLabels(undefined, "pt")
    assert.equal(labels.title, BUILT_IN_LANGUAGES.pt?.title)
    assert.equal(labels.eyebrow, DEFAULT_LABELS.eyebrow)
  })

  it("lets host overrides win over the built-in catalog", () => {
    const labels = resolveLabels({ pt: { title: "Cartazes em lote" } }, "pt")
    assert.equal(labels.title, "Cartazes em lote")
    assert.equal(labels.import, BUILT_IN_LANGUAGES.pt?.import)
  })

  it("returns defaults for unknown languages", () => {
    assert.deepEqual(
      resolveLabels({ pt: { title: "x" } }, "de"),
      DEFAULT_LABELS,
    )
  })

  it("has every label translated in each built-in catalog", () => {
    for (const [language, catalog] of Object.entries(BUILT_IN_LANGUAGES)) {
      for (const key of Object.keys(DEFAULT_LABELS)) {
        assert.ok(
          key in catalog || key === "eyebrow",
          `missing "${key}" in built-in "${language}" catalog`,
        )
      }
    }
  })
})

describe("contentLabel", () => {
  it("tries label keys in order", () => {
    const entry = {
      id: "1",
      slug: "lisboa",
      data: { city: "Lisboa", name: "ignored" },
    }
    assert.equal(contentLabel(entry, ["city", "name"]), "Lisboa")
  })

  it("falls back to slug then id", () => {
    assert.equal(contentLabel({ id: "1", slug: "lisboa", data: {} }), "lisboa")
    assert.equal(contentLabel({ id: "1", data: {} }), "1")
  })
})
