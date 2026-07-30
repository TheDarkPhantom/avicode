/**
 * Avi Code addition: which provider drivers can answer a `/btw` side question.
 *
 * The authoritative answer is the adapter's `capabilities.sideQuestion`, which
 * lives on the server. That capability is not on the config push stream, so the
 * client needs its own copy to decide whether to offer the command — this is
 * that copy, kept in one place so the two cannot drift silently.
 *
 * The client check only hides the command. A provider that cannot branch its
 * conversation still fails loudly if the RPC is called anyway, so being wrong
 * here degrades discoverability, never correctness.
 */
const SIDE_QUESTION_DRIVERS: ReadonlySet<string> = new Set(["claudeAgent"]);

export function driverSupportsSideQuestion(driverKind: string | null | undefined): boolean {
  return driverKind !== null && driverKind !== undefined && SIDE_QUESTION_DRIVERS.has(driverKind);
}
