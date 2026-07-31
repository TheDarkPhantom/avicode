import { assert, it, vi } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http";
import { VOICE_TOKEN_TTL_SECONDS } from "@t3tools/contracts";

import { createVoiceToken } from "./VoiceTokenService.ts";

const makeHttpLayer = (respond: (request: HttpClientRequest.HttpClientRequest) => Response) => {
  const execute = vi.fn((request: HttpClientRequest.HttpClientRequest) =>
    Effect.succeed(HttpClientResponse.fromWeb(request, respond(request))),
  );
  return {
    execute,
    layer: Layer.succeed(
      HttpClient.HttpClient,
      HttpClient.make((request) => execute(request)),
    ),
  };
};

const grantResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

it("fails without reaching Deepgram when no key is configured", () =>
  Effect.gen(function* () {
    const { execute, layer } = makeHttpLayer(() => grantResponse({}));
    const error = yield* Effect.flip(createVoiceToken("").pipe(Effect.provide(layer)));
    assert.equal(error._tag, "VoiceNotConfiguredError");
    assert.equal(execute.mock.calls.length, 0);
  }).pipe(Effect.runPromise));

it("exchanges the API key for a short-lived token", () =>
  Effect.gen(function* () {
    const { execute, layer } = makeHttpLayer(() =>
      grantResponse({ access_token: "jwt-abc", expires_in: 60 }),
    );

    const result = yield* createVoiceToken("dg-key").pipe(Effect.provide(layer));
    assert.deepEqual(result, { accessToken: "jwt-abc", expiresIn: 60 });

    const request = execute.mock.calls[0]?.[0];
    assert.isDefined(request);
    assert.equal(request.method, "POST");
    assert.equal(request.url, "https://api.deepgram.com/v1/auth/grant");
    // Deepgram authenticates the grant call with the raw key using the `Token`
    // scheme; `Bearer` is for the JWT it returns.
    assert.equal(request.headers.authorization, "Token dg-key");
  }).pipe(Effect.runPromise));

it("asks for the TTL the contract advertises", () =>
  Effect.gen(function* () {
    const { execute, layer } = makeHttpLayer(() =>
      grantResponse({ access_token: "jwt-abc", expires_in: VOICE_TOKEN_TTL_SECONDS }),
    );
    yield* createVoiceToken("dg-key").pipe(Effect.provide(layer));

    const body = execute.mock.calls[0]?.[0]?.body;
    assert.isDefined(body);
    assert.include(
      new TextDecoder().decode((body as { body: Uint8Array }).body),
      `"ttl_seconds":${VOICE_TOKEN_TTL_SECONDS}`,
    );
  }).pipe(Effect.runPromise));

it("reports a rejected key distinctly from a transport problem", () =>
  Effect.gen(function* () {
    const { layer } = makeHttpLayer(() => grantResponse({ err_code: "INVALID_AUTH" }, 401));
    const error = yield* Effect.flip(createVoiceToken("bad-key").pipe(Effect.provide(layer)));
    assert.equal(error._tag, "VoiceTokenRejectedError");
    // The message steers the user to the setting that is actually wrong.
    assert.include(error.message, "Settings");
  }).pipe(Effect.runPromise));

it("names the permission problem when Deepgram forbids the grant", () =>
  Effect.gen(function* () {
    const { layer } = makeHttpLayer(() =>
      grantResponse({ err_code: "FORBIDDEN", err_msg: "Insufficient permissions." }, 403),
    );
    const error = yield* Effect.flip(
      createVoiceToken("member-less-key").pipe(Effect.provide(layer)),
    );
    assert.equal(error._tag, "VoiceTokenRejectedError");
    // A 403 key transcribes fine, so "check your key" sends the user looking
    // in the wrong place. The permission it lacks has to be named.
    assert.include(error.message, "Member permissions");
  }).pipe(Effect.runPromise));

it("surfaces a non-auth failure status", () =>
  Effect.gen(function* () {
    const { layer } = makeHttpLayer(() => grantResponse({}, 500));
    const error = yield* Effect.flip(createVoiceToken("dg-key").pipe(Effect.provide(layer)));
    assert.equal(error._tag, "VoiceTokenRejectedError");
    assert.include(error.message, "500");
  }).pipe(Effect.runPromise));

it("treats an unreadable success body as a request failure", () =>
  Effect.gen(function* () {
    const { layer } = makeHttpLayer(
      () => new Response("not json", { status: 200, headers: { "content-type": "text/plain" } }),
    );
    const error = yield* Effect.flip(createVoiceToken("dg-key").pipe(Effect.provide(layer)));
    assert.equal(error._tag, "VoiceTokenRequestError");
  }).pipe(Effect.runPromise));
