# emdash-plugin-bulk-upload

Bulk upload admin page for [Emdash CMS](https://emdash.dev). Adds a drag-and-drop queue to the admin panel that creates a reviewed **draft** entry (with an optional linked translation) for every uploaded file. Nothing is published automatically.

- Drag-and-drop or file-picker queue with per-file previews, editable titles, and extra per-row fields
- Shared details applied to every entry: reference selects loaded from other collections, plus taxonomy assignment
- Optional linked translation drafts via Emdash's `translationOf`
- Idempotent imports: retrying a failed row skips the media upload and entries that already succeeded
- Built with [Kumo](https://www.npmjs.com/package/@cloudflare/kumo), the same component system as the Emdash admin, so it looks native
- Ships an optional `month-year` schema-field widget (`YYYY-MM` month picker)

## Install

```sh
npm install emdash-plugin-bulk-upload
```

`emdash`, `@emdash-cms/admin`, `@cloudflare/kumo`, and `react` are peer dependencies; an Emdash project already has all of them except possibly Kumo.

## Usage

The plugin is configured in two places: the **descriptor** in your Astro config, and an **admin entry** module in your project where the page is configured (it lives in your project so the config can include functions).

### 1. Astro config

```ts
// astro.config.mjs
import { bulkUpload } from "emdash-plugin-bulk-upload";

emdash({
  plugins: [
    bulkUpload({
      adminEntry: "@/plugins/bulk-upload-admin",
      page: { label: "Gallery bulk upload" },
      monthYearWidget: true, // optional schema-field widget
    }),
  ],
});
```

### 2. Admin entry

A real-world example: a photo gallery collection with a location reference, an optional author reference, a category taxonomy, and a month/year field, in a Portuguese/English site.

```tsx
// src/plugins/bulk-upload-admin.tsx
import {
  contentLabel,
  createBulkUploadAdmin,
  imageFieldValue,
} from "emdash-plugin-bulk-upload/admin";

export const { pages, fields } = createBulkUploadAdmin({
  collection: "gallery",
  primaryLocale: "pt",
  translationLocale: "en",
  sharedFields: [
    {
      kind: "collection",
      name: "location",
      label: { en: "Location", pt: "Local" },
      placeholder: { en: "Choose a location", pt: "Escolhe um local" },
      collection: "locations",
      labelKeys: ["city", "name", "title"],
      filter: (entry) => entry.data.sort_index !== 100,
      optionLabel: (entry, lang) =>
        contentLabel(entry, ["city"]) +
        (entry.data.activity_status === "inactive"
          ? lang === "pt" ? " (inativo)" : " (inactive)"
          : ""),
    },
    {
      kind: "taxonomy",
      name: "category",
      label: { en: "Category", pt: "Categoria" },
      taxonomy: "category",
      defaultSlug: "posters",
    },
    {
      kind: "collection",
      name: "author",
      label: { en: "Author", pt: "Autoria" },
      collection: "authors",
      noneLabel: { en: "No author", pt: "Sem autoria" },
    },
  ],
  rowFields: [
    { name: "date", label: { en: "Month and year", pt: "Mês e ano" }, type: "month" },
  ],
  buildData: ({ media, title, row, shared }) => ({
    title,
    description: "",
    image: imageFieldValue(media, title),
    date: row.date,
    location: shared.location,
    ...(shared.author ? { author: shared.author } : {}),
  }),
  previewAspectRatio: "2 / 3",
  monthYearField: true,
  languages: {
    pt: {
      title: "Carregamento em lote",
      intro: "Cria um rascunho da Galeria por imagem. Nada é publicado automaticamente.",
      // …override any label; unset keys keep the English defaults
    },
  },
});
```

### 3. Tailwind source

The page is styled with Tailwind utilities and Kumo design tokens, compiled by your project's Tailwind build. Tailwind does not scan `node_modules` by default, so register the package as a source in your global CSS:

```css
@source "../node_modules/emdash-plugin-bulk-upload/src";
```

(Adjust the relative path to your CSS file's location.)

## Configuration

### `bulkUpload(options)` (descriptor)

| Option | Default | Description |
| --- | --- | --- |
| `adminEntry` | required | Module specifier of your admin entry |
| `id` | `"bulk-upload"` | Plugin id, for running more than one uploader |
| `page.path` | `"/bulk-upload"` | Admin page path (must match `path` in the admin config) |
| `page.label` / `page.icon` | `"Bulk upload"` / `"upload"` | Navigation entry |
| `monthYearWidget` | `false` | Register the `month-year` field widget (`true` or `{ label }`) |

### `createBulkUploadAdmin(options)` (admin entry)

| Option | Default | Description |
| --- | --- | --- |
| `collection` | required | Collection the drafts are created in |
| `primaryLocale` | required | Locale of the primary drafts |
| `translationLocale` | — | Enables the linked-translation checkbox |
| `translationsDefault` | `true` | Initial state of that checkbox |
| `sharedFields` | `[]` | Selects shown once and applied to every entry (see below) |
| `rowFields` | `[]` | Extra per-file inputs (`text` or `month`) |
| `buildData` | required | `({ media, title, row, shared }) => data` payload for the entry |
| `titleFromFilename` | humanized filename | Initial title for each file |
| `accept` | `"image/*"` | File input accept attribute |
| `previewAspectRatio` | `"1 / 1"` | CSS aspect-ratio of the thumbnails |
| `languages` | — | Per-language label overrides (English defaults built in) |
| `monthYearField` | `false` | Export the `month-year` widget (`true` or `{ normalize }`) |
| `path` | `"/bulk-upload"` | Page key; must match the descriptor |

**Shared fields** come in two kinds. `kind: "collection"` loads options from another collection and passes the selected entry id to `buildData` under `shared[name]`; add `noneLabel` to make it optional. `kind: "taxonomy"` loads taxonomy terms and assigns the selected term to each created primary entry after creation. Labels and placeholders accept a plain string or a `{ lang: string }` map.

The admin language is detected from `document.documentElement.lang`; anything without an override falls back to English.

## License

[MIT](./LICENSE)
