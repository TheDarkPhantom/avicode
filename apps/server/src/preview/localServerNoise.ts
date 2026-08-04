/**
 * Avi Code addition: keep the browser panel to servers Avi Code started.
 *
 * The Windows probe is `Get-NetTCPConnection -State Listen`, which returns every
 * listening socket on the machine; `lsof` on macOS and Linux has the same shape.
 * On a normal desktop that is dominated by the operating system and by vendor
 * tools — lighting daemons, peripheral updaters, VPN clients, game launchers —
 * and they buried the one dev server the user actually wanted.
 *
 * This filter used to guess, with a process-name blocklist and a port range.
 * Guessing lost twice: each round of reports named binaries nobody had thought
 * of, and the next tool installed brought the problem back. Probing for HTTP
 * would not have helped either, because several of the offenders (an activity
 * tracker, a vendor debug server) really do serve pages.
 *
 * So the rule is provenance rather than shape: a listener is offered when an
 * Avi Code terminal owns the process, and otherwise it is not, whatever port it
 * sits on and whatever it is called. The trade-off is deliberate — a dev server
 * started outside the app no longer appears on its own, and is reached by typing
 * its URL into the panel's address bar.
 *
 * @module preview/localServerNoise
 */

export interface LocalServerNoiseCandidate {
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
export const isBrowsableLocalServer = (server: LocalServerNoiseCandidate): boolean =>
  server.terminal !== null && server.terminal !== undefined;

export const filterBrowsableLocalServers = <T extends LocalServerNoiseCandidate>(
  servers: ReadonlyArray<T>,
): ReadonlyArray<T> => servers.filter(isBrowsableLocalServer);
