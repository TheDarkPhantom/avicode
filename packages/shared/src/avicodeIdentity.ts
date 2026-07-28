/**
 * AviCode's public identity boundary.
 *
 * Keep upstream-compatible internal package and environment-variable names elsewhere.
 * User-visible names, OS identity, storage roots, protocols, telemetry origin, and
 * release ownership must come from this module (or the JSON-safe mirror used by the
 * standalone Electron launcher).
 */
export const AVICODE_IDENTITY = Object.freeze({
  productName: "Avi Code",
  companyName: "Advisor Avi",
  appId: "com.advisoravi.avicode",
  developmentAppId: "com.advisoravi.avicode.dev",
  protocol: "avicode",
  developmentProtocol: "avicode-dev",
  homeDirectoryName: ".avicode",
  userDataDirectoryName: "avicode",
  developmentUserDataDirectoryName: "avicode-dev",
  executableName: "AviCode",
  artifactName: "AviCode-${version}-${arch}.${ext}",
  sessionOriginator: "avicode_desktop",
  releaseOwner: "TheDarkPhantom",
  releaseRepository: "avicode",
  releaseSlug: "TheDarkPhantom/avicode",
  upstreamRepository: "pingdotgg/t3code",
} as const);

export type AviCodeIdentity = typeof AVICODE_IDENTITY;

export function formatAviCodeDisplayName(stage: "Alpha" | "Dev" | "Nightly"): string {
  return `${AVICODE_IDENTITY.productName} (${stage})`;
}
