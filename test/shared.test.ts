import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  contentLabel,
  currentMonth,
  DEFAULT_LABELS,
  defaultTitleFromFilename,
  imageFieldValue,
  isValidMonth,
  resolveLabels,
  resolveText,
} from "../src/shared.ts"

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
  it("merges language overrides over the defaults", () => {
    const labels = resolveLabels(
      { pt: { title: "Carregamento em lote" } },
      "pt",
    )
    assert.equal(labels.title, "Carregamento em lote")
    assert.equal(labels.import, DEFAULT_LABELS.import)
  })

  it("returns defaults for unknown languages", () => {
    assert.deepEqual(
      resolveLabels({ pt: { title: "x" } }, "de"),
      DEFAULT_LABELS,
    )
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
