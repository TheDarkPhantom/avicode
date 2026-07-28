import { type ServerConfig, WS_METHODS } from "@t3tools/contracts";
import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Ref from "effect/Ref";
import * as Schedule from "effect/Schedule";
import type * as Scope from "effect/Scope";
import * as RpcClient from "effect/unstable/rpc/RpcClient";
import * as RpcSerialization from "effect/unstable/rpc/RpcSerialization";
import * as Socket from "effect/unstable/socket/Socket";

import { makeWsRpcProtocolClient, type WsRpcProtocolClient } from "./protocol.ts";
import type {
  ConnectionAttemptError,
  ConnectionTransientError,
  PreparedConnection,
} from "../connection/model.ts";
import {
  ConnectionBlockedError,
  ConnectionTransientError as ConnectionTransientErrorClass,
} from "../connection/model.ts";

const SOCKET_OPEN_TIMEOUT = "15 seconds";
const HEARTBEAT_INTERVAL = "15 seconds";
const MAX_MISSED_PONGS = 3;

interface HeartbeatDiagnostic {
  readonly lastPingAtMs: number | null;
  readonly lastPongAtMs: number | null;
  readonly timedOutAtMs: number | null;
}

interface SocketCloseDiagnostic {
  readonly bufferedAmount: number;
  readonly code: number;
  readonly extensions: string;
  readonly wasClean: boolean;
}

export interface RpcSession {
  readonly client: WsRpcProtocolClient;
  readonly initialConfig: Effect.Effect<ServerConfig, ConnectionAttemptError>;
  readonly ready: Effect.Effect<void, ConnectionAttemptError>;
  readonly probe: Effect.Effect<void, ConnectionAttemptError>;
  readonly closed: Effect.Effect<never, ConnectionTransientError>;
}

export class RpcSessionFactory extends Context.Service<
  RpcSessionFactory,
  {
    readonly connect: (
      connection: PreparedConnection,
    ) => Effect.Effect<RpcSession, ConnectionAttemptError, Scope.Scope>;
  }
>()("@t3tools/client-runtime/rpc/session/RpcSessionFactory") {}

type InitialConfigError = Effect.Error<
  ReturnType<WsRpcProtocolClient[typeof WS_METHODS.serverGetConfig]>
>;
type ProbeError = Effect.Error<ReturnType<WsRpcProtocolClient[typeof WS_METHODS.serverProbe]>>;

function mapSessionRpcError(error: InitialConfigError | ProbeError): ConnectionAttemptError {
  switch (error._tag) {
    case "EnvironmentAuthorizationError":
      return new ConnectionBlockedError({
        reason: "permission",
        detail: error.message,
      });
    case "KeybindingsConfigParseError":
    case "ServerSettingsError":
      return new ConnectionTransientErrorClass({
        reason: "remote-unavailable",
        detail: error.message,
      });
    case "RpcClientError":
      return new ConnectionTransientErrorClass({
        reason: "transport",
        detail: error.message,
      });
  }
}

export const make = Effect.gen(function* () {
  const webSocketConstructor = yield* Socket.WebSocketConstructor;

  const connect = Effect.fnUntraced(function* (connection: PreparedConnection) {
    yield* Effect.annotateCurrentSpan({
      "connection.environment.id": connection.environmentId,
    });

    const connected = yield* Deferred.make<void>();
    const disconnected = yield* Deferred.make<never, ConnectionTransientError>();
    const connectedAtMs = yield* Clock.currentTimeMillis;
    const heartbeatDiagnostic = yield* Ref.make<HeartbeatDiagnostic>({
      lastPingAtMs: null,
      lastPongAtMs: null,
      timedOutAtMs: null,
    });
    let socketCloseDiagnostic: SocketCloseDiagnostic | null = null;
    let socketErrorObserved = false;
    const diagnosticWebSocketConstructor = (url: string, protocols?: string | Array<string>) => {
      const socket = webSocketConstructor(url, protocols);
      socket.addEventListener(
        "close",
        (event) => {
          socketCloseDiagnostic = {
            bufferedAmount: socket.bufferedAmount,
            code: event.code,
            extensions: socket.extensions,
            wasClean: event.wasClean,
          };
        },
        { once: true },
      );
      socket.addEventListener(
        "error",
        () => {
          socketErrorObserved = true;
        },
        { once: true },
      );
      return socket;
    };
    const hooks = RpcClient.ConnectionHooks.of({
      onConnect: Deferred.succeed(connected, undefined).pipe(Effect.asVoid),
      onDisconnect: Effect.gen(function* () {
        const wasConnected = yield* Deferred.isDone(connected);
        const now = yield* Clock.currentTimeMillis;
        const heartbeat = yield* Ref.get(heartbeatDiagnostic);
        const timedOut = heartbeat.timedOutAtMs !== null;
        if (wasConnected) {
          yield* Effect.logWarning("Environment WebSocket disconnected.").pipe(
            Effect.annotateLogs({
              "environment.id": connection.environmentId,
              "environment.label": connection.label,
              "websocket.session_lifetime_ms": now - connectedAtMs,
              "websocket.close_code": socketCloseDiagnostic?.code ?? "unavailable",
              "websocket.close_clean": socketCloseDiagnostic?.wasClean ?? "unavailable",
              "websocket.buffered_amount": socketCloseDiagnostic?.bufferedAmount ?? "unavailable",
              "websocket.extensions": socketCloseDiagnostic?.extensions ?? "",
              "websocket.error_observed": socketErrorObserved,
              "websocket.heartbeat_timeout": timedOut,
              "websocket.last_ping_at_ms": heartbeat.lastPingAtMs ?? "unavailable",
              "websocket.last_pong_at_ms": heartbeat.lastPongAtMs ?? "unavailable",
            }),
          );
        }
        yield* Deferred.fail(
          disconnected,
          new ConnectionTransientErrorClass({
            reason: timedOut ? "timeout" : "transport",
            detail: timedOut
              ? `${connection.label} timed out waiting for a heartbeat response.`
              : wasConnected
                ? `${connection.label} disconnected.`
                : `${connection.label} could not establish a WebSocket connection.`,
          }),
        );
      }).pipe(Effect.asVoid),
      onPing: Clock.currentTimeMillis.pipe(
        Effect.flatMap((lastPingAtMs) =>
          Ref.update(heartbeatDiagnostic, (current) => ({ ...current, lastPingAtMs })),
        ),
      ),
      onPong: Clock.currentTimeMillis.pipe(
        Effect.flatMap((lastPongAtMs) =>
          Ref.update(heartbeatDiagnostic, (current) => ({ ...current, lastPongAtMs })),
        ),
      ),
      onPingTimeout: Effect.gen(function* () {
        const timedOutAtMs = yield* Clock.currentTimeMillis;
        const heartbeat = yield* Ref.updateAndGet(heartbeatDiagnostic, (current) => ({
          ...current,
          timedOutAtMs,
        }));
        yield* Effect.logWarning("Environment WebSocket heartbeat timed out.").pipe(
          Effect.annotateLogs({
            "environment.id": connection.environmentId,
            "environment.label": connection.label,
            "websocket.ping_interval_ms": 15_000,
            "websocket.max_missed_pongs": MAX_MISSED_PONGS,
            "websocket.last_ping_at_ms": heartbeat.lastPingAtMs ?? "unavailable",
            "websocket.last_pong_at_ms": heartbeat.lastPongAtMs ?? "unavailable",
          }),
        );
      }),
    });
    const socketLayer = Socket.layerWebSocket(connection.socketUrl, {
      openTimeout: SOCKET_OPEN_TIMEOUT,
    }).pipe(
      Layer.provide(Layer.succeed(Socket.WebSocketConstructor, diagnosticWebSocketConstructor)),
    );
    const protocolLayer = Layer.effect(
      RpcClient.Protocol,
      RpcClient.makeProtocolSocket({
        maxMissedPongs: MAX_MISSED_PONGS,
        pingInterval: HEARTBEAT_INTERVAL,
        retryTransientErrors: false,
        retryPolicy: Schedule.recurs(0),
      }),
    ).pipe(
      Layer.provide(
        Layer.mergeAll(
          socketLayer,
          RpcSerialization.layerJson,
          Layer.succeed(RpcClient.ConnectionHooks, hooks),
        ),
      ),
    );
    const protocolContext = yield* Layer.build(protocolLayer).pipe(
      Effect.withSpan("environment.websocket.connect"),
    );
    const client = yield* makeWsRpcProtocolClient.pipe(Effect.provide(protocolContext));
    const initialConfig = yield* Effect.cached(
      client[WS_METHODS.serverGetConfig]({}).pipe(
        Effect.mapError(mapSessionRpcError),
        Effect.withSpan("environment.initialSync"),
      ),
    );
    const probe = initialConfig.pipe(
      Effect.flatMap((config) =>
        (config.environment.capabilities.connectionProbe === true
          ? client[WS_METHODS.serverProbe]({})
          : client[WS_METHODS.serverGetConfig]({})
        ).pipe(Effect.mapError(mapSessionRpcError)),
      ),
      Effect.asVoid,
      Effect.withSpan("clientRuntime.connection.rpcSession.probe"),
    );

    return {
      client,
      initialConfig,
      ready: Deferred.await(connected).pipe(
        Effect.andThen(initialConfig),
        Effect.asVoid,
        Effect.raceFirst(Deferred.await(disconnected)),
      ),
      probe,
      closed: Deferred.await(disconnected),
    } satisfies RpcSession;
  });

  return RpcSessionFactory.of({ connect });
});

export const layer = Layer.effect(RpcSessionFactory, make);
