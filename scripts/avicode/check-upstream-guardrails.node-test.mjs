import * as NodeAssert from "node:assert/strict";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeTest from "node:test";
import {
  checkUpstreamGuardrails,
  defaultRepositoryRoot,
  registryFile,
} from "./check-upstream-guardrails.mjs";

// Built at runtime so this fork-owned file passes its own brand check.
const upstreamName = ["T3", "Code"].join(" ");
const temporaryDirectories = [];

NodeTest.afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    NodeFS.rmSync(directory, { recursive: true, force: true });
  }
});

function write(root, relativeFile, contents) {
  const file = NodePath.join(root, ...relativeFile.split("/"));
  NodeFS.mkdirSync(NodePath.dirname(file), { recursive: true });
  NodeFS.writeFileSync(file, contents);
}

function fixture() {
  const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "avicode-guardrails-"));
  temporaryDirectories.push(root);
  write(root, "apps/web/index.html", "<title>Avi Code 2</title>\n");
  write(
    root,
    ".github/workflows/avicode-release.yml",
    "name: release\non:\n  workflow_dispatch:\n    inputs:\n      version:\n        type: string\n\njobs: {}\n",
  );
  write(root, ".github/workflows/sync-upstream.yml", "git merge --no-ff\n");
  write(root, "scripts/avicode/allowed.mjs", `// based on ${upstreamName}\n`);
  write(
    root,
    registryFile,
    JSON.stringify({
      version: 2,
      boundaries: [
        {
          id: "branding",
          requiredFiles: ["apps/web/index.html"],
          requiredText: [{ file: "apps/web/index.html", values: ["<title>Avi Code 2</title>"] }],
        },
        {
          id: "release",
          manualOnlyWorkflows: [".github/workflows/avicode-release.yml"],
        },
        {
          id: "upstream-sync",
          requiredText: [
            {
              file: ".github/workflows/sync-upstream.yml",
              values: ["git merge --no-ff"],
              forbiddenValues: ["gh pr merge"],
            },
          ],
        },
      ],
      brandBan: {
        text: upstreamName,
        paths: ["scripts/avicode"],
        allowedLines: { "scripts/avicode/allowed.mjs": [`// based on ${upstreamName}`] },
      },
    }),
  );
  return root;
}

NodeTest.test("the repository passes its own guardrails", () => {
  const result = checkUpstreamGuardrails(defaultRepositoryRoot);
  NodeAssert.deepEqual(result.failures, []);
  NodeAssert.ok(result.boundaries.includes("identity"));
});

NodeTest.test("a clean fixture passes", () => {
  const result = checkUpstreamGuardrails(fixture());
  NodeAssert.deepEqual(result.failures, []);
  NodeAssert.deepEqual(result.boundaries, ["branding", "release", "upstream-sync"]);
});

NodeTest.test("fails when the registry is missing", () => {
  const root = fixture();
  NodeFS.rmSync(NodePath.join(root, ...registryFile.split("/")));
  NodeAssert.deepEqual(checkUpstreamGuardrails(root).failures, [`${registryFile} is missing.`]);
});

NodeTest.test("fails when a sync reverts protected text", () => {
  const root = fixture();
  write(root, "apps/web/index.html", `<title>${upstreamName}</title>\n`);
  const { failures } = checkUpstreamGuardrails(root);
  NodeAssert.ok(failures.some((failure) => failure.startsWith("branding: apps/web/index.html")));
});

NodeTest.test("fails when a protected file disappears", () => {
  const root = fixture();
  NodeFS.rmSync(NodePath.join(root, "apps", "web", "index.html"));
  const { failures } = checkUpstreamGuardrails(root);
  NodeAssert.ok(failures.some((failure) => failure.includes("apps/web/index.html is missing")));
});

NodeTest.test("fails when forbidden text appears", () => {
  const root = fixture();
  write(root, ".github/workflows/sync-upstream.yml", "git merge --no-ff\ngh pr merge --auto\n");
  const { failures } = checkUpstreamGuardrails(root);
  NodeAssert.ok(failures.some((failure) => failure.includes('must not contain "gh pr merge"')));
});

NodeTest.test("fails when a manual workflow gains an automatic trigger", () => {
  const root = fixture();
  write(
    root,
    ".github/workflows/avicode-release.yml",
    "on:\n  workflow_dispatch:\n  push:\n    branches: [main]\njobs: {}\n",
  );
  const { failures } = checkUpstreamGuardrails(root);
  NodeAssert.ok(failures.some((failure) => failure.includes("workflow_dispatch, push")));
});

NodeTest.test("flags the upstream name in fork-owned files unless allowlisted", () => {
  const root = fixture();
  write(root, "scripts/avicode/label.mjs", `export const label = "${upstreamName}";\n`);
  const { failures } = checkUpstreamGuardrails(root);
  NodeAssert.equal(failures.length, 1);
  NodeAssert.ok(failures[0].startsWith("brand: scripts/avicode/label.mjs:1"));
});
