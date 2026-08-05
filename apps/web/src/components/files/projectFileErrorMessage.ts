import type { ProjectFileFailure, ProjectFileOperation } from "@t3tools/contracts";

/**
 * Avi Code addition: says what actually went wrong when a file will not open.
 *
 * The server already sends a `failure` discriminator and the `operation` that
 * failed, but the panel only ever rendered `message`, which is the same
 * "Failed to read workspace file 'x' in 'y'." sentence for every cause. A file
 * that simply is not there read exactly like a permissions problem or a
 * containment rejection, which sent people looking in the wrong place.
 */
interface ProjectFileErrorLike {
  readonly _tag?: unknown;
  readonly failure?: ProjectFileFailure | undefined;
  readonly operation?: ProjectFileOperation | undefined;
  readonly relativePath?: string | undefined;
  readonly cwd?: string | undefined;
  // Avi Code addition: the server stamps this when the target does not exist, so
  // the reader no longer has to sniff a `cause` whose platform code the wire drops.
  readonly notFound?: boolean | undefined;
  readonly message?: unknown;
  readonly cause?: unknown;
}

/** Operations that touch the target path, so ENOENT there means "not found". */
const TARGET_OPERATIONS: ReadonlySet<ProjectFileOperation> = new Set([
  "realpath-target",
  "open",
  "stat",
  "read",
]);

function isProjectFileError(value: unknown): value is ProjectFileErrorLike {
  if (typeof value !== "object" || value === null) return false;
  const tag = (value as { _tag?: unknown })._tag;
  return (
    tag === "ProjectReadFileError" ||
    tag === "ProjectWriteFileError" ||
    tag === "ProjectListEntriesError" ||
    tag === "ProjectSearchEntriesError"
  );
}

function causeCode(cause: unknown): string | null {
  if (typeof cause !== "object" || cause === null) return null;
  const direct = (cause as { code?: unknown }).code;
  if (typeof direct === "string") return direct;
  const nested = (cause as { cause?: unknown }).cause;
  return nested === undefined ? null : causeCode(nested);
}

function looksMissing(error: ProjectFileErrorLike): boolean {
  // Avi Code addition: newer servers stamp this reliably; the heuristics below
  // stay only so a read against a legacy server still resolves to "not found".
  if (error.notFound === true) return true;
  if (error.operation && !TARGET_OPERATIONS.has(error.operation)) return false;
  const code = causeCode(error.cause);
  if (code === "ENOENT" || code === "ENOTDIR") return true;
  // Effect wraps the platform error, so fall back to the text it carries.
  return /\bENOENT\b|no such file or directory/i.test(String(error.cause ?? ""));
}

function fallbackMessage(error: ProjectFileErrorLike): string {
  return typeof error.message === "string" && error.message.length > 0
    ? error.message
    : "Workspace query failed.";
}

/**
 * Avi Code addition: whether the read got as far as the target and failed there,
 * which is the one shape that means the same relative path might resolve in a
 * different repo. Containment, folder, and binary failures all say the path was
 * reached, so looking elsewhere for those would be wrong.
 *
 * Deliberately wider than {@link describeProjectFileError}'s missing-file test:
 * the platform error's `code` does not survive the wire, so a caller that
 * demanded a confirmed ENOENT would miss the case it exists for.
 */
export function isProjectFileTargetUnreachable(value: unknown): boolean {
  if (!isProjectFileError(value)) return false;
  if (value.failure !== "operation_failed") return false;
  return value.operation !== undefined && TARGET_OPERATIONS.has(value.operation);
}

/**
 * Avi Code addition: whether the read failed specifically because the target
 * does not exist. Narrower than {@link isProjectFileTargetUnreachable}, which
 * also fires on permissions and other reachable-but-failed reads: this is the
 * signal that a file an agent is about to write will appear on a later read, and
 * the one that should gate the cross-repo reroot so a transient miss is not
 * mistaken for a wrong-repo path.
 */
export function isProjectFileMissing(value: unknown): boolean {
  if (!isProjectFileError(value)) return false;
  return looksMissing(value);
}

/**
 * A sentence worth showing the user, or `null` when the cause is unrecognised
 * and the caller should keep whatever it already had.
 */
export function describeProjectFileError(value: unknown): string | null {
  if (!isProjectFileError(value)) return null;
  const target = value.relativePath ?? "That file";

  switch (value.failure) {
    case "workspace_path_outside_root":
    case "resolved_path_outside_root":
      return `${target} is outside ${value.cwd ?? "this folder"}.`;
    case "path_not_file":
      return `${target} is a folder, not a file.`;
    case "binary_file":
      return `${target} is a binary file, so there is nothing to show.`;
    case "operation_failed":
      return looksMissing(value) ? `File not found: ${target}` : fallbackMessage(value);
    default:
      return null;
  }
}
