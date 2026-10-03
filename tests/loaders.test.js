import test from "node:test";
import assert from "node:assert/strict";
import { fetchBinaryAsset } from "../static/js/loaders.js";

test("binary asset fetch preserves bytes and reports completion", async () => {
  const progress = [];
  const result = await fetchBinaryAsset("data:application/octet-stream;base64,AQIDBA==", value => progress.push(value));
  assert.deepEqual([...new Uint8Array(result)], [1, 2, 3, 4]);
  assert.equal(progress.at(-1), 1);
});

test("binary asset fetch surfaces errors instead of hanging", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response("Not found", { status: 404 });
    await assert.rejects(fetchBinaryAsset("/missing.glb"), /HTTP 404/);
  } finally { globalThis.fetch = original; }
});

test("slow binary asset fetch is cancelled", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = (_, { signal }) => new Promise((resolve, reject) => {
      signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    });
    await assert.rejects(fetchBinaryAsset("/slow.glb", () => {}, 10), /timed out/);
  } finally { globalThis.fetch = original; }
});
