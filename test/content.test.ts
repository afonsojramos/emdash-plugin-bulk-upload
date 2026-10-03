import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { contentPayload } from "../src/content.ts";

const fields = {
  title: { kind: "string" },
  location: { kind: "reference", validation: { relation: "gallery_location" } },
  author: { kind: "reference", validation: { relation: "gallery_author" } },
  legacy: { kind: "reference" },
};

describe("contentPayload", () => {
  it("moves relation-bound references out of data without mutating it", () => {
    const data = { title: "Poster", location: "porto", legacy: "old-entry" };
    assert.deepEqual(contentPayload(data, fields), {
      data: { title: "Poster", legacy: "old-entry" },
      references: { location: ["porto"] },
    });
    assert.deepEqual(data, { title: "Poster", location: "porto", legacy: "old-entry" });
  });

  it("preserves multiple selections and explicitly empty references", () => {
    assert.deepEqual(contentPayload({ location: ["porto", "lisboa"], author: "" }, fields), {
      data: {},
      references: { location: ["porto", "lisboa"], author: [] },
    });
    assert.deepEqual(contentPayload({ location: null, author: undefined }, fields), {
      data: {},
      references: { location: [], author: [] },
    });
  });

  it("does not invent omitted reference selections", () => {
    assert.deepEqual(contentPayload({ title: "Poster" }, fields), { data: { title: "Poster" } });
  });

  it("keeps legacy schemas and ordinary data unchanged", () => {
    const data = { title: "Poster", location: "porto" };
    assert.deepEqual(contentPayload(data, {}), { data });
    assert.deepEqual(
      contentPayload(data, {
        location: { kind: "reference", validation: { relation: "" } },
      }),
      { data },
    );
    assert.deepEqual(
      contentPayload(data, {
        location: { kind: "string", validation: { relation: "unrelated" } },
      }),
      { data },
    );
  });

  it("rejects invalid reference values instead of silently dropping them", () => {
    for (const location of [42, { id: "porto" }, ["porto", 42], [""]]) {
      assert.throws(() => contentPayload({ location }, fields), /location/);
    }
  });
});
