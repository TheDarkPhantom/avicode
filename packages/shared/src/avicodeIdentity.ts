/**
 * Avi Code 2's public identity. User-visible names, OS identity, storage roots, protocols and
 * release ownership come from here; upstream-compatible internal names (packages, env vars)
 * stay as they are. The standalone Electron launcher script mirrors these values by hand.
 */
export const AVICODE_IDENTITY = Object.freeze({
  productName: "Avi Code 2",
  companyName: "Advisor Avi",
  /** Vendor segment of the admin policy registry key and Group Policy namespace. */
  policyVendor: "AdvisorAvi",
  appId: "com.advisoravi.avicode2",
  developmentAppId: "com.advisoravi.avicode2.dev",
  protocol: "avicode2",
  developmentProtocol: "avicode2-dev",
  homeDirectoryName: ".avicode2",
  userDataDirectoryName: "avicode2",
  developmentUserDataDirectoryName: "avicode2-dev",
  cacheDirectoryName: "avicode2",
  executableName: "AviCode2",
  artifactName: "AviCode2-${version}-${arch}.${ext}",
  cliCommandName: "avicode",
  sessionOriginator: "avicode_desktop",
  releaseOwner: "TheDarkPhantom",
  releaseRepository: "avicode",
  releaseSlug: "TheDarkPhantom/avicode",
  upstreamRepository: "pingdotgg/t3code",
  /** T3 Connect onboarding, the mobile app row and the GitHub star prompt promote T3 Code. */
  showsUpstreamPromotions: false as boolean,
  /** The first Avi Code, frozen on `legacy/v1`. Its data is read once for the history import. */
  legacy: Object.freeze({
    productName: "Avi Code",
    homeDirectoryName: ".avicode",
    userDataDirectoryName: "avicode",
  }),
} as const);

export type AviCodeIdentity = typeof AVICODE_IDENTITY;
