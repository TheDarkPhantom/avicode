import * as Effect from "effect/Effect";
import * as Semaphore from "effect/Semaphore";

/**
 * Serializes repository-mutating Git workflows, one at a time per repository.
 *
 * Nothing else in the server does this. Several threads told to do the same
 * work each finish and run their own commit / push / open-PR / auto-merge
 * sequence, and those sequences interleave: threads sharing a checkout race on
 * one index, and even threads in separate worktrees race on shared refs, the
 * remote branch, and the pull request. The only "who is merging" state that
 * existed lived in a browser atom, so no two agents could ever see each other.
 *
 * This turns simultaneous into sequential. It does not resolve the logical
 * conflict that the second thread's branch is stale once the first one merges
 * — that needs a rebase-or-fail policy on top.
 */

/** POSIX root, Windows drive root, or a UNC share. */
const ABSOLUTE_PATH_PATTERN = /^(?:[/\\]|[A-Za-z]:[/\\])/;

/**
 * Collapses `.`, `..`, duplicate separators, and any trailing separator.
 *
 * Hand-rolled rather than `node:path` because the key must not change shape
 * with the host OS — `path.win32` would rewrite separators and `path.resolve`
 * would graft the current drive onto a POSIX-looking path. It is pure string
 * work on two already-absolute paths, so there is nothing platform-specific
 * left to defer to.
 */
function normalizePathKey(raw: string): string {
  const slashed = raw.replaceAll("\\", "/");
  const isRooted = slashed.startsWith("/");
  const segments: string[] = [];
  for (const segment of slashed.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      const previous = segments.at(-1);
      if (previous !== undefined && previous !== "..") {
        segments.pop();
        continue;
      }
      // `..` above a rooted path has nowhere to go; drop it rather than let it
      // escape and make two different repositories share a key.
      if (isRooted) continue;
    }
    segments.push(segment);
  }
  const joined = segments.join("/");
  return isRooted ? `/${joined}` : joined;
}

/**
 * Every worktree of a repository reports the same `--git-common-dir`, so
 * keying on it (falling back to the checkout root when a driver could not
 * resolve it) makes all worktrees of one repository contend for one permit.
 * That is deliberate: separate worktrees have separate indexes but still share
 * the refs and the remote branch that concurrent agents actually collide on.
 */
export function repositoryLockKey(
  repository: {
    readonly metadataPath: string | null;
    readonly rootPath: string;
  },
  // Required rather than defaulted from `process.platform`: this module stays
  // pure, and the caller already sits in Effect where `HostProcessPlatform`
  // supplies the host platform (and lets tests provide it explicitly).
  options: { readonly platform: NodeJS.Platform },
): string {
  const metadataPath = repository.metadataPath;
  // `rev-parse --git-common-dir` may answer relatively (plain ".git" from the
  // checkout root), and the driver that fills `metadataPath` does not
  // absolutize it. Left alone, every repository would key on ".git" and share
  // one lock — a global merge lock rather than a per-repository one. Resolve
  // against the root, which `--show-toplevel` always reports absolutely.
  const raw =
    metadataPath === null
      ? repository.rootPath
      : ABSOLUTE_PATH_PATTERN.test(metadataPath)
        ? metadataPath
        : `${repository.rootPath}/${metadataPath}`;
  const normalized = normalizePathKey(raw);
  // Windows and macOS default to case-insensitive filesystems, where two
  // spellings of one path are one repository and must not buy two permits.
  return options.platform === "linux" ? normalized : normalized.toLowerCase();
}

/**
 * Bounded in practice by the number of repositories this server has touched,
 * so entries are never evicted: a permit must outlive any single action, and
 * dropping one while a caller holds it would silently unserialize the next.
 */
const semaphoresByKey = new Map<string, Semaphore.Semaphore>();

function semaphoreFor(key: string): Semaphore.Semaphore {
  const existing = semaphoresByKey.get(key);
  if (existing !== undefined) return existing;
  const created = Semaphore.makeUnsafe(1);
  semaphoresByKey.set(key, created);
  return created;
}

/**
 * Runs `action` while holding the repository's single permit. Effect releases
 * the permit on success, failure, and interruption alike, so an agent whose
 * turn is cancelled mid-push cannot strand every other thread on that repo.
 */
export function withRepositoryLock<A, E, R>(
  key: string,
  action: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> {
  return semaphoreFor(key).withPermits(1)(action);
}

/** Test seam: the registry is module state that would otherwise leak between cases. */
export function __resetRepositoryLocksForTests(): void {
  semaphoresByKey.clear();
}
