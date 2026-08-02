/**
 * Avi Code addition: wire contract for signing a Claude provider instance in
 * from inside the app.
 *
 * Upstream leaves this to the shell — an unauthenticated Claude instance shows
 * "Run `claude auth login` and try again" and the user is expected to find a
 * terminal, remember to export `CLAUDE_CONFIG_DIR` for that instance, and run
 * it themselves. This contract exposes the same CLI flow as an RPC so Settings
 * can drive it directly.
 *
 * The flow mirrors what `claude auth login --claudeai` actually does over plain
 * pipes: it prints an authorization URL, then blocks on stdin waiting for the
 * code the browser hands back. A rejected code is not fatal — the CLI reports
 * it and re-prompts — so `codeRejected` is a non-terminal event and the client
 * may submit again on the same session.
 *
 * @module claudeLogin
 */
import * as Schema from "effect/Schema";

import { TrimmedNonEmptyString } from "./baseSchemas.ts";
import { ProviderInstanceId } from "./providerInstance.ts";

/**
 * Codes are short (a base64url blob plus a `#`-delimited state), but the CLI
 * is the real validator. The bound only keeps a pasted essay off the wire.
 */
export const CLAUDE_LOGIN_MAX_CODE_LENGTH = 2_048;

export const ClaudeLoginStartInput = Schema.Struct({
  instanceId: ProviderInstanceId,
});
export type ClaudeLoginStartInput = typeof ClaudeLoginStartInput.Type;

export const ClaudeLoginSubmitCodeInput = Schema.Struct({
  instanceId: ProviderInstanceId,
  code: TrimmedNonEmptyString.check(Schema.isMaxLength(CLAUDE_LOGIN_MAX_CODE_LENGTH)),
});
export type ClaudeLoginSubmitCodeInput = typeof ClaudeLoginSubmitCodeInput.Type;

/** The login process is running; no URL has been parsed yet. */
const ClaudeLoginStartedEvent = Schema.Struct({
  type: Schema.Literal("started"),
});

/**
 * The CLI opened this URL in the server's browser and printed it as a
 * fallback. The client shows it so a user on a machine where the browser did
 * not open (or who is driving a remote environment) can still complete it.
 */
const ClaudeLoginAuthorizationUrlEvent = Schema.Struct({
  type: Schema.Literal("authorizationUrl"),
  url: TrimmedNonEmptyString,
});

/** The CLI is blocked on stdin. `claudeLogin.submitCode` is now meaningful. */
const ClaudeLoginAwaitingCodeEvent = Schema.Struct({
  type: Schema.Literal("awaitingCode"),
});

/** Non-terminal: the CLI rejected the code and is prompting again. */
const ClaudeLoginCodeRejectedEvent = Schema.Struct({
  type: Schema.Literal("codeRejected"),
  message: TrimmedNonEmptyString,
});

/**
 * Terminal. `email` is read back from `claude auth status` rather than scraped
 * from the login output, so it reflects the credential actually persisted to
 * this instance's config directory.
 */
const ClaudeLoginSucceededEvent = Schema.Struct({
  type: Schema.Literal("succeeded"),
  email: Schema.NullOr(TrimmedNonEmptyString),
});

/** Terminal. Covers a non-zero exit and a clean exit that left no credential. */
const ClaudeLoginFailedEvent = Schema.Struct({
  type: Schema.Literal("failed"),
  message: TrimmedNonEmptyString,
});

export const ClaudeLoginStreamEvent = Schema.Union([
  ClaudeLoginStartedEvent,
  ClaudeLoginAuthorizationUrlEvent,
  ClaudeLoginAwaitingCodeEvent,
  ClaudeLoginCodeRejectedEvent,
  ClaudeLoginSucceededEvent,
  ClaudeLoginFailedEvent,
]);
export type ClaudeLoginStreamEvent = typeof ClaudeLoginStreamEvent.Type;

/**
 * The instance id does not resolve to a configured Claude instance. Also
 * covers an id that exists but belongs to another driver, since the login flow
 * is Claude-specific.
 */
export class ClaudeLoginUnsupportedInstanceError extends Schema.TaggedErrorClass<ClaudeLoginUnsupportedInstanceError>()(
  "ClaudeLoginUnsupportedInstanceError",
  {
    instanceId: Schema.String,
  },
) {
  override get message(): string {
    return `No Claude provider instance is configured with id: ${this.instanceId}`;
  }
}

/** `submitCode` arrived with no live login session for that instance. */
export class ClaudeLoginNotRunningError extends Schema.TaggedErrorClass<ClaudeLoginNotRunningError>()(
  "ClaudeLoginNotRunningError",
  {
    instanceId: Schema.String,
  },
) {
  override get message(): string {
    return `No Claude sign-in is in progress for instance: ${this.instanceId}`;
  }
}

/** The CLI could not be started, or died before the flow could begin. */
export class ClaudeLoginProcessError extends Schema.TaggedErrorClass<ClaudeLoginProcessError>()(
  "ClaudeLoginProcessError",
  {
    detail: Schema.String,
  },
) {
  override get message(): string {
    return this.detail;
  }
}

export const ClaudeLoginError = Schema.Union([
  ClaudeLoginUnsupportedInstanceError,
  ClaudeLoginNotRunningError,
  ClaudeLoginProcessError,
]);
export type ClaudeLoginError = typeof ClaudeLoginError.Type;
