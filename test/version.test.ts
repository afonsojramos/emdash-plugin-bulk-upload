import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { PLUGIN_VERSION } from "../src/version.ts"

test("PLUGIN_VERSION matches package.json", () => {
  const pkg = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  )
  assert.equal(PLUGIN_VERSION, pkg.version)
})
