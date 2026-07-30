/**
 * Avi Code addition. Upstream opens every chat at the live edge, which is the
 * right place while an agent is working but the wrong one afterwards: a
 * finished answer has to be scrolled back up before it can be read from its
 * first line. With `aviCodeOpenChatsAtLastResponse` on, opening a chat that is
 * not working starts the list at the top of its last response instead.
 *
 * The position is handed to LegendList as its initial scroll target rather than
 * applied afterwards, so the chat opens there — no visible jump from the
 * bottom, no animation. `MessagesTimeline` is keyed by thread in `ChatView`, so
 * one resolution per mount is one resolution per chat open.
 */
import { useRef } from "react";
import { CHAT_LIST_ANCHOR_OFFSET } from "@t3tools/shared/chatList";
import { useClientSettings } from "~/hooks/useSettings";
import type { MessagesTimelineRow } from "./MessagesTimeline.logic";

/**
 * Height of the timeline's top fade mask (`--topbar-scroll-fade-height`, 3rem
 * at the width the chat column needs). Content under it is progressively
 * transparent, so a response anchored flush to the top would open with its
 * first lines washed out.
 */
const CHAT_TIMELINE_TOP_FADE_HEIGHT = 48;

export interface ChatInitialScrollTarget {
  readonly index: number;
  readonly viewPosition: number;
  readonly viewOffset: number;
}

/**
 * Row index of the newest assistant message — the response a finished chat
 * should open on. Null when the chat has no response to open on yet.
 */
export function findLastResponseRowIndex(rows: ReadonlyArray<MessagesTimelineRow>): number | null {
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index];
    if (row?.kind === "message" && row.message.role === "assistant") {
      return index;
    }
  }

  return null;
}

/**
 * The initial scroll target for a chat open, or null to keep upstream's
 * open-at-the-live-edge behaviour. Resolved once, on the first render that has
 * rows, and then frozen: later rows belong to turns the user started, and those
 * follow the live edge as usual.
 */
export function useChatInitialScrollTarget({
  rows,
  chatIsIdle,
  topFadeEnabled,
}: {
  readonly rows: ReadonlyArray<MessagesTimelineRow>;
  readonly chatIsIdle: boolean;
  readonly topFadeEnabled: boolean;
}): ChatInitialScrollTarget | null {
  const enabled = useClientSettings((settings) => settings.aviCodeOpenChatsAtLastResponse);
  const resolved = useRef<{ done: boolean; target: ChatInitialScrollTarget | null }>({
    done: false,
    target: null,
  });

  if (!resolved.current.done && rows.length > 0) {
    const index = enabled && chatIsIdle ? findLastResponseRowIndex(rows) : null;
    resolved.current = {
      done: true,
      target:
        index === null
          ? null
          : {
              index,
              viewPosition: 0,
              viewOffset:
                CHAT_LIST_ANCHOR_OFFSET + (topFadeEnabled ? CHAT_TIMELINE_TOP_FADE_HEIGHT : 0),
            },
    };
  }

  return resolved.current.target;
}
