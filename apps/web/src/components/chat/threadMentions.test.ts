import { describe, expect, it } from "vite-plus/test";
import { THREAD_CONTEXT_MAX_REFERENCES, ThreadId } from "@t3tools/contracts";

import {
  canReferenceMoreThreads,
  filterThreadMentionCandidates,
  threadMentionDescription,
  threadReferenceLimitMessage,
  THREAD_MENTION_SUGGESTION_LIMIT,
  type ThreadMentionCandidate,
} from "./threadMentions";

function candidate(
  id: string,
  title: string,
  projectTitle: string,
  archived = false,
): ThreadMentionCandidate {
  return { threadId: ThreadId.make(id), title, projectTitle, archived };
}

const candidates = [
  candidate("t1", "Auth refactor", "avicode"),
  candidate("t2", "Sidebar pins", "avicode"),
  candidate("t3", "Release notes", "marketing", true),
  candidate("t4", "Auth token rotation", "server"),
];

describe("filterThreadMentionCandidates", () => {
  it("returns every candidate for an empty query, up to the suggestion limit", () => {
    const result = filterThreadMentionCandidates(candidates, {
      query: "",
      referencedThreadIds: [],
    });
    expect(result.map((entry) => entry.title)).toEqual([
      "Auth refactor",
      "Sidebar pins",
      "Release notes",
      "Auth token rotation",
    ]);
  });

  it("matches on title and on project title, case insensitively", () => {
    expect(
      filterThreadMentionCandidates(candidates, { query: "AUTH", referencedThreadIds: [] }).map(
        (entry) => entry.title,
      ),
    ).toEqual(["Auth refactor", "Auth token rotation"]);

    expect(
      filterThreadMentionCandidates(candidates, {
        query: "marketing",
        referencedThreadIds: [],
      }).map((entry) => entry.title),
    ).toEqual(["Release notes"]);
  });

  it("hides threads that are already referenced", () => {
    const result = filterThreadMentionCandidates(candidates, {
      query: "auth",
      referencedThreadIds: [ThreadId.make("t1")],
    });
    expect(result.map((entry) => entry.title)).toEqual(["Auth token rotation"]);
  });

  it("offers nothing once the reference cap is reached", () => {
    const referenced = Array.from({ length: THREAD_CONTEXT_MAX_REFERENCES }, (_unused, index) =>
      ThreadId.make(`other-${index}`),
    );
    expect(
      filterThreadMentionCandidates(candidates, { query: "", referencedThreadIds: referenced }),
    ).toEqual([]);
  });

  it("caps suggestions so file results keep room in the menu", () => {
    const many = Array.from({ length: 20 }, (_unused, index) =>
      candidate(`bulk-${index}`, `Thread ${index}`, "avicode"),
    );
    expect(
      filterThreadMentionCandidates(many, { query: "", referencedThreadIds: [] }),
    ).toHaveLength(THREAD_MENTION_SUGGESTION_LIMIT);
  });

  it("honours an explicit limit override", () => {
    expect(
      filterThreadMentionCandidates(candidates, {
        query: "",
        referencedThreadIds: [],
        limit: 2,
      }),
    ).toHaveLength(2);
  });

  it("ignores surrounding whitespace in the query", () => {
    expect(
      filterThreadMentionCandidates(candidates, { query: "  pins  ", referencedThreadIds: [] }).map(
        (entry) => entry.title,
      ),
    ).toEqual(["Sidebar pins"]);
  });
});

describe("canReferenceMoreThreads", () => {
  it("allows references below the cap and stops at it", () => {
    expect(canReferenceMoreThreads(0)).toBe(true);
    expect(canReferenceMoreThreads(THREAD_CONTEXT_MAX_REFERENCES - 1)).toBe(true);
    expect(canReferenceMoreThreads(THREAD_CONTEXT_MAX_REFERENCES)).toBe(false);
  });

  it("reports the cap from the contract rather than a hardcoded number", () => {
    expect(threadReferenceLimitMessage()).toBe(
      `You can reference up to ${THREAD_CONTEXT_MAX_REFERENCES} threads.`,
    );
  });
});

describe("threadMentionDescription", () => {
  it("shows the project, and marks archived threads", () => {
    expect(threadMentionDescription(candidate("t1", "Auth refactor", "avicode"))).toBe("avicode");
    expect(threadMentionDescription(candidate("t3", "Release notes", "marketing", true))).toBe(
      "marketing · Archived",
    );
  });
});
