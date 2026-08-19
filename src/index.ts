import type {
  FieldWidgetConfig,
  PluginDescriptor,
  ResolvedPlugin,
} from "emdash"
import { definePlugin } from "emdash"

const PLUGIN_ID = "emdash-plugin-bulk-upload"
import { PLUGIN_VERSION } from "./version.ts"

export interface BulkUploadPage {
  path?: string
  label?: string
  icon?: string
}

export interface BulkUploadPluginOptions {
  /**
   * Module specifier of the host's admin entry — the file that calls
   * `createBulkUploadAdmin()` from `emdash-plugin-bulk-upload/admin` with the
   * project-specific configuration (collections, field mapping, labels).
   */
  adminEntry: string
  /** Plugin id, when running more than one uploader. Defaults to `bulk-upload`. */
  id?: string
  /** Admin navigation entry. Defaults to `/bulk-upload`, "Bulk upload", `upload` icon. */
  page?: BulkUploadPage
  /** Register the bundled `month-year` schema-field widget. */
  monthYearWidget?: boolean | { label?: string }
}

interface ResolvedAdminPage {
  path: string
  label: string
  icon?: string
}

interface ResolvedAdminOptions {
  id: string
  pages: ResolvedAdminPage[]
  fieldWidgets: FieldWidgetConfig[]
}

function resolveAdminOptions(
  options: BulkUploadPluginOptions,
): ResolvedAdminOptions {
  const fieldWidgets: FieldWidgetConfig[] = options.monthYearWidget
    ? [
        {
          name: "month-year",
          label:
            (typeof options.monthYearWidget === "object" &&
              options.monthYearWidget.label) ||
            "Month and year",
          fieldTypes: ["string", "text"],
        },
      ]
    : []
  return {
    id: options.id ?? PLUGIN_ID,
    pages: [
      {
        path: options.page?.path ?? "/bulk-upload",
        label: options.page?.label ?? "Bulk upload",
        icon: options.page?.icon ?? "upload",
      },
    ],
    fieldWidgets,
  }
}

export function bulkUpload(options: BulkUploadPluginOptions): PluginDescriptor {
  const admin = resolveAdminOptions(options)
  return {
    id: admin.id,
    version: PLUGIN_VERSION,
    format: "native",
    entrypoint: "emdash-plugin-bulk-upload",
    options: admin as unknown as Record<string, unknown>,
    adminEntry: options.adminEntry,
    adminPages: admin.pages,
    fieldWidgets: admin.fieldWidgets,
  }
}

export function createPlugin(
  options?: Partial<ResolvedAdminOptions>,
): ResolvedPlugin {
  return definePlugin({
    id: options?.id ?? PLUGIN_ID,
    version: PLUGIN_VERSION,
    admin: {
      pages: options?.pages ?? [
        { path: "/bulk-upload", label: "Bulk upload", icon: "upload" },
      ],
      fieldWidgets: options?.fieldWidgets ?? [],
    },
  })
}
