import * as NodeAssert from "node:assert/strict";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeTest from "node:test";
import { checkUpstreamGuardrails, defaultRepositoryRoot } from "./check-upstream-guardrails.mjs";

const temporaryDirectories = [];

NodeTest.afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    NodeFS.rmSync(directory, { recursive: true, force: true });
  }
});

function fixture() {
  const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "avicode-guardrails-"));
  temporaryDirectories.push(root);
  NodeFS.mkdirSync(NodePath.join(root, ".avicode"), { recursive: true });
  NodeFS.mkdirSync(NodePath.join(root, ".github", "workflows"), { recursive: true });
  NodeFS.writeFileSync(
    NodePath.join(root, ".github", "workflows", "sync-upstream.yml"),
    "0 1 * * 1\npingdotgg/t3code\ngit merge --no-ff\ngh pr create\npublish: never\n",
  );
  NodeFS.writeFileSync(
    NodePath.join(root, ".avicode", "upstream-guardrails.json"),
    JSON.stringify({
      version: 1,
      upstream: { repository: "pingdotgg/t3code", branch: "main" },
      releaseRepository: "TheDarkPhantom/avicode",
      identity: {
        productName: "Avi Code",
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

NodeTest.test("the repository guardrails are internally consistent", () => {
  const result = checkUpstreamGuardrails(defaultRepositoryRoot);
  NodeAssert.deepEqual(result.failures, []);
});

NodeTest.test("accepts active and planned customization boundaries", () => {
  const result = checkUpstreamGuardrails(fixture());
  NodeAssert.deepEqual(result.failures, []);
  NodeAssert.deepEqual(result.activeBoundaries, ["sync"]);
  NodeAssert.deepEqual(result.plannedBoundaries, ["future"]);
});

NodeTest.test("fails when protected sync behavior disappears", () => {
  const root = fixture();
  NodeFS.writeFileSync(
    NodePath.join(root, ".github", "workflows", "sync-upstream.yml"),
    "pingdotgg/t3code\npublish: never\n",
  );
  const result = checkUpstreamGuardrails(root);
  NodeAssert.ok(result.failures.some((failure) => failure.includes("git merge --no-ff")));
});

NodeTest.test("rejects self-merging and release-publishing workflows", () => {
  const root = fixture();
  NodeFS.appendFileSync(
    NodePath.join(root, ".github", "workflows", "sync-upstream.yml"),
    "\ngh pr merge --auto\nactions/create-release\n",
  );
  const result = checkUpstreamGuardrails(root);
  NodeAssert.ok(result.failures.some((failure) => failure.includes("never merge")));
  NodeAssert.ok(result.failures.some((failure) => failure.includes("auto-merge")));
  NodeAssert.ok(result.failures.some((failure) => failure.includes("publish a release")));
});

NodeTest.test("rejects identity or update-repository drift", () => {
  const root = fixture();
  const manifestFile = NodePath.join(root, ".avicode", "upstream-guardrails.json");
  const manifest = JSON.parse(NodeFS.readFileSync(manifestFile, "utf8"));
  manifest.identity.appId = "com.t3tools.t3code";
  manifest.releaseRepository = "pingdotgg/t3code";
  NodeFS.writeFileSync(manifestFile, JSON.stringify(manifest));
  const result = checkUpstreamGuardrails(root);
  NodeAssert.ok(result.failures.some((failure) => failure.includes("appId")));
  NodeAssert.ok(result.failures.some((failure) => failure.includes("release repository")));
});

NodeTest.test("rejects visible upstream branding in product source", () => {
  const root = fixture();
  const sourceDirectory = NodePath.join(root, "apps", "web", "src");
  NodeFS.mkdirSync(sourceDirectory, { recursive: true });
  NodeFS.writeFileSync(
    NodePath.join(sourceDirectory, "UpstreamBrand.tsx"),
    'export const label = "T3 Code";\n',
  );

  const result = checkUpstreamGuardrails(root);
  NodeAssert.ok(result.failures.some((failure) => failure.includes("UpstreamBrand.tsx")));
});

NodeTest.test("rejects automatic release and relay deployment triggers", () => {
  const root = fixture();
  NodeFS.writeFileSync(
    NodePath.join(root, ".github", "workflows", "release.yml"),
    "on:\n  schedule:\n    - cron: '0 * * * *'\npermissions:\n  contents: write\n",
  );
  NodeFS.writeFileSync(
    NodePath.join(root, ".github", "workflows", "deploy-relay.yml"),
    "on:\n  push:\n    branches: [main]\npermissions:\n  contents: read\n",
  );
  const result = checkUpstreamGuardrails(root);
  NodeAssert.ok(result.failures.some((failure) => failure.includes("release")));
  NodeAssert.ok(result.failures.some((failure) => failure.includes("relay deployment")));
});
