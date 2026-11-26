// Fails when an upstream sync drops Avi Code's identity, branding, release or privacy changes.
// The protected values live in .avicode/upstream-guardrails.json.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

const scriptDirectory = NodePath.dirname(NodeURL.fileURLToPath(import.meta.url));
export const defaultRepositoryRoot = NodePath.resolve(scriptDirectory, "../..");
export const registryFile = ".avicode/upstream-guardrails.json";

function read(repositoryRoot, relativeFile) {
  const file = NodePath.join(repositoryRoot, ...relativeFile.split("/"));
  return NodeFS.existsSync(file) ? NodeFS.readFileSync(file, "utf8") : undefined;
}

function filesUnder(repositoryRoot, relativePath) {
  const path = NodePath.join(repositoryRoot, ...relativePath.split("/"));
  if (!NodeFS.existsSync(path)) return [];
  if (!NodeFS.statSync(path).isDirectory()) return [relativePath];
  return NodeFS.readdirSync(path, { withFileTypes: true }).flatMap((entry) =>
    filesUnder(repositoryRoot, `${relativePath}/${entry.name}`),
  );
}

// The `on:` block of a workflow: everything from `on:` up to the next top-level key.
function workflowTriggers(contents) {
  const lines = contents.split(/\r?\n/u);
  const start = lines.findIndex((line) => /^on:\s*$/u.test(line));
  if (start === -1) return undefined;
  const triggers = [];
  for (const line of lines.slice(start + 1)) {
    if (/^\S/u.test(line)) break;
    const trigger = /^ {2}([a-z_]+):/u.exec(line);
    if (trigger) triggers.push(trigger[1]);
  }
  return triggers;
}

function checkBoundary(repositoryRoot, boundary, failures) {
  const fail = (message) => failures.push(`${boundary.id}: ${message}`);

  for (const file of boundary.requiredFiles ?? []) {
    if (read(repositoryRoot, file) === undefined) fail(`${file} is missing.`);
  }

  for (const requirement of boundary.requiredText ?? []) {
    const contents = read(repositoryRoot, requirement.file);
    if (contents === undefined) {
      fail(`${requirement.file} is missing.`);
      continue;
    }
    for (const value of requirement.values ?? []) {
      if (!contents.includes(value)) fail(`${requirement.file} lost ${JSON.stringify(value)}.`);
    }
    for (const value of requirement.forbiddenValues ?? []) {
      if (contents.includes(value))
        fail(`${requirement.file} must not contain ${JSON.stringify(value)}.`);
    }
  }

  for (const file of boundary.manualOnlyWorkflows ?? []) {
    const contents = read(repositoryRoot, file);
    if (contents === undefined) continue;
    const triggers = workflowTriggers(contents);
    if (!triggers || triggers.length !== 1 || triggers[0] !== "workflow_dispatch") {
      fail(`${file} must run only on workflow_dispatch (found ${triggers?.join(", ") || "none"}).`);
    }
  }
}

function checkBrandBan(repositoryRoot, brandBan, failures) {
  const allowedLines = brandBan.allowedLines ?? {};
  for (const path of brandBan.paths ?? []) {
    for (const file of filesUnder(repositoryRoot, path)) {
      const allowed = new Set(allowedLines[file] ?? []);
      read(repositoryRoot, file)
        .split(/\r?\n/u)
        .forEach((line, index) => {
          if (line.includes(brandBan.text) && !allowed.has(line.trim())) {
            failures.push(
              `brand: ${file}:${index + 1} says ${JSON.stringify(brandBan.text)}. Use Avi Code, or allowlist factual attribution in ${registryFile}.`,
            );
          }
        });
    }
  }
}

export function checkUpstreamGuardrails(repositoryRoot = defaultRepositoryRoot) {
  const contents = read(repositoryRoot, registryFile);
  if (contents === undefined) return { failures: [`${registryFile} is missing.`], boundaries: [] };

  const registry = JSON.parse(contents);
  const boundaries = registry.boundaries ?? [];
  const failures = [];
  for (const boundary of boundaries) checkBoundary(repositoryRoot, boundary, failures);
  if (registry.brandBan) checkBrandBan(repositoryRoot, registry.brandBan, failures);
  return { failures, boundaries: boundaries.map((boundary) => boundary.id) };
}

export function formatGuardrailResult(result) {
  return [
    `Avi Code boundaries: ${result.boundaries.join(", ") || "none"}`,
    ...result.failures.map((failure) => `ERROR: ${failure}`),
  ].join("\n");
}

if (
  process.argv[1] &&
  NodePath.resolve(process.argv[1]) === NodeURL.fileURLToPath(import.meta.url)
) {
  const result = checkUpstreamGuardrails();
  process.stdout.write(`${formatGuardrailResult(result)}\n`);
  if (result.failures.length > 0) process.exitCode = 1;
}
