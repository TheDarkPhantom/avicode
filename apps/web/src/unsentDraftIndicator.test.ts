import { EnvironmentId, ProjectId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { createEmptyThreadDraft, type DraftThreadState } from "./composerDraftStore";
import { DEFAULT_INTERACTION_MODE, DEFAULT_RUNTIME_MODE } from "./types";
import {
  hasUnsentComposerContent,
  selectProjectHasUnsentDraft,
  selectThreadHasUnsentDraft,
  type UnsentDraftLookupState,
} from "./unsentDraftIndicator";

const LOGICAL_PROJECT_KEY = "env-1:project-1";
const DRAFT_ID = "draft-1";

function makeDraftSession(overrides: Partial<DraftThreadState> = {}): DraftThreadState {
  return {
    threadId: ThreadId.make("thread-1"),
    environmentId: EnvironmentId.make("env-1"),
    projectId: ProjectId.make("project-1"),
    logicalProjectKey: LOGICAL_PROJECT_KEY,
    createdAt: "2026-08-01T10:00:00.000Z",
    runtimeMode: DEFAULT_RUNTIME_MODE,
    interactionMode: DEFAULT_INTERACTION_MODE,
    branch: null,
    worktreePath: null,
    envMode: "local",
    startFromOrigin: false,
    promotedTo: null,
    ...overrides,
  };
}

function makeState(overrides: Partial<UnsentDraftLookupState> = {}): UnsentDraftLookupState {
  return {
    draftsByThreadKey: { [DRAFT_ID]: { ...createEmptyThreadDraft(), prompt: "half a thought" } },
    draftThreadsByThreadKey: { [DRAFT_ID]: makeDraftSession() },
    logicalProjectDraftThreadKeyByLogicalProjectKey: { [LOGICAL_PROJECT_KEY]: DRAFT_ID },
    ...overrides,
  };
}

describe("hasUnsentComposerContent", () => {
  it("ignores a draft that only carries settings the composer wrote by itself", () => {
    // Opening a project seeds model / runtime / interaction mode immediately.
    // Counting those would put a marker on every project ever clicked.
    expect(
      hasUnsentComposerContent({
        ...createEmptyThreadDraft(),
        runtimeMode: DEFAULT_RUNTIME_MODE,
        interactionMode: DEFAULT_INTERACTION_MODE,
        activeProvider: null,
        communicationStyleId: "concise",
      }),
    ).toBe(false);
  });

  it("ignores whitespace-only text", () => {
    expect(hasUnsentComposerContent({ ...createEmptyThreadDraft(), prompt: "  \n\t " })).toBe(
      false,
    );
  });

  it("counts typed text", () => {
    expect(hasUnsentComposerContent({ ...createEmptyThreadDraft(), prompt: "ship it" })).toBe(true);
  });

  it("counts an attachment with no text, which is still work to lose", () => {
    expect(
      hasUnsentComposerContent({
        ...createEmptyThreadDraft(),
        persistedAttachments: [
          {
            type: "image",
            id: "attachment-1",
            name: "screenshot.png",
            mimeType: "image/png",
            sizeBytes: 1_024,
            dataUrl: "data:image/png;base64,AAAA",
          },
        ],
      }),
    ).toBe(true);
  });

  it("counts a thread pulled in as context", () => {
    expect(
      hasUnsentComposerContent({
        ...createEmptyThreadDraft(),
        threadContextIds: [ThreadId.make("thread-2")],
      }),
    ).toBe(true);
  });

  it("reports nothing for a project that has no draft at all", () => {
    expect(hasUnsentComposerContent(null)).toBe(false);
  });
});

describe("selectProjectHasUnsentDraft", () => {
  it("reports a project holding text that was never sent", () => {
    expect(selectProjectHasUnsentDraft(makeState(), LOGICAL_PROJECT_KEY)).toBe(true);
  });

  it("reports nothing for a project with no draft session", () => {
    expect(selectProjectHasUnsentDraft(makeState(), "env-1:other-project")).toBe(false);
  });

  it("reports nothing when the draft session exists but the composer is empty", () => {
    expect(
      selectProjectHasUnsentDraft(
        makeState({ draftsByThreadKey: { [DRAFT_ID]: createEmptyThreadDraft() } }),
        LOGICAL_PROJECT_KEY,
      ),
    ).toBe(false);
  });

  it("reports nothing while the draft is being promoted to a real thread", () => {
    // Between send and the thread arriving the sidebar is about to list it on
    // its own; marking the project too would make the row flicker.
    expect(
      selectProjectHasUnsentDraft(
        makeState({
          draftThreadsByThreadKey: {
            [DRAFT_ID]: makeDraftSession({
              promotedTo: {
                environmentId: EnvironmentId.make("env-1"),
                threadId: ThreadId.make("thread-1"),
              },
            }),
          },
        }),
        LOGICAL_PROJECT_KEY,
      ),
    ).toBe(false);
  });

  it("reports nothing when the project mapping points at a session that is gone", () => {
    expect(
      selectProjectHasUnsentDraft(makeState({ draftThreadsByThreadKey: {} }), LOGICAL_PROJECT_KEY),
    ).toBe(false);
  });

  it("tolerates a padded key and refuses an empty one", () => {
    expect(selectProjectHasUnsentDraft(makeState(), ` ${LOGICAL_PROJECT_KEY} `)).toBe(true);
    expect(selectProjectHasUnsentDraft(makeState(), "   ")).toBe(false);
  });
});

describe("selectThreadHasUnsentDraft", () => {
  const THREAD_KEY = "env-1:thread-1";

  function makeThreadState(
    draft: Partial<UnsentDraftLookupState["draftsByThreadKey"]> = {
      [THREAD_KEY]: { ...createEmptyThreadDraft(), prompt: "half a thought" },
    },
  ): UnsentDraftLookupState {
    return {
      draftsByThreadKey: draft as UnsentDraftLookupState["draftsByThreadKey"],
      draftThreadsByThreadKey: {},
      logicalProjectDraftThreadKeyByLogicalProjectKey: {},
    };
  }

  it("reports a thread holding text that was never sent", () => {
    expect(selectThreadHasUnsentDraft(makeThreadState(), THREAD_KEY)).toBe(true);
  });

  it("reports nothing for a thread with no draft", () => {
    expect(selectThreadHasUnsentDraft(makeThreadState(), "env-1:other-thread")).toBe(false);
  });

  it("reports nothing when the draft exists but the composer is empty", () => {
    expect(
      selectThreadHasUnsentDraft(
        makeThreadState({ [THREAD_KEY]: createEmptyThreadDraft() }),
        THREAD_KEY,
      ),
    ).toBe(false);
  });

  it("reports nothing for a draft that only carries composer defaults", () => {
    expect(
      selectThreadHasUnsentDraft(
        makeThreadState({
          [THREAD_KEY]: {
            ...createEmptyThreadDraft(),
            runtimeMode: DEFAULT_RUNTIME_MODE,
            interactionMode: DEFAULT_INTERACTION_MODE,
          },
        }),
        THREAD_KEY,
      ),
    ).toBe(false);
  });

  it("tolerates a padded key and refuses an empty one", () => {
    expect(selectThreadHasUnsentDraft(makeThreadState(), ` ${THREAD_KEY} `)).toBe(true);
    expect(selectThreadHasUnsentDraft(makeThreadState(), "   ")).toBe(false);
  });
});
