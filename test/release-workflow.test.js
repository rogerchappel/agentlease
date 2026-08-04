import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const releasePath = new URL("../.github/workflows/release.yml", import.meta.url);
const dryRunPath = new URL("../.github/workflows/release-dry-run.yml", import.meta.url);

test("tag releases publish the inspected tarball before creating the GitHub release", async () => {
  const workflow = await readFile(releasePath, "utf8");
  const pack = workflow.indexOf("npm pack --json > pack-result.json");
  const publish = workflow.indexOf('npm publish "${{ steps.pack.outputs.tarball }}" --provenance --access public');
  const release = workflow.indexOf('gh release create "${GITHUB_REF_NAME}"');

  assert.ok(pack >= 0, "release workflow must inspect npm pack JSON");
  assert.ok(workflow.includes("tarball=${pack.filename}"), "pack filename must become a step output");
  assert.ok(publish > pack, "npm publish must follow packing");
  assert.ok(release > publish, "GitHub release must follow npm publication");
  assert.ok(workflow.includes('"${{ steps.pack.outputs.tarball }}"'), "publish and release must use the captured tarball");
  assert.match(workflow, /npm install --global npm@11\.5\.2/);
});

test("PR and manual dry runs cannot publish", async () => {
  const workflow = await readFile(dryRunPath, "utf8");

  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /npm publish|gh release create/);
});
