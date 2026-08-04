# Upstream orchestration V2 merge prep

`pingdotgg/t3code#2829` replaces the V1 orchestration engine wholesale: 810 files, +154k/−74k as of
2026-07-31. It is the largest upstream change this fork will ever take, and the weekly
`sync-upstream.yml` will most likely surface it as an `upstream-sync-blocked` issue rather than a
clean PR.

This document is the inventory of **what the fork owns inside that blast radius**, so the merge is
a checklist rather than a rediscovery. It is written before the merge on purpose. Every entry
records what the fork does, why, and how expensive it is to re-express on V2.

**Last updated:** 2026-08-04, against `upstream/main` at the time of writing.

## How to read the cost column

- **Free** — the code lives in a fork-owned file. Upstream cannot conflict with it. The only work is
  re-pointing it at whatever V1 API it used.
- **Cheap** — a thin branch, an added field, or a single call site in an upstream file. Conflicts
  are mechanical.
- **Expensive** — fork logic interleaved with upstream orchestration. These are the entries worth
  attacking **before** the merge, by moving the logic into a fork-owned file. Anything extracted
  today is a conflict that never happens.

## Scale

The fork's diff against `upstream/main`, limited to the blast radius:

```
apps/server/src/orchestration     ~1,050 lines added across 18 files
apps/server/src/persistence         ~730 lines added across 14 files
apps/server/src/provider          ~2,500 lines added across 26 files
packages/contracts/orchestration.ts  ~184 lines
apps/server/src/auth/RpcAuthorization.ts  13 lines
```

Roughly 4,500 added lines, 114 deleted. The fork is almost entirely additive, which is the good
news: very little of it fights upstream for the same lines.

---

## 1. Migrations

`apps/server/src/persistence/Migrations.ts` statically imports each file and registers it under an
explicit id. Two branches both adding `0NN_` collide at merge time and only the registry id
disambiguates.

**The rule is fixed and asymmetric: on an upstream merge, renumber _upstream's_ migration, never the
fork's.** Fork ids are already applied in Avi's live `~/.avicode/userdata` database, so moving one
re-runs a migration that has already run.

| Id    | File                                               | Owner                    | Notes                                                                                        |
| ----- | -------------------------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------- |
| `035` | `035_ProviderInstanceUsage.ts`                     | Fork                     | Per-instance plan quota and token usage.                                                     |
| `036` | `036_ProjectionThreadMessageContext.ts`            | Fork                     | Cross-thread context references on a message.                                                |
| `037` | `037_ProjectionThreadsForkLineage.ts`              | Fork                     | `fork_parent_thread_id`, `fork_point_message_id`, and their index.                           |
| `038` | `038_ProjectionThreadTitleRegeneration.ts`         | Upstream, **renumbered** | Upstream shipped it as `035`, which the fork already owned. The live precedent for the rule. |
| `039` | `039_ProjectionThreadMessageCommunicationStyle.ts` | Fork                     | `communication_style` on a message.                                                          |

Renumbering an upstream migration means four edits, not one: the **file name**, the **import**, the
**registry entry**, and any `toMigrationInclusive` steps in its **test**. `Migrations.ts:53-57`
carries the comment explaining why `038` is where it is; keep that comment alive through the merge.

V2 will almost certainly add migrations of its own. Expect to renumber every one of them past `039`,
and expect V2 to restructure the projection tables these five write to, which is the real work
(section 2).

**Cost: cheap, but only if the rule is followed.** Getting it backwards silently corrupts a live
database.

## 2. Projection schema

Fork-added columns and the `SELECT` trap. `ProjectionThreadDbRowSchema` derives from
`ProjectionThread`, so a new column makes **every** query that decodes into that row required to
project it. A miss throws `Missing key at [...]` deep inside a reactor, which can wedge the whole
server suite rather than fail one test.

### `projection_threads`

Two columns, declared in `persistence/Services/ProjectionThreads.ts:37-39`:

- `forkParentThreadId` (`fork_parent_thread_id`)
- `forkPointMessageId` (`fork_point_message_id`)

Both null for a root thread. Every site that must project them:

- `persistence/Layers/ProjectionThreads.ts` — insert list (`:42`), values (`:69`), upsert
  (`:96`), and two `SELECT`s (`:130`, `:166`)
- `orchestration/Layers/ProjectionSnapshotQuery.ts` — four `SELECT`s (`:361`, `:397`, `:435`,
  `:806`), plus `resolveThreadForkOrigin` (`:240-252`) which rebuilds the origin from the pair
- `orchestration/Layers/ProjectionPipeline.ts` — writes `null` on thread creation (`:603`) and the
  parent on fork (`:636`)

### `projection_thread_messages`

One column, declared in `persistence/Services/ProjectionThreadMessages.ts:34-36`:

- `communicationStyle` (`communication_style`), optional; absent means the Default style

Sites: `persistence/Layers/ProjectionThreadMessages.ts` insert (`:69`), the `COALESCE` preserve on
upsert (`:99`, `:122-124`), and two `SELECT`s (`:146`, `:169`). The `COALESCE` matters: a streaming
message is upserted repeatedly and a naive overwrite would drop the style on the second write.

`threadContext` is on the same table from migration `036`.

**Cost: expensive.** These columns are threaded through upstream query files. If V2 rewrites
`ProjectionSnapshotQuery` and `ProjectionThreads`, every one of these ten-odd sites has to be
re-applied by hand, and a missed `SELECT` fails loudly but far from its cause.

**Pre-merge action worth taking:** grep for a sibling column (`worktree_path AS "worktreePath"`) to
enumerate the call sites mechanically rather than by memory, and keep that list next to this
document.

## 3. Decider and command invariants

`orchestration/decider.ts` carries two fork additions:

- **`:762`** — communication style. A style with nothing to say is the Default style, so an empty
  directive is normalised away rather than persisted.
- **`:1001`** — `thread.fork`. Branch a conversation at an earlier user message.

`commandInvariants.ts` has **no** fork additions. That is worth knowing: the fork adds commands but
has not needed to add invariants.

Fork-owned decider tests, which are the safety net for the merge:

- `orchestration/decider.fork.test.ts` (214 lines)
- `orchestration/decider.communicationStyle.test.ts` (138 lines)

`orchestration/threadContext.ts` and its test are entirely fork-owned files.

The command and event shapes live in `packages/contracts/src/orchestration.ts`:

- `ThreadForkFields` / `ThreadForkCommand` (`:856-880`) — the `thread.fork` command. The design note
  above it is load-bearing: forking is a **conversation-only** operation and deliberately does not
  touch the working tree or git checkpoints, so both branches share one worktree.
- `ThreadForkedPayload` (`:1263`) — emitted against the **new** thread
  (`aggregateId = forkThreadId`). `inheritedMessageIds` is the exact prefix copied from the source,
  resolved by the decider at fork time so replays stay deterministic even if the source thread later
  changes.
- `ThreadContextReference` (`:266`), `CommunicationStyleLabel` / `CommunicationStyleDirective`
  (`:287-295`), and their appearances on turn-start payloads (`:793-818`, `:1209-1228`).
- Raised document/input character caps (`:141`), upstream 120k input.

**Cost: expensive for `thread.fork`, cheap for communication style.** The fork command is a new
aggregate-creating operation; if V2 changes how aggregates are created or how events name their
aggregate, `ThreadForkedPayload`'s "emitted against the new thread" trick needs rethinking from
first principles, not porting. Read that comment before assuming the port is mechanical.

## 4. Projector

`orchestration/projector.ts` carries two fork folds:

- **`:316`** — materialise a conversation branch as its own thread in the read model
- **`:515`** — keep a value in the read model because the timeline needs it

`orchestration/Schemas.ts:52` and `orchestration/Normalizer.ts:51` both branch for forks. The
Normalizer note is subtle and easy to lose: **fork uploads belong to the new aggregate, never the
source thread.**

`orchestration/Layers/ProjectionPipeline.ts:621` and `:959` carry the fork and
context/style-carry-forward folds.

`orchestration/Layers/ProviderCommandReactor.ts:1075` splices the style directive into the
provider-bound text. The comment there explains why it happens at that point and not earlier: the
transcript must stay exactly what the user typed.

**Cost: expensive.** All five are branches inside upstream files. `ProviderCommandReactor`'s splice
is the one most likely to move, because V2 reworks how a turn reaches a provider.

## 5. Provider adapters

The largest slice by line count (~2,500 added lines), but the **least** likely to conflict badly,
because adapters sit at the edge of orchestration rather than inside it.

Fork additions to `provider/Services/ProviderAdapter.ts` (58 lines):

- `capabilities.sideQuestion` — `"fork-session" | "unsupported"`; Claude reports `fork-session`,
  the other four `unsupported`
- `capabilities.planTurnEnforcement` — `"tool-denial" | "unsupported"`; Claude reports
  `tool-denial`, the other four `unsupported`
- `askSideQuestion`, `forkThread`, and the `ProviderForkResult` shape

Per-adapter fork work:

| Adapter  | Added      | What                                                                                                      |
| -------- | ---------- | --------------------------------------------------------------------------------------------------------- |
| Claude   | ~550 lines | `/btw` fork-session, plan-turn tool denial via `canUseTool`, plan quota `/usage` parsing, session forking |
| Codex    | ~311 lines | Desktop message forks, session runtime changes                                                            |
| Cursor   | ~30 lines  | Capability declarations, failing `askSideQuestion`                                                        |
| Grok     | ~30 lines  | Same                                                                                                      |
| OpenCode | ~31 lines  | Same                                                                                                      |

Entirely fork-owned provider files (free to carry): `ProviderQuotaTracker` (Layer + Service),
`claudeQuotaWindows.ts`, `providerQuotaProbe.ts`, `providerUsageRollup.ts`, `providerAuthAudit.ts`,
and the whole `provider/ClaudeLogin/` directory.

**Cost: cheap to free, with one exception.** Every adapter change is additive to a shape the fork
also owns lines in. The exception is `ClaudeAdapter.ts`, where 550 fork lines are interleaved with a
large upstream file — if V2 rewrites the adapter interface, that one file is a day's work on its
own.

**Test doubles are part of this.** Adding one capability field required updating six test doubles
plus the integration adapter. Expect the same multiplier for anything V2 changes about the shape:

- `orchestration/Layers/{CheckpointReactor,ProviderCommandReactor,ProviderRuntimeIngestion}.test.ts`
- `provider/Layers/{ProviderAdapterRegistry,ProviderService,ProviderSessionReaper}.test.ts`
- `integration/TestProviderAdapter.integration.ts`

## 6. RPCs and scopes

`apps/server/src/auth/RpcAuthorization.ts` holds `RPC_REQUIRED_SCOPES`, and
`RpcAuthorization.test.ts` asserts its keys equal `WsRpcGroup.requests` **exactly**. Registering an
RPC without choosing a scope is a type error and a failing test, not a runtime throw on first use.
Upstream introduced this check in v0.0.31 and it immediately caught a fork RPC — `voice.createToken`
— that had never had a scope at all.

Fork-owned entries (`RpcAuthorization.ts:41-53`, 13 lines):

| RPC                        | Scope       | Why                                                                                   |
| -------------------------- | ----------- | ------------------------------------------------------------------------------------- |
| `server.getProviderUsage`  | Read        | Reports quota, mutates nothing.                                                       |
| `voice.getCredential`      | **Operate** | Releases the stored Deepgram key to the client. Deliberately not a read.              |
| `provider.askSideQuestion` | Read        | `/btw` runs the model with tools denied and mutates nothing, not even the transcript. |
| `claudeLogin.start`        | Operate     | Writes a credential into the instance's config directory.                             |
| `claudeLogin.submitCode`   | Operate     | Same.                                                                                 |

Streaming RPCs additionally need their tag in `EnvironmentStreamCommandRpcTag`
(`packages/client-runtime/src/rpc/client.ts:57-63`). The fork's entry there is
`claudeLoginStart`. `providerAskSideQuestion` is listed too, but as an upstream-adjacent line. Unary
RPCs need nothing there.

The RPC definitions themselves are in `packages/contracts/src/rpc.ts`: `WS_METHODS` entries at
`:240-259` and the `Rpc.make` declarations at `:359-404`.

**Cost: cheap.** The compile-time check means nothing can be silently lost. If V2 renames the scope
constants, the fix is five lines and the test tells you when you are done.

---

## Pre-merge extraction candidates

Ranked by how much conflict they remove per hour spent. Doing any of these **before** `#2829` lands
converts an expensive merge conflict into no conflict at all.

1. **The projection column `SELECT` sites (section 2).** Not extractable as such, but the call-site
   list can be generated and pinned now, which turns "find every query" into "check ten known
   lines". Cheapest useful step.
2. **`ProviderCommandReactor`'s style splice (`:1075`).** A single transformation of provider-bound
   text. Move it into a fork-owned pure function that the reactor calls in one line, the way
   `AssetWorkspaceRoot.ts` now holds asset root resolution. Then V2's rewrite of the reactor is a
   one-line re-application.
3. **`Normalizer.ts`'s fork-upload branch (`:51`).** One conditional; extract the predicate.
4. **`ProjectionSnapshotQuery`'s `resolveThreadForkOrigin` (`:240-252`).** Already nearly
   self-contained. Moving it into a fork-owned module costs minutes.

`ClaudeAdapter.ts` is deliberately **not** on this list. Its 550 fork lines are genuinely
adapter-shaped and extracting them would make the file harder to read for a conflict that may not
happen.

## When V2 lands

1. Do not let `sync-upstream.yml` auto-merge it. The guardrail script already forbids that workflow
   from merging its own PR; keep it that way.
2. Renumber upstream's migrations past `039`, never the fork's. Four edits each.
3. Work sections 2, 3 and 4 in that order — schema, then decider, then projector — because a broken
   projection wedges the tests that would tell you about the other two.
4. Run the fork-owned decider tests (`decider.fork.test.ts`,
   `decider.communicationStyle.test.ts`) first. They are the cheapest signal that the fork's own
   semantics survived.
5. **Re-check queue-vs-steer.** `#4245` (the upstream queue/steer PR) was closed unmerged in favour
   of V2, on the claim that V2 has the behaviour natively. Verify that claim rather than assuming
   it. `FUTURE_ENHANCEMENTS.md` has the full history and the warning not to merge the dead branch.
6. Update this document. An inventory that describes the pre-merge world is worse than none.
