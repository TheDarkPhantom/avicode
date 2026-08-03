/**
 * Avi Code addition: keep the browser panel to things that could be a website.
 *
 * The Windows probe is `Get-NetTCPConnection -State Listen`, which returns every
 * listening socket on the machine. On a normal desktop that is dominated by the
 * operating system — `lsass`, `svchost`, `spoolsv`, `wininit`, `services` — plus
 * whatever games and vendor tools are running. None of those speak HTTP, so the
 * panel offered a list of things that cannot be opened and buried the one dev
 * server the user actually wanted. `lsof` on macOS and Linux has the same shape.
 *
 * The rules are deliberately permissive in one direction: anything Avi Code
 * started itself is always kept, whatever port it landed on, because that is by
 * definition a server the user launched. Everything else has to look like a
 * developer's server rather than an OS internal.
 *
 * @module preview/localServerNoise
 */

/**
 * Ports below this are privileged and, in practice, system services. A dev
 * server on 80 or 443 is possible but needs elevation and is rare enough that
 * excluding it beats listing `epmap` and SMB on every machine.
 */
const MIN_PLAUSIBLE_PORT = 1024;

/**
 * Windows' dynamic/ephemeral range, also used by RPC endpoint mapper clients.
 * Everything in the reported screenshots above 49152 was an OS service; a dev
 * server that lands here was still started by us and is kept by the owner rule.
 */
const MIN_EPHEMERAL_PORT = 49152;

/**
 * Processes known not to serve a browsable page. Lower-cased, matched exactly
 * against the reported process name. A blocklist rather than an allowlist so an
 * unrecognised binary listening on 3000 still shows up: missing someone's
 * hand-rolled server is worse than showing one extra row.
 */
const NON_WEB_PROCESS_NAMES: ReadonlySet<string> = new Set([
  // Windows
  "system",
  "idle",
  "svchost",
  "lsass",
  "services",
  "wininit",
  "winlogon",
  "csrss",
  "smss",
  "spoolsv",
  "searchindexer",
  "msmpeng",
  "sqlservr",
  "jhi_service",
  "armourycrateservice",
  "armourycratecontrolinterface",
  "asussoftwaremanager",
  "asussystemanalysis",
  "lightingservice",
  "rtkauduservice",
  "nvcontainer",
  "steam",
  "steamwebhelper",
  // macOS and Linux
  "launchd",
  "rapportd",
  "sharingd",
  "controlce",
  "systemd",
  "systemd-resolve",
  "cupsd",
  "avahi-daemon",
  "sshd",
  "rpcbind",
  "dnsmasq",
]);

export interface LocalServerNoiseCandidate {
  readonly port: number;
  readonly processName: string | null;
  /** Non-null when an Avi Code terminal owns the listening process. */
  readonly terminal: unknown;
}

/**
 * Whether a discovered listener is worth offering in the browser panel.
 *
 * Exported for tests and for callers that hold a richer server type; the shape
 * is intentionally structural so both the scanner rows and the client's
 * `PreviewableServer` satisfy it.
 */
export const isBrowsableLocalServer = (server: LocalServerNoiseCandidate): boolean => {
  // Ours. Whatever it is and wherever it listens, the user started it here.
  if (server.terminal !== null && server.terminal !== undefined) return true;

  if (server.port < MIN_PLAUSIBLE_PORT) return false;
  if (server.port >= MIN_EPHEMERAL_PORT) return false;

  const processName = server.processName?.trim().toLowerCase();
  if (!processName) return true;
  // `.exe` is present on some Windows probes and absent on others.
  const normalized = processName.endsWith(".exe") ? processName.slice(0, -4) : processName;
  return !NON_WEB_PROCESS_NAMES.has(normalized);
};

export const filterBrowsableLocalServers = <T extends LocalServerNoiseCandidate>(
  servers: ReadonlyArray<T>,
): ReadonlyArray<T> => servers.filter(isBrowsableLocalServer);
