import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { setTimeout } from "node:timers/promises";

export function containerReleaseRef(ref) {
  if (ref === "refs/heads/main") return "latest";
  const match = /^refs\/tags\/(v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))$/.exec(ref);
  assert(match, "Only main or a canonical version tag may publish containers");
  return match[1];
}

export function reviewedRunState(runs, revision, repository) {
  const matching = runs
    .filter(
      (run) =>
        run.head_sha === revision &&
        run.head_branch === "main" &&
        run.event === "push" &&
        run.head_repository?.full_name === repository,
    )
    .sort(
      (left, right) => right.run_number - left.run_number || right.run_attempt - left.run_attempt,
    );
  if (!matching.length) return "waiting";
  const latest = matching[0];
  return latest.status !== "completed"
    ? "waiting"
    : latest.conclusion === "success"
      ? "passed"
      : "failed";
}

async function verify() {
  const env = process.env;
  const tag = containerReleaseRef(env.GITHUB_REF);
  const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
  const revision = git("rev-parse", "HEAD");
  assert.match(revision, /^[a-f0-9]{40}$/);
  assert.equal(revision, env.GITHUB_SHA, "Checkout must match the requested revision");
  git("merge-base", "--is-ancestor", revision, "origin/main");
  for (const workflow of ["ci.yml", "secrets.yml"]) {
    const deadline = Date.now() + 20 * 60_000;
    while (true) {
      const response = JSON.parse(
        execFileSync(
          "gh",
          [
            "api",
            `repos/${env.GITHUB_REPOSITORY}/actions/workflows/${workflow}/runs?head_sha=${revision}&branch=main&event=push&per_page=100`,
          ],
          { encoding: "utf8" },
        ),
      );
      const state = reviewedRunState(response.workflow_runs, revision, env.GITHUB_REPOSITORY);
      assert.notEqual(state, "failed", `${workflow} failed for this revision`);
      if (state === "passed") break;
      assert(Date.now() < deadline, `Timed out waiting for ${workflow} on this revision`);
      await setTimeout(30_000);
    }
  }
  appendFileSync(env.GITHUB_OUTPUT, `revision=${revision}\ntag=${tag}\n`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await verify();
