import assert from "node:assert/strict";
import { test } from "node:test";
import { bulkUpload, createPlugin } from "../src/index.ts";

test("carries the configured React entry into the runtime definition", () => {
  const descriptor = bulkUpload({
    id: "gallery-tools",
    adminEntry: "@/plugins/bulk-upload-admin",
    monthYearWidget: true,
  });
  const plugin = createPlugin(descriptor.options);
  assert.equal(descriptor.format, "native");
  assert.equal(plugin.admin?.entry, descriptor.adminEntry);
  assert.equal(plugin.id, "gallery-tools");
  assert.deepEqual(plugin.admin?.pages, descriptor.adminPages);
  assert.deepEqual(plugin.admin?.fieldWidgets, descriptor.fieldWidgets);
});
