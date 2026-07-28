import assert from "node:assert/strict";
import * as FS from "node:fs";
import * as OS from "node:os";
import * as Path from "node:path";
import { afterEach, test } from "node:test";
import {
  checkUpstreamGuardrails,
  defaultRepositoryRoot,
} from "./check-upstream-guardrails.mjs";

const temporaryDirectories = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    FS.rmSync(directory, { recursive: true, force: true });
  }
});

function fixture() {
  const root = FS.mkdtempSync(Path.join(OS.tmpdir(), "avicode-guardrails-"));
  temporaryDirectories.push(root);
  FS.mkdirSync(Path.join(root, ".avicode"), { recursive: true });
  FS.mkdirSync(Path.join(root, ".github", "workflows"), { recursive: true });
  FS.writeFileSync(
    Path.join(root, ".github", "workflows", "sync-upstream.yml"),
    "0 1 * * 1\npingdotgg/t3code\ngit merge --no-ff\ngh pr create\npublish: never\n",
  );
  FS.writeFileSync(
    Path.join(root, ".avicode", "upstream-guardrails.json"),
    JSON.stringify({
      version: 1,
      upstream: { repository: "pingdotgg/t3code", branch: "main" },
      releaseRepository: "TheDarkPhantom/avicode",
      identity: {
        productName: "AviCode",
        appId: "com.advisoravi.avicode",
        protocol: "avicode://",
        dataHome: "~/.avicode",
        executable: "AviCode.exe",
        codexOriginator: "avicode_desktop",
      },
      boundaries: [
        {
          id: "sync",
          owner: "AviCodeIdentity",
          state: "active",
          requiredFiles: [".github/workflows/sync-upstream.yml"],
          requiredText: [
            {
              file: ".github/workflows/sync-upstream.yml",
              values: ["git merge --no-ff", "publish: never"],
            },
          ],
        },
        { id: "future", owner: "DocumentAttachments", state: "planned", requiredFiles: [] },
      ],
    }),
  );
  return root;
}

test("the repository guardrails are internally consistent", () => {
  const result = checkUpstreamGuardrails(defaultRepositoryRoot);
  assert.deepEqual(result.failures, []);
});

test("accepts active and planned customization boundaries", () => {
  const result = checkUpstreamGuardrails(fixture());
  assert.deepEqual(result.failures, []);
  assert.deepEqual(result.activeBoundaries, ["sync"]);
  assert.deepEqual(result.plannedBoundaries, ["future"]);
});

test("fails when protected sync behavior disappears", () => {
  const root = fixture();
  FS.writeFileSync(
    Path.join(root, ".github", "workflows", "sync-upstream.yml"),
    "pingdotgg/t3code\npublish: never\n",
  );
  const result = checkUpstreamGuardrails(root);
  assert.ok(result.failures.some((failure) => failure.includes("git merge --no-ff")));
});

test("rejects self-merging and release-publishing workflows", () => {
  const root = fixture();
  FS.appendFileSync(
    Path.join(root, ".github", "workflows", "sync-upstream.yml"),
    "\ngh pr merge --auto\nactions/create-release\n",
  );
  const result = checkUpstreamGuardrails(root);
  assert.ok(result.failures.some((failure) => failure.includes("never merge")));
  assert.ok(result.failures.some((failure) => failure.includes("auto-merge")));
  assert.ok(result.failures.some((failure) => failure.includes("publish a release")));
});

test("rejects identity or update-repository drift", () => {
  const root = fixture();
  const manifestFile = Path.join(root, ".avicode", "upstream-guardrails.json");
  const manifest = JSON.parse(FS.readFileSync(manifestFile, "utf8"));
  manifest.identity.appId = "com.t3tools.t3code";
  manifest.releaseRepository = "pingdotgg/t3code";
  FS.writeFileSync(manifestFile, JSON.stringify(manifest));
  const result = checkUpstreamGuardrails(root);
  assert.ok(result.failures.some((failure) => failure.includes("appId")));
  assert.ok(result.failures.some((failure) => failure.includes("release repository")));
});
