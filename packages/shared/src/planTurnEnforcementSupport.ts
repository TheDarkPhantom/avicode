/**
 * Avi Code addition: which provider drivers actually hold a plan turn to
 * planning.
 *
 * The authoritative answer is the adapter's `capabilities.planTurnEnforcement`,
 * which lives on the server. That capability is not on the config push stream,
 * so the client needs its own copy to describe plan mode honestly — this is
 * that copy, kept in one place so the two cannot drift silently. It mirrors
 * `sideQuestionSupport.ts`, which solves the same problem for `/btw`.
 *
 * Only the Claude adapter enforces anything: it refuses Edit, Write and
 * NotebookEdit for the duration of a plan turn, so a proposed plan waits for
 * the Implement button. Every other backend is left to police its own plan
 * mode, which this fork has not verified any of them do. Saying so in the
 * tooltip is the point: a Plan badge that silently means nothing is worse than
 * no badge at all.
 */
const PLAN_TURN_ENFORCING_DRIVERS: ReadonlySet<string> = new Set(["claudeAgent"]);

export function driverEnforcesPlanTurns(driverKind: string | null | undefined): boolean {
  return (
    driverKind !== null && driverKind !== undefined && PLAN_TURN_ENFORCING_DRIVERS.has(driverKind)
  );
}
