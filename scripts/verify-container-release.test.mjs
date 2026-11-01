import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { containerReleaseRef, reviewedRunState } from "./verify-container-release.mjs";

test("container publishing rejects feature branches, arbitrary tags and injected refs", () => {
  assert.equal(containerReleaseRef("refs/heads/main"), "latest");
  assert.equal(containerReleaseRef("refs/tags/v1.2.3"), "v1.2.3");
  for (const ref of [
    "refs/heads/feature",
    "refs/tags/other",
    "refs/tags/v01.2.3",
    "refs/tags/v1.2.3\nlatest",
  ]) {
    assert.throws(() => containerReleaseRef(ref));
  }
});
test("only the latest same-revision main push checks from this repository authorize publication", () => {
  const run = {
    head_sha: "abc",
    head_branch: "main",
    event: "push",
    head_repository: { full_name: "owner/repo" },
    run_number: 1,
    run_attempt: 1,
    status: "completed",
    conclusion: "success",
  };
  const state = (runs) => reviewedRunState(runs, "abc", "owner/repo");
  assert.equal(state([run]), "passed");
  assert.equal(state([{ ...run, head_sha: "other" }]), "waiting");
  assert.equal(state([{ ...run, event: "pull_request" }]), "waiting");
  assert.equal(state([{ ...run, head_repository: { full_name: "fork/repo" } }]), "waiting");
  assert.equal(state([run, { ...run, run_attempt: 2, conclusion: "failure" }]), "failed");
  assert.equal(
    state([run, { ...run, run_number: 2, status: "in_progress", conclusion: null }]),
    "waiting",
  );
});
test("publication is environment-gated and promotes the checked artifact with narrowly scoped write permission", () => {
  const workflow = readFileSync(
    new URL("../.github/workflows/release.yml", import.meta.url),
    "utf8",
  );
  assert.match(workflow, /environment: containers/);
  assert.match(workflow, /needs: \[authorize, build\]/);
  assert.match(workflow, /sha256sum --check --strict/);
  assert.match(workflow, /docker tag "\$image_id"/);
  assert.equal((workflow.match(/packages: write/g) ?? []).length, 1);
  assert.doesNotMatch(workflow.split("  publish:")[0], /docker (?:push|login)|packages: write/);
});
