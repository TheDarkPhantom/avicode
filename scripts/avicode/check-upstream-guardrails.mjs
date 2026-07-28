import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

const scriptDirectory = NodePath.dirname(NodeURL.fileURLToPath(import.meta.url));
export const defaultRepositoryRoot = NodePath.resolve(scriptDirectory, "../..");

const manifestPath = (repositoryRoot) =>
  NodePath.join(repositoryRoot, ".avicode", "upstream-guardrails.json");

function readJson(path) {
  return JSON.parse(NodeFS.readFileSync(path, "utf8"));
}

function normalizedRelativePath(value) {
  return value.replaceAll("\\", "/");
}

function sourceFilesUnder(directory) {
  if (!NodeFS.existsSync(directory)) return [];
  return NodeFS.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = NodePath.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFilesUnder(path);
    return /\.(?:ts|tsx)$/u.test(entry.name) && !/\.test\.(?:ts|tsx)$/u.test(entry.name)
      ? [path]
      : [];
  });
}

export function checkUpstreamGuardrails(repositoryRoot = defaultRepositoryRoot) {
  const failures = [];
  const warnings = [];
  const manifestFile = manifestPath(repositoryRoot);

  if (!NodeFS.existsSync(manifestFile)) {
    return {
      failures: [".avicode/upstream-guardrails.json is missing."],
      warnings,
      activeBoundaries: [],
      plannedBoundaries: [],
    };
  }

  const manifest = readJson(manifestFile);
  const identity = manifest.identity ?? {};
  const expectedIdentity = {
    productName: "Avi Code",
    appId: "com.advisoravi.avicode",
    protocol: "avicode://",
    dataHome: "~/.avicode",
    executable: "AviCode.exe",
    codexOriginator: "avicode_desktop",
  };

  for (const [key, value] of Object.entries(expectedIdentity)) {
    if (identity[key] !== value) {
      failures.push(`Identity invariant ${key} must remain ${JSON.stringify(value)}.`);
    }
  }

  if (
    manifest.upstream?.repository !== "pingdotgg/t3code" ||
    manifest.upstream?.branch !== "main"
  ) {
    failures.push("The authoritative upstream must remain pingdotgg/t3code main.");
  }
  if (manifest.releaseRepository !== "TheDarkPhantom/avicode") {
    failures.push("The AviCode release repository must remain TheDarkPhantom/avicode.");
  }

  const boundaries = Array.isArray(manifest.boundaries) ? manifest.boundaries : [];
  const activeBoundaries = [];
  const plannedBoundaries = [];

  for (const boundary of boundaries) {
    if (boundary.state !== "active" && boundary.state !== "planned") {
      failures.push(`Boundary ${boundary.id ?? "<unknown>"} has invalid state ${boundary.state}.`);
      continue;
    }

    if (boundary.state === "planned") {
      plannedBoundaries.push(boundary.id);
      continue;
    }

    activeBoundaries.push(boundary.id);
    for (const relativeFile of boundary.requiredFiles ?? []) {
      const file = NodePath.resolve(repositoryRoot, relativeFile);
      if (!NodeFS.existsSync(file)) {
        failures.push(
          `${boundary.id}: required file ${normalizedRelativePath(relativeFile)} is missing.`,
        );
      }
    }

    for (const requirement of boundary.requiredText ?? []) {
      const file = NodePath.resolve(repositoryRoot, requirement.file);
      if (!NodeFS.existsSync(file)) continue;
      const contents = NodeFS.readFileSync(file, "utf8");
      for (const value of requirement.values ?? []) {
        if (!contents.includes(value)) {
          failures.push(
            `${boundary.id}: ${normalizedRelativePath(requirement.file)} is missing protected text ${JSON.stringify(value)}.`,
          );
        }
      }
    }
  }

  if (plannedBoundaries.length > 0) {
    warnings.push(
      `Planned boundaries are not enforced until their base features land: ${plannedBoundaries.join(", ")}.`,
    );
  }

  const syncWorkflow = NodePath.join(repositoryRoot, ".github", "workflows", "sync-upstream.yml");
  if (NodeFS.existsSync(syncWorkflow)) {
    const contents = NodeFS.readFileSync(syncWorkflow, "utf8");
    const forbidden = [
      ["gh pr merge", "The upstream workflow must never merge its own pull request."],
      ["--auto", "The upstream workflow must never enable auto-merge."],
      ["workflow_run:", "Upstream synchronization must not trigger a release workflow."],
      ["actions/create-release", "Upstream synchronization must not publish a release."],
    ];
    for (const [needle, message] of forbidden) {
      if (contents.includes(needle)) failures.push(message);
    }
  }

  for (const [relativeFile, label] of [
    [".github/workflows/release.yml", "AviCode release"],
    [".github/workflows/deploy-relay.yml", "AviCode relay deployment"],
  ]) {
    const workflow = NodePath.join(repositoryRoot, ...relativeFile.split("/"));
    if (!NodeFS.existsSync(workflow)) continue;
    const triggerSection =
      NodeFS.readFileSync(workflow, "utf8").split(/\npermissions:/u, 1)[0] ?? "";
    if (/^\s{2}(?:push|schedule):/mu.test(triggerSection)) {
      failures.push(`${label} must remain manual-only during the personal alpha.`);
    }
  }

  const legacyT3CopyAllowlist = new Set([
    "apps/desktop/src/app/DesktopEnvironment.ts",
    "apps/desktop/src/app/LegacyT3Import.ts",
  ]);
  for (const sourceRoot of [
    "apps/web/src",
    "apps/desktop/src",
    "apps/server/src",
    "packages/contracts/src",
    "packages/shared/src",
  ]) {
    for (const file of sourceFilesUnder(NodePath.join(repositoryRoot, ...sourceRoot.split("/")))) {
      const relativeFile = normalizedRelativePath(NodePath.relative(repositoryRoot, file));
      if (
        !legacyT3CopyAllowlist.has(relativeFile) &&
        NodeFS.readFileSync(file, "utf8").includes("T3 Code")
      ) {
        failures.push(
          `Visible upstream brand reference found in ${relativeFile}; use Avi Code or explicitly allowlist compatibility copy.`,
        );
      }
    }
  }

  return { failures, warnings, activeBoundaries, plannedBoundaries };
}

export function formatGuardrailResult(result) {
  const lines = [
    `Active AviCode boundaries: ${result.activeBoundaries.join(", ") || "none"}`,
    `Planned AviCode boundaries: ${result.plannedBoundaries.join(", ") || "none"}`,
  ];
  for (const warning of result.warnings) lines.push(`WARNING: ${warning}`);
  for (const failure of result.failures) lines.push(`ERROR: ${failure}`);
  return lines.join("\n");
}

if (
  process.argv[1] &&
  NodePath.resolve(process.argv[1]) === NodeURL.fileURLToPath(import.meta.url)
) {
  const result = checkUpstreamGuardrails();
  process.stdout.write(`${formatGuardrailResult(result)}\n`);
  if (result.failures.length > 0) process.exitCode = 1;
}
