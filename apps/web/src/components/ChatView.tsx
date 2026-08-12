import {
  type ApprovalRequestId,
  type ClientOrchestrationCommand,
  type CommandId,
  DEFAULT_MODEL,
  defaultInstanceIdForDriver,
  type EnvironmentId,
  type MessageId,
  type ModelSelection,
  type ProjectScript,
  type ProjectId,
  type ProviderApprovalDecision,
  ProviderInstanceId,
  type ServerProvider,
  type ResolvedKeybindingsConfig,
  type ScopedThreadRef,
  type ThreadId,
  type TurnId,
  type KeybindingCommand,
  OrchestrationThreadActivity,
  ProviderInteractionMode,
  ProviderDriverKind,
  RuntimeMode,
  TerminalOpenInput,
} from "@t3tools/contracts";
import {
  connectionStatusTitle,
  type EnvironmentConnectionPresentation,
} from "@t3tools/client-runtime/connection";
import { effectiveSnoozed } from "@t3tools/client-runtime/state/thread-settled";
import {
  parseScopedThreadKey,
  scopedProjectKey,
  scopedThreadKey,
  scopeProjectRef,
  scopeThreadRef,
} from "@t3tools/client-runtime/environment";
import {
  applyClaudePromptEffortPrefix,
  createModelSelection,
  resolvePromptInjectedEffort,
} from "@t3tools/shared/model";
import { CHAT_LIST_ANCHOR_OFFSET } from "@t3tools/shared/chatList";
import { projectScriptCwd, projectScriptRuntimeEnv } from "@t3tools/shared/projectScripts";
import { truncate } from "@t3tools/shared/String";
import { nextTerminalId, resolveTerminalSessionLabel } from "@t3tools/shared/terminalLabels";
import { Debouncer } from "@tanstack/react-pacer";
import { useAtomValue } from "@effect/atom-react";
import {
  type CSSProperties,
  lazy,
  memo,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
import { useNavigate } from "@tanstack/react-router";
import { useShallow } from "zustand/react/shallow";
import {
  isAtomCommandInterrupted,
  mapAtomCommandResult,
  settlePromise,
  squashAtomCommandFailure,
  type AtomCommandResult,
} from "@t3tools/client-runtime/state/runtime";
import * as Cause from "effect/Cause";
import { AsyncResult } from "effect/unstable/reactivity";
import { isElectron } from "../env";
import { readLocalApi } from "../localApi";
import { useDiffPanelStore } from "../diffPanelStore";
import {
  collapseExpandedComposerCursor,
  parseComposerSideQuestionCommand,
  parseStandaloneComposerSlashCommand,
  resolveSideQuestionSubmission,
} from "../composer-logic";
import {
  derivePendingApprovals,
  derivePendingUserInputs,
  deriveExpiredUserInputs,
  derivePhase,
  deriveTimelineEntries,
  deriveActiveWorkStartedAt,
  deriveActivePlanState,
  findSidebarProposedPlan,
  findLatestProposedPlan,
  deriveWorkLogEntries,
  hasActionableProposedPlan,
  isLatestTurnSettled,
} from "../session-logic";
import { type LegendListRef } from "@legendapp/list/react";
import { getAnchoredTurnMetrics, type TimelineScrollMode } from "./chat/timelineScrollAnchoring";
import { isWithinWorkspaceRoot, workspacePathBasename } from "../workspacePathMatch";
import { useCrossRepoFileFallback } from "./files/useCrossRepoFileFallback";
import { useProjectWorkspaceRoots } from "../state/projectWorkspaceRoots";
import { ThreadFindBar } from "./chat/find/ThreadFindBar";
import {
  formatMatchCount,
  reconcileMatchIndex,
  stepMatchIndex,
  type ThreadFindMatch,
} from "./chat/find/threadFindMatches";
import {
  createPendingAnswerFocusSync,
  type PendingAnswerFocusSync,
} from "./chat/pendingAnswerFocusSync";
import {
  buildPendingUserInputAnswers,
  derivePendingUserInputProgress,
  formatExpiredUserInputAnswers,
  formatExpiredUserInputDraft,
  hasHandledExpiredUserInputRecovery,
  markExpiredUserInputRecoveryHandled,
  mergeExpiredUserInputWithComposerDraft,
  initialPendingUserInputState,
  pendingUserInputReducer,
  type PendingUserInputDraftAnswer,
} from "../pendingUserInput";
import { useUiStateStore } from "../uiStateStore";
import {
  buildPlanImplementationThreadTitle,
  buildPlanImplementationPrompt,
  buildPlanReviewPrompt,
  buildPlanReviewThreadTitle,
  resolvePlanFollowUpSubmission,
} from "../proposedPlan";
import { findLatestPlanReviewShell } from "../planReview";
import { resolveInitialInteractionMode } from "../aviCodeInteractionMode";
import {
  DEFAULT_RUNTIME_MODE,
  DEFAULT_THREAD_TERMINAL_ID,
  MAX_TERMINALS_PER_GROUP,
  type ChatMessage,
  type ChatAttachment,
  type SessionPhase,
  type Thread,
  type TurnDiffSummary,
} from "../types";
import { useTheme } from "../hooks/useTheme";
import { useTurnDiffSummaries } from "../hooks/useTurnDiffSummaries";
import { isCommandPaletteOpen } from "../commandPaletteBus";
import { buildTemporaryWorktreeBranchName } from "@t3tools/shared/git";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { RIGHT_PANEL_INLINE_LAYOUT_MEDIA_QUERY } from "../rightPanelLayout";
import {
  resolveFollowedRightPanelState,
  selectActiveRightPanelSurface,
  selectThreadRightPanelState,
  type RightPanelSurface,
  useRightPanelStore,
} from "../rightPanelStore";
import {
  useDesktopRightPanelWindowReservation,
  useRightPanelSplitLayout,
} from "../hooks/useRightPanelSplitLayout";
import {
  isPreviewSupportedInRuntime,
  setActivePreviewTab,
  useThreadPreviewState,
} from "../previewStateStore";
import { addBrowserSurface } from "./preview/addBrowserSurface";
import { useAutoOpenScriptPreview } from "./preview/useAutoOpenScriptPreview";
import { closePreviewSession } from "./preview/closePreviewSession";
import { ThreadPreviewMiniPlayer } from "./preview/ThreadPreviewMiniPlayer";
import { subscribePreviewAction } from "./preview/previewActionBus";
import { getConfiguredPreviewUrls } from "./preview/previewEmptyStateLogic";
import {
  selectThreadPreviewMiniPlayer,
  usePreviewMiniPlayerStore,
} from "../previewMiniPlayerStore";
import { RightPanelTabs } from "./RightPanelTabs";
import { DiffWorkerPoolProvider } from "./DiffWorkerPoolProvider";
import { BranchToolbar } from "./BranchToolbar";
import { resolveShortcutCommand, shortcutLabelForCommand } from "../keybindings";
import PlanSidebar from "./PlanSidebar";
import ThreadTerminalDrawer from "./ThreadTerminalDrawer";
import {
  AlarmClockIcon,
  ChevronDownIcon,
  ClockIcon,
  MessageSquareReplyIcon,
  GitBranchIcon,
  TriangleAlertIcon,
  SquarePenIcon,
  WifiOffIcon,
} from "lucide-react";
import { chatContentMaxWidthCss } from "~/lib/chatContentWidth";
import { cn, randomHex } from "~/lib/utils";
import { COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS } from "~/workspaceTitlebar";
import { stackedThreadToast, toastManager } from "./ui/toast";
import { decodeProjectScriptKeybindingRule } from "~/lib/projectScriptKeybindings";
import { type NewProjectScriptInput } from "./ProjectScriptsControl";
import {
  buildProjectScript,
  commandForProjectScript,
  nextProjectScriptId,
  primaryProjectScript,
  projectScriptIdFromCommand,
} from "~/projectScripts";
import { useDevServerStartIntent } from "~/devServerStartIntent";
import { newCommandId, newDraftId, newMessageId, newThreadId } from "~/lib/utils";
import { getProviderModelCapabilities, resolveSelectableProvider } from "../providerModels";
import { NO_PROVIDER_MODEL_SELECTION } from "../providerInstances";
import { useClientSettings, useEnvironmentSettings } from "../hooks/useSettings";
import { useArchiveThreadWithFeedback } from "../hooks/useArchiveThreadWithFeedback";
import { useNewThreadHandler } from "../hooks/useHandleNewThread";
import { useWindowActive } from "../hooks/useWindowActive";
import { resolveAppModelSelectionForInstance } from "../modelSelection";
import { getTerminalFocusOwner } from "../lib/terminalFocus";
import { resolveNewDraftStartFromOrigin } from "../lib/chatThreadActions";
import {
  deriveLogicalProjectKeyFromSettings,
  selectProjectGroupingSettings,
} from "../logicalProject";
import { buildDraftThreadRouteParams } from "../threadRoutes";
import {
  type ComposerAttachment,
  type ComposerThreadDraftState,
  createEmptyThreadDraft,
  type DraftThreadEnvMode,
  useComposerDraftStore,
  type DraftId,
} from "../composerDraftStore";
import {
  appendTerminalContextsToPrompt,
  formatTerminalContextLabel,
  type TerminalContextDraft,
  type TerminalContextSelection,
} from "../lib/terminalContext";
import {
  appendElementContextsToPrompt,
  type ElementContextDraft,
  formatElementContextLabel,
} from "../lib/elementContext";
import { appendPreviewAnnotationPrompt } from "../lib/previewAnnotation";
import { appendReviewCommentsToPrompt, type ReviewCommentContext } from "../reviewCommentContext";
import {
  formatThreadWindowTitle,
  isWindowTitlePrivacyEnabled,
  WINDOW_TITLE_PRIVACY_EVENT,
} from "../lib/windowTitleMetadata";
import { environmentCatalog } from "../connection/catalog";
import { selectThreadTerminalUiState, useTerminalUiStateStore } from "../terminalUiStateStore";
import { useKnownTerminalSessions, useThreadRunningTerminalIds } from "../state/terminalSessions";
import { projectEnvironment } from "../state/projects";
import { useEnvironmentQuery } from "../state/query";
import {
  primaryServerAvailableEditorsAtom,
  primaryServerEditorDiscoveryPendingAtom,
  primaryServerKeybindingsAtom,
  primaryServerSettingsAtom,
  serverEnvironment,
} from "../state/server";
import { terminalEnvironment } from "../state/terminal";
import { threadEnvironment } from "../state/threads";
import { vcsEnvironment } from "../state/vcs";
import { useEnvironments, usePrimaryEnvironment } from "../state/environments";
import {
  useProject,
  useProjects,
  useThread,
  useThreadProposedPlans,
  useThreadRefs,
  useThreadShell,
  useThreadShells,
} from "../state/entities";
import { environmentShell } from "../state/shell";
import { ChatComposer, type ChatComposerHandle } from "./chat/ChatComposer";
import { DraftHeroHeadline } from "./chat/DraftHeroHeadline";
import { ExpandedImageDialog } from "./chat/ExpandedImageDialog";
import { PullRequestThreadDialog } from "./PullRequestThreadDialog";
import { MessagesTimeline } from "./chat/MessagesTimeline";
import {
  shouldRearmTimelineLiveFollow,
  type TimelineUserScrollDirection,
} from "./chat/MessagesTimeline.logic";
import { ChatHeader } from "./chat/ChatHeader";
import { PanelLayoutControls, RightPanelMaximizeControl } from "./chat/PanelLayoutControls";
import { type ExpandedImagePreview } from "./chat/ExpandedImagePreview";
import { NoActiveThreadState } from "./NoActiveThreadState";
import { resolveEffectiveEnvMode, resolveLocalCheckoutBranchMismatch } from "./BranchToolbar.logic";
import {
  getProviderStatusBannerKey,
  ProviderStatusBanner,
  shouldShowProviderStatusBanner,
} from "./chat/ProviderStatusBanner";
import { ThreadErrorBanner } from "./chat/ThreadErrorBanner";
import { ComposerBannerStack, type ComposerBannerStackItem } from "./chat/ComposerBannerStack";
// Avi Code addition: the plan-review return leg.
import { usePlanReviewBannerItems } from "./chat/usePlanReviewBannerItems";
import { shouldFlushHeldSend, shouldHoldSendWhileRunning } from "./chat/sendWhileRunning.logic";
import { ThreadSyncStatusPill } from "./chat/ThreadSyncStatusPill";
import {
  DRAFT_HERO_TRANSITION_ANIMATION_ID,
  DRAFT_HERO_TRANSITION_DURATION_MS,
  DRAFT_HERO_TRANSITION_EASING,
  MOBILE_COMPOSER_VIEW_TRANSITION_NAME,
  MOBILE_DRAFT_HEADLINE_VIEW_TRANSITION_NAME,
  runMobileComposerTransition,
} from "./chat/draftHeroTransition";
import {
  MAX_HIDDEN_MOUNTED_TERMINAL_THREADS,
  branchMismatchKey,
  buildExpiredTerminalContextToastCopy,
  buildLocalDraftThread,
  buildLoadingThreadFromShell,
  buildThreadTurnInterruptInput,
  canSubmitComposerSendContext,
  collectUserMessageBlobPreviewUrls,
  createLocalDispatchSnapshot,
  deriveComposerSendState,
  derivePendingPlanDecision,
  dismissBranchMismatchForSession,
  hasServerAcknowledgedLocalDispatch,
  isBranchMismatchDismissedForSession,
  shouldShowBranchMismatchBanner,
  getStartedThreadModelChangeBlockReason,
  LAST_INVOKED_SCRIPT_BY_PROJECT_KEY,
  LastInvokedScriptByProjectSchema,
  type LocalDispatchSnapshot,
  PullRequestDialogState,
  cloneComposerImageForRetry,
  deriveLockedProvider,
  readFileAsDataUrl,
  reconcileMountedTerminalThreadIds,
  resolveThreadMetadataUpdateForNextTurn,
  resolveInteractionModeChange,
  resolveSendEnvMode,
  revokeBlobPreviewUrl,
  revokeUserMessagePreviewUrls,
  shouldFollowUpWithAttachments,
  snapshotComposerThreadDraft,
  shouldMarkThreadVisited,
  shouldWriteThreadErrorToCurrentServerThread,
  startNewThreadForProject,
  waitForStartedServerThread,
} from "./ChatView.logic";
import type { ThreadSyncPhase } from "../threadSync";
import { useLocalStorage } from "~/hooks/useLocalStorage";
import { useComposerHandleContext } from "../composerHandleContext";
import { sanitizeThreadErrorMessage } from "~/rpc/transportError";
import { RightPanelSheet } from "./RightPanelSheet";
import { previewEnvironment } from "../state/preview";
import { useAtomCommand } from "../state/use-atom-command";
import { askSideQuestionCommand } from "../state/sideQuestion";
import { Button } from "./ui/button";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "./ui/alert-dialog";
import { Tooltip, TooltipPopup, TooltipTrigger } from "./ui/tooltip";
import { ServerUpdateAction, ServerUpdateProgress } from "./ServerUpdateAction";
import {
  buildVersionMismatchDismissalKey,
  dismissVersionMismatch,
  isVersionMismatchDismissed,
  resolveServerConfigVersionMismatch,
  resolveServerSelfUpdateCapability,
  serverUpdateGuidance,
} from "../versionSkew";
import { useAssetUrls } from "../assets/assetUrls";
import { queuedTurnChatMessage, useOfflineTurnOutboxStore } from "../offlineTurnOutboxStore";
import { findHeldTurnForThread, useHeldTurnStore, type HeldTurnItem } from "../heldTurnStore";
import { dispatchQueuedTurnCommands } from "./OfflineTurnOutboxFlusher";

const IMAGE_ONLY_BOOTSTRAP_PROMPT =
  "[User attached one or more images without additional text. Respond using the conversation context and the attached image(s).]";
const EMPTY_ACTIVITIES: OrchestrationThreadActivity[] = [];
const EMPTY_PROVIDERS: ServerProvider[] = [];
const EMPTY_PROVIDER_SKILLS: ServerProvider["skills"] = [];
const EMPTY_PENDING_USER_INPUT_ANSWERS: Record<string, PendingUserInputDraftAnswer> = {};
function useDraftHeroLayoutTransition(isDraftHeroState: boolean) {
  const transitionGroupRef = useRef<HTMLDivElement | null>(null);
  const composerAnchorRef = useRef<HTMLDivElement | null>(null);
  const previousStateRef = useRef(isDraftHeroState);
  const previousComposerRectRef = useRef<DOMRect | null>(null);
  const animationRef = useRef<Animation | null>(null);
  const attachTransitionGroupRef = (element: HTMLDivElement | null) => {
    transitionGroupRef.current = element;
  };
  const attachComposerAnchorRef = (element: HTMLDivElement | null) => {
    composerAnchorRef.current = element;
  };
  const captureComposerRect = () => {
    previousComposerRectRef.current = composerAnchorRef.current?.getBoundingClientRect() ?? null;
  };

  useLayoutEffect(() => {
    const transitionGroup = transitionGroupRef.current;
    const nextComposerRect = composerAnchorRef.current?.getBoundingClientRect() ?? null;
    const stateChanged = previousStateRef.current !== isDraftHeroState;
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const mobileComposerTransitionActive =
      typeof document !== "undefined" &&
      document.documentElement.dataset.mobileComposerRouteTransition === "true";

    animationRef.current?.cancel();
    animationRef.current = null;

    const previousComposerRect = previousComposerRectRef.current;
    if (
      stateChanged &&
      !prefersReducedMotion &&
      !mobileComposerTransitionActive &&
      transitionGroup &&
      previousComposerRect &&
      nextComposerRect &&
      typeof transitionGroup.animate === "function"
    ) {
      const translateX = previousComposerRect.left - nextComposerRect.left;
      const translateY = previousComposerRect.top - nextComposerRect.top;
      if (Math.abs(translateX) >= 0.5 || Math.abs(translateY) >= 0.5) {
        const animation = transitionGroup.animate(
          [
            { transform: `translate3d(${translateX}px, ${translateY}px, 0)` },
            { transform: "translate3d(0, 0, 0)" },
          ],
          {
            duration: DRAFT_HERO_TRANSITION_DURATION_MS,
            easing: DRAFT_HERO_TRANSITION_EASING,
          },
        );
        animation.id = DRAFT_HERO_TRANSITION_ANIMATION_ID;
        animationRef.current = animation;
        void animation.finished
          .catch(() => undefined)
          .then(() => {
            if (animationRef.current !== animation) {
              return;
            }
            animationRef.current = null;
          });
      }
    }

    previousStateRef.current = isDraftHeroState;
    previousComposerRectRef.current = nextComposerRect;
  }, [isDraftHeroState]);

  return [attachTransitionGroupRef, attachComposerAnchorRef, captureComposerRect] as const;
}
const PreviewPanel = lazy(() =>
  import("./preview/PreviewPanel").then((module) => ({ default: module.PreviewPanel })),
);
const DiffPanel = lazy(() => import("./DiffPanel"));
const FilePreviewPanel = lazy(() => import("./files/FilePreviewPanel"));
const EMPTY_PENDING_FILE_SURFACE_IDS: ReadonlySet<string> = new Set();
const TYPE_TO_FOCUS_EDITABLE_SELECTOR = [
  "input",
  "textarea",
  "select",
  '[contenteditable="true"]',
  '[contenteditable="plaintext-only"]',
  '[role="textbox"]',
].join(",");
const TYPE_TO_FOCUS_INTERACTIVE_SELECTOR = [
  "button",
  "a[href]",
  "summary",
  '[role="button"]',
  '[role="checkbox"]',
  '[role="menuitem"]',
  '[role="option"]',
  '[role="radio"]',
  '[role="switch"]',
  '[role="tab"]',
].join(",");
const TYPE_TO_FOCUS_FLOATING_LAYER_SELECTOR = [
  // Avi Code addition: the find bar is a plain positioned element rather than a
  // popup, so without this every keystroke typed into it would be stolen by the
  // type-to-focus rule and land in the composer.
  '[data-thread-find-bar="true"]',
  '[data-slot="dialog"]',
  '[data-slot="menu-popup"]',
  '[data-slot="select-popup"]',
  '[data-slot="popover-popup"]',
  '[data-slot="combobox-popup"]',
  '[data-slot="autocomplete-popup"]',
].join(",");

type EnvironmentUnavailableState = {
  readonly environmentId: EnvironmentId;
  readonly label: string;
  readonly connection: EnvironmentConnectionPresentation;
};

type ThreadPlanCatalogEntry = Pick<Thread, "id" | "proposedPlans">;

function eventPathContainsSelector(event: Event, selector: string): boolean {
  const path = event.composedPath();
  if (path.length === 0 && event.target) {
    path.push(event.target);
  }
  return path.some((target) => target instanceof Element && target.closest(selector));
}

function shouldTypeToFocusComposer(event: KeyboardEvent): boolean {
  if (event.defaultPrevented || event.isComposing) return false;
  if (event.metaKey || event.ctrlKey || event.altKey) return false;
  if (event.key.length !== 1) return false;

  if (eventPathContainsSelector(event, TYPE_TO_FOCUS_EDITABLE_SELECTOR)) return false;
  if (eventPathContainsSelector(event, TYPE_TO_FOCUS_INTERACTIVE_SELECTOR)) return false;
  if (document.querySelector(TYPE_TO_FOCUS_FLOATING_LAYER_SELECTOR)) return false;

  return true;
}

function formatOutgoingPrompt(params: {
  provider: ProviderDriverKind;
  model: string | null;
  models: ReadonlyArray<ServerProvider["models"][number]>;
  effort: string | null;
  text: string;
}): string {
  const caps = getProviderModelCapabilities(params.models, params.model, params.provider);
  const promptEffort = resolvePromptInjectedEffort(caps, params.effort);
  return applyClaudePromptEffortPrefix(params.text, promptEffort);
}
const SCRIPT_TERMINAL_COLS = 120;
const SCRIPT_TERMINAL_ROWS = 30;

type ChatViewProps =
  | {
      environmentId: EnvironmentId;
      threadId: ThreadId;
      onDiffPanelOpen?: () => void;
      reserveTitleBarControlInset?: boolean;
      forceExpandedMobileComposer?: boolean;
      threadSyncPhase?: ThreadSyncPhase | null;
      routeKind: "server";
      draftId?: never;
    }
  | {
      environmentId: EnvironmentId;
      threadId: ThreadId;
      onDiffPanelOpen?: () => void;
      reserveTitleBarControlInset?: boolean;
      forceExpandedMobileComposer?: boolean;
      threadSyncPhase?: never;
      routeKind: "draft";
      draftId: DraftId;
    };

interface TerminalLaunchContext {
  threadId: ThreadId;
  cwd: string;
  worktreePath: string | null;
}

type PersistentTerminalLaunchContext = Pick<TerminalLaunchContext, "cwd" | "worktreePath">;

function useLocalDispatchState(input: {
  activeThread: Thread | undefined;
  activeLatestTurn: Thread["latestTurn"] | null;
  phase: SessionPhase;
  activePendingApproval: ApprovalRequestId | null;
  activePendingUserInput: ApprovalRequestId | null;
  threadError: string | null | undefined;
}) {
  const [localDispatch, setLocalDispatch] = useState<LocalDispatchSnapshot | null>(null);
  const latestUserMessageId =
    input.activeThread?.messages.findLast((message) => message.role === "user")?.id ?? null;

  const resetLocalDispatch = useCallback(() => {
    setLocalDispatch(null);
  }, []);

  const serverAcknowledgedLocalDispatch = useMemo(
    () =>
      hasServerAcknowledgedLocalDispatch({
        localDispatch,
        phase: input.phase,
        latestTurn: input.activeLatestTurn,
        latestUserMessageId,
        session: input.activeThread?.session ?? null,
        hasPendingApproval: input.activePendingApproval !== null,
        hasPendingUserInput: input.activePendingUserInput !== null,
        threadError: input.threadError,
      }),
    [
      input.activeLatestTurn,
      input.activePendingApproval,
      input.activePendingUserInput,
      input.activeThread?.session,
      input.phase,
      input.threadError,
      latestUserMessageId,
      localDispatch,
    ],
  );
  const activeLocalDispatch = serverAcknowledgedLocalDispatch ? null : localDispatch;
  const beginLocalDispatch = useCallback(
    (options?: { preparingWorktree?: boolean }) => {
      const preparingWorktree = Boolean(options?.preparingWorktree);
      setLocalDispatch((current) => {
        const active = serverAcknowledgedLocalDispatch ? null : current;
        if (active) {
          return active.preparingWorktree === preparingWorktree
            ? active
            : { ...active, preparingWorktree };
        }
        return createLocalDispatchSnapshot(input.activeThread, options);
      });
    },
    [input.activeThread, serverAcknowledgedLocalDispatch],
  );

  return {
    beginLocalDispatch,
    resetLocalDispatch,
    localDispatchStartedAt: activeLocalDispatch?.startedAt ?? null,
    isPreparingWorktree: activeLocalDispatch?.preparingWorktree ?? false,
    isSendBusy: activeLocalDispatch !== null,
  };
}

/** Same terminal ids (order ignored) — avoids reconcile when only server session ordering differs. */
function terminalIdListsEqual(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  if (left.length === 0) {
    return true;
  }
  const sortedLeft = left.toSorted((a, b) => a.localeCompare(b));
  const sortedRight = right.toSorted((a, b) => a.localeCompare(b));
  for (let index = 0; index < sortedLeft.length; index += 1) {
    if (sortedLeft[index] !== sortedRight[index]) {
      return false;
    }
  }
  return true;
}

/**
 * Server knows about fewer sessions than the client, but every server id still exists locally.
 * Typical right after `terminal.open`: known-session list lags; reconciling would drop the new id
 * and later re-add it as a separate group (no split layout).
 */
function serverTerminalIdsStrictSubsetOfClient(
  serverIds: readonly string[],
  clientIds: readonly string[],
): boolean {
  if (serverIds.length >= clientIds.length || clientIds.length === 0) {
    return false;
  }
  const clientSet = new Set(clientIds);
  for (const id of serverIds) {
    if (!clientSet.has(id)) {
      return false;
    }
  }
  return true;
}

interface PersistentThreadTerminalDrawerProps {
  threadRef: { environmentId: EnvironmentId; threadId: ThreadId };
  threadId: ThreadId;
  visible: boolean;
  launchContext: PersistentTerminalLaunchContext | null;
  focusRequestId: number;
  splitShortcutLabel: string | undefined;
  splitVerticalShortcutLabel: string | undefined;
  newShortcutLabel: string | undefined;
  closeShortcutLabel: string | undefined;
  keybindings: ResolvedKeybindingsConfig;
  onAddTerminalContext: (selection: TerminalContextSelection) => void;
}

const PersistentThreadTerminalDrawer = memo(function PersistentThreadTerminalDrawer({
  threadRef,
  threadId,
  visible,
  launchContext,
  focusRequestId,
  splitShortcutLabel,
  splitVerticalShortcutLabel,
  newShortcutLabel,
  closeShortcutLabel,
  keybindings,
  onAddTerminalContext,
}: PersistentThreadTerminalDrawerProps) {
  const openTerminal = useAtomCommand(terminalEnvironment.open, "terminal open");
  const writeTerminal = useAtomCommand(terminalEnvironment.write, "terminal write");
  const closeTerminalMutation = useAtomCommand(terminalEnvironment.close, "terminal close");
  const draftThread = useComposerDraftStore((store) => store.getDraftThreadByRef(threadRef));
  const serverThread = useThread(threadRef, { waitForShell: draftThread !== null });
  const projectRef = serverThread
    ? scopeProjectRef(serverThread.environmentId, serverThread.projectId)
    : draftThread
      ? scopeProjectRef(draftThread.environmentId, draftThread.projectId)
      : null;
  const project = useProject(projectRef);
  const terminalUiState = useTerminalUiStateStore((state) =>
    selectThreadTerminalUiState(state.terminalUiStateByThreadKey, threadRef),
  );
  const knownTerminalSessions = useKnownTerminalSessions({
    environmentId: threadRef.environmentId,
    threadId,
  });
  const panelSurfaces = useRightPanelStore(
    (state) => selectThreadRightPanelState(state.byThreadKey, threadRef).surfaces,
  );
  const panelTerminalIds = useMemo(
    () =>
      new Set(
        panelSurfaces.flatMap((surface) =>
          surface.kind === "terminal" ? surface.terminalIds : [],
        ),
      ),
    [panelSurfaces],
  );
  const drawerTerminalSessions = useMemo(
    () =>
      knownTerminalSessions.filter((session) => !panelTerminalIds.has(session.target.terminalId)),
    [knownTerminalSessions, panelTerminalIds],
  );
  const terminalLabelsById = useMemo(() => {
    const next = new Map<string, string>();
    for (const session of drawerTerminalSessions) {
      next.set(
        session.target.terminalId,
        resolveTerminalSessionLabel(session.target.terminalId, session.state.summary),
      );
    }
    return next;
  }, [drawerTerminalSessions]);
  const terminalLaunchLocationsById = useMemo(() => {
    const next = new Map<
      string,
      {
        readonly cwd: string;
        readonly worktreePath: string | null;
        readonly runtimeEnv: Record<string, string>;
      }
    >();
    if (!project) {
      return next;
    }

    for (const session of drawerTerminalSessions) {
      const summary = session.state.summary;
      if (!summary) {
        continue;
      }
      const worktreePathForLaunch =
        launchContext !== null ? launchContext.worktreePath : summary.worktreePath;
      next.set(session.target.terminalId, {
        cwd: launchContext?.cwd ?? summary.cwd,
        worktreePath: worktreePathForLaunch,
        runtimeEnv: projectScriptRuntimeEnv({
          project: { cwd: project.workspaceRoot },
          worktreePath: worktreePathForLaunch,
        }),
      });
    }

    return next;
  }, [drawerTerminalSessions, launchContext, project]);
  const serverOrderedTerminalIds = useMemo(
    () => drawerTerminalSessions.map((session) => session.target.terminalId),
    [drawerTerminalSessions],
  );
  const storeSetTerminalHeight = useTerminalUiStateStore((state) => state.setTerminalHeight);
  const storeSplitTerminal = useTerminalUiStateStore((state) => state.splitTerminal);
  const storeSplitTerminalVertical = useTerminalUiStateStore(
    (state) => state.splitTerminalVertical,
  );
  const storeNewTerminal = useTerminalUiStateStore((state) => state.newTerminal);
  const storeSetActiveTerminal = useTerminalUiStateStore((state) => state.setActiveTerminal);
  const storeCloseTerminal = useTerminalUiStateStore((state) => state.closeTerminal);
  const reconcileTerminalIds = useTerminalUiStateStore((state) => state.reconcileTerminalIds);

  useEffect(() => {
    if (terminalIdListsEqual(serverOrderedTerminalIds, terminalUiState.terminalIds)) {
      return;
    }
    if (
      serverTerminalIdsStrictSubsetOfClient(serverOrderedTerminalIds, terminalUiState.terminalIds)
    ) {
      return;
    }
    reconcileTerminalIds(threadRef, serverOrderedTerminalIds);
  }, [reconcileTerminalIds, serverOrderedTerminalIds, terminalUiState.terminalIds, threadRef]);
  const [localFocusRequestId, setLocalFocusRequestId] = useState(0);
  const worktreePath = serverThread?.worktreePath ?? draftThread?.worktreePath ?? null;
  const effectiveWorktreePath = useMemo(() => {
    if (launchContext !== null) {
      return launchContext.worktreePath;
    }
    return worktreePath;
  }, [launchContext, worktreePath]);
  const cwd = useMemo(
    () =>
      launchContext?.cwd ??
      (project
        ? projectScriptCwd({
            project: { cwd: project.workspaceRoot },
            worktreePath: effectiveWorktreePath,
          })
        : null),
    [effectiveWorktreePath, launchContext?.cwd, project],
  );
  const runtimeEnv = useMemo(
    () =>
      project
        ? projectScriptRuntimeEnv({
            project: { cwd: project.workspaceRoot },
            worktreePath: effectiveWorktreePath,
          })
        : {},
    [effectiveWorktreePath, project],
  );

  const bumpFocusRequestId = useCallback(() => {
    if (!visible) {
      return;
    }
    setLocalFocusRequestId((value) => value + 1);
  }, [visible]);

  const setTerminalHeight = useCallback(
    (height: number) => {
      storeSetTerminalHeight(threadRef, height);
    },
    [storeSetTerminalHeight, threadRef],
  );

  const splitTerminal = useCallback(() => {
    if (!cwd) {
      return;
    }
    const terminalId = nextTerminalId(serverOrderedTerminalIds);
    storeSplitTerminal(threadRef, terminalId);
    bumpFocusRequestId();
    void openTerminal({
      environmentId: threadRef.environmentId,
      input: {
        threadId,
        terminalId,
        cwd,
        ...(effectiveWorktreePath != null ? { worktreePath: effectiveWorktreePath } : {}),
        env: runtimeEnv,
      },
    });
  }, [
    bumpFocusRequestId,
    cwd,
    effectiveWorktreePath,
    runtimeEnv,
    serverOrderedTerminalIds,
    storeSplitTerminal,
    threadId,
    threadRef,
    openTerminal,
  ]);
  const splitTerminalVertical = useCallback(() => {
    if (!cwd) {
      return;
    }
    const terminalId = nextTerminalId(serverOrderedTerminalIds);
    storeSplitTerminalVertical(threadRef, terminalId);
    bumpFocusRequestId();
    void openTerminal({
      environmentId: threadRef.environmentId,
      input: {
        threadId,
        terminalId,
        cwd,
        ...(effectiveWorktreePath != null ? { worktreePath: effectiveWorktreePath } : {}),
        env: runtimeEnv,
      },
    });
  }, [
    bumpFocusRequestId,
    cwd,
    effectiveWorktreePath,
    openTerminal,
    runtimeEnv,
    serverOrderedTerminalIds,
    storeSplitTerminalVertical,
    threadId,
    threadRef,
  ]);

  const createNewTerminal = useCallback(() => {
    if (!cwd) {
      return;
    }
    const terminalId = nextTerminalId(serverOrderedTerminalIds);
    storeNewTerminal(threadRef, terminalId);
    bumpFocusRequestId();
    void openTerminal({
      environmentId: threadRef.environmentId,
      input: {
        threadId,
        terminalId,
        cwd,
        ...(effectiveWorktreePath != null ? { worktreePath: effectiveWorktreePath } : {}),
        env: runtimeEnv,
      },
    });
  }, [
    bumpFocusRequestId,
    cwd,
    effectiveWorktreePath,
    runtimeEnv,
    serverOrderedTerminalIds,
    storeNewTerminal,
    threadId,
    threadRef,
    openTerminal,
  ]);

  const activateTerminal = useCallback(
    (terminalId: string) => {
      storeSetActiveTerminal(threadRef, terminalId);
      bumpFocusRequestId();
    },
    [bumpFocusRequestId, storeSetActiveTerminal, threadRef],
  );

  const closeTerminal = useCallback(
    (terminalId: string) => {
      const fallbackExitWrite = () =>
        writeTerminal({
          environmentId: threadRef.environmentId,
          input: { threadId, terminalId, data: "exit\n" },
        });

      void (async () => {
        const closeResult = await closeTerminalMutation({
          environmentId: threadRef.environmentId,
          input: {
            threadId,
            terminalId,
            deleteHistory: true,
          },
        });
        if (closeResult._tag === "Failure" && !isAtomCommandInterrupted(closeResult)) {
          await fallbackExitWrite();
        }
      })();

      storeCloseTerminal(threadRef, terminalId);
      bumpFocusRequestId();
    },
    [
      bumpFocusRequestId,
      storeCloseTerminal,
      threadId,
      threadRef,
      closeTerminalMutation,
      writeTerminal,
    ],
  );

  const handleAddTerminalContext = useCallback(
    (selection: TerminalContextSelection) => {
      if (!visible) {
        return;
      }
      onAddTerminalContext(selection);
    },
    [onAddTerminalContext, visible],
  );

  if (!project || !terminalUiState.terminalOpen || !cwd) {
    return null;
  }

  return (
    <div className={visible ? undefined : "hidden"}>
      <ThreadTerminalDrawer
        threadRef={threadRef}
        threadId={threadId}
        cwd={cwd}
        worktreePath={effectiveWorktreePath}
        runtimeEnv={runtimeEnv}
        visible={visible}
        height={terminalUiState.terminalHeight}
        // Known-session order is MRU and changes on focus; persisted store order keeps sidebar labels stable.
        terminalIds={terminalUiState.terminalIds}
        activeTerminalId={terminalUiState.activeTerminalId}
        terminalGroups={terminalUiState.terminalGroups}
        activeTerminalGroupId={terminalUiState.activeTerminalGroupId}
        focusRequestId={focusRequestId + localFocusRequestId + (visible ? 1 : 0)}
        onSplitTerminal={splitTerminal}
        onSplitTerminalVertical={splitTerminalVertical}
        onNewTerminal={createNewTerminal}
        splitShortcutLabel={visible ? splitShortcutLabel : undefined}
        splitVerticalShortcutLabel={visible ? splitVerticalShortcutLabel : undefined}
        newShortcutLabel={visible ? newShortcutLabel : undefined}
        closeShortcutLabel={visible ? closeShortcutLabel : undefined}
        keybindings={keybindings}
        onActiveTerminalChange={activateTerminal}
        onCloseTerminal={closeTerminal}
        onHeightChange={setTerminalHeight}
        onAddTerminalContext={handleAddTerminalContext}
        terminalLabelsById={terminalLabelsById}
        terminalLaunchLocationsById={terminalLaunchLocationsById}
      />
    </div>
  );
});

interface PersistentThreadTerminalPanelProps {
  threadRef: ScopedThreadRef;
  surface: Extract<RightPanelSurface, { kind: "terminal" }>;
  launchContext: PersistentTerminalLaunchContext | null;
  focusRequestId: number;
  keybindings: ResolvedKeybindingsConfig;
  onAddTerminalContext: (selection: TerminalContextSelection) => void;
  onSplitTerminal: () => void;
  onSplitTerminalVertical: () => void;
  onNewTerminal: () => void;
  onActiveTerminalChange: (terminalId: string) => void;
  onCloseTerminal: (terminalId: string) => void;
  splitShortcutLabel?: string | undefined;
  splitVerticalShortcutLabel?: string | undefined;
  newShortcutLabel?: string | undefined;
  closeShortcutLabel?: string | undefined;
}

const PersistentThreadTerminalPanel = memo(function PersistentThreadTerminalPanel({
  threadRef,
  surface,
  launchContext,
  focusRequestId,
  keybindings,
  onAddTerminalContext,
  onSplitTerminal,
  onSplitTerminalVertical,
  onNewTerminal,
  onActiveTerminalChange,
  onCloseTerminal,
  splitShortcutLabel,
  splitVerticalShortcutLabel,
  newShortcutLabel,
  closeShortcutLabel,
}: PersistentThreadTerminalPanelProps) {
  const draftThread = useComposerDraftStore((store) => store.getDraftThreadByRef(threadRef));
  const serverThread = useThread(threadRef, { waitForShell: draftThread !== null });
  const projectRef = serverThread
    ? scopeProjectRef(serverThread.environmentId, serverThread.projectId)
    : draftThread
      ? scopeProjectRef(draftThread.environmentId, draftThread.projectId)
      : null;
  const project = useProject(projectRef);
  const knownTerminalSessions = useKnownTerminalSessions({
    environmentId: threadRef.environmentId,
    threadId: threadRef.threadId,
  });
  const threadWorktreePath = serverThread?.worktreePath ?? draftThread?.worktreePath ?? null;
  const activeSummary =
    knownTerminalSessions.find((session) => session.target.terminalId === surface.activeTerminalId)
      ?.state.summary ?? null;
  const worktreePath =
    launchContext?.worktreePath ?? activeSummary?.worktreePath ?? threadWorktreePath;
  const cwd = useMemo(
    () =>
      launchContext?.cwd ??
      activeSummary?.cwd ??
      (project
        ? projectScriptCwd({
            project: { cwd: project.workspaceRoot },
            worktreePath,
          })
        : null),
    [activeSummary?.cwd, launchContext?.cwd, project, worktreePath],
  );
  const runtimeEnv = useMemo(
    () =>
      project
        ? projectScriptRuntimeEnv({
            project: { cwd: project.workspaceRoot },
            worktreePath,
          })
        : {},
    [project, worktreePath],
  );
  const terminalLabelsById = useMemo(() => {
    const labels = new Map<string, string>();
    for (const terminalId of surface.terminalIds) {
      const summary =
        knownTerminalSessions.find((session) => session.target.terminalId === terminalId)?.state
          .summary ?? null;
      labels.set(terminalId, resolveTerminalSessionLabel(terminalId, summary));
    }
    return labels;
  }, [knownTerminalSessions, surface.terminalIds]);
  const terminalLaunchLocationsById = useMemo(() => {
    const locations = new Map<
      string,
      {
        readonly cwd: string;
        readonly worktreePath: string | null;
        readonly runtimeEnv: Record<string, string>;
      }
    >();
    for (const terminalId of surface.terminalIds) {
      const summary =
        knownTerminalSessions.find((session) => session.target.terminalId === terminalId)?.state
          .summary ?? null;
      const terminalWorktreePath =
        launchContext?.worktreePath ?? summary?.worktreePath ?? threadWorktreePath;
      const terminalCwd =
        launchContext?.cwd ??
        summary?.cwd ??
        (project
          ? projectScriptCwd({
              project: { cwd: project.workspaceRoot },
              worktreePath: terminalWorktreePath,
            })
          : null);
      if (!terminalCwd || !project) continue;
      locations.set(terminalId, {
        cwd: terminalCwd,
        worktreePath: terminalWorktreePath,
        runtimeEnv: projectScriptRuntimeEnv({
          project: { cwd: project.workspaceRoot },
          worktreePath: terminalWorktreePath,
        }),
      });
    }
    return locations;
  }, [
    knownTerminalSessions,
    launchContext?.cwd,
    launchContext?.worktreePath,
    project,
    surface.terminalIds,
    threadWorktreePath,
  ]);

  if (!project || !cwd) return null;

  return (
    <ThreadTerminalDrawer
      mode="panel"
      threadRef={threadRef}
      threadId={threadRef.threadId}
      cwd={cwd}
      worktreePath={worktreePath}
      runtimeEnv={runtimeEnv}
      height={0}
      terminalIds={surface.terminalIds}
      activeTerminalId={surface.activeTerminalId}
      terminalGroups={[
        {
          id: surface.id,
          terminalIds: surface.terminalIds,
          ...(surface.splitDirection === "vertical" ? { splitDirection: "vertical" as const } : {}),
        },
      ]}
      activeTerminalGroupId={surface.id}
      focusRequestId={focusRequestId}
      onSplitTerminal={onSplitTerminal}
      onSplitTerminalVertical={onSplitTerminalVertical}
      onNewTerminal={onNewTerminal}
      splitShortcutLabel={splitShortcutLabel}
      splitVerticalShortcutLabel={splitVerticalShortcutLabel}
      newShortcutLabel={newShortcutLabel}
      closeShortcutLabel={closeShortcutLabel}
      onActiveTerminalChange={onActiveTerminalChange}
      onCloseTerminal={onCloseTerminal}
      onHeightChange={() => undefined}
      onAddTerminalContext={onAddTerminalContext}
      terminalLabelsById={terminalLabelsById}
      terminalLaunchLocationsById={terminalLaunchLocationsById}
      keybindings={keybindings}
    />
  );
});

// Errors surface through two maps (draft-keyed and thread-keyed) whose entries
// can race around promotion, so each write carries its time to let the latest
// one win when they collide.
type LocalThreadErrorEntry = {
  readonly message: string | null;
  readonly at: number;
};

function chatActionErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "An error occurred.";
}

function ChatViewContent(props: ChatViewProps) {
  const {
    environmentId,
    threadId,
    routeKind,
    onDiffPanelOpen,
    reserveTitleBarControlInset = true,
    forceExpandedMobileComposer = false,
  } = props;
  const draftId = routeKind === "draft" ? props.draftId : null;
  const threadSyncPhase = routeKind === "server" ? (props.threadSyncPhase ?? null) : null;
  const threadDetailLoading = threadSyncPhase === "loading";
  const handleNewThread = useNewThreadHandler();
  const routeThreadRef = useMemo(
    () => scopeThreadRef(environmentId, threadId),
    [environmentId, threadId],
  );
  const routeThreadKey = useMemo(() => scopedThreadKey(routeThreadRef), [routeThreadRef]);
  const updateProject = useAtomCommand(projectEnvironment.update, { reportFailure: false });
  const upsertKeybinding = useAtomCommand(serverEnvironment.upsertKeybinding, {
    reportFailure: false,
  });
  const refreshProviderUsage = useAtomCommand(serverEnvironment.refreshProviders, {
    reportFailure: false,
  });
  const openTerminal = useAtomCommand(terminalEnvironment.open, "terminal open");
  const writeTerminal = useAtomCommand(terminalEnvironment.write, "terminal write");
  const closeTerminalMutation = useAtomCommand(terminalEnvironment.close, "terminal close");
  const createThread = useAtomCommand(threadEnvironment.create, { reportFailure: false });
  // Avi Code addition: `/btw`. Failures surface in the answer panel itself, so
  // no toast — a side question going wrong should not interrupt the main task.
  const askSideQuestion = useAtomCommand(askSideQuestionCommand, { reportFailure: false });
  const deleteThread = useAtomCommand(threadEnvironment.delete, { reportFailure: false });
  const updateThreadMetadata = useAtomCommand(threadEnvironment.updateMetadata, {
    reportFailure: false,
  });
  const switchGitRef = useAtomCommand(vcsEnvironment.switchRef, { reportFailure: false });
  const setThreadRuntimeMode = useAtomCommand(threadEnvironment.setRuntimeMode, {
    reportFailure: false,
  });
  const setThreadInteractionMode = useAtomCommand(threadEnvironment.setInteractionMode, {
    reportFailure: false,
  });
  const startThreadTurn = useAtomCommand(threadEnvironment.startTurn, { reportFailure: false });
  const interruptThreadTurn = useAtomCommand(threadEnvironment.interruptTurn, {
    reportFailure: false,
  });
  const respondToThreadApproval = useAtomCommand(threadEnvironment.respondToApproval, {
    reportFailure: false,
  });
  const respondToThreadUserInput = useAtomCommand(threadEnvironment.respondToUserInput, {
    reportFailure: false,
  });
  const revertThreadCheckpoint = useAtomCommand(threadEnvironment.revertCheckpoint, {
    reportFailure: false,
  });
  const forkThread = useAtomCommand(threadEnvironment.fork, { reportFailure: false });
  const openPreview = useAtomCommand(previewEnvironment.open, { reportFailure: false });
  // Avi Code addition: honours the script form's "Open preview automatically",
  // which upstream persisted and offered but never read at runtime.
  const requestAutoOpenScriptPreview = useAutoOpenScriptPreview(openPreview);
  const closePreview = useAtomCommand(previewEnvironment.close, "preview close");
  const { environments } = useEnvironments();
  const primaryEnvironment = usePrimaryEnvironment();
  const retryEnvironment = useAtomCommand(environmentCatalog.retryNow, { reportFailure: false });
  const environmentById = useMemo(
    () => new Map(environments.map((environment) => [environment.environmentId, environment])),
    [environments],
  );
  const composerDraftTarget: ScopedThreadRef | DraftId =
    routeKind === "server" ? routeThreadRef : props.draftId;
  const draftThread = useComposerDraftStore((store) =>
    routeKind === "server"
      ? store.getDraftSessionByRef(routeThreadRef)
      : draftId
        ? store.getDraftSession(draftId)
        : null,
  );
  const routeServerThreadShell = useThreadShell(routeKind === "server" ? routeThreadRef : null);
  const serverThread = useThread(routeThreadRef, { waitForShell: draftThread !== null });
  const loadingServerThread = useMemo(
    () =>
      threadDetailLoading && routeServerThreadShell
        ? buildLoadingThreadFromShell(routeServerThreadShell)
        : null,
    [routeServerThreadShell, threadDetailLoading],
  );
  const activeServerThread = serverThread ?? loadingServerThread;
  const markThreadVisited = useUiStateStore((store) => store.markThreadVisited);
  const activeThreadLastVisitedAt = useUiStateStore(
    (store) => store.threadLastVisitedAtById[routeThreadKey],
  );
  const windowActive = useWindowActive();
  const settings = useEnvironmentSettings(environmentId);
  // New-thread defaults live in the primary environment's settings.json (the
  // settings UI never writes to remote environments), so read them from the
  // primary server rather than the thread's environment.
  const primaryServerSettings = useAtomValue(primaryServerSettingsAtom);
  const setStickyComposerModelSelection = useComposerDraftStore(
    (store) => store.setStickyModelSelection,
  );
  const timestampFormat = settings.timestampFormat;
  const autoOpenPlanSidebar = settings.autoOpenPlanSidebar;
  const navigate = useNavigate();
  const { resolvedTheme } = useTheme();
  // Granular store selectors — avoid subscribing to prompt changes.
  const composerRuntimeMode = useComposerDraftStore(
    (store) => store.getComposerDraft(composerDraftTarget)?.runtimeMode ?? null,
  );
  const composerInteractionMode = useComposerDraftStore(
    (store) => store.getComposerDraft(composerDraftTarget)?.interactionMode ?? null,
  );
  const composerActiveProvider = useComposerDraftStore(
    (store) => store.getComposerDraft(composerDraftTarget)?.activeProvider ?? null,
  );
  const setComposerDraftPrompt = useComposerDraftStore((store) => store.setPrompt);
  const addComposerDraftImages = useComposerDraftStore((store) => store.addImages);
  const setComposerDraftTerminalContexts = useComposerDraftStore(
    (store) => store.setTerminalContexts,
  );
  const setComposerDraftElementContexts = useComposerDraftStore(
    (store) => store.setElementContexts,
  );
  const setComposerDraftPreviewAnnotations = useComposerDraftStore(
    (store) => store.setPreviewAnnotations,
  );
  const setComposerDraftReviewComments = useComposerDraftStore((store) => store.setReviewComments);
  const setComposerDraftThreadContextIds = useComposerDraftStore(
    (store) => store.setThreadContextIds,
  );
  const setComposerDraftModelSelection = useComposerDraftStore((store) => store.setModelSelection);
  const setComposerDraftRuntimeMode = useComposerDraftStore((store) => store.setRuntimeMode);
  const setComposerDraftInteractionMode = useComposerDraftStore(
    (store) => store.setInteractionMode,
  );
  const clearComposerDraftContent = useComposerDraftStore((store) => store.clearComposerContent);
  const setDraftThreadContext = useComposerDraftStore((store) => store.setDraftThreadContext);
  const getDraftSessionByLogicalProjectKey = useComposerDraftStore(
    (store) => store.getDraftSessionByLogicalProjectKey,
  );
  const getDraftSession = useComposerDraftStore((store) => store.getDraftSession);
  const setLogicalProjectDraftThreadId = useComposerDraftStore(
    (store) => store.setLogicalProjectDraftThreadId,
  );
  const promptRef = useRef("");
  const composerImagesRef = useRef<ComposerAttachment[]>([]);
  const composerTerminalContextsRef = useRef<TerminalContextDraft[]>([]);
  const composerElementContextsRef = useRef<ElementContextDraft[]>([]);
  const localComposerRef = useRef<ChatComposerHandle | null>(null);
  const composerRef = useComposerHandleContext() ?? localComposerRef;
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [timelineLiveFollowEnabled, setTimelineLiveFollowEnabled] = useState(true);
  const [expandedImage, setExpandedImage] = useState<ExpandedImagePreview | null>(null);
  const [optimisticUserMessages, setOptimisticUserMessages] = useState<ChatMessage[]>([]);
  const optimisticUserMessagesRef = useRef(optimisticUserMessages);
  optimisticUserMessagesRef.current = optimisticUserMessages;
  const [localDraftErrorsByDraftId, setLocalDraftErrorsByDraftId] = useState<
    Record<string, LocalThreadErrorEntry>
  >({});
  const [localServerErrorsByThreadKey, setLocalServerErrorsByThreadKey] = useState<
    Record<string, LocalThreadErrorEntry>
  >({});
  // Avi Code addition: the error banner's dismiss button used to be a no-op
  // whenever the error came from the server, because clearing the local error
  // just fell through to `session.lastError` again. Remembering the exact
  // message that was dismissed hides that one and no other, so a different
  // error arriving later still shows.
  const [dismissedServerErrorsByThreadKey, setDismissedServerErrorsByThreadKey] = useState<
    Record<string, string>
  >({});
  const [isConnecting, _setIsConnecting] = useState(false);
  const [isRevertingCheckpoint, setIsRevertingCheckpoint] = useState(false);
  // Avi Code addition: ephemeral desktop composer state for non-destructive message forks.
  const [forkEditState, setForkEditState] = useState<{
    sourceMessageId: MessageId;
    retainedAttachments: Array<ChatAttachment & { readonly previewUrl?: string }>;
    savedDraft: ComposerThreadDraftState;
  } | null>(null);
  const [isForkingThread, setIsForkingThread] = useState(false);
  // Avi Code addition: turns captured when their send was held until the running
  // turn finishes. Keyed by thread because a hold outlives navigating away, and
  // holding the built commands rather than a flag is what keeps later typing out
  // of an already-queued message.
  const heldTurnItems = useHeldTurnStore((state) => state.items);
  const heldTurnFailuresById = useHeldTurnStore((state) => state.failuresById);
  const heldTurnInFlightRef = useRef(new Set<CommandId>());
  const [maximizedRightPanelThreadKey, setMaximizedRightPanelThreadKey] = useState<string | null>(
    null,
  );
  const [respondingRequestIds, setRespondingRequestIds] = useState<ApprovalRequestId[]>([]);
  const [respondingUserInputRequestIds, setRespondingUserInputRequestIds] = useState<
    ApprovalRequestId[]
  >([]);
  // Requests placed here were abandoned by an explicit Stop. Their command
  // may still settle later, but that completion no longer owns visible state.
  const dismissedUserInputRequestIdsRef = useRef(new Set<ApprovalRequestId>());
  const [pendingUserInputState, dispatchPendingUserInput] = useReducer(
    pendingUserInputReducer,
    initialPendingUserInputState,
  );
  const useCompactRightPanel = useMediaQuery(RIGHT_PANEL_INLINE_LAYOUT_MEDIA_QUERY);
  // Tracks whether the user explicitly dismissed the sidebar for the active turn.
  const planSidebarDismissedForTurnRef = useRef<string | null>(null);
  // When set, the thread-change reset effect will open the sidebar instead of closing it.
  // Used by "Implement in a new thread" to carry the sidebar-open intent across navigation.
  const planSidebarOpenOnNextThreadRef = useRef(false);
  const [terminalFocusRequestId, setTerminalFocusRequestId] = useState(0);
  const [pullRequestDialogState, setPullRequestDialogState] =
    useState<PullRequestDialogState | null>(null);
  const [terminalUiLaunchContext, setTerminalUiLaunchContext] =
    useState<TerminalLaunchContext | null>(null);
  const [attachmentPreviewHandoffByMessageId, setAttachmentPreviewHandoffByMessageId] = useState<
    Record<string, string[]>
  >({});
  const [pendingServerThreadEnvMode, setPendingServerThreadEnvMode] =
    useState<DraftThreadEnvMode | null>(null);
  const [pendingServerThreadBranch, setPendingServerThreadBranch] = useState<string | null>();
  const [
    pendingServerThreadStartFromOriginByThreadId,
    setPendingServerThreadStartFromOriginByThreadId,
  ] = useState<Record<string, boolean>>({});
  const [lastInvokedScriptByProjectId, setLastInvokedScriptByProjectId] = useLocalStorage(
    LAST_INVOKED_SCRIPT_BY_PROJECT_KEY,
    {},
    LastInvokedScriptByProjectSchema,
  );
  const legendListRef = useRef<LegendListRef | null>(null);
  const [composerOverlayElement, setComposerOverlayElement] = useState<HTMLDivElement | null>(null);
  const [composerOverlayHeight, setComposerOverlayHeight] = useState(0);
  const isAtEndRef = useRef(true);
  const attachmentPreviewHandoffByMessageIdRef = useRef<Record<string, string[]>>({});
  const attachmentPreviewPromotionInFlightByMessageIdRef = useRef<Record<string, true>>({});
  const sendInFlightRef = useRef(false);
  // Avi Code addition: gate against accidental plan implementation.
  //
  // `onSend` treats an empty composer as "implement the plan" when a plan
  // follow-up prompt is showing. Without an explicit intent signal, any
  // programmatic `onSend()` call would start implementation. This ref is
  // set by `submitComposer` (Enter key or button click) and consumed
  // (reset) inside `onSend` on every invocation.
  const planImplementIntentRef = useRef(false);
  const terminalUiOpenByThreadRef = useRef<Record<string, boolean>>({});

  useLayoutEffect(() => {
    if (!composerOverlayElement) return;

    const updateHeight = () => {
      const nextHeight = Math.ceil(composerOverlayElement.getBoundingClientRect().height);
      if (nextHeight <= 0) return;
      setComposerOverlayHeight((currentHeight) =>
        currentHeight === nextHeight ? currentHeight : nextHeight,
      );
    };

    updateHeight();
    if (typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(updateHeight);
    observer.observe(composerOverlayElement);
    return () => observer.disconnect();
  }, [composerOverlayElement]);

  const terminalUiState = useTerminalUiStateStore((state) =>
    selectThreadTerminalUiState(state.terminalUiStateByThreadKey, routeThreadRef),
  );
  const openTerminalThreadKeys = useTerminalUiStateStore(
    useShallow((state) =>
      Object.entries(state.terminalUiStateByThreadKey).flatMap(
        ([nextThreadKey, nextTerminalUiState]) =>
          nextTerminalUiState.terminalOpen ? [nextThreadKey] : [],
      ),
    ),
  );
  const storeSetTerminalOpen = useTerminalUiStateStore((s) => s.setTerminalOpen);
  const storeEnsureTerminal = useTerminalUiStateStore((state) => state.ensureTerminal);
  const storeSplitTerminal = useTerminalUiStateStore((s) => s.splitTerminal);
  const storeSplitTerminalVertical = useTerminalUiStateStore((s) => s.splitTerminalVertical);
  const storeNewTerminal = useTerminalUiStateStore((s) => s.newTerminal);
  const storeSetActiveTerminal = useTerminalUiStateStore((s) => s.setActiveTerminal);
  const storeCloseTerminal = useTerminalUiStateStore((s) => s.closeTerminal);
  const serverThreadRefs = useThreadRefs();
  const allThreadShells = useThreadShells();
  const serverThreadKeys = useMemo(() => serverThreadRefs.map(scopedThreadKey), [serverThreadRefs]);
  const draftThreadsByThreadKey = useComposerDraftStore((store) => store.draftThreadsByThreadKey);
  const draftThreadKeys = useMemo(
    () =>
      Object.values(draftThreadsByThreadKey).map((draftThread) =>
        scopedThreadKey(scopeThreadRef(draftThread.environmentId, draftThread.threadId)),
      ),
    [draftThreadsByThreadKey],
  );
  const [mountedTerminalThreadKeys, setMountedTerminalThreadKeys] = useState<string[]>([]);
  const mountedTerminalThreadRefs = useMemo(
    () =>
      mountedTerminalThreadKeys.flatMap((mountedThreadKey) => {
        const mountedThreadRef = parseScopedThreadKey(mountedThreadKey);
        return mountedThreadRef ? [{ key: mountedThreadKey, threadRef: mountedThreadRef }] : [];
      }),
    [mountedTerminalThreadKeys],
  );

  const fallbackDraftProjectRef = draftThread
    ? scopeProjectRef(draftThread.environmentId, draftThread.projectId)
    : null;
  const fallbackDraftProject = useProject(fallbackDraftProjectRef);
  const localDraftError = activeServerThread
    ? null
    : ((draftId ? localDraftErrorsByDraftId[draftId]?.message : null) ?? null);
  const localServerError = localServerErrorsByThreadKey[routeThreadKey]?.message ?? null;
  // Draft errors are keyed by draftId while server errors are keyed by thread
  // key, so a pending draft entry must migrate when the server thread loads or
  // a failed send would silently disappear on promotion. When both keys hold
  // an entry, the most recent write wins.
  useEffect(() => {
    if (!activeServerThread || !draftId) {
      return;
    }
    const pendingDraftEntry = localDraftErrorsByDraftId[draftId];
    if (pendingDraftEntry === undefined) {
      return;
    }
    setLocalDraftErrorsByDraftId((existing) => {
      if (existing[draftId] === undefined) {
        return existing;
      }
      const next = { ...existing };
      delete next[draftId];
      return next;
    });
    setLocalServerErrorsByThreadKey((existing) => {
      const currentEntry = existing[routeThreadKey];
      if (
        currentEntry !== undefined &&
        (currentEntry.at > pendingDraftEntry.at ||
          currentEntry.message === pendingDraftEntry.message)
      ) {
        return existing;
      }
      return {
        ...existing,
        [routeThreadKey]: pendingDraftEntry,
      };
    });
  }, [activeServerThread, draftId, localDraftErrorsByDraftId, routeThreadKey]);
  const localDraftThread = useMemo(
    () =>
      draftThread
        ? buildLocalDraftThread(
            threadId,
            draftThread,
            fallbackDraftProject?.defaultModelSelection ?? NO_PROVIDER_MODEL_SELECTION,
          )
        : undefined,
    [draftThread, fallbackDraftProject?.defaultModelSelection, threadId],
  );
  // Promotion is data-driven: the draft route keeps rendering while the
  // server thread (same pre-allocated ref) starts, so live state must not
  // depend on which route is mounted.
  const isServerThread = activeServerThread !== null;
  const activeThread = activeServerThread ?? localDraftThread;
  const serverSessionError = activeServerThread?.session?.lastError ?? null;
  const dismissedServerError = dismissedServerErrorsByThreadKey[routeThreadKey] ?? null;
  const threadError = isServerThread
    ? (localServerError ??
      (serverSessionError !== null && serverSessionError === dismissedServerError
        ? null
        : serverSessionError))
    : localDraftError;
  const runtimeMode = composerRuntimeMode ?? activeThread?.runtimeMode ?? DEFAULT_RUNTIME_MODE;
  // Avi Code addition: the final fallback (an unmaterialized new draft) honours
  // the start-in-plan-mode setting; server threads always carry a mode.
  const interactionMode =
    composerInteractionMode ?? activeThread?.interactionMode ?? resolveInitialInteractionMode();
  const isLocalDraftThread = !isServerThread && localDraftThread !== undefined;
  const canCheckoutPullRequestIntoThread = isLocalDraftThread;
  const activeThreadId = activeThread?.id ?? null;
  const runningTerminalIds = useThreadRunningTerminalIds({
    environmentId: activeThread?.environmentId ?? null,
    threadId: activeThreadId,
  });
  const activeThreadKnownSessionsRaw = useKnownTerminalSessions({
    environmentId: activeThread?.environmentId ?? null,
    threadId: activeThreadId,
  });
  const activeThreadKnownSessions = useMemo(() => {
    if (activeThreadId === null) {
      return [];
    }
    return activeThreadKnownSessionsRaw.filter(
      (session) => session.target.threadId === activeThreadId,
    );
  }, [activeThreadId, activeThreadKnownSessionsRaw]);
  const activeServerOrderedTerminalIds = useMemo(
    () => activeThreadKnownSessions.map((session) => session.target.terminalId),
    [activeThreadKnownSessions],
  );
  const activeKnownTerminalIds = useMemo(
    () => [...new Set([...activeServerOrderedTerminalIds, ...terminalUiState.terminalIds])],
    [activeServerOrderedTerminalIds, terminalUiState.terminalIds],
  );
  const activeTerminalLabelsById = useMemo(() => {
    const labels = new Map<string, string>();
    for (const session of activeThreadKnownSessions) {
      labels.set(
        session.target.terminalId,
        resolveTerminalSessionLabel(session.target.terminalId, session.state.summary),
      );
    }
    return labels;
  }, [activeThreadKnownSessions]);
  const activeThreadRef = useMemo(
    () => (activeThread ? scopeThreadRef(activeThread.environmentId, activeThread.id) : null),
    [activeThread],
  );
  const activeThreadKey = activeThreadRef ? scopedThreadKey(activeThreadRef) : null;
  // Avi Code addition: the turn this thread is holding, if any. Declared up here
  // because the composer banner and the timeline both read it long before the
  // send path that creates it.
  const activeHeldTurn = useMemo(
    () => findHeldTurnForThread(heldTurnItems, activeThreadKey),
    [activeThreadKey, heldTurnItems],
  );
  const isHoldingSend = activeHeldTurn !== null;
  const activeHeldTurnFailure = activeHeldTurn
    ? (heldTurnFailuresById[activeHeldTurn.id] ?? null)
    : null;
  const [timelineAnchor, setTimelineAnchor] = useState<{
    readonly threadKey: string | null;
    readonly messageId: MessageId | null;
  }>({ threadKey: activeThreadKey, messageId: null });
  if (timelineAnchor.threadKey !== activeThreadKey) {
    setTimelineAnchor({ threadKey: activeThreadKey, messageId: null });
  }
  const timelineAnchorMessageId = timelineAnchor.messageId;
  const storedRightPanelState = useRightPanelStore((state) =>
    selectThreadRightPanelState(state.byThreadKey, activeThreadRef),
  );
  // When enabled, the right panel follows the user between threads instead of
  // each thread remembering its own visibility.
  const rightPanelFollowsThreads = useClientSettings(
    (settings) => settings.rightPanelFollowsThreads,
  );
  const rightPanelVisibilityPreference = useRightPanelStore((state) => state.visibilityPreference);
  const rightPanelState = useMemo(
    () =>
      resolveFollowedRightPanelState(
        storedRightPanelState,
        rightPanelVisibilityPreference,
        rightPanelFollowsThreads,
      ),
    [rightPanelFollowsThreads, rightPanelVisibilityPreference, storedRightPanelState],
  );
  const activeRightPanelSurface = useMemo(
    () =>
      rightPanelState.isOpen
        ? (rightPanelState.surfaces.find(
            (surface) => surface.id === rightPanelState.activeSurfaceId,
          ) ?? null)
        : null,
    [rightPanelState],
  );
  const activeRightPanelKind = activeRightPanelSurface?.kind ?? null;
  const activeFileSurface =
    activeRightPanelSurface?.kind === "file" ? activeRightPanelSurface : null;
  const diffOpen = activeRightPanelKind === "diff";
  // Avi Code addition. Upstream pinned the chat column to a fixed 48rem in six
  // separate class strings. They all read `--chat-content-max-width` now, which
  // this sets once on the chat root from the user's setting.
  const chatContentWidth = useClientSettings((settings) => settings.aviCodeChatContentWidth);
  // Avi Code addition: steer the running turn, or hold the send until it ends.
  const sendWhileRunning = useClientSettings((settings) => settings.aviCodeSendWhileRunning);
  const chatContentWidthStyle = useMemo(
    () =>
      ({
        "--chat-content-max-width": chatContentMaxWidthCss(chatContentWidth),
      }) as CSSProperties,
    [chatContentWidth],
  );
  useEffect(() => {
    if (!rightPanelFollowsThreads || !activeThreadRef) return;
    useRightPanelStore.getState().adoptVisibilityPreference(activeThreadRef);
    // activeThreadRef is intentionally omitted; it is a fresh object each
    // render, and activeThreadKey already identifies the thread. Including it
    // would re-adopt the preference on every render and fight manual toggles.
  }, [activeThreadKey, rightPanelFollowsThreads]);
  const activePreviewState = useThreadPreviewState(activeThreadRef);
  const activePreviewMiniPlayer = usePreviewMiniPlayerStore((state) =>
    selectThreadPreviewMiniPlayer(state.byThreadKey, activeThreadRef),
  );
  const panelTerminalIds = useMemo(
    () =>
      new Set(
        rightPanelState.surfaces.flatMap((surface) =>
          surface.kind === "terminal" ? surface.terminalIds : [],
        ),
      ),
    [rightPanelState.surfaces],
  );
  const previewPanelOpen = activeRightPanelKind === "preview" && isPreviewSupportedInRuntime();
  const rightPanelOpen = rightPanelState.isOpen;
  const rightPanelSplitLayout = useRightPanelSplitLayout({ panelOpen: rightPanelOpen });
  const shouldUsePlanSidebarSheet =
    useCompactRightPanel || (!isElectron && rightPanelSplitLayout.layout?.fitsInline === false);
  useDesktopRightPanelWindowReservation({
    open: rightPanelOpen && !shouldUsePlanSidebarSheet,
    panelWidth: rightPanelSplitLayout.layout?.panelWidth ?? null,
  });
  const canMaximizeRightPanel = rightPanelOpen && !shouldUsePlanSidebarSheet;
  const rightPanelMaximized =
    canMaximizeRightPanel && maximizedRightPanelThreadKey === routeThreadKey;
  const inlineRightPanelOwnsTitleBar = rightPanelOpen && !shouldUsePlanSidebarSheet;

  useEffect(() => {
    if (!activeThreadRef) return;
    useRightPanelStore
      .getState()
      .reconcileBrowserSurfaces(activeThreadRef, Object.keys(activePreviewState.sessions));
  }, [activePreviewState.sessions, activeThreadRef]);

  useEffect(() => {
    if (!activeThreadRef || !activePreviewMiniPlayer) return;
    const miniTabStillExists = Boolean(activePreviewState.sessions[activePreviewMiniPlayer.tabId]);
    const sameTabOpenInPanel =
      previewPanelOpen &&
      activeRightPanelSurface?.kind === "preview" &&
      activeRightPanelSurface.resourceId === activePreviewMiniPlayer.tabId;
    if (!miniTabStillExists || sameTabOpenInPanel) {
      usePreviewMiniPlayerStore.getState().close(activeThreadRef);
    }
  }, [
    activePreviewMiniPlayer,
    activePreviewState.sessions,
    activeRightPanelSurface,
    activeThreadRef,
    previewPanelOpen,
  ]);

  const planSidebarOpen = activeRightPanelKind === "plan";

  const existingOpenTerminalThreadKeys = useMemo(() => {
    const existingThreadKeys = new Set<string>([...serverThreadKeys, ...draftThreadKeys]);
    return openTerminalThreadKeys.filter((nextThreadKey) => existingThreadKeys.has(nextThreadKey));
  }, [draftThreadKeys, openTerminalThreadKeys, serverThreadKeys]);
  const activeLatestTurn = activeThread?.latestTurn ?? null;
  const sourcePlanThreadRef = useMemo(() => {
    const sourceThreadId = activeLatestTurn?.sourceProposedPlan?.threadId;
    if (!activeThread || !sourceThreadId || sourceThreadId === activeThread.id) {
      return null;
    }
    return scopeThreadRef(activeThread.environmentId, sourceThreadId);
  }, [activeLatestTurn?.sourceProposedPlan?.threadId, activeThread]);
  const sourceThreadProposedPlans = useThreadProposedPlans(sourcePlanThreadRef);
  const threadPlanCatalog = useMemo<ThreadPlanCatalogEntry[]>(() => {
    if (!activeThread) {
      return [];
    }
    const entries: ThreadPlanCatalogEntry[] = [
      { id: activeThread.id, proposedPlans: activeThread.proposedPlans },
    ];
    if (sourcePlanThreadRef) {
      entries.push({
        id: sourcePlanThreadRef.threadId,
        proposedPlans: sourceThreadProposedPlans,
      });
    }
    return entries;
  }, [activeThread, sourcePlanThreadRef, sourceThreadProposedPlans]);
  useEffect(() => {
    setMountedTerminalThreadKeys((currentThreadIds) => {
      const nextThreadIds = reconcileMountedTerminalThreadIds({
        currentThreadIds,
        openThreadIds: existingOpenTerminalThreadKeys,
        activeThreadId: activeThreadKey,
        activeThreadTerminalOpen: Boolean(activeThreadKey && terminalUiState.terminalOpen),
        maxHiddenThreadCount: MAX_HIDDEN_MOUNTED_TERMINAL_THREADS,
      });
      return currentThreadIds.length === nextThreadIds.length &&
        currentThreadIds.every((nextThreadId, index) => nextThreadId === nextThreadIds[index])
        ? currentThreadIds
        : nextThreadIds;
    });
  }, [activeThreadKey, existingOpenTerminalThreadKeys, terminalUiState.terminalOpen]);
  const latestTurnSettled = isLatestTurnSettled(activeLatestTurn, activeThread?.session ?? null);
  const activeProjectRef = activeThread
    ? scopeProjectRef(activeThread.environmentId, activeThread.projectId)
    : null;
  const activeProject = useProject(activeProjectRef);
  useEffect(() => {
    const syncTitle = () => {
      document.title = formatThreadWindowTitle({
        repository: activeProject?.title ?? null,
        threadTitle: activeThread?.title ?? null,
        private: isWindowTitlePrivacyEnabled(),
      });
    };
    syncTitle();
    window.addEventListener(WINDOW_TITLE_PRIVACY_EVENT, syncTitle);
    return () => window.removeEventListener(WINDOW_TITLE_PRIVACY_EVENT, syncTitle);
  }, [activeProject?.title, activeThread?.title]);
  const handleNewThreadInActiveProject = useCallback(() => {
    startNewThreadForProject(activeProjectRef, handleNewThread);
  }, [activeProjectRef, handleNewThread]);
  const activeEnvironmentShell = useEnvironmentQuery(
    activeThread ? environmentShell.stateAtom(activeThread.environmentId) : null,
  );
  const activeEnvironmentBootstrapComplete = activeEnvironmentShell.data?.snapshot._tag === "Some";
  const activeProjectKey = activeProject
    ? `${activeProject.environmentId}:${activeProject.workspaceRoot}`
    : null;
  const [pendingFileSurfaceIdsByProject, setPendingFileSurfaceIdsByProject] = useState<
    ReadonlyMap<string, ReadonlySet<string>>
  >(() => new Map());
  const pendingFileSurfaceIds = activeProjectKey
    ? (pendingFileSurfaceIdsByProject.get(activeProjectKey) ?? EMPTY_PENDING_FILE_SURFACE_IDS)
    : EMPTY_PENDING_FILE_SURFACE_IDS;
  const handleFilePendingChange = useCallback(
    (relativePath: string, pending: boolean) => {
      if (!activeProjectKey) return;
      setPendingFileSurfaceIdsByProject((currentByProject) => {
        const current = currentByProject.get(activeProjectKey) ?? EMPTY_PENDING_FILE_SURFACE_IDS;
        const surfaceId = `file:${relativePath}`;
        if (current.has(surfaceId) === pending) return currentByProject;
        const next = new Set(current);
        if (pending) next.add(surfaceId);
        else next.delete(surfaceId);
        const nextByProject = new Map(currentByProject);
        if (next.size === 0) nextByProject.delete(activeProjectKey);
        else nextByProject.set(activeProjectKey, next);
        return nextByProject;
      });
    },
    [activeProjectKey],
  );
  const configuredPreviewUrls = useMemo(
    () => getConfiguredPreviewUrls(activeProject?.scripts),
    [activeProject?.scripts],
  );

  useEffect(() => {
    if (!activeThreadRef || !activeEnvironmentBootstrapComplete) return;
    useRightPanelStore.getState().reconcileFileSurfaces(activeThreadRef, activeProject !== null);
  }, [activeEnvironmentBootstrapComplete, activeProject, activeThreadRef]);

  // Compute the list of environments this logical project spans, used to
  // drive the environment picker in BranchToolbar.
  const allProjects = useProjects();
  const threadContextCandidates = useMemo(() => {
    const projectTitles = new Map(
      allProjects
        .filter((project) => project.environmentId === environmentId)
        .map((project) => [project.id, project.title]),
    );
    return allThreadShells
      .filter((thread) => thread.environmentId === environmentId && thread.id !== activeThreadId)
      .map((thread) => ({
        threadId: thread.id,
        title: thread.title,
        projectTitle: projectTitles.get(thread.projectId) ?? "Unknown project",
        updatedAt: thread.updatedAt,
        archived: thread.archivedAt !== null,
      }))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }, [activeThreadId, allProjects, allThreadShells, environmentId]);
  const primaryEnvironmentId = primaryEnvironment?.environmentId ?? null;
  const activeEnvironment =
    activeThread == null ? null : (environmentById.get(activeThread.environmentId) ?? null);
  const offlineTurnOutboxItems = useOfflineTurnOutboxStore((state) => state.items);
  const activeQueuedTurnItems = useMemo(
    () =>
      activeThread == null
        ? []
        : offlineTurnOutboxItems.filter(
            (item) =>
              item.environmentId === activeThread.environmentId &&
              item.threadId === activeThread.id,
          ),
    [activeThread, offlineTurnOutboxItems],
  );
  // Avi Code addition: a held turn renders the same pending row an offline one
  // does. It is built from the stored command rather than the optimistic list so
  // it survives navigating away and back, which a hold is allowed to do.
  const queuedTurnMessages = useMemo(
    () =>
      [...activeQueuedTurnItems, ...(activeHeldTurn ? [activeHeldTurn] : [])].flatMap(
        (item) => queuedTurnChatMessage(item) ?? [],
      ),
    [activeHeldTurn, activeQueuedTurnItems],
  );
  const hasQueuedTurn = activeQueuedTurnItems.length > 0;
  const activeEnvironmentConnectionPhase = activeEnvironment?.connection.phase ?? "available";
  const activeEnvironmentUnavailable =
    activeEnvironment !== null && activeEnvironmentConnectionPhase !== "connected";
  const activeEnvironmentUnavailableLabel = activeEnvironment?.label ?? null;
  const activeEnvironmentUnavailableState = useMemo<EnvironmentUnavailableState | null>(() => {
    if (!activeEnvironmentUnavailable || !activeEnvironmentUnavailableLabel || !activeEnvironment) {
      return null;
    }

    return {
      environmentId: activeEnvironment.environmentId,
      label: activeEnvironmentUnavailableLabel,
      connection: activeEnvironment.connection,
    };
  }, [activeEnvironment, activeEnvironmentUnavailable, activeEnvironmentUnavailableLabel]);
  const handleReconnectActiveEnvironment = useCallback(
    async (environmentId: EnvironmentId) => {
      const result = await retryEnvironment(environmentId);
      if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
        const error = squashAtomCommandFailure(result);
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: "Could not reconnect environment",
            description: error instanceof Error ? error.message : "Failed to reconnect.",
          }),
        );
      }
    },
    [retryEnvironment],
  );
  const projectGroupingSettings = selectProjectGroupingSettings(settings);
  const logicalProjectEnvironments = useMemo(() => {
    if (!activeProject) return [];
    const logicalKey = deriveLogicalProjectKeyFromSettings(activeProject, projectGroupingSettings);
    const memberProjects = allProjects.filter(
      (p) => deriveLogicalProjectKeyFromSettings(p, projectGroupingSettings) === logicalKey,
    );
    const seen = new Set<string>();
    const envs: Array<{
      environmentId: EnvironmentId;
      projectId: ProjectId;
      label: string;
      isPrimary: boolean;
    }> = [];
    for (const p of memberProjects) {
      if (seen.has(p.environmentId)) continue;
      seen.add(p.environmentId);
      const isPrimary = p.environmentId === primaryEnvironmentId;
      const label = environmentById.get(p.environmentId)?.label ?? p.environmentId;
      envs.push({
        environmentId: p.environmentId,
        projectId: p.id,
        label,
        isPrimary,
      });
    }
    // Sort: primary first, then alphabetical
    envs.sort((a, b) => {
      if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
      return a.label.localeCompare(b.label);
    });
    return envs;
  }, [activeProject, allProjects, projectGroupingSettings, primaryEnvironmentId, environmentById]);
  const hasMultipleEnvironments = logicalProjectEnvironments.length > 1;

  const openPullRequestDialog = useCallback(
    (reference?: string) => {
      if (!canCheckoutPullRequestIntoThread) {
        return;
      }
      setPullRequestDialogState({
        initialReference: reference ?? null,
        key: Date.now(),
      });
    },
    [canCheckoutPullRequestIntoThread],
  );

  const closePullRequestDialog = useCallback(() => {
    setPullRequestDialogState(null);
  }, []);

  const openOrReuseProjectDraftThread = useCallback(
    async (input: { branch: string; worktreePath: string | null; envMode: DraftThreadEnvMode }) => {
      if (!activeProject) {
        throw new Error("No active project is available for this pull request.");
      }
      const activeProjectRef = scopeProjectRef(activeProject.environmentId, activeProject.id);
      const logicalProjectKey = deriveLogicalProjectKeyFromSettings(
        activeProject,
        projectGroupingSettings,
      );
      const storedDraftSession = getDraftSessionByLogicalProjectKey(logicalProjectKey);
      if (storedDraftSession) {
        setDraftThreadContext(storedDraftSession.draftId, input);
        setLogicalProjectDraftThreadId(
          logicalProjectKey,
          activeProjectRef,
          storedDraftSession.draftId,
          {
            threadId: storedDraftSession.threadId,
            ...input,
          },
        );
        if (routeKind !== "draft" || draftId !== storedDraftSession.draftId) {
          await navigate({
            to: "/draft/$draftId",
            params: buildDraftThreadRouteParams(storedDraftSession.draftId),
          });
        }
        return storedDraftSession.threadId;
      }

      const activeDraftSession = routeKind === "draft" && draftId ? getDraftSession(draftId) : null;
      if (
        !isServerThread &&
        activeDraftSession?.logicalProjectKey === logicalProjectKey &&
        draftId
      ) {
        setDraftThreadContext(draftId, input);
        setLogicalProjectDraftThreadId(logicalProjectKey, activeProjectRef, draftId, {
          threadId: activeDraftSession.threadId,
          createdAt: activeDraftSession.createdAt,
          runtimeMode: activeDraftSession.runtimeMode,
          interactionMode: activeDraftSession.interactionMode,
          ...input,
        });
        return activeDraftSession.threadId;
      }

      const nextDraftId = newDraftId();
      const nextThreadId = newThreadId();
      setLogicalProjectDraftThreadId(logicalProjectKey, activeProjectRef, nextDraftId, {
        threadId: nextThreadId,
        createdAt: new Date().toISOString(),
        runtimeMode: DEFAULT_RUNTIME_MODE,
        // Avi Code addition: new drafts honour the start-in-plan-mode setting.
        interactionMode: resolveInitialInteractionMode(),
        ...input,
      });
      await navigate({
        to: "/draft/$draftId",
        params: buildDraftThreadRouteParams(nextDraftId),
      });
      return nextThreadId;
    },
    [
      activeProject,
      draftId,
      getDraftSession,
      getDraftSessionByLogicalProjectKey,
      isServerThread,
      navigate,
      projectGroupingSettings,
      routeKind,
      setDraftThreadContext,
      setLogicalProjectDraftThreadId,
    ],
  );

  const handlePreparedPullRequestThread = useCallback(
    async (input: { branch: string; worktreePath: string | null }) => {
      await openOrReuseProjectDraftThread({
        branch: input.branch,
        worktreePath: input.worktreePath,
        envMode: input.worktreePath ? "worktree" : "local",
      });
    },
    [openOrReuseProjectDraftThread],
  );

  useEffect(() => {
    // The rule itself, and why it is shaped that way, lives in
    // `shouldMarkThreadVisited`. The effect re-runs on refocus, so returning
    // to a still-open thread clears its indicator.
    if (!serverThread?.id) return;
    if (
      !shouldMarkThreadVisited({
        threadUpdatedAt: serverThread.updatedAt,
        lastVisitedAt: activeThreadLastVisitedAt,
        windowActive,
      })
    ) {
      return;
    }

    markThreadVisited(
      scopedThreadKey(scopeThreadRef(serverThread.environmentId, serverThread.id)),
      serverThread.updatedAt,
    );
  }, [
    activeThreadLastVisitedAt,
    markThreadVisited,
    serverThread?.environmentId,
    serverThread?.id,
    serverThread?.updatedAt,
    windowActive,
  ]);

  const selectedProviderByThreadId = composerActiveProvider ?? null;
  const threadProvider =
    activeThread?.modelSelection.instanceId ??
    activeProject?.defaultModelSelection?.instanceId ??
    null;
  const lockedProvider = deriveLockedProvider({
    thread: activeThread,
    selectedProvider: selectedProviderByThreadId,
    threadProvider,
  });
  // Once a thread selects an environment, never substitute the primary
  // environment's config while the selected environment is still loading.
  const serverConfig = activeThread
    ? (activeEnvironment?.serverConfig ?? null)
    : (primaryEnvironment?.serverConfig ?? null);
  const versionMismatch = resolveServerConfigVersionMismatch(serverConfig);
  const versionMismatchDismissKey =
    versionMismatch && activeThread
      ? buildVersionMismatchDismissalKey(activeThread.environmentId, versionMismatch)
      : null;
  const [dismissedVersionMismatchKey, setDismissedVersionMismatchKey] = useState<string | null>(
    null,
  );
  const versionMismatchDismissed =
    versionMismatchDismissKey === dismissedVersionMismatchKey ||
    isVersionMismatchDismissed(versionMismatchDismissKey);
  const showVersionMismatchBanner =
    versionMismatch !== null && versionMismatchDismissKey !== null && !versionMismatchDismissed;
  const hasMultipleRegisteredEnvironments = environments.length > 1;
  const versionMismatchServerLabel =
    hasMultipleRegisteredEnvironments && activeThread
      ? `${environmentById.get(activeThread.environmentId)?.label ?? serverConfig?.environment.label ?? activeThread.environmentId} server`
      : "server";
  const serverUpdateEnvironmentId = activeThread?.environmentId ?? null;
  const versionMismatchSelfUpdate = resolveServerSelfUpdateCapability(serverConfig);
  const serverUpdateState = useAtomValue(
    serverEnvironment.updateStateAtom(serverUpdateEnvironmentId),
  );
  const systemComposerBannerItems = useMemo<ComposerBannerStackItem[]>(() => {
    const items: ComposerBannerStackItem[] = [];
    const resumingServerUpdate =
      serverUpdateState.status === "running" && serverUpdateState.stage === "resuming";
    if (activeEnvironmentUnavailableState && !resumingServerUpdate) {
      const connection = activeEnvironmentUnavailableState.connection;
      const isReconnecting =
        connection.phase === "connecting" || connection.phase === "reconnecting";
      items.push({
        id: `environment-unavailable:${activeEnvironmentUnavailableState.environmentId}`,
        variant: connection.phase === "error" ? "error" : "warning",
        icon: <WifiOffIcon />,
        title: `${activeEnvironmentUnavailableState.label}: ${connectionStatusTitle(connection)}`,
        description:
          activeQueuedTurnItems.length > 0
            ? `${activeQueuedTurnItems.length === 1 ? "A message is" : `${activeQueuedTurnItems.length} messages are`} queued and will send automatically when this environment reconnects.`
            : (connection.error ??
              "Messages can be queued while this environment reconnects. Other actions still require a connection."),
        actions: (
          <>
            <Button
              size="xs"
              disabled={isReconnecting}
              onClick={() =>
                void handleReconnectActiveEnvironment(
                  activeEnvironmentUnavailableState.environmentId,
                )
              }
            >
              {isReconnecting ? "Reconnecting..." : "Reconnect"}
            </Button>
            <Button
              size="xs"
              variant="outline"
              onClick={() => void navigate({ to: "/settings/connections" })}
            >
              Connections
            </Button>
          </>
        ),
      });
    }
    if (
      serverUpdateEnvironmentId &&
      (serverUpdateState.status !== "idle" ||
        (showVersionMismatchBanner && versionMismatch && versionMismatchDismissKey))
    ) {
      const updateInProgress = serverUpdateState.status === "running";
      const updateFailed = serverUpdateState.status === "failed";
      items.push({
        id: `server-version:${serverUpdateEnvironmentId}`,
        variant: updateFailed ? "error" : "warning",
        icon: <TriangleAlertIcon />,
        title:
          updateInProgress || updateFailed
            ? `${updateFailed ? "Could not update" : "Updating"} ${versionMismatchServerLabel}`
            : "Client and server versions differ",
        description:
          updateInProgress || updateFailed ? (
            <ServerUpdateProgress
              fromVersion={serverUpdateState.fromVersion}
              serverLabel={versionMismatchServerLabel}
              state={serverUpdateState}
            />
          ) : versionMismatch ? (
            <>
              Client {versionMismatch.clientVersion} is connected to {versionMismatchServerLabel}{" "}
              {versionMismatch.serverVersion}.{" "}
              {serverUpdateGuidance(versionMismatchSelfUpdate, versionMismatchServerLabel)}
            </>
          ) : null,
        // The desktop-managed guidance is already the description; the action
        // slot would only repeat it.
        actions:
          updateInProgress ||
          !versionMismatch ||
          versionMismatchSelfUpdate === "desktop-managed" ? undefined : (
            <ServerUpdateAction
              environmentId={serverUpdateEnvironmentId}
              serverLabel={versionMismatchServerLabel}
              selfUpdate={versionMismatchSelfUpdate}
              targetVersion={versionMismatch.clientVersion}
              {...(updateFailed ? { label: "Retry update" } : {})}
            />
          ),
        ...(updateInProgress || updateFailed || !versionMismatchDismissKey
          ? {}
          : {
              dismissLabel: "Dismiss version mismatch warning",
              onDismiss: () => {
                dismissVersionMismatch(versionMismatchDismissKey);
                setDismissedVersionMismatchKey(versionMismatchDismissKey);
              },
            }),
      });
    }
    return items;
  }, [
    activeEnvironmentUnavailableState,
    activeQueuedTurnItems.length,
    handleReconnectActiveEnvironment,
    navigate,
    setDismissedVersionMismatchKey,
    showVersionMismatchBanner,
    serverUpdateState,
    versionMismatch,
    versionMismatchDismissKey,
    serverUpdateEnvironmentId,
    versionMismatchSelfUpdate,
    versionMismatchServerLabel,
  ]);
  const providerStatuses = serverConfig?.providers ?? EMPTY_PROVIDERS;
  const providerDiscoveryState =
    serverConfig === null && activeEnvironmentUnavailableState === null ? "loading" : "ready";
  const unlockedSelectedProvider = resolveSelectableProvider(
    providerStatuses,
    selectedProviderByThreadId ?? threadProvider,
  );
  const selectedProvider: ProviderDriverKind = lockedProvider ?? unlockedSelectedProvider;
  const phase = derivePhase(activeThread?.session ?? null);
  const threadActivities = activeThread?.activities ?? EMPTY_ACTIVITIES;
  const workLogEntries = useMemo(() => deriveWorkLogEntries(threadActivities), [threadActivities]);
  const pendingApprovals = useMemo(
    () => derivePendingApprovals(threadActivities),
    [threadActivities],
  );
  const pendingUserInputs = useMemo(
    () => derivePendingUserInputs(threadActivities),
    [threadActivities],
  );
  const activePendingUserInput = pendingUserInputs[0] ?? null;
  const activePendingDraftAnswers = useMemo(
    () =>
      activePendingUserInput
        ? (pendingUserInputState.answersByRequestId[activePendingUserInput.requestId] ??
          EMPTY_PENDING_USER_INPUT_ANSWERS)
        : EMPTY_PENDING_USER_INPUT_ANSWERS,
    [activePendingUserInput, pendingUserInputState.answersByRequestId],
  );
  const activePendingQuestionIndex = activePendingUserInput
    ? (pendingUserInputState.questionIndexByRequestId[activePendingUserInput.requestId] ?? 0)
    : 0;
  const activePendingProgress = useMemo(
    () =>
      activePendingUserInput
        ? derivePendingUserInputProgress(
            activePendingUserInput.questions,
            activePendingDraftAnswers,
            activePendingQuestionIndex,
          )
        : null,
    [activePendingDraftAnswers, activePendingQuestionIndex, activePendingUserInput],
  );
  const activePendingResolvedAnswers = useMemo(
    () =>
      activePendingUserInput
        ? buildPendingUserInputAnswers(activePendingUserInput.questions, activePendingDraftAnswers)
        : null,
    [activePendingDraftAnswers, activePendingUserInput],
  );
  const activePendingIsResponding = activePendingUserInput
    ? respondingUserInputRequestIds.includes(activePendingUserInput.requestId)
    : false;
  // Avi Code addition: a question dies with its provider session, but the
  // answer already chosen for it should not. Hand it back as composer text so
  // one send restarts the turn carrying it, and drop the per-request draft
  // state, which nothing will ever accept again. Recovery is deliberately
  // gated on that draft still existing in this session: an expiry from a
  // previous run has no answer to return and must not surprise anyone by
  // writing into their composer when they open an old thread.
  const expiredUserInputs = useMemo(
    () => deriveExpiredUserInputs(threadActivities),
    [threadActivities],
  );
  const recoveredExpiredUserInputIdsRef = useRef<Set<string>>(new Set());
  const [deferredExpiredUserInputRecovery, setDeferredExpiredUserInputRecovery] = useState<{
    requestId: string;
    prompt: string;
  } | null>(null);
  const restoreExpiredUserInput = useCallback(
    (recovery: { requestId: string; prompt: string }) => {
      const nextPrompt = mergeExpiredUserInputWithComposerDraft(promptRef.current, recovery.prompt);
      promptRef.current = nextPrompt;
      setComposerDraftPrompt(composerDraftTarget, nextPrompt);
      composerRef.current?.resetCursorState({
        cursor: collapseExpandedComposerCursor(nextPrompt, nextPrompt.length),
        prompt: nextPrompt,
        detectTrigger: true,
      });
      markExpiredUserInputRecoveryHandled(window.localStorage, recovery.requestId);
      setDeferredExpiredUserInputRecovery(null);
    },
    [composerDraftTarget, composerRef, setComposerDraftPrompt],
  );
  useEffect(() => {
    const unseen = expiredUserInputs.filter(
      (entry) =>
        !recoveredExpiredUserInputIdsRef.current.has(entry.requestId) &&
        !hasHandledExpiredUserInputRecovery(window.localStorage, entry.requestId),
    );
    if (unseen.length === 0) return;

    let recoveredPrompt: string | null = null;
    let recoveredRequestId: string | null = null;
    for (const entry of unseen) {
      recoveredExpiredUserInputIdsRef.current.add(entry.requestId);
      if (recoveredPrompt !== null) continue;
      recoveredPrompt = entry.submittedAnswers
        ? formatExpiredUserInputAnswers(entry.questions, entry.submittedAnswers)
        : null;
      if (recoveredPrompt === null) {
        const draft = pendingUserInputState.answersByRequestId[entry.requestId];
        if (draft) {
          recoveredPrompt = formatExpiredUserInputDraft(entry.questions, draft);
        }
      }
      if (recoveredPrompt !== null) {
        recoveredRequestId = entry.requestId;
        setDeferredExpiredUserInputRecovery({
          requestId: entry.requestId,
          prompt: recoveredPrompt,
        });
      }
    }

    const expiredRequestIds = new Set(unseen.map((entry) => entry.requestId));
    dispatchPendingUserInput({ type: "requests-cleared", requestIds: expiredRequestIds });

    // Restore immediately when safe. Otherwise the banner below offers an
    // explicit restore that appends without overwriting the current draft.
    if (recoveredPrompt === null || promptRef.current.trim().length > 0) return;
    if (recoveredRequestId !== null) {
      restoreExpiredUserInput({ requestId: recoveredRequestId, prompt: recoveredPrompt });
    }
  }, [expiredUserInputs, pendingUserInputState.answersByRequestId, restoreExpiredUserInput]);
  const activeProposedPlan = useMemo(() => {
    if (!latestTurnSettled) {
      return null;
    }
    return findLatestProposedPlan(
      activeThread?.proposedPlans ?? [],
      activeLatestTurn?.turnId ?? null,
    );
  }, [activeLatestTurn?.turnId, activeThread?.proposedPlans, latestTurnSettled]);
  const sidebarProposedPlan = useMemo(
    () =>
      findSidebarProposedPlan({
        threads: threadPlanCatalog,
        latestTurn: activeLatestTurn,
        latestTurnSettled,
        threadId: activeThread?.id ?? null,
      }),
    [activeLatestTurn, activeThread?.id, latestTurnSettled, threadPlanCatalog],
  );
  const activePlan = useMemo(
    () => deriveActivePlanState(threadActivities, activeLatestTurn?.turnId ?? undefined),
    [activeLatestTurn?.turnId, threadActivities],
  );
  const pendingPlanDecision = derivePendingPlanDecision({
    latestTurnSettled,
    hasActionablePlan: hasActionableProposedPlan(activeProposedPlan),
    hasPendingUserInput: pendingUserInputs.length > 0,
  });
  const interactionModeLockedByPlan = pendingPlanDecision.interactionModeLocked;
  const effectiveInteractionMode = interactionModeLockedByPlan ? "plan" : interactionMode;
  const planSidebarLabel =
    sidebarProposedPlan || effectiveInteractionMode === "plan" ? "Plan" : "Tasks";
  const showPlanFollowUpPrompt = pendingPlanDecision.showPlanFollowUpPrompt;
  const linkedPlanReview = useMemo(
    () =>
      activeThread && activeProposedPlan
        ? findLatestPlanReviewShell(allThreadShells, {
            environmentId: activeThread.environmentId,
            planThreadId: activeThread.id,
            planId: activeProposedPlan.id,
          })
        : null,
    [activeProposedPlan, activeThread, allThreadShells],
  );
  const onOpenLinkedPlanReview = useCallback(() => {
    if (!activeThread || !linkedPlanReview) return;
    void navigate({
      to: "/$environmentId/$threadId",
      params: {
        environmentId: activeThread.environmentId,
        threadId: linkedPlanReview.id,
      },
    });
  }, [activeThread, linkedPlanReview, navigate]);
  const activePendingApproval = pendingApprovals[0] ?? null;
  const {
    beginLocalDispatch,
    resetLocalDispatch,
    localDispatchStartedAt,
    isPreparingWorktree,
    isSendBusy,
  } = useLocalDispatchState({
    activeThread,
    activeLatestTurn,
    phase,
    activePendingApproval: activePendingApproval?.requestId ?? null,
    activePendingUserInput: activePendingUserInput?.requestId ?? null,
    threadError,
  });
  const isWorking = phase === "running" || isSendBusy || isConnecting || isRevertingCheckpoint;
  const activeWorkStartedAt = deriveActiveWorkStartedAt(
    activeLatestTurn,
    activeThread?.session ?? null,
    localDispatchStartedAt,
  );
  useEffect(() => {
    attachmentPreviewHandoffByMessageIdRef.current = attachmentPreviewHandoffByMessageId;
  }, [attachmentPreviewHandoffByMessageId]);
  const clearAttachmentPreviewHandoff = useCallback(
    (messageId: MessageId, previewUrls?: ReadonlyArray<string>) => {
      delete attachmentPreviewPromotionInFlightByMessageIdRef.current[messageId];
      const currentPreviewUrls =
        previewUrls ?? attachmentPreviewHandoffByMessageIdRef.current[messageId] ?? [];
      setAttachmentPreviewHandoffByMessageId((existing) => {
        if (!(messageId in existing)) {
          return existing;
        }
        const next = { ...existing };
        delete next[messageId];
        attachmentPreviewHandoffByMessageIdRef.current = next;
        return next;
      });
      for (const previewUrl of currentPreviewUrls) {
        revokeBlobPreviewUrl(previewUrl);
      }
    },
    [],
  );
  const clearAttachmentPreviewHandoffs = useCallback(() => {
    attachmentPreviewPromotionInFlightByMessageIdRef.current = {};
    for (const previewUrls of Object.values(attachmentPreviewHandoffByMessageIdRef.current)) {
      for (const previewUrl of previewUrls) {
        revokeBlobPreviewUrl(previewUrl);
      }
    }
    attachmentPreviewHandoffByMessageIdRef.current = {};
    setAttachmentPreviewHandoffByMessageId({});
  }, []);
  useEffect(() => {
    return () => {
      clearAttachmentPreviewHandoffs();
      for (const message of optimisticUserMessagesRef.current) {
        revokeUserMessagePreviewUrls(message);
      }
    };
  }, [clearAttachmentPreviewHandoffs]);
  const handoffAttachmentPreviews = useCallback((messageId: MessageId, previewUrls: string[]) => {
    if (previewUrls.length === 0) return;

    const previousPreviewUrls = attachmentPreviewHandoffByMessageIdRef.current[messageId] ?? [];
    const nextPreviewUrlSet = new Set(previewUrls);
    for (const previewUrl of previousPreviewUrls) {
      if (!nextPreviewUrlSet.has(previewUrl)) {
        revokeBlobPreviewUrl(previewUrl);
      }
    }
    setAttachmentPreviewHandoffByMessageId((existing) => {
      const next = {
        ...existing,
        [messageId]: previewUrls,
      };
      attachmentPreviewHandoffByMessageIdRef.current = next;
      return next;
    });
  }, []);
  const serverMessages = activeThread?.messages;
  const serverAttachmentIds = useMemo(() => {
    const attachmentIds = new Set<string>();
    for (const message of serverMessages ?? []) {
      for (const attachment of message.attachments ?? []) {
        attachmentIds.add(attachment.id);
      }
    }
    return [...attachmentIds];
  }, [serverMessages]);
  const serverAttachmentResources = useMemo(
    () =>
      serverAttachmentIds.map((attachmentId) => ({
        _tag: "attachment" as const,
        attachmentId,
      })),
    [serverAttachmentIds],
  );
  const serverAttachmentUrls = useAssetUrls(environmentId, serverAttachmentResources);
  const serverAttachmentUrlById = useMemo(
    () =>
      new Map(
        serverAttachmentIds.flatMap((attachmentId, index) => {
          const url = serverAttachmentUrls[index];
          return url ? [[attachmentId, url] as const] : [];
        }),
      ),
    [serverAttachmentIds, serverAttachmentUrls],
  );
  const displayServerMessages = useMemo<ReadonlyArray<ChatMessage>>(() => {
    if (!serverMessages) return [];
    return serverMessages.map((message) => {
      if (!message.attachments || message.attachments.length === 0) {
        return message;
      }
      return {
        ...message,
        attachments: message.attachments.map((attachment) => {
          const previewUrl = serverAttachmentUrlById.get(attachment.id);
          return previewUrl ? { ...attachment, previewUrl } : attachment;
        }),
      };
    });
  }, [serverAttachmentUrlById, serverMessages]);
  useEffect(() => {
    if (typeof Image === "undefined" || displayServerMessages.length === 0) {
      return;
    }

    const cleanups: Array<() => void> = [];
    const userMessagesById = new Map<string, ChatMessage>(
      displayServerMessages
        .filter((message) => message.role === "user")
        .map((message) => [String(message.id), message] as const),
    );

    for (const [messageId, handoffPreviewUrls] of Object.entries(
      attachmentPreviewHandoffByMessageId,
    )) {
      if (attachmentPreviewPromotionInFlightByMessageIdRef.current[messageId]) {
        continue;
      }

      const serverMessage = userMessagesById.get(messageId);
      if (!serverMessage?.attachments || serverMessage.attachments.length === 0) {
        continue;
      }

      const serverPreviewUrls = serverMessage.attachments.flatMap((attachment) =>
        attachment.type === "image" && attachment.previewUrl ? [attachment.previewUrl] : [],
      );
      if (
        serverPreviewUrls.length === 0 ||
        serverPreviewUrls.length !== handoffPreviewUrls.length ||
        serverPreviewUrls.some((previewUrl) => previewUrl.startsWith("blob:"))
      ) {
        continue;
      }

      attachmentPreviewPromotionInFlightByMessageIdRef.current[messageId] = true;

      let cancelled = false;
      const imageInstances: HTMLImageElement[] = [];

      const preloadServerPreviews = Promise.all(
        serverPreviewUrls.map(
          (previewUrl) =>
            new Promise<void>((resolve, reject) => {
              const image = new Image();
              imageInstances.push(image);
              const handleLoad = () => resolve();
              const handleError = () =>
                reject(new Error(`Failed to load server preview for ${messageId}.`));
              image.addEventListener("load", handleLoad, { once: true });
              image.addEventListener("error", handleError, { once: true });
              image.src = previewUrl;
            }),
        ),
      );

      void preloadServerPreviews
        .then(() => {
          if (cancelled) {
            return;
          }
          clearAttachmentPreviewHandoff(messageId as MessageId, handoffPreviewUrls);
        })
        .catch(() => {
          if (!cancelled) {
            delete attachmentPreviewPromotionInFlightByMessageIdRef.current[messageId];
          }
        });

      cleanups.push(() => {
        cancelled = true;
        delete attachmentPreviewPromotionInFlightByMessageIdRef.current[messageId];
        for (const image of imageInstances) {
          image.src = "";
        }
      });
    }

    return () => {
      for (const cleanup of cleanups) {
        cleanup();
      }
    };
  }, [attachmentPreviewHandoffByMessageId, clearAttachmentPreviewHandoff, displayServerMessages]);
  const timelineMessages = useMemo(() => {
    const messages = displayServerMessages;
    const serverMessagesWithPreviewHandoff =
      Object.keys(attachmentPreviewHandoffByMessageId).length === 0
        ? messages
        : // Spread only fires for the few messages that actually changed;
          // unchanged ones early-return their original reference.
          // In-place mutation would break React's immutable state contract.
          messages.map((message) => {
            if (
              message.role !== "user" ||
              !message.attachments ||
              message.attachments.length === 0
            ) {
              return message;
            }
            const handoffPreviewUrls = attachmentPreviewHandoffByMessageId[message.id];
            if (!handoffPreviewUrls || handoffPreviewUrls.length === 0) {
              return message;
            }

            let changed = false;
            let imageIndex = 0;
            const attachments = message.attachments.map((attachment) => {
              if (attachment.type !== "image") {
                return attachment;
              }
              const handoffPreviewUrl = handoffPreviewUrls[imageIndex];
              imageIndex += 1;
              if (!handoffPreviewUrl || attachment.previewUrl === handoffPreviewUrl) {
                return attachment;
              }
              changed = true;
              return {
                ...attachment,
                previewUrl: handoffPreviewUrl,
              };
            });

            return changed ? { ...message, attachments } : message;
          });

    const localPendingMessages = [...optimisticUserMessages, ...queuedTurnMessages];
    if (localPendingMessages.length === 0) {
      return serverMessagesWithPreviewHandoff;
    }
    const serverIds = new Set(serverMessagesWithPreviewHandoff.map((message) => message.id));
    const pendingMessageIds = new Set<MessageId>();
    const pendingMessages = localPendingMessages.filter((message) => {
      if (serverIds.has(message.id) || pendingMessageIds.has(message.id)) return false;
      pendingMessageIds.add(message.id);
      return true;
    });
    if (pendingMessages.length === 0) {
      return serverMessagesWithPreviewHandoff;
    }
    return [...serverMessagesWithPreviewHandoff, ...pendingMessages];
  }, [
    attachmentPreviewHandoffByMessageId,
    displayServerMessages,
    optimisticUserMessages,
    queuedTurnMessages,
  ]);
  const timelineEntries = useMemo(
    () =>
      deriveTimelineEntries(timelineMessages, activeThread?.proposedPlans ?? [], workLogEntries),
    [activeThread?.proposedPlans, timelineMessages, workLogEntries],
  );
  const [dockedDraftHeroThreadKey, setDockedDraftHeroThreadKey] = useState<string | null>(null);
  const draftHeroDockRequested =
    activeThreadKey !== null && dockedDraftHeroThreadKey === activeThreadKey;
  const isDraftHeroState =
    isLocalDraftThread && timelineEntries.length === 0 && !isWorking && !draftHeroDockRequested;
  const [
    attachDraftHeroTransitionGroupRef,
    attachDraftHeroComposerAnchorRef,
    captureDraftHeroComposerRect,
  ] = useDraftHeroLayoutTransition(isDraftHeroState);
  const { turnDiffSummaries, inferredCheckpointTurnCountByTurnId } =
    useTurnDiffSummaries(activeThread);
  const turnDiffSummaryByAssistantMessageId = useMemo(() => {
    const byMessageId = new Map<MessageId, TurnDiffSummary>();
    for (const summary of turnDiffSummaries) {
      if (!summary.assistantMessageId) continue;
      byMessageId.set(summary.assistantMessageId, summary);
    }
    return byMessageId;
  }, [turnDiffSummaries]);
  const revertTurnCountByUserMessageId = useMemo(() => {
    const byUserMessageId = new Map<MessageId, number>();
    for (let index = 0; index < timelineEntries.length; index += 1) {
      const entry = timelineEntries[index];
      if (!entry || entry.kind !== "message" || entry.message.role !== "user") {
        continue;
      }

      for (let nextIndex = index + 1; nextIndex < timelineEntries.length; nextIndex += 1) {
        const nextEntry = timelineEntries[nextIndex];
        if (!nextEntry || nextEntry.kind !== "message") {
          continue;
        }
        if (nextEntry.message.role === "user") {
          break;
        }
        const summary = turnDiffSummaryByAssistantMessageId.get(nextEntry.message.id);
        if (!summary) {
          continue;
        }
        const turnCount =
          summary.checkpointTurnCount ?? inferredCheckpointTurnCountByTurnId[summary.turnId];
        if (typeof turnCount !== "number") {
          break;
        }
        byUserMessageId.set(entry.message.id, Math.max(0, turnCount - 1));
        break;
      }
    }

    return byUserMessageId;
  }, [inferredCheckpointTurnCountByTurnId, timelineEntries, turnDiffSummaryByAssistantMessageId]);

  const gitCwd = activeProject
    ? projectScriptCwd({
        project: { cwd: activeProject.workspaceRoot },
        worktreePath: activeThread?.worktreePath ?? null,
      })
    : null;
  const gitStatusCwd = activeThread?.worktreePath ?? gitCwd;
  const gitStatusQuery = useEnvironmentQuery(
    gitStatusCwd === null
      ? null
      : vcsEnvironment.status({
          environmentId,
          input: { cwd: gitStatusCwd },
        }),
  );
  const keybindings = useAtomValue(primaryServerKeybindingsAtom);
  const availableEditors = useAtomValue(primaryServerAvailableEditorsAtom);
  const editorDiscoveryPending = useAtomValue(primaryServerEditorDiscoveryPendingAtom);
  // Prefer an instance-id match so a custom Codex instance (e.g.
  // `codex_personal`) surfaces its own status/message in the banner rather
  // than the default Codex's. Falls back to first-match-by-kind when no
  // saved instance id is available or the instance no longer exists.
  const selectedProviderInstanceId =
    providerStatuses.find((status) => status.instanceId === selectedProviderByThreadId)
      ?.instanceId ?? null;
  const activeProviderInstanceId =
    selectedProviderInstanceId ??
    activeThread?.session?.providerInstanceId ??
    activeThread?.modelSelection.instanceId ??
    activeProject?.defaultModelSelection?.instanceId ??
    null;
  const activeProviderStatus = useMemo(() => {
    if (activeProviderInstanceId) {
      return (
        providerStatuses.find((status) => status.instanceId === activeProviderInstanceId) ?? null
      );
    }
    const defaultInstanceId = defaultInstanceIdForDriver(selectedProvider);
    return providerStatuses.find((status) => status.instanceId === defaultInstanceId) ?? null;
  }, [activeProviderInstanceId, providerStatuses, selectedProvider]);
  const providerStatusBannerKey = getProviderStatusBannerKey(activeProviderStatus);
  const [dismissedProviderStatusBannerKey, setDismissedProviderStatusBannerKey] = useState<
    string | null
  >(null);
  useEffect(() => {
    if (providerStatusBannerKey === null && dismissedProviderStatusBannerKey !== null) {
      setDismissedProviderStatusBannerKey(null);
    }
  }, [dismissedProviderStatusBannerKey, providerStatusBannerKey]);
  const visibleProviderStatus = shouldShowProviderStatusBanner(
    activeProviderStatus,
    dismissedProviderStatusBannerKey,
  )
    ? activeProviderStatus
    : null;
  const hasTimelineTopBanner = Boolean(threadError) || visibleProviderStatus !== null;
  const activeProjectCwd = activeProject?.workspaceRoot ?? null;
  const activeThreadWorktreePath = activeThread?.worktreePath ?? null;
  const activeWorkspaceRoot = activeThreadWorktreePath ?? activeProjectCwd ?? undefined;
  // Avi Code addition: a file surface can carry its own root when it came from
  // another repo, so the viewer and its tree follow the file rather than the
  // thread. Falls back to the thread's own workspace for every other surface.
  const activeFileSurfaceRoot = activeFileSurface?.root ?? activeWorkspaceRoot;
  const activeFileSurfaceLabel = useMemo(() => {
    const surfaceRoot = activeFileSurface?.root;
    if (!surfaceRoot) return activeProject?.title ?? "";
    const owningProject = allProjects.find((project) =>
      isWithinWorkspaceRoot(project.workspaceRoot, surfaceRoot),
    );
    return owningProject?.title ?? workspacePathBasename(surfaceRoot);
  }, [activeFileSurface?.root, activeProject?.title, allProjects]);
  // Avi Code addition: a path an agent wrote relative to a folder above this
  // thread's workspace resolves to a file that is not there, so the tab opens on
  // a read failure. Move it to the repo that owns the path. Tabs already
  // carrying a root are excluded, which is what stops this repeating on one tab.
  const isThreadRelativeFileSurface =
    activeFileSurface !== null && activeFileSurface.root === undefined;
  const projectWorkspaceRoots = useProjectWorkspaceRoots();
  useCrossRepoFileFallback({
    environmentId: activeProject?.environmentId ?? null,
    threadRef: activeThreadRef,
    surfaceId: isThreadRelativeFileSurface ? activeFileSurface.id : null,
    workspaceRoot: isThreadRelativeFileSurface ? (activeWorkspaceRoot ?? null) : null,
    relativePath: isThreadRelativeFileSurface ? activeFileSurface.relativePath : null,
    projectRoots: projectWorkspaceRoots,
    isThreadWorking: isWorking,
  });
  // Avi Code addition: changes whenever the thread checkpoints, i.e. when the
  // agent may have created the file the preview is waiting on. Drives the file
  // viewer's self-heal in useMissingFileAutoReload.
  const fileReloadSignal = useMemo(() => {
    const last = turnDiffSummaries.at(-1);
    return `${turnDiffSummaries.length}:${last?.checkpointRef ?? ""}:${last?.completedAt ?? ""}`;
  }, [turnDiffSummaries]);
  const activeTerminalLaunchContext =
    terminalUiLaunchContext?.threadId === activeThreadId ? terminalUiLaunchContext : null;
  // Default true while loading to avoid toolbar flicker.
  const isGitRepo = gitStatusQuery.data?.isRepo ?? true;
  const showComposerContextStrip = isGitRepo && activeProject !== null;
  const initialDiffPanelGitScope =
    gitStatusQuery.data?.hasWorkingTreeChanges === true ? "unstaged" : "branch";
  const diffPanelGitStatusResolutionKey = gitStatusQuery.data ? "resolved" : "pending";
  const terminalShortcutLabelOptions = useMemo(
    () => ({
      context: {
        terminalFocus: true,
        terminalOpen: Boolean(terminalUiState.terminalOpen),
      },
    }),
    [terminalUiState.terminalOpen],
  );
  const splitTerminalShortcutLabel = useMemo(
    () => shortcutLabelForCommand(keybindings, "terminal.split", terminalShortcutLabelOptions),
    [keybindings, terminalShortcutLabelOptions],
  );
  const splitTerminalVerticalShortcutLabel = useMemo(
    () =>
      shortcutLabelForCommand(keybindings, "terminal.splitVertical", terminalShortcutLabelOptions),
    [keybindings, terminalShortcutLabelOptions],
  );
  const newTerminalShortcutLabel = useMemo(
    () => shortcutLabelForCommand(keybindings, "terminal.new", terminalShortcutLabelOptions),
    [keybindings, terminalShortcutLabelOptions],
  );
  const closeTerminalShortcutLabel = useMemo(
    () => shortcutLabelForCommand(keybindings, "terminal.close", terminalShortcutLabelOptions),
    [keybindings, terminalShortcutLabelOptions],
  );
  const onToggleDiff = useCallback(() => {
    if (!isServerThread) {
      return;
    }
    if (!diffOpen) {
      onDiffPanelOpen?.();
    }
    if (activeThreadRef) {
      useRightPanelStore.getState().toggle(activeThreadRef, "diff");
    }
  }, [activeThreadRef, diffOpen, isServerThread, onDiffPanelOpen]);

  const envLocked = Boolean(
    activeThread &&
    (activeThread.messages.length > 0 ||
      (activeThread.session !== null && activeThread.session.status !== "stopped")),
  );

  // Handle environment change for draft threads.  When the user picks a
  // different environment we update the draft context to point at the physical
  // project in that environment while keeping the same logical project.
  const onEnvironmentChange = useCallback(
    (nextEnvironmentId: EnvironmentId) => {
      if (envLocked || !draftId) return;
      const target = logicalProjectEnvironments.find(
        (env) => env.environmentId === nextEnvironmentId,
      );
      if (!target) return;
      setDraftThreadContext(draftId, {
        projectRef: scopeProjectRef(target.environmentId, target.projectId),
      });
    },
    [draftId, envLocked, logicalProjectEnvironments, setDraftThreadContext],
  );

  const activeTerminalGroup =
    terminalUiState.terminalGroups.find(
      (group) => group.id === terminalUiState.activeTerminalGroupId,
    ) ??
    terminalUiState.terminalGroups.find((group) =>
      group.terminalIds.includes(terminalUiState.activeTerminalId),
    ) ??
    null;
  const hasReachedSplitLimit =
    (activeTerminalGroup?.terminalIds.length ?? 0) >= MAX_TERMINALS_PER_GROUP;
  const setThreadError = useCallback(
    (targetThreadId: ThreadId | null, error: string | null) => {
      if (!targetThreadId) return;
      const nextError = sanitizeThreadErrorMessage(error);
      const nextEntry: LocalThreadErrorEntry = { message: nextError, at: Date.now() };
      if (
        shouldWriteThreadErrorToCurrentServerThread({
          activeServerThread,
          routeThreadRef,
          targetThreadId,
        })
      ) {
        setLocalServerErrorsByThreadKey((existing) => {
          if ((existing[routeThreadKey]?.message ?? null) === nextError) {
            return existing;
          }
          return {
            ...existing,
            [routeThreadKey]: nextEntry,
          };
        });
        return;
      }
      const localDraftErrorKey = draftId ?? targetThreadId;
      setLocalDraftErrorsByDraftId((existing) => {
        if ((existing[localDraftErrorKey]?.message ?? null) === nextError) {
          return existing;
        }
        return {
          ...existing,
          [localDraftErrorKey]: nextEntry,
        };
      });
    },
    [activeServerThread, draftId, routeThreadKey, routeThreadRef],
  );

  const focusComposer = useCallback(() => {
    composerRef.current?.focusAtEnd();
  }, [composerRef]);
  const scheduleComposerFocus = useCallback(() => {
    window.requestAnimationFrame(() => {
      focusComposer();
    });
  }, [focusComposer]);
  const addTerminalContextToDraft = useCallback(
    (selection: TerminalContextSelection) => {
      composerRef.current?.addTerminalContext(selection);
    },
    [composerRef],
  );
  const setTerminalOpen = useCallback(
    (open: boolean) => {
      if (!activeThreadRef) return;
      storeSetTerminalOpen(activeThreadRef, open);
    },
    [activeThreadRef, storeSetTerminalOpen],
  );
  const toggleTerminalVisibility = useCallback(() => {
    if (!activeThreadRef) return;
    const nextOpen = !terminalUiState.terminalOpen;
    if (nextOpen && terminalUiState.terminalIds.length === 0) {
      if (!activeThreadId || !activeProject) {
        return;
      }
      const cwdForOpen = gitCwd ?? activeProject.workspaceRoot;
      if (!cwdForOpen) {
        return;
      }
      const terminalId = nextTerminalId([...activeKnownTerminalIds, ...panelTerminalIds]);
      storeEnsureTerminal(activeThreadRef, terminalId, { open: true });
      void openTerminal({
        environmentId,
        input: {
          threadId: activeThreadId,
          terminalId,
          cwd: cwdForOpen,
          ...(activeThreadWorktreePath != null ? { worktreePath: activeThreadWorktreePath } : {}),
          env: projectScriptRuntimeEnv({
            project: { cwd: activeProject.workspaceRoot },
            worktreePath: activeThreadWorktreePath,
          }),
        },
      });
      return;
    }
    setTerminalOpen(nextOpen);
  }, [
    activeKnownTerminalIds,
    activeProject,
    activeThreadId,
    activeThreadRef,
    activeThreadWorktreePath,
    environmentId,
    gitCwd,
    openTerminal,
    panelTerminalIds,
    setTerminalOpen,
    storeEnsureTerminal,
    terminalUiState.terminalIds.length,
    terminalUiState.terminalOpen,
  ]);
  const splitTerminal = useCallback(
    (direction: "horizontal" | "vertical" = "horizontal") => {
      if (!activeThreadRef || hasReachedSplitLimit || !activeThreadId || !activeProject) {
        return;
      }
      const cwdForOpen = gitCwd ?? activeProject.workspaceRoot;
      if (!cwdForOpen) {
        return;
      }
      const terminalId = nextTerminalId(activeKnownTerminalIds);
      if (direction === "vertical") {
        storeSplitTerminalVertical(activeThreadRef, terminalId);
      } else {
        storeSplitTerminal(activeThreadRef, terminalId);
      }
      setTerminalFocusRequestId((value) => value + 1);
      void openTerminal({
        environmentId,
        input: {
          threadId: activeThreadId,
          terminalId,
          cwd: cwdForOpen,
          ...(activeThreadWorktreePath != null ? { worktreePath: activeThreadWorktreePath } : {}),
          env: projectScriptRuntimeEnv({
            project: { cwd: activeProject.workspaceRoot },
            worktreePath: activeThreadWorktreePath,
          }),
        },
      });
    },
    [
      activeProject,
      activeKnownTerminalIds,
      activeThreadId,
      activeThreadRef,
      openTerminal,
      activeThreadWorktreePath,
      environmentId,
      gitCwd,
      hasReachedSplitLimit,
      storeSplitTerminal,
      storeSplitTerminalVertical,
    ],
  );
  const createNewTerminal = useCallback(() => {
    if (!activeThreadRef || !activeThreadId || !activeProject) {
      return;
    }
    const cwdForOpen = gitCwd ?? activeProject.workspaceRoot;
    if (!cwdForOpen) {
      return;
    }
    const terminalId = nextTerminalId(activeKnownTerminalIds);
    storeNewTerminal(activeThreadRef, terminalId);
    setTerminalFocusRequestId((value) => value + 1);
    void openTerminal({
      environmentId,
      input: {
        threadId: activeThreadId,
        terminalId,
        cwd: cwdForOpen,
        ...(activeThreadWorktreePath != null ? { worktreePath: activeThreadWorktreePath } : {}),
        env: projectScriptRuntimeEnv({
          project: { cwd: activeProject.workspaceRoot },
          worktreePath: activeThreadWorktreePath,
        }),
      },
    });
  }, [
    activeProject,
    activeKnownTerminalIds,
    activeThreadId,
    activeThreadRef,
    openTerminal,
    activeThreadWorktreePath,
    environmentId,
    gitCwd,
    storeNewTerminal,
  ]);
  const closeTerminal = useCallback(
    (terminalId: string) => {
      if (!activeThreadId || !activeThreadRef) return;
      const fallbackExitWrite = () =>
        writeTerminal({
          environmentId,
          input: { threadId: activeThreadId, terminalId, data: "exit\n" },
        });
      void (async () => {
        const closeResult = await closeTerminalMutation({
          environmentId,
          input: {
            threadId: activeThreadId,
            terminalId,
            deleteHistory: true,
          },
        });
        if (closeResult._tag === "Failure" && !isAtomCommandInterrupted(closeResult)) {
          await fallbackExitWrite();
        }
      })();
      storeCloseTerminal(activeThreadRef, terminalId);
      setTerminalFocusRequestId((value) => value + 1);
    },
    [
      activeThreadId,
      activeThreadRef,
      closeTerminalMutation,
      environmentId,
      storeCloseTerminal,
      writeTerminal,
    ],
  );
  const runProjectScript = useCallback(
    async (
      script: ProjectScript,
      options?: {
        cwd?: string;
        env?: Record<string, string>;
        worktreePath?: string | null;
        preferNewTerminal?: boolean;
        rememberAsLastInvoked?: boolean;
      },
    ) => {
      if (!activeThreadId || !activeProject || !activeThread) return;
      if (options?.rememberAsLastInvoked !== false) {
        setLastInvokedScriptByProjectId((current) => {
          if (current[activeProject.id] === script.id) return current;
          return { ...current, [activeProject.id]: script.id };
        });
      }
      const targetCwd = options?.cwd ?? gitCwd ?? activeProject.workspaceRoot;
      const baseTerminalId =
        terminalUiState.activeTerminalId || activeKnownTerminalIds[0] || DEFAULT_THREAD_TERMINAL_ID;
      const isBaseTerminalBusy = runningTerminalIds.includes(baseTerminalId);
      const wantsNewTerminal = Boolean(options?.preferNewTerminal) || isBaseTerminalBusy;
      const shouldCreateNewTerminal = wantsNewTerminal;
      const targetWorktreePath = options?.worktreePath ?? activeThread.worktreePath ?? null;

      setTerminalUiLaunchContext({
        threadId: activeThreadId,
        cwd: targetCwd,
        worktreePath: targetWorktreePath,
      });
      setTerminalOpen(true);
      if (!activeThreadRef) {
        return;
      }
      setTerminalFocusRequestId((value) => value + 1);

      const runtimeEnv = projectScriptRuntimeEnv({
        project: {
          cwd: activeProject.workspaceRoot,
        },
        worktreePath: targetWorktreePath,
        ...(options?.env ? { extraEnv: options.env } : {}),
      });
      const targetTerminalId = shouldCreateNewTerminal
        ? nextTerminalId(activeKnownTerminalIds)
        : baseTerminalId;
      const openTerminalInput: TerminalOpenInput = shouldCreateNewTerminal
        ? {
            threadId: activeThreadId,
            terminalId: targetTerminalId,
            cwd: targetCwd,
            ...(targetWorktreePath !== null ? { worktreePath: targetWorktreePath } : {}),
            env: runtimeEnv,
            cols: SCRIPT_TERMINAL_COLS,
            rows: SCRIPT_TERMINAL_ROWS,
          }
        : {
            threadId: activeThreadId,
            terminalId: targetTerminalId,
            cwd: targetCwd,
            ...(targetWorktreePath !== null ? { worktreePath: targetWorktreePath } : {}),
            env: runtimeEnv,
          };

      if (shouldCreateNewTerminal) {
        storeNewTerminal(activeThreadRef, targetTerminalId);
      } else {
        storeSetActiveTerminal(activeThreadRef, targetTerminalId);
      }

      const openResult = await openTerminal({ environmentId, input: openTerminalInput });
      if (openResult._tag === "Failure") {
        if (!isAtomCommandInterrupted(openResult)) {
          const error = squashAtomCommandFailure(openResult);
          setThreadError(
            activeThreadId,
            error instanceof Error ? error.message : `Failed to run script "${script.name}".`,
          );
        }
        return;
      }

      const writeResult = await writeTerminal({
        environmentId,
        input: {
          threadId: activeThreadId,
          terminalId: targetTerminalId,
          data: `${script.command}\r`,
        },
      });
      if (writeResult._tag === "Failure" && !isAtomCommandInterrupted(writeResult)) {
        const error = squashAtomCommandFailure(writeResult);
        setThreadError(
          activeThreadId,
          error instanceof Error ? error.message : `Failed to run script "${script.name}".`,
        );
        return;
      }
      requestAutoOpenScriptPreview({ script, threadRef: activeThreadRef });
    },
    [
      activeProject,
      activeThread,
      activeThreadId,
      activeThreadRef,
      gitCwd,
      setTerminalOpen,
      setThreadError,
      storeNewTerminal,
      storeSetActiveTerminal,
      setLastInvokedScriptByProjectId,
      environmentId,
      openTerminal,
      activeKnownTerminalIds,
      requestAutoOpenScriptPreview,
      runningTerminalIds,
      terminalUiState.activeTerminalId,
      writeTerminal,
    ],
  );

  // Avi Code addition: the preview panel starts the dev server itself when a
  // thread has none running, by running the project's primary action.
  const activePrimaryScript = useMemo(
    () => primaryProjectScript(activeProject?.scripts ?? []),
    [activeProject?.scripts],
  );
  const handleStartDevServer = useCallback(() => {
    if (activePrimaryScript) void runProjectScript(activePrimaryScript);
  }, [activePrimaryScript, runProjectScript]);

  // Avi Code addition: the sidebar cannot run an action itself, so its "start dev
  // server" button navigates here and leaves a request the active thread picks up.
  const startDevServerNonce = useDevServerStartIntent(
    (state) => state.pendingByThreadKey[routeThreadKey] ?? null,
  );
  useEffect(() => {
    if (startDevServerNonce == null || !activePrimaryScript || !activeThreadId) return;
    useDevServerStartIntent.getState().consume(routeThreadKey);
    void runProjectScript(activePrimaryScript);
  }, [startDevServerNonce, routeThreadKey, activePrimaryScript, activeThreadId, runProjectScript]);

  const persistProjectScripts = useCallback(
    async (input: {
      projectId: ProjectId;
      projectCwd: string;
      previousScripts: ReadonlyArray<ProjectScript>;
      nextScripts: ReadonlyArray<ProjectScript>;
      keybinding?: string | null;
      keybindingCommand: KeybindingCommand;
    }): Promise<AtomCommandResult<void, unknown>> => {
      const updateResult = mapAtomCommandResult(
        await updateProject({
          environmentId,
          input: {
            projectId: input.projectId,
            scripts: input.nextScripts,
          },
        }),
        () => undefined,
      );
      if (updateResult._tag === "Failure") {
        return updateResult;
      }

      const keybindingRule = decodeProjectScriptKeybindingRule({
        keybinding: input.keybinding,
        command: input.keybindingCommand,
      });

      if (isElectron && keybindingRule) {
        return mapAtomCommandResult(
          await upsertKeybinding({
            environmentId,
            input: keybindingRule,
          }),
          () => undefined,
        );
      }
      return updateResult;
    },
    [environmentId, updateProject, upsertKeybinding],
  );
  const saveProjectScript = useCallback(
    async (input: NewProjectScriptInput): Promise<AtomCommandResult<void, unknown>> => {
      if (!activeProject) {
        return AsyncResult.success(undefined);
      }
      const nextId = nextProjectScriptId(
        input.name,
        activeProject.scripts.map((script) => script.id),
      );
      const nextScript = buildProjectScript(nextId, input);
      const nextScripts = input.runOnWorktreeCreate
        ? [
            ...activeProject.scripts.map((script) =>
              script.runOnWorktreeCreate ? { ...script, runOnWorktreeCreate: false } : script,
            ),
            nextScript,
          ]
        : [...activeProject.scripts, nextScript];

      return persistProjectScripts({
        projectId: activeProject.id,
        projectCwd: activeProject.workspaceRoot,
        previousScripts: activeProject.scripts,
        nextScripts,
        keybinding: input.keybinding,
        keybindingCommand: commandForProjectScript(nextId),
      });
    },
    [activeProject, persistProjectScripts],
  );
  const updateProjectScript = useCallback(
    async (
      scriptId: string,
      input: NewProjectScriptInput,
    ): Promise<AtomCommandResult<void, unknown>> => {
      if (!activeProject) {
        return AsyncResult.success(undefined);
      }
      const existingScript = activeProject.scripts.find((script) => script.id === scriptId);
      if (!existingScript) {
        return AsyncResult.failure(Cause.fail(new Error("Script not found.")));
      }

      const updatedScript = buildProjectScript(existingScript.id, input);
      const nextScripts = activeProject.scripts.map((script) =>
        script.id === scriptId
          ? updatedScript
          : input.runOnWorktreeCreate
            ? { ...script, runOnWorktreeCreate: false }
            : script,
      );

      return persistProjectScripts({
        projectId: activeProject.id,
        projectCwd: activeProject.workspaceRoot,
        previousScripts: activeProject.scripts,
        nextScripts,
        keybinding: input.keybinding,
        keybindingCommand: commandForProjectScript(scriptId),
      });
    },
    [activeProject, persistProjectScripts],
  );
  const deleteProjectScript = useCallback(
    async (scriptId: string): Promise<AtomCommandResult<void, unknown>> => {
      if (!activeProject) {
        return AsyncResult.success(undefined);
      }
      const nextScripts = activeProject.scripts.filter((script) => script.id !== scriptId);

      const deletedName = activeProject.scripts.find((s) => s.id === scriptId)?.name;

      const result = await persistProjectScripts({
        projectId: activeProject.id,
        projectCwd: activeProject.workspaceRoot,
        previousScripts: activeProject.scripts,
        nextScripts,
        keybinding: null,
        keybindingCommand: commandForProjectScript(scriptId),
      });
      if (result._tag === "Success") {
        toastManager.add({
          type: "success",
          title: `Deleted action "${deletedName ?? "Unknown"}"`,
        });
      } else if (!isAtomCommandInterrupted(result)) {
        const error = squashAtomCommandFailure(result);
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: "Could not delete action",
            description: error instanceof Error ? error.message : "An unexpected error occurred.",
          }),
        );
      }
      return result;
    },
    [activeProject, persistProjectScripts],
  );

  const handleRuntimeModeChange = useCallback(
    (mode: RuntimeMode) => {
      if (mode === runtimeMode) return;
      setComposerDraftRuntimeMode(composerDraftTarget, mode);
      if (isLocalDraftThread) {
        setDraftThreadContext(composerDraftTarget, { runtimeMode: mode });
      }
      scheduleComposerFocus();
    },
    [
      isLocalDraftThread,
      runtimeMode,
      scheduleComposerFocus,
      composerDraftTarget,
      setComposerDraftRuntimeMode,
      setDraftThreadContext,
    ],
  );

  const handleInteractionModeChange = useCallback(
    (requestedMode: ProviderInteractionMode) => {
      const mode = resolveInteractionModeChange({
        currentMode: effectiveInteractionMode,
        requestedMode,
        interactionModeLockedByPlan,
      });
      if (mode === null) return;
      setComposerDraftInteractionMode(composerDraftTarget, mode);
      if (isLocalDraftThread) {
        setDraftThreadContext(composerDraftTarget, { interactionMode: mode });
      }
      scheduleComposerFocus();
    },
    [
      effectiveInteractionMode,
      interactionModeLockedByPlan,
      isLocalDraftThread,
      scheduleComposerFocus,
      composerDraftTarget,
      setComposerDraftInteractionMode,
      setDraftThreadContext,
    ],
  );
  const toggleInteractionMode = useCallback(() => {
    handleInteractionModeChange(effectiveInteractionMode === "plan" ? "default" : "plan");
  }, [effectiveInteractionMode, handleInteractionModeChange]);
  const dismissPlanSidebarForCurrentTurn = useCallback(() => {
    planSidebarDismissedForTurnRef.current =
      activePlan?.turnId ?? sidebarProposedPlan?.turnId ?? "__dismissed__";
  }, [activePlan?.turnId, sidebarProposedPlan?.turnId]);
  const togglePlanSidebar = useCallback(() => {
    if (!activeThreadRef) return;
    if (planSidebarOpen) {
      dismissPlanSidebarForCurrentTurn();
    } else {
      planSidebarDismissedForTurnRef.current = null;
    }
    useRightPanelStore.getState().toggle(activeThreadRef, "plan");
  }, [activeThreadRef, dismissPlanSidebarForCurrentTurn, planSidebarOpen]);
  const closePlanSidebar = useCallback(() => {
    if (!activeThreadRef) return;
    setMaximizedRightPanelThreadKey(null);
    useRightPanelStore.getState().close(activeThreadRef);
    dismissPlanSidebarForCurrentTurn();
  }, [activeThreadRef, dismissPlanSidebarForCurrentTurn]);
  const createBrowserSurface = useCallback(() => {
    if (!activeThreadRef) return;
    void addBrowserSurface({ threadRef: activeThreadRef, openPreview });
  }, [activeThreadRef, openPreview]);
  const addDiffSurface = useCallback(() => {
    if (!activeThreadRef || !isServerThread || !isGitRepo) return;
    if (planSidebarOpen) {
      dismissPlanSidebarForCurrentTurn();
    }
    useRightPanelStore.getState().open(activeThreadRef, "diff");
    onDiffPanelOpen?.();
  }, [
    activeThreadRef,
    dismissPlanSidebarForCurrentTurn,
    isGitRepo,
    isServerThread,
    onDiffPanelOpen,
    planSidebarOpen,
  ]);
  const addFilesSurface = useCallback(() => {
    if (!activeThreadRef || !activeProject) return;
    useRightPanelStore.getState().open(activeThreadRef, "files");
  }, [activeProject, activeThreadRef]);
  // Avi Code addition: find in thread. The matches come from the timeline,
  // which owns the rows; this owns the query, the caret, and the bar.
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [findMatches, setFindMatches] = useState<readonly ThreadFindMatch[]>([]);
  const [findMatchIndex, setFindMatchIndex] = useState(-1);
  const activeFindMatchRef = useRef<ThreadFindMatch | null>(null);
  activeFindMatchRef.current = findMatches[findMatchIndex] ?? null;

  const onFindMatchesChange = useCallback((matches: readonly ThreadFindMatch[]) => {
    setFindMatches(matches);
    // Hold the caret on the match the user was reading while they keep typing,
    // rather than throwing them back to the top of the thread each keystroke.
    setFindMatchIndex(reconcileMatchIndex(activeFindMatchRef.current, matches));
  }, []);

  const stepFindMatch = useCallback(
    (direction: "next" | "previous") => {
      setFindOpen(true);
      setFindMatchIndex((current) => stepMatchIndex(current, findMatches.length, direction));
    },
    [findMatches.length],
  );

  const closeFind = useCallback(() => {
    setFindOpen(false);
    setFindQuery("");
    setFindMatches([]);
    setFindMatchIndex(-1);
  }, []);

  // Leaving the thread should not carry a search into the next one.
  useEffect(() => {
    closeFind();
  }, [activeThreadId, closeFind]);

  const openFileSurface = useCallback(
    (relativePath: string) => {
      if (!activeThreadRef || !activeProject) return;
      // Avi Code addition: carry the current surface's root so picking a second
      // file out of an external repo's tree stays in that repo.
      useRightPanelStore
        .getState()
        .openFile(activeThreadRef, relativePath, undefined, activeFileSurface?.root);
    },
    [activeFileSurface?.root, activeProject, activeThreadRef],
  );
  const togglePreviewPanel = useCallback(() => {
    if (!activeThreadRef || !isPreviewSupportedInRuntime()) return;
    if (previewPanelOpen) {
      useRightPanelStore.getState().close(activeThreadRef);
      return;
    }
    const activeTabId = activePreviewState.activeTabId;
    if (activeTabId) {
      useRightPanelStore.getState().openBrowser(activeThreadRef, activeTabId);
    } else {
      createBrowserSurface();
    }
  }, [activePreviewState.activeTabId, activeThreadRef, createBrowserSurface, previewPanelOpen]);
  const closePreviewPanel = useCallback(() => {
    if (activeThreadRef) {
      setMaximizedRightPanelThreadKey(null);
      useRightPanelStore.getState().close(activeThreadRef);
    }
  }, [activeThreadRef]);
  const addTerminalSurface = useCallback(() => {
    if (!activeThreadRef || !activeThreadId || !activeProject) return;
    const cwd = gitCwd ?? activeProject.workspaceRoot;
    const terminalId = nextTerminalId([...activeKnownTerminalIds, ...panelTerminalIds]);
    useRightPanelStore.getState().openTerminal(activeThreadRef, terminalId);
    setTerminalFocusRequestId((value) => value + 1);
    void openTerminal({
      environmentId: activeThreadRef.environmentId,
      input: {
        threadId: activeThreadId,
        terminalId,
        cwd,
        ...(activeThreadWorktreePath != null ? { worktreePath: activeThreadWorktreePath } : {}),
        env: projectScriptRuntimeEnv({
          project: { cwd: activeProject.workspaceRoot },
          worktreePath: activeThreadWorktreePath,
        }),
      },
    });
  }, [
    activeKnownTerminalIds,
    activeProject,
    activeThreadId,
    activeThreadRef,
    activeThreadWorktreePath,
    gitCwd,
    openTerminal,
    panelTerminalIds,
  ]);
  const splitPanelTerminal = useCallback(
    (direction: "horizontal" | "vertical" = "horizontal") => {
      if (
        !activeThreadRef ||
        !activeThreadId ||
        !activeProject ||
        activeRightPanelSurface?.kind !== "terminal" ||
        activeRightPanelSurface.terminalIds.length >= MAX_TERMINALS_PER_GROUP
      ) {
        return;
      }
      const terminalId = nextTerminalId([...activeKnownTerminalIds, ...panelTerminalIds]);
      const cwd = gitCwd ?? activeProject.workspaceRoot;
      useRightPanelStore
        .getState()
        .splitTerminal(activeThreadRef, activeRightPanelSurface.id, terminalId, direction);
      setTerminalFocusRequestId((value) => value + 1);
      void openTerminal({
        environmentId: activeThreadRef.environmentId,
        input: {
          threadId: activeThreadId,
          terminalId,
          cwd,
          ...(activeThreadWorktreePath != null ? { worktreePath: activeThreadWorktreePath } : {}),
          env: projectScriptRuntimeEnv({
            project: { cwd: activeProject.workspaceRoot },
            worktreePath: activeThreadWorktreePath,
          }),
        },
      });
    },
    [
      activeKnownTerminalIds,
      activeProject,
      activeRightPanelSurface,
      activeThreadId,
      activeThreadRef,
      activeThreadWorktreePath,
      gitCwd,
      openTerminal,
      panelTerminalIds,
    ],
  );
  const splitPanelTerminalVertical = useCallback(() => {
    splitPanelTerminal("vertical");
  }, [splitPanelTerminal]);
  const activatePanelTerminal = useCallback(
    (terminalId: string) => {
      if (!activeThreadRef || activeRightPanelSurface?.kind !== "terminal") return;
      useRightPanelStore
        .getState()
        .activateTerminal(activeThreadRef, activeRightPanelSurface.id, terminalId);
      setTerminalFocusRequestId((value) => value + 1);
    },
    [activeRightPanelSurface, activeThreadRef],
  );
  const closePanelTerminal = useCallback(
    (terminalId: string) => {
      if (!activeThreadRef || activeRightPanelSurface?.kind !== "terminal") return;
      void closeTerminalMutation({
        environmentId: activeThreadRef.environmentId,
        input: { threadId: activeThreadRef.threadId, terminalId, deleteHistory: true },
      });
      storeCloseTerminal(activeThreadRef, terminalId);
      useRightPanelStore
        .getState()
        .closeTerminal(activeThreadRef, activeRightPanelSurface.id, terminalId);
      setTerminalFocusRequestId((value) => value + 1);
    },
    [activeRightPanelSurface, activeThreadRef, closeTerminalMutation, storeCloseTerminal],
  );
  const activateRightPanelSurface = useCallback(
    (surface: RightPanelSurface) => {
      if (!activeThreadRef) return;
      if (surface.kind === "plan") {
        planSidebarDismissedForTurnRef.current = null;
      } else if (planSidebarOpen) {
        dismissPlanSidebarForCurrentTurn();
      }
      useRightPanelStore.getState().activateSurface(activeThreadRef, surface.id);
      if (surface.kind === "preview" && surface.resourceId) {
        setActivePreviewTab(activeThreadRef, surface.resourceId);
      }
      if (surface.kind === "terminal") {
        setTerminalFocusRequestId((value) => value + 1);
      }
      if (surface.kind === "diff" && !diffOpen) {
        onDiffPanelOpen?.();
      }
    },
    [activeThreadRef, diffOpen, dismissPlanSidebarForCurrentTurn, onDiffPanelOpen, planSidebarOpen],
  );
  const toggleRightPanel = useCallback(() => {
    if (!activeThreadRef) return;
    if (rightPanelOpen) {
      if (planSidebarOpen) {
        closePlanSidebar();
      } else {
        closePreviewPanel();
      }
      return;
    }
    useRightPanelStore.getState().toggleVisibility(activeThreadRef);
  }, [activeThreadRef, closePlanSidebar, closePreviewPanel, planSidebarOpen, rightPanelOpen]);
  const toggleRightPanelMaximized = useCallback(() => {
    if (!canMaximizeRightPanel) return;
    setMaximizedRightPanelThreadKey((threadKey) =>
      threadKey === routeThreadKey ? null : routeThreadKey,
    );
  }, [canMaximizeRightPanel, routeThreadKey]);
  const cleanupRightPanelSurfaces = useCallback(
    (surfaces: readonly RightPanelSurface[]) => {
      if (!activeThreadRef) return;
      if (surfaces.some((surface) => surface.kind === "plan")) {
        dismissPlanSidebarForCurrentTurn();
      }

      for (const surface of surfaces) {
        if (surface.kind === "preview" && surface.resourceId) {
          void closePreviewSession({
            closePreview,
            snapshot: activePreviewState.sessions[surface.resourceId] ?? null,
            tabId: surface.resourceId,
            threadRef: activeThreadRef,
          });
        }
        if (surface.kind === "terminal") {
          for (const terminalId of surface.terminalIds) {
            storeCloseTerminal(activeThreadRef, terminalId);
            void closeTerminalMutation({
              environmentId: activeThreadRef.environmentId,
              input: { threadId: activeThreadRef.threadId, terminalId, deleteHistory: true },
            });
          }
        }
      }
    },
    [
      activeThreadRef,
      activePreviewState.sessions,
      closePreview,
      closeTerminalMutation,
      dismissPlanSidebarForCurrentTurn,
      storeCloseTerminal,
    ],
  );
  const syncActivePreviewSurface = useCallback(() => {
    if (!activeThreadRef) return;
    const nextActiveSurface = selectActiveRightPanelSurface(
      useRightPanelStore.getState().byThreadKey,
      activeThreadRef,
    );
    if (nextActiveSurface?.kind === "preview" && nextActiveSurface.resourceId) {
      setActivePreviewTab(activeThreadRef, nextActiveSurface.resourceId);
    }
  }, [activeThreadRef]);
  const closeRightPanelSurface = useCallback(
    (surface: RightPanelSurface) => {
      if (!activeThreadRef) return;
      cleanupRightPanelSurfaces([surface]);
      useRightPanelStore.getState().closeSurface(activeThreadRef, surface.id);
      syncActivePreviewSurface();
    },
    [activeThreadRef, cleanupRightPanelSurfaces, syncActivePreviewSurface],
  );
  const closeOtherRightPanelSurfaces = useCallback(
    (surface: RightPanelSurface) => {
      if (!activeThreadRef) return;
      const surfaces = rightPanelState.surfaces.filter((entry) => entry.id !== surface.id);
      cleanupRightPanelSurfaces(surfaces);
      useRightPanelStore.getState().closeOtherSurfaces(activeThreadRef, surface.id);
      syncActivePreviewSurface();
    },
    [
      activeThreadRef,
      cleanupRightPanelSurfaces,
      rightPanelState.surfaces,
      syncActivePreviewSurface,
    ],
  );
  const closeRightPanelSurfacesToRight = useCallback(
    (surface: RightPanelSurface) => {
      if (!activeThreadRef) return;
      const surfaceIndex = rightPanelState.surfaces.findIndex((entry) => entry.id === surface.id);
      if (surfaceIndex < 0) return;
      const surfaces = rightPanelState.surfaces.slice(surfaceIndex + 1);
      cleanupRightPanelSurfaces(surfaces);
      useRightPanelStore.getState().closeSurfacesToRight(activeThreadRef, surface.id);
      syncActivePreviewSurface();
    },
    [
      activeThreadRef,
      cleanupRightPanelSurfaces,
      rightPanelState.surfaces,
      syncActivePreviewSurface,
    ],
  );
  const closeAllRightPanelSurfaces = useCallback(() => {
    if (!activeThreadRef) return;
    cleanupRightPanelSurfaces(rightPanelState.surfaces);
    useRightPanelStore.getState().closeAllSurfaces(activeThreadRef);
  }, [activeThreadRef, cleanupRightPanelSurfaces, rightPanelState.surfaces]);
  const copyRightPanelFilePath = useCallback((relativePath: string) => {
    if (typeof window === "undefined" || !navigator.clipboard?.writeText) {
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: "Failed to copy path",
          description: "Clipboard API unavailable.",
        }),
      );
      return;
    }

    void navigator.clipboard.writeText(relativePath).then(
      () => {
        toastManager.add({
          type: "success",
          title: "Path copied",
          description: relativePath,
        });
      },
      (error) => {
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: "Failed to copy path",
            description: error instanceof Error ? error.message : "An error occurred.",
          }),
        );
      },
    );
  }, []);
  useEffect(
    () =>
      subscribePreviewAction((action) => {
        if (action === "toggle-panel") togglePreviewPanel();
      }),
    [togglePreviewPanel],
  );
  const persistThreadSettingsForNextTurn = useCallback(
    async (input: {
      threadId: ThreadId;
      createdAt: string;
      modelSelection?: ModelSelection;
      branch?: string;
      runtimeMode: RuntimeMode;
      interactionMode: ProviderInteractionMode;
    }): Promise<AtomCommandResult<void, unknown>> => {
      if (!serverThread) {
        return AsyncResult.success(undefined);
      }

      let result: AtomCommandResult<void, unknown> = AsyncResult.success(undefined);
      const metadataUpdate = resolveThreadMetadataUpdateForNextTurn({
        currentModelSelection: serverThread.modelSelection,
        ...(input.modelSelection ? { nextModelSelection: input.modelSelection } : {}),
        currentBranch: serverThread.branch,
        ...(input.branch ? { nextBranch: input.branch } : {}),
      });
      if (metadataUpdate) {
        result = mapAtomCommandResult(
          await updateThreadMetadata({
            environmentId,
            input: {
              threadId: input.threadId,
              ...metadataUpdate,
            },
          }),
          () => undefined,
        );
        if (result._tag === "Failure") {
          return result;
        }
      }

      if (input.runtimeMode !== serverThread.runtimeMode) {
        result = mapAtomCommandResult(
          await setThreadRuntimeMode({
            environmentId,
            input: {
              threadId: input.threadId,
              runtimeMode: input.runtimeMode,
              createdAt: input.createdAt,
            },
          }),
          () => undefined,
        );
        if (result._tag === "Failure") {
          return result;
        }
      }

      if (input.interactionMode !== serverThread.interactionMode) {
        result = mapAtomCommandResult(
          await setThreadInteractionMode({
            environmentId,
            input: {
              threadId: input.threadId,
              interactionMode: input.interactionMode,
              createdAt: input.createdAt,
            },
          }),
          () => undefined,
        );
      }
      return result;
    },
    [
      environmentId,
      serverThread,
      setThreadInteractionMode,
      setThreadRuntimeMode,
      updateThreadMetadata,
    ],
  );

  // Debounce *showing* the scroll-to-bottom pill so it doesn't flash during
  // thread switches. LegendList fires scroll events with isAtEnd=false while
  // initialScrollAtEnd is settling; hiding is always immediate.
  const showScrollDebouncer = useRef(
    new Debouncer(() => setShowScrollToBottom(true), { wait: 150 }),
  );
  const timelineScrollModeRef = useRef<TimelineScrollMode>("following-end");
  const pendingTimelineAnchorRef = useRef<MessageId | null>(null);
  const positionedTimelineAnchorRef = useRef<MessageId | null>(null);
  const settledTimelineAnchorRef = useRef<MessageId | null>(null);
  const activeTimelineAnchorIndexRef = useRef<number | null>(null);
  const anchorUserScrollGenerationRef = useRef(0);
  const liveFollowUserScrollGenerationRef = useRef<number | null>(0);
  const pendingAnchorScrollRestoreRef = useRef<{
    readonly messageId: MessageId;
    readonly offset: number;
    readonly userScrollGeneration: number;
  } | null>(null);
  const anchorScrollRestoreFrameRef = useRef<number | null>(null);
  // Avi Code addition: ref-gated scroll frame so the live-follow scroll driver
  // is not starved by rapid streaming tokens. Each token changes timelineEntries,
  // which re-runs the scroll effect; a cleanup-cancelled rAF never fires when
  // tokens arrive faster than two frames. The ref lets one pending double-rAF
  // survive across effect re-runs and read the latest state when it fires.
  const liveFollowScrollPendingRef = useRef(false);
  // Avi Code addition: which way the user's last scroll gesture was heading, so
  // arriving at the live edge can be told apart from being dragged back to it.
  const timelineUserScrollDirectionRef = useRef<TimelineUserScrollDirection | null>(null);
  const cancelTimelineLiveFollowForUserNavigation = useCallback(() => {
    anchorUserScrollGenerationRef.current += 1;
    timelineScrollModeRef.current = "free-scrolling";
    liveFollowUserScrollGenerationRef.current = null;
    setTimelineLiveFollowEnabled(false);
    pendingTimelineAnchorRef.current = null;
    positionedTimelineAnchorRef.current = null;
    settledTimelineAnchorRef.current = null;
    activeTimelineAnchorIndexRef.current = null;
    pendingAnchorScrollRestoreRef.current = null;
    if (anchorScrollRestoreFrameRef.current !== null) {
      cancelAnimationFrame(anchorScrollRestoreFrameRef.current);
      anchorScrollRestoreFrameRef.current = null;
    }
    liveFollowScrollPendingRef.current = false;
  }, []);
  // Avi Code addition. A scroll the user drove themselves, as opposed to a
  // programmatic jump. LegendList re-reads `maintainScrollAtEnd` live from its
  // own prop store and decides whether to snap to the end from a near-end flag
  // cached before this gesture's scroll event was dispatched. Letting the opt-out
  // ride an ordinary state update leaves the list armed for a render, and while
  // an assistant message streams a data change lands inside that window almost
  // every frame, which is what dragged the reader back to the live edge. The
  // flush is what makes the opt-out win the race; it is safe here because this
  // only ever runs from a DOM event handler.
  const cancelTimelineLiveFollowForUserScroll = useCallback(
    (direction: TimelineUserScrollDirection) => {
      timelineUserScrollDirectionRef.current = direction;
      flushSync(() => {
        cancelTimelineLiveFollowForUserNavigation();
      });
    },
    [cancelTimelineLiveFollowForUserNavigation],
  );
  // Avi Code addition. The timeline reports a chat that opened at the top of
  // its last response rather than the live edge. That open starts off the live
  // edge on purpose, so live follow has to stay off for it — both here and in
  // the thread-open reset below, which would otherwise re-arm it and scroll the
  // chat straight back to the bottom.
  const openedAtLastResponseThreadIdRef = useRef<ThreadId | null>(null);
  const onTimelineOpenedAtLastResponse = useCallback(() => {
    openedAtLastResponseThreadIdRef.current = activeThread?.id ?? null;
    timelineUserScrollDirectionRef.current = null;
    cancelTimelineLiveFollowForUserNavigation();
    // The chat deliberately opens away from the live edge, so show the way back
    // to it straight away rather than waiting for a scroll gesture to reveal it.
    isAtEndRef.current = false;
    setShowScrollToBottom(true);
  }, [activeThread?.id, cancelTimelineLiveFollowForUserNavigation]);
  const getActiveTimelineTurnMetrics = useCallback(
    (list?: LegendListRef | null) => {
      const resolvedList = list ?? legendListRef.current;
      const anchorIndex = activeTimelineAnchorIndexRef.current;
      const state = resolvedList?.getState();
      if (!resolvedList || !state || anchorIndex === null) {
        return null;
      }

      return getAnchoredTurnMetrics({
        state,
        anchorIndex,
        composerOverlayHeight,
        anchorOffset: CHAT_LIST_ANCHOR_OFFSET,
      });
    },
    [composerOverlayHeight],
  );
  const timelineRealContentOverflowsViewport = useCallback(
    (list?: LegendListRef | null) => {
      const resolvedList = list ?? legendListRef.current;
      const state = resolvedList?.getState();
      if (!resolvedList || !state || state.data.length === 0) {
        return false;
      }

      const lastRowIndex = state.data.length - 1;
      const lastRowTop = state.positionAtIndex(lastRowIndex);
      const lastRowHeight = state.sizeAtIndex(lastRowIndex);
      if (
        typeof lastRowTop !== "number" ||
        typeof lastRowHeight !== "number" ||
        !Number.isFinite(lastRowTop) ||
        !Number.isFinite(lastRowHeight)
      ) {
        return false;
      }

      const realContentBottom = lastRowTop + Math.max(1, lastRowHeight);
      const visibleScrollLength = Math.max(
        0,
        (state.scrollLength ?? 0) - composerOverlayHeight - CHAT_LIST_ANCHOR_OFFSET,
      );
      return realContentBottom > visibleScrollLength;
    },
    [composerOverlayHeight],
  );

  // Live-follow stays active after send/thread-open until an actual list scroll
  // gesture opts out.
  const scrollToEnd = useCallback((animated = false) => {
    isAtEndRef.current = true;
    // Asking for the live edge is consent to follow it again.
    timelineUserScrollDirectionRef.current = "toward-end";
    timelineScrollModeRef.current = "following-end";
    liveFollowUserScrollGenerationRef.current = anchorUserScrollGenerationRef.current;
    setTimelineLiveFollowEnabled(true);
    pendingTimelineAnchorRef.current = null;
    activeTimelineAnchorIndexRef.current = null;
    showScrollDebouncer.current.cancel();
    setShowScrollToBottom(false);
    liveFollowScrollPendingRef.current = false;
    void legendListRef.current?.scrollToEnd?.({ animated });
  }, []);
  const onTimelineAnchorReady = useCallback((messageId: MessageId, anchorIndex: number) => {
    // Avi Code addition: after the user scrolls away during streaming,
    // cancelTimelineLiveFollowForUserNavigation resets the positioning refs.
    // LegendList's anchoredEndSpace is still configured (timelineAnchorMessageId
    // is React state, not cleared on scroll-away), so it keeps calling onReady
    // as the anchor space settles. Without this guard, the ref reset lets
    // onReady re-trigger positioning and snap the viewport back to the anchor.
    if (liveFollowUserScrollGenerationRef.current !== anchorUserScrollGenerationRef.current) {
      return;
    }
    if (pendingTimelineAnchorRef.current === messageId) {
      pendingTimelineAnchorRef.current = null;
    }
    activeTimelineAnchorIndexRef.current = anchorIndex;
    if (positionedTimelineAnchorRef.current === messageId) {
      return;
    }
    positionedTimelineAnchorRef.current = messageId;
    settledTimelineAnchorRef.current = null;
    const positionAnchor = (remainingAttempts: number) => {
      requestAnimationFrame(() => {
        if (positionedTimelineAnchorRef.current !== messageId) {
          return;
        }
        const list = legendListRef.current;
        if (!list) {
          if (remainingAttempts > 0) {
            positionAnchor(remainingAttempts - 1);
          }
          return;
        }
        const scrollNode = list.getScrollableNode();
        let finished = false;
        const finishAnimatedPositioning = () => {
          if (finished) {
            return;
          }
          finished = true;
          window.clearTimeout(fallbackTimer);
          scrollNode.removeEventListener("scrollend", finishAnimatedPositioning);
          if (positionedTimelineAnchorRef.current !== messageId) {
            return;
          }
          const scrollOffset = list.getState().scroll;
          void list.scrollToOffset({ offset: scrollOffset, animated: false });
          settledTimelineAnchorRef.current = messageId;
        };
        const fallbackTimer = window.setTimeout(finishAnimatedPositioning, 750);
        scrollNode.addEventListener("scrollend", finishAnimatedPositioning, { once: true });
        void list.scrollToIndex({
          index: anchorIndex,
          animated: true,
          viewPosition: 0,
          viewOffset: CHAT_LIST_ANCHOR_OFFSET,
        });
      });
    };
    requestAnimationFrame(() => positionAnchor(12));
  }, []);
  const onTimelineAnchorSizeChanged = useCallback((messageId: MessageId) => {
    if (settledTimelineAnchorRef.current !== messageId) {
      return;
    }
    if (liveFollowUserScrollGenerationRef.current === anchorUserScrollGenerationRef.current) {
      return;
    }
    const scrollOffset = legendListRef.current?.getState().scroll;
    if (scrollOffset === undefined) {
      return;
    }
    if (pendingAnchorScrollRestoreRef.current === null) {
      pendingAnchorScrollRestoreRef.current = {
        messageId,
        offset: scrollOffset,
        userScrollGeneration: anchorUserScrollGenerationRef.current,
      };
    }
    if (anchorScrollRestoreFrameRef.current !== null) {
      return;
    }
    anchorScrollRestoreFrameRef.current = requestAnimationFrame(() => {
      anchorScrollRestoreFrameRef.current = null;
      const pending = pendingAnchorScrollRestoreRef.current;
      pendingAnchorScrollRestoreRef.current = null;
      if (
        pending &&
        settledTimelineAnchorRef.current === pending.messageId &&
        pending.userScrollGeneration === anchorUserScrollGenerationRef.current
      ) {
        const list = legendListRef.current;
        const currentScrollOffset = list?.getState().scroll;
        if (
          typeof currentScrollOffset === "number" &&
          Math.abs(currentScrollOffset - pending.offset) <= 2
        ) {
          void list?.scrollToOffset({ offset: pending.offset, animated: false });
        }
      }
    });
  }, []);

  // Avi Code addition: keyed off the absolute live edge rather than LegendList's
  // `isNearEnd`, which counts half a viewport as "at the end". Under the old
  // reading, a shorter scroll up left live follow off with the pill still hidden,
  // so there was no way back to the live edge; and reaching the end re-armed live
  // follow whatever brought the list there, including an auto-scroll the reader
  // had just opted out of.
  const onIsAtEndChange = useCallback((isAbsoluteEnd: boolean) => {
    if (
      liveFollowUserScrollGenerationRef.current !== anchorUserScrollGenerationRef.current &&
      shouldRearmTimelineLiveFollow({
        isAbsoluteEnd,
        lastUserScrollDirection: timelineUserScrollDirectionRef.current,
      })
    ) {
      timelineScrollModeRef.current = "following-end";
      liveFollowUserScrollGenerationRef.current = anchorUserScrollGenerationRef.current;
      setTimelineLiveFollowEnabled(true);
    }
    if (
      !isAbsoluteEnd &&
      liveFollowUserScrollGenerationRef.current === anchorUserScrollGenerationRef.current
    ) {
      // Still following: a send anchors the list away from the end on purpose,
      // and streaming content keeps pushing the edge out of reach between frames.
      showScrollDebouncer.current.cancel();
      setShowScrollToBottom(false);
      return;
    }
    if (isAtEndRef.current === isAbsoluteEnd) return;
    isAtEndRef.current = isAbsoluteEnd;
    if (isAbsoluteEnd) {
      showScrollDebouncer.current.cancel();
      setShowScrollToBottom(false);
    } else {
      timelineScrollModeRef.current = "free-scrolling";
      liveFollowUserScrollGenerationRef.current = null;
      setTimelineLiveFollowEnabled(false);
      showScrollDebouncer.current.maybeExecute();
    }
  }, []);

  // Avi Code addition. The timeline froze the viewport in place because the
  // active turn settled while the reader was parked mid-answer. Quiesce the
  // live-follow driver so the fold reflow that just collapsed the turn cannot
  // re-pull the list toward the end. Mirror the manual opt-out reset, but leave
  // anchorUserScrollGenerationRef untouched so onIsAtEndChange can still re-arm
  // follow if the user later scrolls back to the bottom.
  const onActiveTurnSettled = useCallback(() => {
    if (isAtEndRef.current) {
      return;
    }
    timelineScrollModeRef.current = "free-scrolling";
    liveFollowUserScrollGenerationRef.current = null;
    setTimelineLiveFollowEnabled(false);
    pendingTimelineAnchorRef.current = null;
    positionedTimelineAnchorRef.current = null;
    settledTimelineAnchorRef.current = null;
    pendingAnchorScrollRestoreRef.current = null;
    if (anchorScrollRestoreFrameRef.current !== null) {
      cancelAnimationFrame(anchorScrollRestoreFrameRef.current);
      anchorScrollRestoreFrameRef.current = null;
    }
    liveFollowScrollPendingRef.current = false;
  }, []);

  // Avi Code addition: ref-gated double-rAF instead of cleanup-cancelled rAFs.
  // During streaming, timelineEntries changes on every token (~5-10ms). The
  // original cleanup cancelled pending rAFs on each change, but a double-rAF
  // needs ~33ms to complete, so the scroll callback was perpetually starved.
  // The ref gate ensures exactly one pending double-rAF at a time without
  // cancelling it; when it fires it reads the latest state from refs.
  useEffect(() => {
    if (!activeThread?.id) {
      return;
    }
    if (liveFollowUserScrollGenerationRef.current !== anchorUserScrollGenerationRef.current) {
      return;
    }
    if (liveFollowScrollPendingRef.current) {
      return;
    }
    liveFollowScrollPendingRef.current = true;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        liveFollowScrollPendingRef.current = false;

        if (liveFollowUserScrollGenerationRef.current !== anchorUserScrollGenerationRef.current) {
          return;
        }
        if (pendingTimelineAnchorRef.current !== null) {
          return;
        }
        if (
          positionedTimelineAnchorRef.current !== null &&
          settledTimelineAnchorRef.current !== positionedTimelineAnchorRef.current
        ) {
          return;
        }
        const list = legendListRef.current;
        if (!list) {
          return;
        }

        if (timelineScrollModeRef.current === "anchoring-new-turn") {
          const metrics = getActiveTimelineTurnMetrics(list);
          if (!metrics) {
            return;
          }
          if (metrics.scrollDeltaToRevealEnd <= 1) {
            return;
          }

          const nextOffset = list.getState().scroll + metrics.scrollDeltaToRevealEnd;
          void list.scrollToOffset({ offset: nextOffset, animated: false });
          return;
        }

        if (timelineScrollModeRef.current !== "following-end") {
          return;
        }
        if (!timelineRealContentOverflowsViewport(list)) {
          return;
        }

        void list.scrollToEnd?.({ animated: false });
      });
    });
    // No cleanup: the pending rAF reads current state from refs and bails via
    // the generation guard when live follow has been disabled. Cancelling on
    // every token arrival was what starved the scroll driver during streaming.
  }, [
    activeThread?.id,
    timelineEntries,
    getActiveTimelineTurnMetrics,
    timelineRealContentOverflowsViewport,
  ]);

  useEffect(() => {
    setPullRequestDialogState(null);
    // Avi Code addition: the timeline's own layout effect runs first, so a chat
    // that opened at its last response has already opted out of live follow.
    if (openedAtLastResponseThreadIdRef.current !== (activeThread?.id ?? null)) {
      isAtEndRef.current = true;
      timelineUserScrollDirectionRef.current = null;
      timelineScrollModeRef.current = "following-end";
      liveFollowUserScrollGenerationRef.current = anchorUserScrollGenerationRef.current;
      setTimelineLiveFollowEnabled(true);
      pendingTimelineAnchorRef.current = null;
      positionedTimelineAnchorRef.current = null;
      settledTimelineAnchorRef.current = null;
      activeTimelineAnchorIndexRef.current = null;
      liveFollowScrollPendingRef.current = false;
      showScrollDebouncer.current.cancel();
      setShowScrollToBottom(false);
    }
    if (planSidebarOpenOnNextThreadRef.current) {
      planSidebarOpenOnNextThreadRef.current = false;
      if (activeThreadRef) {
        useRightPanelStore.getState().open(activeThreadRef, "plan");
      }
    }
    planSidebarDismissedForTurnRef.current = null;
    // activeThreadRef resets transitively with the active thread.
  }, [activeThread?.id]);

  // Auto-open the plan sidebar when plan/todo steps arrive for the current turn.
  // Don't auto-open for plans carried over from a previous turn (the user can open manually).
  useEffect(() => {
    if (!autoOpenPlanSidebar) return;
    if (!activePlan) return;
    if (planSidebarOpen) return;
    const latestTurnId = activeLatestTurn?.turnId ?? null;
    if (latestTurnId && activePlan.turnId !== latestTurnId) return;
    const turnKey = activePlan.turnId ?? sidebarProposedPlan?.turnId ?? "__dismissed__";
    if (planSidebarDismissedForTurnRef.current === turnKey) return;
    if (activeThreadRef) {
      useRightPanelStore.getState().open(activeThreadRef, "plan");
    }
  }, [
    activePlan,
    activeLatestTurn?.turnId,
    activeThreadRef,
    autoOpenPlanSidebar,
    planSidebarOpen,
    sidebarProposedPlan?.turnId,
  ]);

  useEffect(() => {
    setIsRevertingCheckpoint(false);
  }, [activeThread?.id]);

  useEffect(() => {
    if (!activeThread?.id || terminalUiState.terminalOpen) return;
    const frame = window.requestAnimationFrame(() => {
      focusComposer();
    });
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [activeThread?.id, focusComposer, terminalUiState.terminalOpen]);

  useEffect(() => {
    if (!activeThread?.id) return;
    if (activeThread.messages.length === 0) {
      return;
    }
    const serverIds = new Set(activeThread.messages.map((message) => message.id));
    const removedMessages = optimisticUserMessages.filter((message) => serverIds.has(message.id));
    if (removedMessages.length === 0) {
      return;
    }
    const timer = window.setTimeout(() => {
      setOptimisticUserMessages((existing) =>
        existing.filter((message) => !serverIds.has(message.id)),
      );
    }, 0);
    for (const removedMessage of removedMessages) {
      const previewUrls = collectUserMessageBlobPreviewUrls(removedMessage);
      if (previewUrls.length > 0) {
        handoffAttachmentPreviews(removedMessage.id, previewUrls);
        continue;
      }
      revokeUserMessagePreviewUrls(removedMessage);
    }
    return () => {
      window.clearTimeout(timer);
    };
  }, [activeThread?.id, activeThread?.messages, handoffAttachmentPreviews, optimisticUserMessages]);

  useEffect(() => {
    setOptimisticUserMessages((existing) => {
      for (const message of existing) {
        revokeUserMessagePreviewUrls(message);
      }
      return [];
    });
    resetLocalDispatch();
    setExpandedImage(null);
  }, [draftId, resetLocalDispatch, threadId]);

  const closeExpandedImage = useCallback(() => {
    setExpandedImage(null);
  }, []);

  const activeWorktreePath = activeThread?.worktreePath ?? null;
  const derivedEnvMode: DraftThreadEnvMode = resolveEffectiveEnvMode({
    activeWorktreePath,
    hasServerThread: isServerThread,
    draftThreadEnvMode: isLocalDraftThread ? draftThread?.envMode : undefined,
  });
  const canOverrideServerThreadEnvMode = Boolean(
    isServerThread &&
    activeThread &&
    activeThread.messages.length === 0 &&
    activeThread.worktreePath === null &&
    !envLocked,
  );
  const envMode: DraftThreadEnvMode = canOverrideServerThreadEnvMode
    ? (pendingServerThreadEnvMode ?? draftThread?.envMode ?? derivedEnvMode)
    : derivedEnvMode;
  const activeThreadBranch =
    canOverrideServerThreadEnvMode && pendingServerThreadBranch !== undefined
      ? pendingServerThreadBranch
      : (activeThread?.branch ?? null);
  const startFromOrigin = isLocalDraftThread
    ? (draftThread?.startFromOrigin ?? false)
    : canOverrideServerThreadEnvMode
      ? (pendingServerThreadStartFromOriginByThreadId[activeThread?.id ?? ""] ??
        primaryServerSettings.newWorktreesStartFromOrigin)
      : false;
  const sendEnvMode = resolveSendEnvMode({
    requestedEnvMode: envMode,
    isGitRepo,
  });
  const localCheckoutBranchMismatch = useMemo(
    () =>
      isServerThread
        ? resolveLocalCheckoutBranchMismatch({
            effectiveEnvMode: envMode,
            activeWorktreePath,
            activeThreadBranch,
            currentGitBranch: gitStatusQuery.data?.refName ?? null,
          })
        : null,
    [activeThreadBranch, activeWorktreePath, envMode, gitStatusQuery.data?.refName, isServerThread],
  );
  // Snooze state of the open thread, resolved exactly like the sidebar
  // partition (same shell, same capability gate) so the banner and the
  // sidebar row never disagree.
  const activeThreadShell = useThreadShell(isServerThread ? activeThreadRef : null);
  const supportsSnooze = serverConfig?.environment.capabilities.threadSnooze === true;
  const activeThreadSnoozed =
    activeThreadShell !== null &&
    supportsSnooze &&
    effectiveSnoozed(activeThreadShell, { now: new Date().toISOString() });
  const [snoozeWakeTick, bumpSnoozeWakeTick] = useState(0);
  useEffect(() => {
    void snoozeWakeTick;
    if (!activeThreadSnoozed) return;
    const wakeAtMs = Date.parse(activeThreadShell?.snoozedUntil ?? "");
    if (!Number.isFinite(wakeAtMs)) return;
    const id = window.setTimeout(
      () => bumpSnoozeWakeTick((tick) => tick + 1),
      Math.min(Math.max(0, wakeAtMs - Date.now()) + 50, 2_147_483_647),
    );
    return () => window.clearTimeout(id);
  }, [activeThreadShell?.snoozedUntil, activeThreadSnoozed, snoozeWakeTick]);
  const unsnoozeThreadMutation = useAtomCommand(threadEnvironment.unsnooze, {
    reportFailure: false,
  });
  // Keyed by thread, not a boolean: the pending state must follow the thread
  // it belongs to across navigation, and a request resolving for thread A
  // must never clear (or re-enable) thread B's button.
  const [unsnoozingThreadKey, setUnsnoozingThreadKey] = useState<string | null>(null);
  const isUnsnoozing = unsnoozingThreadKey !== null && unsnoozingThreadKey === activeThreadKey;
  const handleUnsnoozeActiveThread = useCallback(async () => {
    if (!activeThreadRef) return;
    const threadKey = scopedThreadKey(activeThreadRef);
    setUnsnoozingThreadKey(threadKey);
    try {
      const result = await unsnoozeThreadMutation({
        environmentId: activeThreadRef.environmentId,
        input: { threadId: activeThreadRef.threadId, reason: "user" },
      });
      if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
        const error = squashAtomCommandFailure(result);
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: "Failed to wake thread",
            description: error instanceof Error ? error.message : "An error occurred.",
          }),
        );
      }
    } finally {
      setUnsnoozingThreadKey((current) => (current === threadKey ? null : current));
    }
  }, [activeThreadRef, unsnoozeThreadMutation]);
  const [isRestoringThreadBranch, setIsRestoringThreadBranch] = useState(false);
  const [branchRestoreConfirmOpen, setBranchRestoreConfirmOpen] = useState(false);
  // Once revealed for a given mismatch, the banner stays mounted until the
  // mismatch changes or resolves, so clearing the draft doesn't flicker it.
  const [revealedBranchMismatchKey, setRevealedBranchMismatchKey] = useState<string | null>(null);
  // Dismissal lives in a module-level set (survives remounts); this tick just
  // forces a re-render so the banner leaves immediately.
  const [, setBranchMismatchDismissTick] = useState(0);
  const composerHasDraftContent = useComposerDraftStore((store) => {
    const draft = store.getComposerDraft(composerDraftTarget);
    return Boolean(
      draft &&
      (draft.prompt.trim().length > 0 ||
        draft.images.length > 0 ||
        draft.terminalContexts.length > 0 ||
        draft.elementContexts.length > 0 ||
        draft.previewAnnotations.length > 0 ||
        draft.reviewComments.length > 0),
    );
  });
  const activeBranchMismatchKey = branchMismatchKey(
    activeThread?.id ?? null,
    localCheckoutBranchMismatch,
  );
  const showBranchMismatchBanner = shouldShowBranchMismatchBanner({
    hasMismatch: localCheckoutBranchMismatch !== null,
    isDismissed: isBranchMismatchDismissedForSession(activeBranchMismatchKey),
    composerHasContent: composerHasDraftContent,
    wasShownForCurrentMismatch:
      revealedBranchMismatchKey !== null && revealedBranchMismatchKey === activeBranchMismatchKey,
  });
  useEffect(() => {
    setRevealedBranchMismatchKey((revealed) => {
      if (showBranchMismatchBanner) {
        return activeBranchMismatchKey;
      }
      // Hysteresis is scoped to an uninterrupted mismatch: reset when the
      // mismatch resolves or changes so a recurrence re-gates on intent.
      return revealed !== null && revealed !== activeBranchMismatchKey ? null : revealed;
    });
  }, [activeBranchMismatchKey, showBranchMismatchBanner]);
  const handleSwitchCheckoutToThread = useCallback(async () => {
    if (
      !activeProjectCwd ||
      !activeThread ||
      !localCheckoutBranchMismatch ||
      isRestoringThreadBranch
    ) {
      return;
    }
    setIsRestoringThreadBranch(true);
    const checkoutResult = await switchGitRef({
      environmentId,
      input: {
        cwd: activeProjectCwd,
        refName: localCheckoutBranchMismatch.threadBranch,
      },
    });
    if (checkoutResult._tag === "Failure") {
      setIsRestoringThreadBranch(false);
      if (!isAtomCommandInterrupted(checkoutResult)) {
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: "Failed to switch checkout",
            description: chatActionErrorMessage(squashAtomCommandFailure(checkoutResult)),
          }),
        );
      }
      return;
    }

    const nextBranch = checkoutResult.value.refName ?? localCheckoutBranchMismatch.threadBranch;
    if (nextBranch !== activeThread.branch) {
      const updateResult = await updateThreadMetadata({
        environmentId,
        input: { threadId: activeThread.id, branch: nextBranch, worktreePath: null },
      });
      if (updateResult._tag === "Failure") {
        setIsRestoringThreadBranch(false);
        if (!isAtomCommandInterrupted(updateResult)) {
          toastManager.add(
            stackedThreadToast({
              type: "error",
              title: "Checkout switched, but the thread could not be updated",
              description: chatActionErrorMessage(squashAtomCommandFailure(updateResult)),
            }),
          );
        }
        gitStatusQuery.refresh();
        return;
      }
    }
    gitStatusQuery.refresh();
    setIsRestoringThreadBranch(false);
    scheduleComposerFocus();
  }, [
    activeProjectCwd,
    activeThread,
    environmentId,
    gitStatusQuery,
    isRestoringThreadBranch,
    localCheckoutBranchMismatch,
    scheduleComposerFocus,
    switchGitRef,
    updateThreadMetadata,
  ]);
  // The stack renders items[0] front-most and tucks the rest behind hover, so
  // ordering is priority: system banners, then the branch-mismatch notice,
  // and the informational snoozed-thread banner last — it must never cover another.
  const parkedThreadBannerItem = useMemo<ComposerBannerStackItem | null>(() => {
    if (!activeThreadSnoozed) {
      return null;
    }
    return {
      id: `thread-snoozed:${activeThread?.id ?? "unknown"}`,
      variant: "info",
      icon: <AlarmClockIcon />,
      title: "This thread is snoozed",
      description: "Sending a message wakes it and moves it back to Active in the sidebar.",
      actions: (
        <Button
          size="xs"
          variant="outline"
          disabled={isUnsnoozing}
          onClick={() => void handleUnsnoozeActiveThread()}
        >
          {isUnsnoozing ? "Waking..." : "Wake now"}
        </Button>
      ),
    };
  }, [activeThread?.id, activeThreadSnoozed, handleUnsnoozeActiveThread, isUnsnoozing]);
  const handleRestoreThreadBranch = useCallback(() => {
    if (gitStatusQuery.data?.hasWorkingTreeChanges) {
      setBranchRestoreConfirmOpen(true);
      return;
    }
    void handleSwitchCheckoutToThread();
  }, [gitStatusQuery.data?.hasWorkingTreeChanges, handleSwitchCheckoutToThread]);
  const restoreComposerDraft = useCallback(
    (draft: ComposerThreadDraftState) => {
      clearComposerDraftContent(composerDraftTarget);
      promptRef.current = draft.prompt;
      composerImagesRef.current = [...draft.images];
      composerTerminalContextsRef.current = [...draft.terminalContexts];
      composerElementContextsRef.current = [...draft.elementContexts];
      setComposerDraftPrompt(composerDraftTarget, draft.prompt);
      addComposerDraftImages(composerDraftTarget, [...draft.images]);
      setComposerDraftTerminalContexts(composerDraftTarget, draft.terminalContexts);
      setComposerDraftElementContexts(composerDraftTarget, draft.elementContexts);
      setComposerDraftPreviewAnnotations(composerDraftTarget, draft.previewAnnotations);
      setComposerDraftReviewComments(composerDraftTarget, draft.reviewComments);
      setComposerDraftThreadContextIds(composerDraftTarget, draft.threadContextIds);
      composerRef.current?.resetCursorState({
        cursor: collapseExpandedComposerCursor(draft.prompt, draft.prompt.length),
        prompt: draft.prompt,
        detectTrigger: true,
      });
    },
    [
      addComposerDraftImages,
      clearComposerDraftContent,
      composerDraftTarget,
      composerRef,
      setComposerDraftElementContexts,
      setComposerDraftPreviewAnnotations,
      setComposerDraftPrompt,
      setComposerDraftReviewComments,
      setComposerDraftTerminalContexts,
      setComposerDraftThreadContextIds,
    ],
  );
  const cancelForkEdit = useCallback(() => {
    if (!forkEditState || isForkingThread) return;
    restoreComposerDraft(forkEditState.savedDraft);
    setForkEditState(null);
    scheduleComposerFocus();
  }, [forkEditState, isForkingThread, restoreComposerDraft, scheduleComposerFocus]);
  // Avi Code addition: dispatching a held turn. The commands were built when the
  // send was held, so this never consults the composer — that is the difference
  // between sending what the user wrote and sending whatever they had reached.
  const flushHeldTurn = useCallback(
    async (held: HeldTurnItem) => {
      if (heldTurnInFlightRef.current.has(held.id)) return;
      heldTurnInFlightRef.current.add(held.id);
      useHeldTurnStore.getState().setFailure(held.id, null);
      try {
        const failure = await dispatchQueuedTurnCommands(
          held,
          async (heldEnvironmentId, command) => {
            switch (command.type) {
              case "thread.meta.update": {
                const { type: _, ...input } = command;
                return updateThreadMetadata({ environmentId: heldEnvironmentId, input });
              }
              case "thread.runtime-mode.set": {
                const { type: _, ...input } = command;
                return setThreadRuntimeMode({ environmentId: heldEnvironmentId, input });
              }
              case "thread.interaction-mode.set": {
                const { type: _, ...input } = command;
                return setThreadInteractionMode({ environmentId: heldEnvironmentId, input });
              }
              case "thread.turn.start": {
                const { type: _, ...input } = command;
                return startThreadTurn({ environmentId: heldEnvironmentId, input });
              }
              default:
                throw new Error(`Unsupported held command: ${command.type}`);
            }
          },
        );
        if (failure) {
          if (!isAtomCommandInterrupted(failure)) {
            const error = squashAtomCommandFailure(failure);
            const message =
              error instanceof Error ? error.message : "Failed to send the queued message.";
            // The hold stays put so "Send now" can retry it rather than the
            // message disappearing along with the error.
            useHeldTurnStore.getState().setFailure(held.id, message);
            setThreadError(held.threadId, sanitizeThreadErrorMessage(message));
          }
          return;
        }
        // Hand the row to the optimistic list before dropping the hold, so the
        // message does not blink out between the dispatch and the server echo.
        const dispatchedMessage = queuedTurnChatMessage(held);
        if (dispatchedMessage) {
          setOptimisticUserMessages((existing) =>
            existing.some((message) => message.id === dispatchedMessage.id)
              ? existing
              : [...existing, dispatchedMessage],
          );
        }
        useHeldTurnStore.getState().remove(held.id);
      } finally {
        heldTurnInFlightRef.current.delete(held.id);
      }
    },
    [
      setThreadError,
      setThreadInteractionMode,
      setThreadRuntimeMode,
      startThreadTurn,
      updateThreadMetadata,
    ],
  );
  const sendHeldMessageNow = useCallback(() => {
    if (activeHeldTurn === null) return;
    void flushHeldTurn(activeHeldTurn);
  }, [activeHeldTurn, flushHeldTurn]);
  // Cancelling puts the queued message back exactly as it was sent, over
  // anything typed since — same trade as `cancelForkEdit`. Giving the queued
  // message back is the button's whole job, so it wins the composer.
  const cancelHeldSend = useCallback(() => {
    if (activeHeldTurn === null || heldTurnInFlightRef.current.has(activeHeldTurn.id)) return;
    useHeldTurnStore.getState().remove(activeHeldTurn.id);
    restoreComposerDraft(activeHeldTurn.draft);
    scheduleComposerFocus();
  }, [activeHeldTurn, restoreComposerDraft, scheduleComposerFocus]);
  const onEditAndForkUserMessage = useCallback(
    (messageId: MessageId) => {
      if (!isElectron || !activeThread || !isServerThread || isForkingThread || isWorking) return;
      const message = displayServerMessages.find(
        (candidate) => candidate.id === messageId && candidate.role === "user",
      );
      if (!message) return;
      const currentDraft = useComposerDraftStore.getState().getComposerDraft(composerDraftTarget);
      if (!currentDraft) return;
      const savedDraft: ComposerThreadDraftState = {
        ...currentDraft,
        images: currentDraft.images.map(cloneComposerImageForRetry),
        terminalContexts: [...currentDraft.terminalContexts],
        threadContextIds: [...currentDraft.threadContextIds],
        elementContexts: [...currentDraft.elementContexts],
        previewAnnotations: [...currentDraft.previewAnnotations],
        reviewComments: [...currentDraft.reviewComments],
        modelSelectionByProvider: { ...currentDraft.modelSelectionByProvider },
        nonPersistedImageIds: [...currentDraft.nonPersistedImageIds],
        persistedAttachments: [...currentDraft.persistedAttachments],
      };
      clearComposerDraftContent(composerDraftTarget);
      promptRef.current = message.text;
      composerImagesRef.current = [];
      composerTerminalContextsRef.current = [];
      composerElementContextsRef.current = [];
      setComposerDraftPrompt(composerDraftTarget, message.text);
      composerRef.current?.resetCursorState({
        cursor: collapseExpandedComposerCursor(message.text, message.text.length),
        prompt: message.text,
        detectTrigger: true,
      });
      setForkEditState({
        sourceMessageId: messageId,
        retainedAttachments: [...(message.attachments ?? [])],
        savedDraft,
      });
      scheduleComposerFocus();
    },
    [
      activeThread,
      displayServerMessages,
      clearComposerDraftContent,
      composerDraftTarget,
      composerRef,
      isForkingThread,
      isServerThread,
      isWorking,
      scheduleComposerFocus,
      setComposerDraftPrompt,
    ],
  );
  // Avi Code addition: banners that carry Codex review findings back to the
  // plan thread (see usePlanReviewBannerItems).
  const planReviewBannerItems = usePlanReviewBannerItems({
    activeThread: activeThread ?? null,
    activeLatestTurn,
    activeProposedPlanId: activeProposedPlan?.id ?? null,
    showPlanFollowUpPrompt,
    threadShells: allThreadShells,
    scheduleComposerFocus,
  });
  const composerBannerItems = useMemo<ComposerBannerStackItem[]>(() => {
    const parkedThreadItems = parkedThreadBannerItem === null ? [] : [parkedThreadBannerItem];
    const expiredAnswerItems: ComposerBannerStackItem[] = deferredExpiredUserInputRecovery
      ? [
          {
            id: `expired-user-input:${deferredExpiredUserInputRecovery.requestId}`,
            variant: "info",
            icon: <MessageSquareReplyIcon />,
            title: "Your answer is safe",
            description:
              "The provider session ended before it received your answer. Restore it as a new message to continue.",
            actions: (
              <Button
                size="xs"
                variant="outline"
                onClick={() => restoreExpiredUserInput(deferredExpiredUserInputRecovery)}
              >
                Restore answer
              </Button>
            ),
            dismissLabel: "Dismiss recovered answer",
            onDismiss: () => {
              markExpiredUserInputRecoveryHandled(
                window.localStorage,
                deferredExpiredUserInputRecovery.requestId,
              );
              setDeferredExpiredUserInputRecovery(null);
            },
          },
        ]
      : [];
    // Avi Code addition: a send held until the running turn finishes. Says the
    // reload limitation out loud, because nothing persists the hold.
    const heldSendItems: ComposerBannerStackItem[] = isHoldingSend
      ? [
          {
            id: `held-send:${activeThreadKey}`,
            variant: activeHeldTurnFailure === null ? "info" : "error",
            icon: <ClockIcon />,
            title:
              activeHeldTurnFailure === null
                ? "Queued until this turn finishes"
                : "Queued message could not be sent",
            description:
              activeHeldTurnFailure ??
              "Your message is queued as it was written and sends as its own turn. Reloading loses the queue.",
            actions: (
              <>
                <Button size="xs" variant="outline" onClick={sendHeldMessageNow}>
                  Send now
                </Button>
                <Button size="xs" variant="ghost" onClick={cancelHeldSend}>
                  Cancel
                </Button>
              </>
            ),
          },
        ]
      : [];
    const forkEditItems: ComposerBannerStackItem[] =
      forkEditState === null
        ? []
        : [
            {
              id: `fork-edit:${forkEditState.sourceMessageId}`,
              variant: "info",
              icon: <SquarePenIcon />,
              title: "Editing a fork from an earlier message",
              description:
                forkEditState.retainedAttachments.length > 0 ? (
                  <span className="flex flex-wrap items-center gap-1">
                    {forkEditState.retainedAttachments.map((attachment) => (
                      <Button
                        key={attachment.id}
                        size="xs"
                        variant="outline"
                        disabled={isForkingThread}
                        aria-label={`Remove ${attachment.name}`}
                        onClick={() =>
                          setForkEditState((current) =>
                            current === null
                              ? null
                              : {
                                  ...current,
                                  retainedAttachments: current.retainedAttachments.filter(
                                    (candidate) => candidate.id !== attachment.id,
                                  ),
                                },
                          )
                        }
                      >
                        {attachment.name} (remove)
                      </Button>
                    ))}
                  </span>
                ) : (
                  "The original thread and repository files will remain unchanged."
                ),
              actions: (
                <Button
                  size="xs"
                  variant="ghost"
                  disabled={isForkingThread}
                  onClick={cancelForkEdit}
                >
                  Cancel
                </Button>
              ),
            },
          ];
    if (!localCheckoutBranchMismatch || !showBranchMismatchBanner || !activeBranchMismatchKey) {
      return [
        ...heldSendItems,
        ...forkEditItems,
        ...expiredAnswerItems,
        ...planReviewBannerItems,
        ...systemComposerBannerItems,
        ...parkedThreadItems,
      ];
    }
    return [
      ...heldSendItems,
      ...forkEditItems,
      ...expiredAnswerItems,
      ...planReviewBannerItems,
      ...systemComposerBannerItems,
      {
        id: `branch-mismatch:${activeBranchMismatchKey}`,
        variant: "info",
        icon: <GitBranchIcon />,
        title: (
          <span className="flex min-w-0 items-baseline gap-1.5">
            <span className="shrink-0 font-normal text-muted-foreground">Branch changed — was</span>
            <Tooltip>
              <TooltipTrigger
                render={
                  <code className="min-w-0 truncate font-medium text-foreground">
                    {localCheckoutBranchMismatch.threadBranch}
                  </code>
                }
              />
              <TooltipPopup side="top" className="max-w-80">
                This thread last ran on {localCheckoutBranchMismatch.threadBranch}. Sending will
                continue on {localCheckoutBranchMismatch.currentBranch}.
              </TooltipPopup>
            </Tooltip>
          </span>
        ),
        className: "dark:shadow-none",
        actions: (
          <Button
            size="xs"
            variant="ghost"
            disabled={isRestoringThreadBranch}
            onClick={handleRestoreThreadBranch}
          >
            {isRestoringThreadBranch ? "Restoring..." : "Restore branch"}
          </Button>
        ),
        dismissLabel: "Dismiss branch change notice",
        onDismiss: () => {
          dismissBranchMismatchForSession(activeBranchMismatchKey);
          setBranchMismatchDismissTick((tick) => tick + 1);
        },
      },
      ...parkedThreadItems,
    ];
  }, [
    activeHeldTurnFailure,
    activeThreadKey,
    cancelForkEdit,
    cancelHeldSend,
    deferredExpiredUserInputRecovery,
    forkEditState,
    isForkingThread,
    isHoldingSend,
    sendHeldMessageNow,
    activeBranchMismatchKey,
    handleRestoreThreadBranch,
    isRestoringThreadBranch,
    localCheckoutBranchMismatch,
    parkedThreadBannerItem,
    planReviewBannerItems,
    restoreExpiredUserInput,
    showBranchMismatchBanner,
    systemComposerBannerItems,
  ]);

  useEffect(() => {
    setPendingServerThreadEnvMode(null);
    setPendingServerThreadBranch(undefined);
  }, [activeThread?.id]);

  useEffect(() => {
    if (canOverrideServerThreadEnvMode) {
      return;
    }
    setPendingServerThreadEnvMode(null);
    setPendingServerThreadBranch(undefined);
  }, [canOverrideServerThreadEnvMode]);

  useEffect(() => {
    if (!activeThreadId) {
      setTerminalUiLaunchContext(null);
      return;
    }
    setTerminalUiLaunchContext((current) => {
      if (!current) return current;
      if (current.threadId === activeThreadId) return current;
      return null;
    });
  }, [activeThreadId]);

  useEffect(() => {
    if (!activeThreadId || !activeProjectCwd) {
      return;
    }
    setTerminalUiLaunchContext((current) => {
      if (!current || current.threadId !== activeThreadId) {
        return current;
      }
      const settledCwd = projectScriptCwd({
        project: { cwd: activeProjectCwd },
        worktreePath: activeThreadWorktreePath,
      });
      if (
        settledCwd === current.cwd &&
        (activeThreadWorktreePath ?? null) === current.worktreePath
      ) {
        return null;
      }
      return current;
    });
  }, [activeProjectCwd, activeThreadId, activeThreadWorktreePath]);

  useEffect(() => {
    if (terminalUiState.terminalOpen) {
      return;
    }
    setTerminalUiLaunchContext((current) =>
      current?.threadId === activeThreadId ? null : current,
    );
  }, [activeThreadId, terminalUiState.terminalOpen]);

  useEffect(() => {
    if (!activeThreadKey) return;
    const previous = terminalUiOpenByThreadRef.current[activeThreadKey] ?? false;
    const current = Boolean(terminalUiState.terminalOpen);

    if (!previous && current) {
      terminalUiOpenByThreadRef.current[activeThreadKey] = current;
      setTerminalFocusRequestId((value) => value + 1);
      return;
    } else if (previous && !current) {
      terminalUiOpenByThreadRef.current[activeThreadKey] = current;
      const frame = window.requestAnimationFrame(() => {
        focusComposer();
      });
      return () => {
        window.cancelAnimationFrame(frame);
      };
    }

    terminalUiOpenByThreadRef.current[activeThreadKey] = current;
  }, [activeThreadKey, focusComposer, terminalUiState.terminalOpen]);

  // Avi Code addition: `thread.archive` (mod+w) is the tab-close analogue for a
  // thread. Archiving is the reversible "close" — the row leaves the sidebar,
  // `archiveThread` routes on to a fresh draft, and Settings → Archived brings
  // it back. Upstream leaves mod+w to Electron's window-close role, which quits
  // the desktop app.
  const archiveThreadWithFeedback = useArchiveThreadWithFeedback();
  const confirmThreadArchive = useClientSettings<boolean>(
    (settings) => settings.confirmThreadArchive,
  );
  const closeActiveThread = useCallback(async () => {
    // A local draft has nothing to archive — closing it would only produce
    // another draft, which `chat.new` already does.
    if (!isServerThread || !activeThreadRef) return;
    const localApi = readLocalApi();
    if (confirmThreadArchive && localApi) {
      const confirmed = await localApi.dialogs.confirm(
        `Archive thread "${activeThread?.title ?? "this thread"}"?`,
      );
      if (!confirmed) return;
    }
    await archiveThreadWithFeedback(activeThreadRef);
  }, [
    activeThread?.title,
    activeThreadRef,
    archiveThreadWithFeedback,
    confirmThreadArchive,
    isServerThread,
  ]);

  useEffect(() => {
    const handler = (event: globalThis.KeyboardEvent) => {
      if (!activeThreadId || isCommandPaletteOpen()) {
        return;
      }
      const terminalFocusOwner = getTerminalFocusOwner();
      if (event.defaultPrevented && terminalFocusOwner === null) {
        return;
      }
      const shortcutContext = {
        terminalFocus: terminalFocusOwner !== null,
        terminalOpen: Boolean(terminalUiState.terminalOpen),
        modelPickerOpen: composerRef.current?.isModelPickerOpen() ?? false,
      };

      if (
        !shortcutContext.terminalFocus &&
        !shortcutContext.modelPickerOpen &&
        shouldTypeToFocusComposer(event)
      ) {
        if (composerRef.current?.insertTextAtEnd(event.key)) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
      }

      const command = resolveShortcutCommand(event, keybindings, {
        context: shortcutContext,
      });
      if (!command) return;

      if (command === "terminal.toggle") {
        event.preventDefault();
        event.stopPropagation();
        toggleTerminalVisibility();
        return;
      }

      if (command === "rightPanel.toggle") {
        event.preventDefault();
        event.stopPropagation();
        toggleRightPanel();
        return;
      }

      if (command === "terminal.split") {
        event.preventDefault();
        event.stopPropagation();
        if (terminalFocusOwner === "right-panel") {
          splitPanelTerminal();
          return;
        }
        if (!terminalUiState.terminalOpen) {
          setTerminalOpen(true);
        }
        splitTerminal();
        return;
      }

      if (command === "terminal.splitVertical") {
        event.preventDefault();
        event.stopPropagation();
        if (terminalFocusOwner === "right-panel") {
          splitPanelTerminal("vertical");
          return;
        }
        if (!terminalUiState.terminalOpen) {
          setTerminalOpen(true);
        }
        splitTerminal("vertical");
        return;
      }

      if (command === "terminal.close") {
        event.preventDefault();
        event.stopPropagation();
        if (terminalFocusOwner === "right-panel" && activeRightPanelSurface?.kind === "terminal") {
          closePanelTerminal(activeRightPanelSurface.activeTerminalId);
          return;
        }
        if (!terminalUiState.terminalOpen) return;
        closeTerminal(terminalUiState.activeTerminalId);
        return;
      }

      if (command === "terminal.new") {
        event.preventDefault();
        event.stopPropagation();
        if (terminalFocusOwner === "right-panel") {
          addTerminalSurface();
          return;
        }
        if (!terminalUiState.terminalOpen) {
          setTerminalOpen(true);
        }
        createNewTerminal();
        return;
      }

      if (command === "diff.toggle") {
        event.preventDefault();
        event.stopPropagation();
        onToggleDiff();
        return;
      }

      // Avi Code addition: suppressing the browser's own find is the point. It
      // only sees mounted rows, so on a virtualized transcript it reports a
      // confident count that is mostly wrong.
      if (command === "find.toggle") {
        event.preventDefault();
        event.stopPropagation();
        setFindOpen(true);
        return;
      }
      if (command === "find.next" || command === "find.previous") {
        event.preventDefault();
        event.stopPropagation();
        stepFindMatch(command === "find.next" ? "next" : "previous");
        return;
      }

      if (command === "thread.archive") {
        event.preventDefault();
        event.stopPropagation();
        void closeActiveThread();
        return;
      }

      if (command === "modelPicker.toggle") {
        event.preventDefault();
        event.stopPropagation();
        composerRef.current?.toggleModelPicker();
        return;
      }

      const scriptId = projectScriptIdFromCommand(command);
      if (!scriptId || !activeProject) return;
      const script = activeProject.scripts.find((entry) => entry.id === scriptId);
      if (!script) return;
      event.preventDefault();
      event.stopPropagation();
      void runProjectScript(script);
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [
    activeProject,
    activeRightPanelSurface,
    addTerminalSurface,
    terminalUiState.terminalOpen,
    terminalUiState.activeTerminalId,
    activeThreadId,
    closeActiveThread,
    closeTerminal,
    closePanelTerminal,
    createNewTerminal,
    setTerminalOpen,
    runProjectScript,
    splitTerminal,
    splitPanelTerminal,
    keybindings,
    onToggleDiff,
    toggleRightPanel,
    toggleTerminalVisibility,
    composerRef,
  ]);

  const onRevertToTurnCount = useCallback(
    async (turnCount: number) => {
      const localApi = readLocalApi();
      if (!localApi || !activeThread || isRevertingCheckpoint) return;

      if (activeEnvironmentUnavailable && activeEnvironmentUnavailableLabel) {
        setThreadError(
          activeThread.id,
          `Reconnect ${activeEnvironmentUnavailableLabel} before reverting checkpoints.`,
        );
        return;
      }
      if (phase === "running" || isSendBusy || isConnecting) {
        setThreadError(activeThread.id, "Interrupt the current turn before reverting checkpoints.");
        return;
      }
      const confirmed = await localApi.dialogs.confirm(
        [
          `Revert this thread to checkpoint ${turnCount}?`,
          "This will discard newer messages and turn diffs in this thread.",
          "This action cannot be undone.",
        ].join("\n"),
      );
      if (!confirmed) {
        return;
      }

      setIsRevertingCheckpoint(true);
      setThreadError(activeThread.id, null);
      const result = await revertThreadCheckpoint({
        environmentId,
        input: {
          threadId: activeThread.id,
          turnCount,
        },
      });
      if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
        const error = squashAtomCommandFailure(result);
        setThreadError(
          activeThread.id,
          error instanceof Error ? error.message : "Failed to revert thread state.",
        );
      }
      setIsRevertingCheckpoint(false);
    },
    [
      activeThread,
      activeEnvironmentUnavailable,
      activeEnvironmentUnavailableLabel,
      environmentId,
      isConnecting,
      isRevertingCheckpoint,
      isSendBusy,
      phase,
      revertThreadCheckpoint,
      setThreadError,
    ],
  );

  // Avi Code addition: the thread whose answer was submitted with attachments
  // still in the composer, cleared once they have been sent as their own
  // message. Holds the thread rather than a flag so switching threads mid-flight
  // cannot deliver one thread's screenshot into another.
  const pendingAnswerAttachmentFollowUpRef = useRef<ThreadId | null>(null);

  const onSend = async (e?: { preventDefault: () => void }) => {
    e?.preventDefault();
    // Avi Code addition: consume the intent signal early so it never leaks
    // across sends. The plan follow-up branch reads the snapshot below.
    const hasExplicitImplementIntent = planImplementIntentRef.current;
    planImplementIntentRef.current = false;
    if (
      !activeThread ||
      isSendBusy ||
      isConnecting ||
      threadDetailLoading ||
      // Avi Code change: upstream blocks any send while the environment is
      // unavailable. The fork queues offline sends instead, so only block once
      // a turn is already waiting in the outbox — it holds one per thread.
      (activeEnvironmentUnavailable && hasQueuedTurn) ||
      sendInFlightRef.current
    )
      return;
    if (activePendingProgress) {
      // Avi Code addition: an attachment cannot ride the answer. Every
      // provider's answer transport carries strings only, so upstream simply
      // dropped whatever was in the composer. Remember it here and send it as
      // its own message once the question clears.
      if (
        shouldFollowUpWithAttachments({
          isLastQuestion: activePendingProgress.isLastQuestion,
          hasResolvedAnswers: activePendingResolvedAnswers !== null,
          attachmentCount: composerRef.current?.getSendContext().images.length ?? 0,
        })
      ) {
        pendingAnswerAttachmentFollowUpRef.current = activeThread.id;
      }
      onAdvanceActivePendingUserInput();
      return;
    }
    const sendCtx = composerRef.current?.getSendContext();
    if (
      !sendCtx ||
      !canSubmitComposerSendContext({
        providerAvailable: sendCtx.providerAvailable,
        environmentUnavailable: activeEnvironmentUnavailable,
      })
    )
      return;
    const {
      images: composerImages,
      terminalContexts: composerTerminalContexts,
      elementContexts: composerElementContexts,
      previewAnnotations: composerPreviewAnnotations,
      reviewComments: composerReviewComments,
      threadContextIds: composerThreadContextIds,
      communicationStyle: composerCommunicationStyle,
      selectedProvider: ctxSelectedProvider,
      selectedModel: ctxSelectedModel,
      selectedProviderModels: ctxSelectedProviderModels,
      selectedPromptEffort: ctxSelectedPromptEffort,
      selectedModelSelection: ctxSelectedModelSelection,
    } = sendCtx;
    const promptForSend = promptRef.current;
    const {
      trimmedPrompt: trimmed,
      sendableTerminalContexts: sendableComposerTerminalContexts,
      expiredTerminalContextCount,
      hasSendableContent,
    } = deriveComposerSendState({
      prompt: promptForSend,
      imageCount: composerImages.length,
      terminalContexts: composerTerminalContexts,
      elementContextCount:
        composerElementContexts.length +
        composerPreviewAnnotations.length +
        composerReviewComments.length,
    });
    // Avi Code addition: with "Queue" chosen, a send during a running turn is
    // captured and dispatched when the turn settles rather than steered into it.
    // Decided here but acted on much further down, beside the offline queue:
    // mode switches, `/btw` and plan follow-ups all return before that point and
    // none of them is a turn worth queueing.
    const holdUntilTurnFinishes =
      activeThreadKey !== null &&
      hasSendableContent &&
      !forkEditState &&
      !activeEnvironmentUnavailable &&
      shouldHoldSendWhileRunning({ setting: sendWhileRunning, phase });
    if (forkEditState) {
      if (
        !isElectron ||
        !isServerThread ||
        selectedProvider !== "codex" ||
        phase === "running" ||
        activeEnvironmentUnavailable
      ) {
        setThreadError(activeThread.id, "This Codex thread is not ready to fork.");
        return;
      }
      if (!hasSendableContent && forkEditState.retainedAttachments.length === 0) {
        return;
      }

      setIsForkingThread(true);
      const forkThreadId = newThreadId();
      const createdAt = new Date().toISOString();
      const messageTextWithContexts = appendElementContextsToPrompt(
        appendTerminalContextsToPrompt(promptForSend, sendableComposerTerminalContexts),
        composerElementContexts,
      );
      const messageTextWithPreviewAnnotations = composerPreviewAnnotations.reduce(
        (text, annotation) => appendPreviewAnnotationPrompt(text, annotation),
        messageTextWithContexts,
      );
      const messageTextForSend = appendReviewCommentsToPrompt(
        messageTextWithPreviewAnnotations,
        composerReviewComments,
      );
      const outgoingMessageText = formatOutgoingPrompt({
        provider: ctxSelectedProvider,
        model: ctxSelectedModel,
        models: ctxSelectedProviderModels,
        effort: ctxSelectedPromptEffort,
        text: messageTextForSend || IMAGE_ONLY_BOOTSTRAP_PROMPT,
      });
      const attachmentResult = await settlePromise(async () => {
        const retainedUploads = await Promise.all(
          forkEditState.retainedAttachments.map(async (attachment) => {
            if (!attachment.previewUrl) {
              throw new Error(`The original attachment '${attachment.name}' is unavailable.`);
            }
            const response = await fetch(attachment.previewUrl);
            if (!response.ok) {
              throw new Error(`Could not reload '${attachment.name}'.`);
            }
            if (attachment.type === "document") {
              return {
                type: "document" as const,
                name: attachment.name,
                mimeType: attachment.mimeType,
                sizeBytes: attachment.sizeBytes,
                extractedText: await response.text(),
              };
            }
            const blob = await response.blob();
            return {
              type: "image" as const,
              name: attachment.name,
              mimeType: attachment.mimeType,
              sizeBytes: attachment.sizeBytes,
              dataUrl: await readFileAsDataUrl(
                new File([blob], attachment.name, { type: attachment.mimeType }),
              ),
            };
          }),
        );
        const newUploads = await Promise.all(
          composerImages.map(async (attachment) =>
            attachment.type === "document"
              ? {
                  type: "document" as const,
                  name: attachment.name,
                  mimeType: attachment.mimeType,
                  sizeBytes: attachment.sizeBytes,
                  extractedText: attachment.extractedText,
                }
              : {
                  type: "image" as const,
                  name: attachment.name,
                  mimeType: attachment.mimeType,
                  sizeBytes: attachment.sizeBytes,
                  dataUrl: await readFileAsDataUrl(attachment.file),
                },
          ),
        );
        return [...retainedUploads, ...newUploads];
      });

      let failure: AtomCommandResult<unknown, unknown> | null = null;
      if (attachmentResult._tag === "Failure") {
        setThreadError(
          activeThread.id,
          sanitizeThreadErrorMessage(
            chatActionErrorMessage(squashAtomCommandFailure(attachmentResult)),
          ),
        );
      } else {
        const forkResult = await forkThread({
          environmentId,
          input: {
            threadId: activeThread.id,
            forkThreadId,
            forkPointMessageId: forkEditState.sourceMessageId,
            message: {
              messageId: newMessageId(),
              role: "user",
              text: outgoingMessageText,
              attachments: attachmentResult.value,
            },
            modelSelection: ctxSelectedModelSelection,
            runtimeMode,
            interactionMode,
            createdAt,
          },
        });
        failure = forkResult._tag === "Failure" ? forkResult : null;
      }
      if (failure === null && attachmentResult._tag === "Success") {
        const startedResult = await settlePromise(() =>
          waitForStartedServerThread(scopeThreadRef(activeThread.environmentId, forkThreadId)),
        );
        failure = startedResult._tag === "Failure" ? startedResult : null;
      }
      if (failure !== null) {
        const error = squashAtomCommandFailure(failure);
        setThreadError(activeThread.id, sanitizeThreadErrorMessage(chatActionErrorMessage(error)));
        setIsForkingThread(false);
        return;
      }
      if (attachmentResult._tag === "Failure") {
        setIsForkingThread(false);
        return;
      }

      restoreComposerDraft(forkEditState.savedDraft);
      setForkEditState(null);
      await navigate({
        to: "/$environmentId/$threadId",
        params: {
          environmentId: activeThread.environmentId,
          threadId: forkThreadId,
        },
      });
      setIsForkingThread(false);
      return;
    }
    if (showPlanFollowUpPrompt && activeProposedPlan) {
      // Avi Code addition: an empty composer means "implement the plan", but
      // only when the user explicitly triggered the send (Enter key or
      // Implement button). Without this gate a stray programmatic `onSend()`
      // call (e.g. the attachment follow-up effect) would silently start an
      // implementation the user never asked for. Typed text ("Refine") is
      // always intentional, so it skips the gate.
      if (!trimmed && !hasExplicitImplementIntent) {
        return;
      }
      const followUp = resolvePlanFollowUpSubmission({
        draftText: trimmed,
        planMarkdown: activeProposedPlan.planMarkdown,
      });
      // Avi Code addition: snapshot the composer's images/documents so the plan
      // follow-up (Refine/Implement) carries them, matching the normal send
      // path. The draft is cleared inside onSubmitPlanFollowUp after the
      // optimistic message is set, so blob preview URLs survive until render.
      const followUpImages = [...composerImages];
      promptRef.current = "";
      composerRef.current?.resetCursorState();
      await onSubmitPlanFollowUp({
        text: followUp.text,
        interactionMode: followUp.interactionMode,
        attachmentImages: followUpImages,
      });
      return;
    }
    const standaloneSlashCommand =
      composerImages.length === 0 &&
      sendableComposerTerminalContexts.length === 0 &&
      composerElementContexts.length === 0 &&
      composerPreviewAnnotations.length === 0 &&
      composerReviewComments.length === 0
        ? parseStandaloneComposerSlashCommand(trimmed)
        : null;
    if (standaloneSlashCommand) {
      handleInteractionModeChange(standaloneSlashCommand);
      promptRef.current = "";
      clearComposerDraftContent(composerDraftTarget);
      composerRef.current?.resetCursorState();
      return;
    }
    // Avi Code addition: `/btw` never becomes a turn. Given a question it clears
    // the composer like the mode switches above, but instead of changing thread
    // state it asks on a discarded fork and shows the answer in a dismissible
    // panel.
    //
    // Claimed even on a draft, where there is no conversation to branch from.
    // Falling through there would send the raw "/btw …" text as a prompt, which
    // is never what was meant. The composer is only cleared once we know we are
    // acting: a bare "/btw" is an unfinished command, and eating the text the
    // user is still typing into is worse than not sending.
    const sideQuestion = parseComposerSideQuestionCommand(trimmed);
    if (sideQuestion !== null) {
      // Only a thread the server knows about can be branched from. A draft has
      // a pre-allocated id and so a non-null ref, which is why this guard reads
      // `isServerThread` rather than testing the ref for null.
      const sideQuestionTarget =
        isServerThread && activeThreadRef !== null && activeThreadKey !== null
          ? { ref: activeThreadRef, key: activeThreadKey }
          : null;
      const submission = resolveSideQuestionSubmission({
        question: sideQuestion.question,
        hasProviderThread: sideQuestionTarget !== null,
      });
      if (submission.kind === "incomplete") {
        toastManager.add(
          stackedThreadToast({
            type: "info",
            title: "Add your question after /btw.",
            description: "For example: /btw why did that test fail?",
          }),
        );
        return;
      }
      promptRef.current = "";
      clearComposerDraftContent(composerDraftTarget);
      composerRef.current?.resetCursorState();
      if (submission.kind === "no-thread" || sideQuestionTarget === null) {
        toastManager.add(
          stackedThreadToast({
            type: "info",
            title: "Nothing to ask about yet.",
            description: "Send a message first — /btw answers from this chat's history.",
          }),
        );
        return;
      }
      void askSideQuestion({
        threadKey: sideQuestionTarget.key,
        environmentId: sideQuestionTarget.ref.environmentId,
        threadId: sideQuestionTarget.ref.threadId,
        question: submission.question,
      });
      return;
    }
    if (!hasSendableContent) {
      if (expiredTerminalContextCount > 0) {
        const toastCopy = buildExpiredTerminalContextToastCopy(
          expiredTerminalContextCount,
          "empty",
        );
        toastManager.add(
          stackedThreadToast({
            type: "warning",
            title: toastCopy.title,
            description: toastCopy.description,
          }),
        );
      }
      return;
    }
    if (!activeProject) {
      toastManager.add(
        stackedThreadToast({
          type: "warning",
          title: "Choose a project first",
          description: "This draft no longer points to an available project.",
        }),
      );
      return;
    }
    const threadIdForSend = activeThread.id;
    const isFirstMessage = !isServerThread || activeThread.messages.length === 0;
    const baseBranchForWorktree =
      isFirstMessage && sendEnvMode === "worktree" && !activeThread.worktreePath
        ? activeThreadBranch
        : null;

    // In worktree mode, require an explicit base branch so we don't silently
    // fall back to local execution when branch selection is missing.
    const shouldCreateWorktree =
      isFirstMessage && sendEnvMode === "worktree" && !activeThread.worktreePath;
    if (shouldCreateWorktree && !activeThreadBranch) {
      setThreadError(threadIdForSend, "Select a base branch before sending in New worktree mode.");
      return;
    }

    sendInFlightRef.current = true;
    if (isDraftHeroState && activeThreadKey) {
      let resolveDockStarted: (() => void) | undefined;
      const dockStarted = new Promise<void>((resolve) => {
        resolveDockStarted = resolve;
      });
      const dockTransition = runMobileComposerTransition(() => {
        flushSync(() => {
          captureDraftHeroComposerRect();
          setDockedDraftHeroThreadKey(activeThreadKey);
        });
        resolveDockStarted?.();
      });
      void dockTransition.catch(() => resolveDockStarted?.());
      await dockStarted;
    }
    beginLocalDispatch({ preparingWorktree: Boolean(baseBranchForWorktree) });

    const composerImagesSnapshot = [...composerImages];
    const composerTerminalContextsSnapshot = [...sendableComposerTerminalContexts];
    const composerElementContextsSnapshot = [...composerElementContexts];
    const composerPreviewAnnotationsSnapshot = [...composerPreviewAnnotations];
    const composerReviewCommentsSnapshot: ReviewCommentContext[] = [...composerReviewComments];
    const composerThreadContextIdsSnapshot = [...composerThreadContextIds];
    const messageTextWithContexts = appendElementContextsToPrompt(
      appendTerminalContextsToPrompt(promptForSend, composerTerminalContextsSnapshot),
      composerElementContextsSnapshot,
    );
    const messageTextWithPreviewAnnotations = composerPreviewAnnotationsSnapshot.reduce(
      (text, annotation) => appendPreviewAnnotationPrompt(text, annotation),
      messageTextWithContexts,
    );
    const messageTextForSend = appendReviewCommentsToPrompt(
      messageTextWithPreviewAnnotations,
      composerReviewCommentsSnapshot,
    );
    const messageIdForSend = newMessageId();
    const messageCreatedAt = new Date().toISOString();
    // Avi Code addition: establish the read baseline synchronously with the
    // user's send. If they switch threads before the server echo mounts here,
    // the later completion must still become Done in the sidebar.
    markThreadVisited(
      scopedThreadKey(scopeThreadRef(activeThread.environmentId, threadIdForSend)),
      messageCreatedAt,
    );
    const outgoingMessageText = formatOutgoingPrompt({
      provider: ctxSelectedProvider,
      model: ctxSelectedModel,
      models: ctxSelectedProviderModels,
      effort: ctxSelectedPromptEffort,
      text: messageTextForSend || IMAGE_ONLY_BOOTSTRAP_PROMPT,
    });
    const turnAttachmentsPromise = Promise.all(
      composerImagesSnapshot.map(async (attachment) =>
        attachment.type === "document"
          ? {
              type: "document" as const,
              name: attachment.name,
              mimeType: attachment.mimeType,
              sizeBytes: attachment.sizeBytes,
              extractedText: attachment.extractedText,
            }
          : {
              type: "image" as const,
              name: attachment.name,
              mimeType: attachment.mimeType,
              sizeBytes: attachment.sizeBytes,
              dataUrl: await readFileAsDataUrl(attachment.file),
            },
      ),
    );
    const optimisticAttachments = composerImagesSnapshot.map((image) => ({
      type: "image" as const,
      id: image.id,
      name: image.name,
      mimeType: image.mimeType,
      sizeBytes: image.sizeBytes,
      previewUrl: image.previewUrl,
    }));
    // Sending always returns to the live edge. The new row becomes the
    // anchored end-space target so it lands near the top while the response
    // streams into the reserved space below it.
    isAtEndRef.current = true;
    timelineScrollModeRef.current = "anchoring-new-turn";
    liveFollowUserScrollGenerationRef.current = anchorUserScrollGenerationRef.current;
    setTimelineLiveFollowEnabled(true);
    pendingTimelineAnchorRef.current = messageIdForSend;
    activeTimelineAnchorIndexRef.current = null;
    showScrollDebouncer.current.cancel();
    setShowScrollToBottom(false);
    setTimelineAnchor({
      threadKey: scopedThreadKey(scopeThreadRef(activeThread.environmentId, threadIdForSend)),
      messageId: messageIdForSend,
    });
    setOptimisticUserMessages((existing) => [
      ...existing,
      {
        id: messageIdForSend,
        role: "user",
        text: outgoingMessageText,
        ...(optimisticAttachments.length > 0 ? { attachments: optimisticAttachments } : {}),
        ...(composerThreadContextIdsSnapshot.length > 0
          ? {
              threadContext: composerThreadContextIdsSnapshot.map((threadId) => ({ threadId })),
            }
          : {}),
        // Avi Code addition: the optimistic message carries the label so the
        // style chip appears immediately rather than after the server echo.
        ...(composerCommunicationStyle
          ? { communicationStyle: composerCommunicationStyle.label }
          : {}),
        turnId: null,
        createdAt: messageCreatedAt,
        updatedAt: messageCreatedAt,
        streaming: false,
      },
    ]);
    setThreadError(threadIdForSend, null);
    if (expiredTerminalContextCount > 0) {
      const toastCopy = buildExpiredTerminalContextToastCopy(
        expiredTerminalContextCount,
        "omitted",
      );
      toastManager.add(
        stackedThreadToast({
          type: "warning",
          title: toastCopy.title,
          description: toastCopy.description,
        }),
      );
    }
    // A queued send clears the composer only once its commands are safely
    // stored, so a rejected queue leaves the draft where the user can see it.
    if (!activeEnvironmentUnavailable && !holdUntilTurnFinishes) {
      promptRef.current = "";
      clearComposerDraftContent(composerDraftTarget);
      composerRef.current?.resetCursorState();
    }

    let firstComposerImageName: string | null = null;
    if (composerImagesSnapshot.length > 0) {
      const firstComposerImage = composerImagesSnapshot[0];
      if (firstComposerImage) {
        firstComposerImageName = firstComposerImage.name;
      }
    }
    let titleSeed = trimmed;
    if (!titleSeed) {
      if (firstComposerImageName) {
        titleSeed = `Image: ${firstComposerImageName}`;
      } else if (composerTerminalContextsSnapshot.length > 0) {
        titleSeed = formatTerminalContextLabel(composerTerminalContextsSnapshot[0]!);
      } else if (composerElementContextsSnapshot.length > 0) {
        titleSeed = formatElementContextLabel(composerElementContextsSnapshot[0]!);
      } else {
        titleSeed = "New thread";
      }
    }
    const title = truncate(titleSeed);
    const threadCreateModelSelection = createModelSelection(
      ctxSelectedModelSelection.instanceId,
      ctxSelectedModel || activeProject.defaultModelSelection?.model || DEFAULT_MODEL,
      ctxSelectedModelSelection.options,
    );

    // Avi Code change: two reasons to store a turn rather than send it — the
    // environment is offline, or the user chose to queue behind a running turn.
    // Both want the same fully-built commands, which is what fixes the message
    // to what was written instead of to whatever the composer holds later.
    if (activeEnvironmentUnavailable || holdUntilTurnFinishes) {
      // Taken before the composer is cleared below, so cancelling the hold can
      // give the whole draft back rather than only its text.
      const draftBehindHeldTurn = holdUntilTurnFinishes
        ? useComposerDraftStore.getState().getComposerDraft(composerDraftTarget)
        : null;
      const heldTurnTarget =
        holdUntilTurnFinishes && activeThreadKey !== null
          ? {
              threadKey: activeThreadKey,
              draft: draftBehindHeldTurn
                ? snapshotComposerThreadDraft(draftBehindHeldTurn)
                : { ...createEmptyThreadDraft(), prompt: promptForSend },
            }
          : null;
      const turnAttachmentsResult = await settlePromise(() => turnAttachmentsPromise);
      if (turnAttachmentsResult._tag === "Failure") {
        setOptimisticUserMessages((existing) =>
          existing.filter((message) => message.id !== messageIdForSend),
        );
        setThreadError(threadIdForSend, "Could not save the message attachments for retry.");
        sendInFlightRef.current = false;
        setDockedDraftHeroThreadKey((currentThreadKey) =>
          currentThreadKey === activeThreadKey ? null : currentThreadKey,
        );
        resetLocalDispatch();
        return;
      }

      const queuedCommands: ClientOrchestrationCommand[] = [];
      if (serverThread) {
        const metadataUpdate = resolveThreadMetadataUpdateForNextTurn({
          currentModelSelection: serverThread.modelSelection,
          ...(ctxSelectedModel ? { nextModelSelection: ctxSelectedModelSelection } : {}),
          currentBranch: serverThread.branch,
          ...(localCheckoutBranchMismatch
            ? { nextBranch: localCheckoutBranchMismatch.currentBranch }
            : {}),
        });
        if (isFirstMessage || metadataUpdate) {
          queuedCommands.push({
            type: "thread.meta.update",
            commandId: newCommandId(),
            threadId: threadIdForSend,
            ...(isFirstMessage ? { title } : {}),
            ...metadataUpdate,
          });
        }
        if (runtimeMode !== serverThread.runtimeMode) {
          queuedCommands.push({
            type: "thread.runtime-mode.set",
            commandId: newCommandId(),
            threadId: threadIdForSend,
            runtimeMode,
            createdAt: messageCreatedAt,
          });
        }
        if (interactionMode !== serverThread.interactionMode) {
          queuedCommands.push({
            type: "thread.interaction-mode.set",
            commandId: newCommandId(),
            threadId: threadIdForSend,
            interactionMode,
            createdAt: messageCreatedAt,
          });
        }
      }

      const bootstrap =
        isLocalDraftThread || baseBranchForWorktree
          ? {
              ...(isLocalDraftThread
                ? {
                    createThread: {
                      projectId: activeProject.id,
                      title,
                      modelSelection: threadCreateModelSelection,
                      runtimeMode,
                      interactionMode,
                      branch: activeThreadBranch,
                      worktreePath: activeThread.worktreePath,
                      createdAt: activeThread.createdAt,
                    },
                  }
                : {}),
              ...(baseBranchForWorktree
                ? {
                    prepareWorktree: {
                      projectCwd: activeProject.workspaceRoot,
                      baseBranch: baseBranchForWorktree,
                      branch: buildTemporaryWorktreeBranchName(randomHex),
                      ...(startFromOrigin ? { startFromOrigin: true } : {}),
                    },
                    runSetupScript: true,
                  }
                : {}),
            }
          : undefined;
      const startCommandId = newCommandId();
      queuedCommands.push({
        type: "thread.turn.start",
        commandId: startCommandId,
        threadId: threadIdForSend,
        message: {
          messageId: messageIdForSend,
          role: "user",
          text: outgoingMessageText,
          attachments: turnAttachmentsResult.value,
        },
        modelSelection: ctxSelectedModelSelection,
        titleSeed: title,
        runtimeMode,
        interactionMode,
        ...(bootstrap ? { bootstrap } : {}),
        ...(composerThreadContextIdsSnapshot.length > 0
          ? {
              threadContext: composerThreadContextIdsSnapshot.map((threadId) => ({ threadId })),
            }
          : {}),
        ...(composerCommunicationStyle ? { communicationStyle: composerCommunicationStyle } : {}),
        createdAt: messageCreatedAt,
      });
      const storedTurn = {
        id: startCommandId,
        environmentId: activeThread.environmentId,
        threadId: threadIdForSend,
        messageId: messageIdForSend,
        createdAt: messageCreatedAt,
        commands: queuedCommands,
      };
      const queued =
        heldTurnTarget === null
          ? useOfflineTurnOutboxStore.getState().enqueue(storedTurn)
          : useHeldTurnStore.getState().enqueue({ ...storedTurn, ...heldTurnTarget });
      if (!queued.queued) {
        setOptimisticUserMessages((existing) =>
          existing.filter((message) => message.id !== messageIdForSend),
        );
        setThreadError(
          threadIdForSend,
          queued.reason === "already-queued"
            ? "A message is already queued for this thread."
            : "Could not save this message locally. It remains in the composer.",
        );
        sendInFlightRef.current = false;
        setDockedDraftHeroThreadKey((currentThreadKey) =>
          currentThreadKey === activeThreadKey ? null : currentThreadKey,
        );
        resetLocalDispatch();
        return;
      }
      // The held turn now owns the pending row, so the optimistic copy would
      // only be a second source of truth for the same message.
      if (heldTurnTarget !== null) {
        setOptimisticUserMessages((existing) =>
          existing.filter((message) => message.id !== messageIdForSend),
        );
      }

      promptRef.current = "";
      clearComposerDraftContent(composerDraftTarget);
      composerRef.current?.resetCursorState();
      if (heldTurnTarget === null) {
        // A held send has the composer banner; a toast on top of it is noise.
        toastManager.add({
          type: "success",
          title: "Message queued",
          description: `It will send automatically when ${activeEnvironmentUnavailableLabel ?? "the environment"} reconnects.`,
        });
      }
      sendInFlightRef.current = false;
      resetLocalDispatch();
      return;
    }

    let failure: AtomCommandResult<unknown, unknown> | null = null;
    // Auto-title from first message
    if (isFirstMessage && isServerThread) {
      const titleResult = await updateThreadMetadata({
        environmentId,
        input: {
          threadId: threadIdForSend,
          title,
        },
      });
      if (titleResult._tag === "Failure") {
        failure = titleResult;
      }
    }

    if (failure === null && isServerThread) {
      const settingsResult = await persistThreadSettingsForNextTurn({
        threadId: threadIdForSend,
        createdAt: messageCreatedAt,
        ...(ctxSelectedModel ? { modelSelection: ctxSelectedModelSelection } : {}),
        ...(localCheckoutBranchMismatch
          ? { branch: localCheckoutBranchMismatch.currentBranch }
          : {}),
        runtimeMode,
        interactionMode,
      });
      if (settingsResult._tag === "Failure") {
        failure = settingsResult;
      }
    }

    const turnAttachmentsResult = await settlePromise(() => turnAttachmentsPromise);
    if (failure === null && turnAttachmentsResult._tag === "Failure") {
      failure = turnAttachmentsResult;
    }

    let turnStartSucceeded = false;
    if (failure === null && turnAttachmentsResult._tag === "Success") {
      const bootstrap =
        isLocalDraftThread || baseBranchForWorktree
          ? {
              ...(isLocalDraftThread
                ? {
                    createThread: {
                      projectId: activeProject.id,
                      title,
                      modelSelection: threadCreateModelSelection,
                      runtimeMode,
                      interactionMode,
                      branch: activeThreadBranch,
                      worktreePath: activeThread.worktreePath,
                      createdAt: activeThread.createdAt,
                    },
                  }
                : {}),
              ...(baseBranchForWorktree
                ? {
                    prepareWorktree: {
                      projectCwd: activeProject.workspaceRoot,
                      baseBranch: baseBranchForWorktree,
                      branch: buildTemporaryWorktreeBranchName(randomHex),
                      ...(startFromOrigin ? { startFromOrigin: true } : {}),
                    },
                    runSetupScript: true,
                  }
                : {}),
            }
          : undefined;
      beginLocalDispatch({ preparingWorktree: false });
      const startResult = await startThreadTurn({
        environmentId,
        input: {
          threadId: threadIdForSend,
          message: {
            messageId: messageIdForSend,
            role: "user",
            text: outgoingMessageText,
            attachments: turnAttachmentsResult.value,
          },
          modelSelection: ctxSelectedModelSelection,
          titleSeed: title,
          runtimeMode,
          interactionMode,
          ...(bootstrap ? { bootstrap } : {}),
          ...(composerThreadContextIdsSnapshot.length > 0
            ? {
                threadContext: composerThreadContextIdsSnapshot.map((threadId) => ({ threadId })),
              }
            : {}),
          ...(composerCommunicationStyle ? { communicationStyle: composerCommunicationStyle } : {}),
          createdAt: messageCreatedAt,
        },
      });
      if (startResult._tag === "Failure") {
        failure = startResult;
      } else {
        turnStartSucceeded = true;
      }
    }

    if (failure !== null) {
      if (
        promptRef.current.length === 0 &&
        composerImagesRef.current.length === 0 &&
        composerTerminalContextsRef.current.length === 0 &&
        composerElementContextsRef.current.length === 0 &&
        (useComposerDraftStore.getState().getComposerDraft(composerDraftTarget)?.previewAnnotations
          .length ?? 0) === 0 &&
        (useComposerDraftStore.getState().getComposerDraft(composerDraftTarget)?.reviewComments
          .length ?? 0) === 0 &&
        (useComposerDraftStore.getState().getComposerDraft(composerDraftTarget)?.threadContextIds
          .length ?? 0) === 0
      ) {
        setOptimisticUserMessages((existing) => {
          const removed = existing.filter((message) => message.id === messageIdForSend);
          for (const message of removed) {
            revokeUserMessagePreviewUrls(message);
          }
          const next = existing.filter((message) => message.id !== messageIdForSend);
          return next.length === existing.length ? existing : next;
        });
        promptRef.current = promptForSend;
        const retryComposerImages = composerImagesSnapshot.map(cloneComposerImageForRetry);
        composerImagesRef.current = retryComposerImages;
        composerTerminalContextsRef.current = composerTerminalContextsSnapshot;
        composerElementContextsRef.current = composerElementContextsSnapshot;
        setComposerDraftPrompt(composerDraftTarget, promptForSend);
        addComposerDraftImages(composerDraftTarget, retryComposerImages);
        setComposerDraftTerminalContexts(composerDraftTarget, composerTerminalContextsSnapshot);
        setComposerDraftElementContexts(composerDraftTarget, composerElementContextsSnapshot);
        setComposerDraftPreviewAnnotations(composerDraftTarget, composerPreviewAnnotationsSnapshot);
        setComposerDraftReviewComments(composerDraftTarget, composerReviewCommentsSnapshot);
        setComposerDraftThreadContextIds(composerDraftTarget, composerThreadContextIdsSnapshot);
        composerRef.current?.resetCursorState({
          cursor: collapseExpandedComposerCursor(promptForSend, promptForSend.length),
          prompt: promptForSend,
          detectTrigger: true,
        });
      }
      if (!isAtomCommandInterrupted(failure)) {
        const error = squashAtomCommandFailure(failure);
        setThreadError(
          threadIdForSend,
          error instanceof Error ? error.message : "Failed to send message.",
        );
      }
    }
    sendInFlightRef.current = false;
    if (!turnStartSucceeded) {
      setDockedDraftHeroThreadKey((currentThreadKey) =>
        currentThreadKey === activeThreadKey ? null : currentThreadKey,
      );
      resetLocalDispatch();
    }
  };

  // Avi Code addition: dispatching a held turn once its thread is free again.
  // It goes straight to the stored commands rather than back through `onSend`,
  // which would re-read the composer and, with a question on screen, answer the
  // questionnaire instead of sending.
  useEffect(() => {
    if (
      activeHeldTurn === null ||
      !shouldFlushHeldSend({
        heldThreadKeys: heldTurnItems.map((item) => item.threadKey),
        activeThreadKey,
        phase,
        isSendBusy,
        isConnecting,
        hasPendingUserInput: activePendingProgress !== null,
        environmentUnavailable: activeEnvironmentUnavailable,
      })
    ) {
      return;
    }
    void flushHeldTurn(activeHeldTurn);
  }, [
    activeEnvironmentUnavailable,
    activeHeldTurn,
    activePendingProgress,
    activeThreadKey,
    flushHeldTurn,
    heldTurnItems,
    isConnecting,
    isSendBusy,
    phase,
  ]);

  const onInterrupt = async () => {
    if (!activeThread) return;
    if (activePendingUserInput) {
      if (respondingUserInputRequestIds.includes(activePendingUserInput.requestId)) {
        dismissedUserInputRequestIdsRef.current.add(activePendingUserInput.requestId);
      }
      setRespondingUserInputRequestIds((existing) =>
        existing.filter((id) => id !== activePendingUserInput.requestId),
      );
    }
    const result = await interruptThreadTurn({
      environmentId,
      input: buildThreadTurnInterruptInput(activeThread),
    });
    if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
      const error = squashAtomCommandFailure(result);
      setThreadError(
        activeThread.id,
        error instanceof Error ? error.message : "Failed to interrupt the current turn.",
      );
    }
  };

  const onRespondToApproval = useCallback(
    async (requestId: ApprovalRequestId, decision: ProviderApprovalDecision) => {
      if (!activeThreadId) return;

      setRespondingRequestIds((existing) =>
        existing.includes(requestId) ? existing : [...existing, requestId],
      );
      const result = await respondToThreadApproval({
        environmentId,
        input: {
          threadId: activeThreadId,
          requestId,
          decision,
        },
      });
      if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
        const error = squashAtomCommandFailure(result);
        setThreadError(
          activeThreadId,
          error instanceof Error ? error.message : "Failed to submit approval decision.",
        );
      }
      setRespondingRequestIds((existing) => existing.filter((id) => id !== requestId));
      return result;
    },
    [activeThreadId, environmentId, respondToThreadApproval, setThreadError],
  );

  const onRespondToUserInput = useCallback(
    async (requestId: ApprovalRequestId, answers: Record<string, unknown>) => {
      if (!activeThreadId) return;

      setRespondingUserInputRequestIds((existing) =>
        existing.includes(requestId) ? existing : [...existing, requestId],
      );
      const result = await respondToThreadUserInput({
        environmentId,
        input: {
          threadId: activeThreadId,
          requestId,
          answers,
        },
      });
      const wasDismissed = dismissedUserInputRequestIdsRef.current.delete(requestId);
      if (!wasDismissed && result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
        const error = squashAtomCommandFailure(result);
        setThreadError(
          activeThreadId,
          error instanceof Error ? error.message : "Failed to submit user input.",
        );
      }
      setRespondingUserInputRequestIds((existing) => existing.filter((id) => id !== requestId));
      return result;
    },
    [activeThreadId, environmentId, respondToThreadUserInput, setThreadError],
  );

  const onSelectActivePendingUserInputOption = useCallback(
    (questionId: string, optionLabel: string) => {
      if (!activePendingUserInput) {
        return;
      }
      dispatchPendingUserInput({
        type: "option-selected",
        requestId: activePendingUserInput.requestId,
        questions: activePendingUserInput.questions,
        questionId,
        optionLabel,
      });
      promptRef.current = "";
      composerRef.current?.resetCursorState({ cursor: 0 });
    },
    [activePendingUserInput, composerRef],
  );

  // Avi Code addition: see `pendingAnswerFocusSync` for why this is deferred.
  // Focusing the answer editor synchronously used to echo its stale value back
  // through `onChange` and wipe whatever was just written into it.
  const pendingAnswerFocusSyncRef = useRef<PendingAnswerFocusSync | null>(null);
  if (pendingAnswerFocusSyncRef.current === null) {
    pendingAnswerFocusSyncRef.current = createPendingAnswerFocusSync({
      readSnapshot: () => composerRef.current?.readSnapshot(),
      focusAt: (cursor) => composerRef.current?.focusAt(cursor),
      scheduleFrame: (callback) => window.requestAnimationFrame(callback),
      cancelFrame: (handle) => window.cancelAnimationFrame(handle),
    });
  }
  // Never focus an editor the user has already navigated away from.
  useEffect(() => {
    const sync = pendingAnswerFocusSyncRef.current;
    return () => sync?.cancel();
  }, [activeThreadId]);

  const onChangeActivePendingUserInputCustomAnswer = useCallback(
    (
      questionId: string,
      value: string,
      nextCursor: number,
      expandedCursor: number,
      _cursorAdjacentToMention: boolean,
    ) => {
      if (!activePendingUserInput) {
        return;
      }
      promptRef.current = value;
      dispatchPendingUserInput({
        type: "custom-answer-changed",
        requestId: activePendingUserInput.requestId,
        questionId,
        value,
      });
      pendingAnswerFocusSyncRef.current?.sync({ value, cursor: nextCursor, expandedCursor });
    },
    [activePendingUserInput],
  );

  const onAdvanceActivePendingUserInput = useCallback(() => {
    if (!activePendingUserInput) {
      return;
    }
    dispatchPendingUserInput({
      type: "advance",
      requestId: activePendingUserInput.requestId,
      questions: activePendingUserInput.questions,
    });
  }, [activePendingUserInput]);

  // Reducer submission intents carry the exact answer snapshot that completed
  // the questionnaire. Consuming each id once keeps React Strict Mode from
  // sending the provider response twice while still allowing a failed retry.
  const consumedPendingSubmissionIdsRef = useRef(new Set<number>());
  useEffect(() => {
    const intent = pendingUserInputState.submissionIntent;
    if (!intent || consumedPendingSubmissionIdsRef.current.has(intent.submissionId)) return;
    consumedPendingSubmissionIdsRef.current.add(intent.submissionId);
    dispatchPendingUserInput({ type: "submission-consumed", submissionId: intent.submissionId });
    if (
      activeThreadId &&
      shouldFollowUpWithAttachments({
        isLastQuestion: true,
        hasResolvedAnswers: true,
        attachmentCount: composerRef.current?.getSendContext().images.length ?? 0,
      })
    ) {
      pendingAnswerAttachmentFollowUpRef.current = activeThreadId;
    }
    void onRespondToUserInput(intent.requestId as ApprovalRequestId, intent.answers);
  }, [activeThreadId, composerRef, onRespondToUserInput, pendingUserInputState.submissionIntent]);

  // Avi Code addition: deliver the attachments the answer could not carry.
  //
  // Waits for the question to actually clear rather than firing straight after
  // the response resolves: until then `onSend` would take the answer branch
  // again, and the message really is a follow-up to the answer. The composer
  // text was consumed as the answer, so only the attachments go.
  useEffect(() => {
    const followUpThreadId = pendingAnswerAttachmentFollowUpRef.current;
    if (followUpThreadId === null) return;
    if (activePendingUserInput) return;
    if (followUpThreadId !== activeThreadId) {
      // Left the thread before the question cleared. The attachments stay in
      // that thread's draft rather than following the user somewhere else.
      pendingAnswerAttachmentFollowUpRef.current = null;
      return;
    }
    pendingAnswerAttachmentFollowUpRef.current = null;
    promptRef.current = "";
    void onSend();
    // `onSend` is redefined every render; depending on it would run this on
    // each one. The ref above is what decides whether there is work to do.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePendingUserInput, activeThreadId]);

  const onPreviousActivePendingUserInputQuestion = useCallback(() => {
    if (!activePendingUserInput) {
      return;
    }
    dispatchPendingUserInput({ type: "previous", requestId: activePendingUserInput.requestId });
  }, [activePendingUserInput]);

  const onSubmitPlanFollowUp = useCallback(
    async ({
      text,
      interactionMode: nextInteractionMode,
      // Avi Code addition: images/documents captured from the composer at the
      // call site, sent alongside the plan follow-up text.
      attachmentImages,
    }: {
      text: string;
      interactionMode: "default" | "plan";
      attachmentImages: ComposerAttachment[];
    }) => {
      if (
        !activeThread ||
        !isServerThread ||
        isSendBusy ||
        isConnecting ||
        sendInFlightRef.current
      ) {
        return;
      }

      const trimmed = text.trim();
      if (!trimmed) {
        return;
      }

      const sendCtx = composerRef.current?.getSendContext();
      if (!sendCtx?.providerAvailable) {
        return;
      }
      const {
        selectedProvider: ctxSelectedProvider,
        selectedModel: ctxSelectedModel,
        selectedProviderModels: ctxSelectedProviderModels,
        selectedPromptEffort: ctxSelectedPromptEffort,
        selectedModelSelection: ctxSelectedModelSelection,
      } = sendCtx;

      const threadIdForSend = activeThread.id;
      const messageIdForSend = newMessageId();
      const messageCreatedAt = new Date().toISOString();
      // Avi Code addition: plan follow-ups share the normal send semantics.
      // Record the baseline before awaiting attachments or the server so an
      // immediate thread switch cannot suppress the completion indicator.
      markThreadVisited(
        scopedThreadKey(scopeThreadRef(activeThread.environmentId, threadIdForSend)),
        messageCreatedAt,
      );
      const outgoingMessageText = formatOutgoingPrompt({
        provider: ctxSelectedProvider,
        model: ctxSelectedModel,
        models: ctxSelectedProviderModels,
        effort: ctxSelectedPromptEffort,
        text: trimmed,
      });

      sendInFlightRef.current = true;
      beginLocalDispatch({ preparingWorktree: false });
      setThreadError(threadIdForSend, null);

      // Avi Code addition: build the turn/optimistic attachments from the
      // composer snapshot, mirroring the normal send path so Refine/Implement
      // carry pasted images and documents.
      const turnAttachments = await Promise.all(
        attachmentImages.map(async (attachment) =>
          attachment.type === "document"
            ? {
                type: "document" as const,
                name: attachment.name,
                mimeType: attachment.mimeType,
                sizeBytes: attachment.sizeBytes,
                extractedText: attachment.extractedText,
              }
            : {
                type: "image" as const,
                name: attachment.name,
                mimeType: attachment.mimeType,
                sizeBytes: attachment.sizeBytes,
                dataUrl: await readFileAsDataUrl(attachment.file),
              },
        ),
      );
      const optimisticAttachments = attachmentImages.map((image) => ({
        type: "image" as const,
        id: image.id,
        name: image.name,
        mimeType: image.mimeType,
        sizeBytes: image.sizeBytes,
        previewUrl: image.previewUrl,
      }));

      // Position this sent row once LegendList has measured the anchored tail.
      isAtEndRef.current = true;
      timelineScrollModeRef.current = "anchoring-new-turn";
      liveFollowUserScrollGenerationRef.current = anchorUserScrollGenerationRef.current;
      setTimelineLiveFollowEnabled(true);
      pendingTimelineAnchorRef.current = messageIdForSend;
      activeTimelineAnchorIndexRef.current = null;
      showScrollDebouncer.current.cancel();
      setShowScrollToBottom(false);
      setTimelineAnchor({
        threadKey: scopedThreadKey(scopeThreadRef(activeThread.environmentId, threadIdForSend)),
        messageId: messageIdForSend,
      });

      setOptimisticUserMessages((existing) => [
        ...existing,
        {
          id: messageIdForSend,
          role: "user",
          text: outgoingMessageText,
          ...(optimisticAttachments.length > 0 ? { attachments: optimisticAttachments } : {}),
          turnId: null,
          createdAt: messageCreatedAt,
          updatedAt: messageCreatedAt,
          streaming: false,
        },
      ]);

      // Avi Code addition: clear the composer now that the optimistic message
      // (with its blob preview URLs) is captured, matching the normal send path.
      clearComposerDraftContent(composerDraftTarget);

      const settingsResult = await persistThreadSettingsForNextTurn({
        threadId: threadIdForSend,
        createdAt: messageCreatedAt,
        modelSelection: ctxSelectedModelSelection,
        ...(localCheckoutBranchMismatch
          ? { branch: localCheckoutBranchMismatch.currentBranch }
          : {}),
        runtimeMode,
        interactionMode: nextInteractionMode,
      });
      let failure: AtomCommandResult<unknown, unknown> | null =
        settingsResult._tag === "Failure" ? settingsResult : null;

      if (failure === null) {
        // Keep the mode toggle and plan-follow-up banner in sync immediately
        // while the same-thread implementation turn is starting.
        setComposerDraftInteractionMode(
          scopeThreadRef(activeThread.environmentId, threadIdForSend),
          nextInteractionMode,
        );

        const startResult = await startThreadTurn({
          environmentId,
          input: {
            threadId: threadIdForSend,
            message: {
              messageId: messageIdForSend,
              role: "user",
              text: outgoingMessageText,
              attachments: turnAttachments,
            },
            modelSelection: ctxSelectedModelSelection,
            titleSeed: activeThread.title,
            runtimeMode,
            interactionMode: nextInteractionMode,
            ...(nextInteractionMode === "default" && activeProposedPlan
              ? {
                  sourceProposedPlan: {
                    threadId: activeThread.id,
                    planId: activeProposedPlan.id,
                  },
                }
              : {}),
            createdAt: messageCreatedAt,
          },
        });
        failure = startResult._tag === "Failure" ? startResult : null;
      }

      if (failure === null) {
        // Optimistically open the plan sidebar when implementing (not refining).
        // "default" mode here means the agent is executing the plan, which produces
        // step-tracking activities that the sidebar will display.
        if (nextInteractionMode === "default" && autoOpenPlanSidebar) {
          planSidebarDismissedForTurnRef.current = null;
          if (activeThreadRef) {
            useRightPanelStore.getState().open(activeThreadRef, "plan");
          }
        }
        sendInFlightRef.current = false;
        return;
      }

      setOptimisticUserMessages((existing) =>
        existing.filter((message) => message.id !== messageIdForSend),
      );
      if (!isAtomCommandInterrupted(failure)) {
        const error = squashAtomCommandFailure(failure);
        setThreadError(
          threadIdForSend,
          error instanceof Error ? error.message : "Failed to send plan follow-up.",
        );
      }
      sendInFlightRef.current = false;
      resetLocalDispatch();
    },
    [
      activeThread,
      activeProposedPlan,
      beginLocalDispatch,
      isConnecting,
      isSendBusy,
      isServerThread,
      localCheckoutBranchMismatch,
      persistThreadSettingsForNextTurn,
      resetLocalDispatch,
      runtimeMode,
      setComposerDraftInteractionMode,
      setThreadError,
      startThreadTurn,
      autoOpenPlanSidebar,
      environmentId,
      composerRef,
      clearComposerDraftContent,
      composerDraftTarget,
      markThreadVisited,
    ],
  );

  // Avi Code addition: resend an earlier user message as a fresh turn in the
  // same thread. The original text and attachments go out verbatim; the
  // composer draft is left untouched.
  const onRetryUserMessage = useCallback(
    async (messageId: MessageId) => {
      if (
        !activeThread ||
        !isServerThread ||
        isSendBusy ||
        isConnecting ||
        activeEnvironmentUnavailable ||
        sendInFlightRef.current
      ) {
        return;
      }
      const message = displayServerMessages.find(
        (candidate) => candidate.id === messageId && candidate.role === "user",
      );
      if (!message) return;
      const sendCtx = composerRef.current?.getSendContext();
      if (!sendCtx?.providerAvailable) return;

      const threadIdForSend = activeThread.id;
      const retryMessageId = newMessageId();
      const messageCreatedAt = new Date().toISOString();
      // Display rows resolve preview URLs onto every attachment kind at runtime.
      const messageAttachments: ReadonlyArray<ChatAttachment & { readonly previewUrl?: string }> =
        message.attachments ?? [];

      sendInFlightRef.current = true;
      beginLocalDispatch({ preparingWorktree: false });
      setThreadError(threadIdForSend, null);

      const attachmentResult = await settlePromise(() =>
        Promise.all(
          messageAttachments.map(async (attachment) => {
            if (!attachment.previewUrl) {
              throw new Error(`The original attachment '${attachment.name}' is unavailable.`);
            }
            const response = await fetch(attachment.previewUrl);
            if (!response.ok) {
              throw new Error(`Could not reload '${attachment.name}'.`);
            }
            if (attachment.type === "document") {
              return {
                type: "document" as const,
                name: attachment.name,
                mimeType: attachment.mimeType,
                sizeBytes: attachment.sizeBytes,
                extractedText: await response.text(),
              };
            }
            const blob = await response.blob();
            return {
              type: "image" as const,
              name: attachment.name,
              mimeType: attachment.mimeType,
              sizeBytes: attachment.sizeBytes,
              dataUrl: await readFileAsDataUrl(
                new File([blob], attachment.name, { type: attachment.mimeType }),
              ),
            };
          }),
        ),
      );
      if (attachmentResult._tag === "Failure") {
        setThreadError(
          threadIdForSend,
          sanitizeThreadErrorMessage(
            chatActionErrorMessage(squashAtomCommandFailure(attachmentResult)),
          ),
        );
        sendInFlightRef.current = false;
        resetLocalDispatch();
        return;
      }

      // Position this sent row once LegendList has measured the anchored tail.
      isAtEndRef.current = true;
      timelineScrollModeRef.current = "anchoring-new-turn";
      liveFollowUserScrollGenerationRef.current = anchorUserScrollGenerationRef.current;
      setTimelineLiveFollowEnabled(true);
      pendingTimelineAnchorRef.current = retryMessageId;
      activeTimelineAnchorIndexRef.current = null;
      showScrollDebouncer.current.cancel();
      setShowScrollToBottom(false);
      setTimelineAnchor({
        threadKey: scopedThreadKey(scopeThreadRef(activeThread.environmentId, threadIdForSend)),
        messageId: retryMessageId,
      });
      setOptimisticUserMessages((existing) => [
        ...existing,
        {
          id: retryMessageId,
          role: "user",
          text: message.text,
          ...(message.attachments && message.attachments.length > 0
            ? { attachments: message.attachments }
            : {}),
          turnId: null,
          createdAt: messageCreatedAt,
          updatedAt: messageCreatedAt,
          streaming: false,
        },
      ]);

      const startResult = await startThreadTurn({
        environmentId,
        input: {
          threadId: threadIdForSend,
          message: {
            messageId: retryMessageId,
            role: "user",
            text: message.text,
            attachments: attachmentResult.value,
          },
          modelSelection: sendCtx.selectedModelSelection,
          titleSeed: activeThread.title,
          runtimeMode,
          interactionMode,
          createdAt: messageCreatedAt,
        },
      });
      if (startResult._tag === "Failure") {
        // The optimistic attachments still belong to the original message's
        // display row, so drop the copy without revoking its preview URLs.
        setOptimisticUserMessages((existing) =>
          existing.filter((candidate) => candidate.id !== retryMessageId),
        );
        if (!isAtomCommandInterrupted(startResult)) {
          const error = squashAtomCommandFailure(startResult);
          setThreadError(
            threadIdForSend,
            error instanceof Error ? error.message : "Failed to send the message again.",
          );
        }
        resetLocalDispatch();
      }
      sendInFlightRef.current = false;
    },
    [
      activeThread,
      activeEnvironmentUnavailable,
      beginLocalDispatch,
      composerRef,
      displayServerMessages,
      environmentId,
      interactionMode,
      isConnecting,
      isSendBusy,
      isServerThread,
      resetLocalDispatch,
      runtimeMode,
      setThreadError,
      startThreadTurn,
    ],
  );

  const onImplementPlanInNewThread = useCallback(async () => {
    if (
      !activeThread ||
      !activeProject ||
      !activeProposedPlan ||
      !isServerThread ||
      isSendBusy ||
      isConnecting ||
      activeEnvironmentUnavailable ||
      sendInFlightRef.current
    ) {
      return;
    }

    const sendCtx = composerRef.current?.getSendContext();
    if (!sendCtx?.providerAvailable) {
      return;
    }
    const {
      selectedProvider: ctxSelectedProvider,
      selectedModel: ctxSelectedModel,
      selectedProviderModels: ctxSelectedProviderModels,
      selectedPromptEffort: ctxSelectedPromptEffort,
      selectedModelSelection: ctxSelectedModelSelection,
    } = sendCtx;

    const createdAt = new Date().toISOString();
    const nextThreadId = newThreadId();
    const planMarkdown = activeProposedPlan.planMarkdown;
    const implementationPrompt = buildPlanImplementationPrompt(planMarkdown);
    const outgoingImplementationPrompt = formatOutgoingPrompt({
      provider: ctxSelectedProvider,
      model: ctxSelectedModel,
      models: ctxSelectedProviderModels,
      effort: ctxSelectedPromptEffort,
      text: implementationPrompt,
    });
    const nextThreadTitle = truncate(buildPlanImplementationThreadTitle(planMarkdown));
    const nextThreadModelSelection: ModelSelection = ctxSelectedModelSelection;

    sendInFlightRef.current = true;
    beginLocalDispatch({ preparingWorktree: false });
    const finish = () => {
      sendInFlightRef.current = false;
      resetLocalDispatch();
    };

    const createResult = await createThread({
      environmentId,
      input: {
        threadId: nextThreadId,
        projectId: activeProject.id,
        title: nextThreadTitle,
        modelSelection: nextThreadModelSelection,
        runtimeMode,
        interactionMode: "default",
        branch: activeThreadBranch,
        worktreePath: activeThread.worktreePath,
        createdAt,
      },
    });
    let failure: AtomCommandResult<unknown, unknown> | null =
      createResult._tag === "Failure" ? createResult : null;

    if (failure === null) {
      const startResult = await startThreadTurn({
        environmentId,
        input: {
          threadId: nextThreadId,
          message: {
            messageId: newMessageId(),
            role: "user",
            text: outgoingImplementationPrompt,
            attachments: [],
          },
          modelSelection: ctxSelectedModelSelection,
          titleSeed: nextThreadTitle,
          runtimeMode,
          interactionMode: "default",
          sourceProposedPlan: {
            threadId: activeThread.id,
            planId: activeProposedPlan.id,
          },
          createdAt,
        },
      });
      failure = startResult._tag === "Failure" ? startResult : null;
    }

    if (failure === null) {
      const startedResult = await settlePromise(() =>
        waitForStartedServerThread(scopeThreadRef(activeThread.environmentId, nextThreadId)),
      );
      failure = startedResult._tag === "Failure" ? startedResult : null;
    }

    if (failure === null) {
      // Signal that the plan sidebar should open on the new thread when enabled.
      planSidebarOpenOnNextThreadRef.current = autoOpenPlanSidebar;
      const navigateResult = await settlePromise(() =>
        navigate({
          to: "/$environmentId/$threadId",
          params: {
            environmentId: activeThread.environmentId,
            threadId: nextThreadId,
          },
        }),
      );
      failure = navigateResult._tag === "Failure" ? navigateResult : null;
    }

    if (failure !== null) {
      const cleanupResult = await deleteThread({
        environmentId,
        input: {
          threadId: nextThreadId,
        },
      });
      if (cleanupResult._tag === "Failure" && !isAtomCommandInterrupted(cleanupResult)) {
        console.warn(
          "Failed to clean up implementation thread after start failure.",
          squashAtomCommandFailure(cleanupResult),
        );
      }
      if (!isAtomCommandInterrupted(failure)) {
        const error = squashAtomCommandFailure(failure);
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: "Could not start implementation thread",
            description:
              error instanceof Error
                ? error.message
                : "An error occurred while creating the new thread.",
          }),
        );
      }
    }
    finish();
  }, [
    activeProject,
    activeProposedPlan,
    activeThreadBranch,
    activeThread,
    beginLocalDispatch,
    activeEnvironmentUnavailable,
    createThread,
    deleteThread,
    isConnecting,
    isSendBusy,
    isServerThread,
    navigate,
    resetLocalDispatch,
    runtimeMode,
    startThreadTurn,
    autoOpenPlanSidebar,
    environmentId,
    composerRef,
  ]);

  const onReviewPlanWithCodex = useCallback(async () => {
    if (
      !activeThread ||
      !activeProject ||
      !activeProposedPlan ||
      !isServerThread ||
      isSendBusy ||
      isConnecting ||
      activeEnvironmentUnavailable ||
      sendInFlightRef.current
    ) {
      return;
    }

    const codexProvider = providerStatuses.find(
      (provider) =>
        provider.driver === "codex" &&
        provider.enabled &&
        provider.status === "ready" &&
        provider.availability !== "unavailable",
    );
    const codexModel = codexProvider?.models[0]?.slug;
    if (!codexProvider || !codexModel) {
      toastManager.add({
        type: "error",
        title: "Codex is unavailable",
        description: "Enable a ready Codex provider with at least one model to review this plan.",
      });
      return;
    }

    const createdAt = new Date().toISOString();
    const nextThreadId = newThreadId();
    const planMarkdown = activeProposedPlan.planMarkdown;
    const reviewPrompt = buildPlanReviewPrompt(planMarkdown);
    const nextThreadTitle = truncate(buildPlanReviewThreadTitle(planMarkdown));
    const reviewModelSelection: ModelSelection = {
      instanceId: codexProvider.instanceId,
      model: codexModel,
    };

    sendInFlightRef.current = true;
    beginLocalDispatch({ preparingWorktree: false });
    const finish = () => {
      sendInFlightRef.current = false;
      resetLocalDispatch();
    };

    const createResult = await createThread({
      environmentId,
      input: {
        threadId: nextThreadId,
        projectId: activeProject.id,
        title: nextThreadTitle,
        modelSelection: reviewModelSelection,
        runtimeMode: "full-access",
        interactionMode: "plan",
        branch: activeThreadBranch,
        worktreePath: activeThread.worktreePath,
        createdAt,
      },
    });
    let failure: AtomCommandResult<unknown, unknown> | null =
      createResult._tag === "Failure" ? createResult : null;

    if (failure === null) {
      const startResult = await startThreadTurn({
        environmentId,
        input: {
          threadId: nextThreadId,
          message: {
            messageId: newMessageId(),
            role: "user",
            text: reviewPrompt,
            attachments: [],
          },
          modelSelection: reviewModelSelection,
          titleSeed: nextThreadTitle,
          runtimeMode: "full-access",
          interactionMode: "plan",
          // Avi Code addition: back-link the review thread to the plan it
          // audits. Ingestion skips implemented-marking for plan-mode turns,
          // so this reference cannot consume the plan.
          sourceProposedPlan: {
            threadId: activeThread.id,
            planId: activeProposedPlan.id,
          },
          createdAt,
        },
      });
      failure = startResult._tag === "Failure" ? startResult : null;
    }

    if (failure === null) {
      const startedResult = await settlePromise(() =>
        waitForStartedServerThread(scopeThreadRef(activeThread.environmentId, nextThreadId)),
      );
      failure = startedResult._tag === "Failure" ? startedResult : null;
    }

    if (failure === null) {
      const navigateResult = await settlePromise(() =>
        navigate({
          to: "/$environmentId/$threadId",
          params: {
            environmentId: activeThread.environmentId,
            threadId: nextThreadId,
          },
        }),
      );
      failure = navigateResult._tag === "Failure" ? navigateResult : null;
    }

    if (failure !== null) {
      const cleanupResult = await deleteThread({
        environmentId,
        input: { threadId: nextThreadId },
      });
      if (cleanupResult._tag === "Failure" && !isAtomCommandInterrupted(cleanupResult)) {
        console.warn(
          "Failed to clean up plan review thread after start failure.",
          squashAtomCommandFailure(cleanupResult),
        );
      }
      if (!isAtomCommandInterrupted(failure)) {
        const error = squashAtomCommandFailure(failure);
        toastManager.add({
          type: "error",
          title: "Could not start Codex review",
          description: error instanceof Error ? error.message : "An error occurred.",
        });
      }
    }
    finish();
  }, [
    activeEnvironmentUnavailable,
    activeProject,
    activeProposedPlan,
    activeThread,
    activeThreadBranch,
    beginLocalDispatch,
    createThread,
    deleteThread,
    environmentId,
    isConnecting,
    isSendBusy,
    isServerThread,
    navigate,
    providerStatuses,
    resetLocalDispatch,
    startThreadTurn,
  ]);

  const getModelDisabledReason = useCallback(
    (instanceId: ProviderInstanceId, model: string): string | null => {
      if (!activeThread) {
        return null;
      }
      const reason = getStartedThreadModelChangeBlockReason({
        providers: providerStatuses,
        hasStartedSession: activeThread.session !== null,
        currentModelSelection: activeThread.modelSelection,
        currentProviderInstanceId: activeThread.session?.providerInstanceId ?? null,
        nextModelSelection: { instanceId, model },
      });
      return reason ? `${reason.description} Start a new thread to use this model.` : null;
    },
    [activeThread, providerStatuses],
  );

  const onProviderModelSelect = useCallback(
    (instanceId: ProviderInstanceId, model: string) => {
      if (!activeThread) return;
      // Look up the configured instance so model normalization and custom
      // model lookup stay scoped to that exact instance. Unknown instance ids
      // are rejected by returning early; the server remains authoritative too.
      const entry = providerStatuses.find((snapshot) => snapshot.instanceId === instanceId);
      const resolvedDriverKind = entry?.driver ?? null;
      if (
        lockedProvider !== null &&
        resolvedDriverKind !== null &&
        resolvedDriverKind !== lockedProvider
      ) {
        scheduleComposerFocus();
        return;
      }
      if (lockedProvider !== null && activeThread.session?.providerInstanceId) {
        const currentEntry = providerStatuses.find(
          (snapshot) => snapshot.instanceId === activeThread.session?.providerInstanceId,
        );
        if (
          currentEntry?.continuation?.groupKey &&
          entry?.continuation?.groupKey &&
          currentEntry.continuation.groupKey !== entry.continuation.groupKey
        ) {
          scheduleComposerFocus();
          return;
        }
      }
      const resolvedModel = resolveAppModelSelectionForInstance(
        instanceId,
        settings,
        providerStatuses,
        model,
      );
      if (!resolvedModel) {
        scheduleComposerFocus();
        return;
      }
      const nextModelSelection: ModelSelection = {
        instanceId,
        model: resolvedModel,
      };
      const modelChangeBlockReason = getStartedThreadModelChangeBlockReason({
        providers: providerStatuses,
        hasStartedSession: activeThread.session !== null,
        currentModelSelection: activeThread.modelSelection,
        currentProviderInstanceId: activeThread.session?.providerInstanceId ?? null,
        nextModelSelection,
      });
      if (modelChangeBlockReason) {
        toastManager.add({
          type: "warning",
          title: modelChangeBlockReason.title,
          description: modelChangeBlockReason.description,
        });
        scheduleComposerFocus();
        return;
      }
      setComposerDraftModelSelection(
        scopeThreadRef(activeThread.environmentId, activeThread.id),
        nextModelSelection,
      );
      const stickyScopeKey =
        settings.projectScopedProviderSelectionEnabled && activeProject
          ? scopedProjectKey(scopeProjectRef(activeProject.environmentId, activeProject.id))
          : null;
      setStickyComposerModelSelection(nextModelSelection, stickyScopeKey);
      scheduleComposerFocus();
    },
    [
      activeThread,
      activeProject,
      lockedProvider,
      scheduleComposerFocus,
      setComposerDraftModelSelection,
      setStickyComposerModelSelection,
      providerStatuses,
      settings,
    ],
  );
  const onRefreshProviderUsage = useCallback(
    async (instanceId: ProviderInstanceId): Promise<void> => {
      await refreshProviderUsage({
        environmentId,
        input: { instanceId },
      });
    },
    [environmentId, refreshProviderUsage],
  );
  const onEnvModeChange = useCallback(
    (mode: DraftThreadEnvMode) => {
      if (canOverrideServerThreadEnvMode) {
        setPendingServerThreadEnvMode(mode);
        scheduleComposerFocus();
        return;
      }
      if (isLocalDraftThread) {
        setDraftThreadContext(composerDraftTarget, {
          envMode: mode,
          startFromOrigin: resolveNewDraftStartFromOrigin({
            envMode: mode,
            newWorktreesStartFromOrigin: primaryServerSettings.newWorktreesStartFromOrigin,
          }),
          ...(mode === "worktree" && draftThread?.worktreePath ? { worktreePath: null } : {}),
        });
      }
      scheduleComposerFocus();
    },
    [
      canOverrideServerThreadEnvMode,
      composerDraftTarget,
      draftThread?.worktreePath,
      isLocalDraftThread,
      primaryServerSettings.newWorktreesStartFromOrigin,
      setPendingServerThreadEnvMode,
      scheduleComposerFocus,
      setDraftThreadContext,
    ],
  );

  const onStartFromOriginChange = (nextStartFromOrigin: boolean) => {
    if (canOverrideServerThreadEnvMode && activeThread) {
      setPendingServerThreadStartFromOriginByThreadId((current) =>
        current[activeThread.id] === nextStartFromOrigin
          ? current
          : { ...current, [activeThread.id]: nextStartFromOrigin },
      );
      return;
    }
    if (isLocalDraftThread) {
      setDraftThreadContext(composerDraftTarget, {
        startFromOrigin: nextStartFromOrigin,
      });
    }
  };

  const onExpandTimelineImage = useCallback((preview: ExpandedImagePreview) => {
    setExpandedImage(preview);
  }, []);
  const onOpenTurnDiff = useCallback(
    (turnId: TurnId, filePath?: string) => {
      if (!isServerThread || !activeThreadRef) return;
      useDiffPanelStore.getState().selectTurn(activeThreadRef, turnId, filePath);
      useRightPanelStore.getState().open(activeThreadRef, "diff");
      onDiffPanelOpen?.();
    },
    [activeThreadRef, isServerThread, onDiffPanelOpen],
  );
  // Both the Map and the revert handler are read from refs at call-time so
  // the callback reference is fully stable and never busts context identity.
  const revertTurnCountRef = useRef(revertTurnCountByUserMessageId);
  revertTurnCountRef.current = revertTurnCountByUserMessageId;
  const onRevertToTurnCountRef = useRef(onRevertToTurnCount);
  onRevertToTurnCountRef.current = onRevertToTurnCount;
  const onRevertUserMessage = useCallback((messageId: MessageId) => {
    const targetTurnCount = revertTurnCountRef.current.get(messageId);
    if (typeof targetTurnCount !== "number") {
      return;
    }
    void onRevertToTurnCountRef.current(targetTurnCount);
  }, []);
  // Empty state: no active thread
  if (!activeThread) {
    return <NoActiveThreadState />;
  }
  const forkSourceThread =
    activeThread.forkedFrom == null
      ? null
      : (allThreadShells.find(
          (thread) =>
            thread.environmentId === activeThread.environmentId &&
            thread.id === activeThread.forkedFrom?.threadId,
        ) ?? null);

  const panelToggleControls = (
    <PanelLayoutControls
      terminalAvailable={activeProject !== null}
      terminalOpen={terminalUiState.terminalOpen}
      terminalShortcutLabel={shortcutLabelForCommand(keybindings, "terminal.toggle")}
      rightPanelAvailable={activeProject !== null}
      rightPanelOpen={rightPanelOpen}
      rightPanelShortcutLabel={shortcutLabelForCommand(keybindings, "rightPanel.toggle")}
      onToggleTerminal={toggleTerminalVisibility}
      onToggleRightPanel={toggleRightPanel}
    />
  );
  const panelLayoutControls = (
    <div className="workspace-titlebar-controls z-50 gap-1 [-webkit-app-region:no-drag]">
      {panelToggleControls}
    </div>
  );
  const rightPanelLayoutControls = (
    <div className="workspace-titlebar-controls z-50 gap-1 [-webkit-app-region:no-drag]">
      {rightPanelOpen && !shouldUsePlanSidebarSheet ? (
        <RightPanelMaximizeControl
          maximized={rightPanelMaximized}
          onToggle={toggleRightPanelMaximized}
        />
      ) : null}
      {rightPanelMaximized ? panelToggleControls : null}
    </div>
  );
  const rightPanelContent = activeThreadRef ? (
    activeRightPanelSurface?.kind === "preview" ? (
      <Suspense fallback={null}>
        <PreviewPanel
          mode="embedded"
          threadRef={activeThreadRef}
          tabId={activeRightPanelSurface.resourceId}
          configuredUrls={configuredPreviewUrls}
          projectRoot={activeProjectCwd}
          worktreePath={activeThreadWorktreePath}
          startDevServerLabel={activePrimaryScript?.name ?? null}
          onStartDevServer={activePrimaryScript ? handleStartDevServer : undefined}
          visible
        />
      </Suspense>
    ) : activeRightPanelSurface?.kind === "terminal" ? (
      <PersistentThreadTerminalPanel
        threadRef={activeThreadRef}
        surface={activeRightPanelSurface}
        launchContext={activeTerminalLaunchContext ?? null}
        focusRequestId={terminalFocusRequestId}
        keybindings={keybindings}
        onAddTerminalContext={addTerminalContextToDraft}
        onSplitTerminal={splitPanelTerminal}
        onSplitTerminalVertical={splitPanelTerminalVertical}
        onNewTerminal={addTerminalSurface}
        onActiveTerminalChange={activatePanelTerminal}
        onCloseTerminal={closePanelTerminal}
        splitShortcutLabel={splitTerminalShortcutLabel ?? undefined}
        splitVerticalShortcutLabel={splitTerminalVerticalShortcutLabel ?? undefined}
        newShortcutLabel={newTerminalShortcutLabel ?? undefined}
        closeShortcutLabel={closeTerminalShortcutLabel ?? undefined}
      />
    ) : activeRightPanelSurface?.kind === "diff" ? (
      <Suspense fallback={null}>
        <DiffPanel
          key={`${activeThreadKey}:${diffPanelGitStatusResolutionKey}`}
          mode="embedded"
          composerDraftTarget={composerDraftTarget}
          initialGitScope={initialDiffPanelGitScope}
        />
      </Suspense>
    ) : activeRightPanelSurface?.kind === "plan" ? (
      <PlanSidebar
        activePlan={activePlan}
        activeProposedPlan={sidebarProposedPlan}
        label={planSidebarLabel}
        environmentId={environmentId}
        threadRef={activeThreadRef}
        markdownCwd={gitCwd ?? undefined}
        workspaceRoot={activeWorkspaceRoot}
        timestampFormat={timestampFormat}
        mode="embedded"
      />
    ) : (activeRightPanelSurface?.kind === "files" || activeRightPanelSurface?.kind === "file") &&
      activeProject &&
      activeFileSurfaceRoot ? (
      <Suspense fallback={null}>
        <FilePreviewPanel
          key={`${activeProject.environmentId}:${activeFileSurfaceRoot}`}
          environmentId={activeProject.environmentId}
          cwd={activeFileSurfaceRoot}
          projectName={activeFileSurfaceLabel}
          isExternalRoot={activeFileSurface?.root !== undefined}
          threadRef={activeThreadRef}
          composerDraftTarget={composerDraftTarget}
          keybindings={keybindings}
          availableEditors={availableEditors}
          editorDiscoveryPending={editorDiscoveryPending}
          relativePath={
            activeRightPanelSurface.kind === "file" ? activeRightPanelSurface.relativePath : null
          }
          revealLine={activeFileSurface?.revealLine ?? null}
          revealRequestId={activeFileSurface?.revealRequestId ?? 0}
          isThreadWorking={isWorking}
          reloadSignal={fileReloadSignal}
          onOpenFile={openFileSurface}
          onPendingChange={handleFilePendingChange}
        />
      </Suspense>
    ) : null
  ) : null;
  const inlineSplitPane =
    rightPanelSplitLayout.layout && rightPanelSplitLayout.preferredChatWidth !== null
      ? {
          handlers: rightPanelSplitLayout.handlers,
          value: rightPanelSplitLayout.preferredChatWidth,
          minimum: rightPanelSplitLayout.separatorMinimum,
          maximum: rightPanelSplitLayout.separatorMaximum,
          active: rightPanelSplitLayout.active,
        }
      : undefined;

  return (
    <div
      ref={rightPanelSplitLayout.containerRef}
      className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden bg-background"
      style={chatContentWidthStyle}
    >
      {rightPanelOpen && !shouldUsePlanSidebarSheet ? rightPanelLayoutControls : null}
      <div
        className={cn(
          "chat-content-container flex min-h-0 min-w-0 flex-col overflow-x-hidden",
          rightPanelMaximized ? "w-0 flex-none" : "flex-1",
        )}
        style={
          ((rightPanelOpen && !shouldUsePlanSidebarSheet) || (!rightPanelOpen && isElectron)) &&
          !rightPanelMaximized &&
          rightPanelSplitLayout.layout
            ? {
                width: `${rightPanelSplitLayout.layout.chatWidth}px`,
                flex: "0 0 auto",
              }
            : undefined
        }
        data-chat-column-maximized-away={rightPanelMaximized ? "true" : "false"}
      >
        {/* Top bar */}
        <header
          data-chat-header
          className={cn(
            "bg-background transition-[padding-left] duration-200 ease-linear motion-reduce:transition-none",
            isElectron
              ? cn(
                  "workspace-topbar drag-region relative px-3 sm:px-5",
                  reserveTitleBarControlInset &&
                    !inlineRightPanelOwnsTitleBar &&
                    "wco:pr-[var(--workspace-native-controls-inset)]",
                )
              : "workspace-topbar pl-[calc(env(safe-area-inset-left)+0.75rem)] pr-[calc(env(safe-area-inset-right)+0.75rem)] sm:pl-[calc(env(safe-area-inset-left)+1.25rem)] sm:pr-[calc(env(safe-area-inset-right)+1.25rem)]",
            COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS,
          )}
        >
          {!rightPanelMaximized ? panelLayoutControls : null}
          <ChatHeader
            activeThreadEnvironmentId={activeThread.environmentId}
            activeThreadId={activeThread.id}
            {...(routeKind === "draft" && draftId ? { draftId } : {})}
            activeThreadTitle={activeThread.title}
            activeProjectName={activeProject?.title}
            activeProjectCwd={activeProject?.workspaceRoot ?? null}
            openInCwd={gitCwd}
            activeProjectScripts={activeProject?.scripts}
            preferredScriptId={
              activeProject ? (lastInvokedScriptByProjectId[activeProject.id] ?? null) : null
            }
            keybindings={keybindings}
            availableEditors={availableEditors}
            editorDiscoveryPending={editorDiscoveryPending}
            rightPanelOpen={rightPanelOpen}
            gitCwd={gitCwd}
            onOpenChanges={onToggleDiff}
            onNewThreadInProject={handleNewThreadInActiveProject}
            onRunProjectScript={runProjectScript}
            onAddProjectScript={saveProjectScript}
            onUpdateProjectScript={updateProjectScript}
            onDeleteProjectScript={deleteProjectScript}
          />
        </header>

        <ThreadErrorBanner
          error={threadError}
          onDismiss={() => {
            setThreadError(activeThread.id, null);
            // Avi Code addition: also hide the server-owned error, which the
            // local clear above cannot reach.
            if (serverSessionError !== null) {
              setDismissedServerErrorsByThreadKey((existing) =>
                existing[routeThreadKey] === serverSessionError
                  ? existing
                  : { ...existing, [routeThreadKey]: serverSessionError },
              );
            }
          }}
        />
        {/* Main content area with optional plan sidebar */}
        <div className="flex min-h-0 min-w-0 flex-1">
          {/* Chat column */}
          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
            {/* Provider status overlays the timeline without changing its content height. */}
            <div className="pointer-events-none absolute inset-x-0 top-0 z-20">
              <ProviderStatusBanner
                status={visibleProviderStatus}
                onDismiss={() => setDismissedProviderStatusBannerKey(providerStatusBannerKey)}
              />
            </div>
            {/* Messages Wrapper */}
            <div className="relative flex min-h-0 flex-1 flex-col">
              {/* Avi Code addition: find in thread, above the transcript. */}
              {findOpen ? (
                <ThreadFindBar
                  query={findQuery}
                  matchCount={findMatches.length}
                  matchIndex={findMatchIndex}
                  statusLabel={formatMatchCount(findMatchIndex, findMatches.length, findQuery)}
                  onQueryChange={setFindQuery}
                  onStep={stepFindMatch}
                  onClose={closeFind}
                />
              ) : null}
              {/* Messages — LegendList handles virtualization and scrolling internally */}
              {activeThread.forkedFrom ? (
                <div className="mx-auto mt-2 flex w-full max-w-(--chat-content-max-width) items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/35 px-3 py-2 text-xs">
                  <span className="min-w-0 truncate">
                    Forked from an earlier message in{" "}
                    <strong>{forkSourceThread?.title ?? "another thread"}</strong>
                  </span>
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() => {
                      const sourceRef = scopeThreadRef(
                        activeThread.environmentId,
                        activeThread.forkedFrom!.threadId,
                      );
                      setTimelineAnchor({
                        threadKey: scopedThreadKey(sourceRef),
                        messageId: activeThread.forkedFrom!.messageId,
                      });
                      void navigate({
                        to: "/$environmentId/$threadId",
                        params: {
                          environmentId: activeThread.environmentId,
                          threadId: activeThread.forkedFrom!.threadId,
                        },
                      });
                    }}
                  >
                    Open source
                  </Button>
                </div>
              ) : null}
              <MessagesTimeline
                key={activeThread.id}
                isWorking={isWorking}
                activeTurnInProgress={isWorking || !latestTurnSettled}
                activeTurnStartedAt={activeWorkStartedAt}
                listRef={legendListRef}
                timelineEntries={timelineEntries}
                latestTurn={activeLatestTurn}
                runningTurnId={
                  activeThread.session?.status === "running"
                    ? activeThread.session.activeTurnId
                    : null
                }
                turnDiffSummaryByAssistantMessageId={turnDiffSummaryByAssistantMessageId}
                activeThreadEnvironmentId={activeThread.environmentId}
                routeThreadKey={routeThreadKey}
                onOpenTurnDiff={onOpenTurnDiff}
                revertTurnCountByUserMessageId={revertTurnCountByUserMessageId}
                canEditAndFork={
                  isElectron &&
                  isServerThread &&
                  selectedProvider === "codex" &&
                  !activeEnvironmentUnavailable
                }
                onEditAndForkUserMessage={onEditAndForkUserMessage}
                canRetryMessages={isServerThread && !activeEnvironmentUnavailable}
                onRetryUserMessage={onRetryUserMessage}
                onRevertUserMessage={onRevertUserMessage}
                isRevertingCheckpoint={isRevertingCheckpoint}
                isForkingThread={isForkingThread}
                onImageExpand={onExpandTimelineImage}
                markdownCwd={gitCwd ?? undefined}
                resolvedTheme={resolvedTheme}
                timestampFormat={timestampFormat}
                workspaceRoot={activeWorkspaceRoot}
                findQuery={findOpen ? findQuery : ""}
                findActiveMatchIndex={findOpen ? findMatchIndex : -1}
                onFindMatchesChange={onFindMatchesChange}
                skills={activeProviderStatus?.skills ?? EMPTY_PROVIDER_SKILLS}
                anchorMessageId={timelineAnchorMessageId}
                onAnchorReady={onTimelineAnchorReady}
                onAnchorSizeChanged={onTimelineAnchorSizeChanged}
                onOpenedAtLastResponse={onTimelineOpenedAtLastResponse}
                contentInsetEndAdjustment={composerOverlayHeight}
                liveFollowEnabled={timelineLiveFollowEnabled}
                onIsAtEndChange={onIsAtEndChange}
                onManualNavigation={cancelTimelineLiveFollowForUserNavigation}
                onManualScroll={cancelTimelineLiveFollowForUserScroll}
                onActiveTurnSettled={onActiveTurnSettled}
                hideEmptyPlaceholder={isDraftHeroState || threadDetailLoading}
                topFadeEnabled={!hasTimelineTopBanner}
              />

              {/* scroll to end pill — shown when user has scrolled away from the live edge */}
              {showScrollToBottom && (
                <div
                  className="pointer-events-none absolute left-1/2 z-30 flex -translate-x-1/2 justify-center py-1.5"
                  style={{ bottom: composerOverlayHeight + 4 }}
                >
                  <button
                    type="button"
                    aria-label="Scroll to end"
                    title="Scroll to end"
                    onClick={() => scrollToEnd(true)}
                    className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-border/60 bg-card px-3 py-1 text-muted-foreground text-xs shadow-sm transition-colors hover:border-border hover:text-foreground hover:cursor-pointer"
                  >
                    <ChevronDownIcon className="size-3.5" />
                    Scroll to end
                  </button>
                </div>
              )}
            </div>

            {/* Input bar — centered hero while a draft has no messages, docked at the bottom otherwise */}
            <div
              ref={setComposerOverlayElement}
              data-chat-composer-overlay="true"
              className={
                isDraftHeroState
                  ? "pointer-events-none absolute inset-0 z-20 flex items-center"
                  : "pointer-events-none absolute inset-x-0 bottom-0 z-20 pt-1.5 sm:pt-2"
              }
            >
              <div
                ref={attachDraftHeroTransitionGroupRef}
                className="chat-composer-horizontal-inset w-full"
              >
                <div className="pointer-events-auto relative z-10">
                  {isDraftHeroState ? (
                    <div className="absolute inset-x-0 bottom-full z-0">
                      <div
                        className="pb-8"
                        style={
                          forceExpandedMobileComposer
                            ? {
                                viewTransitionName: MOBILE_DRAFT_HEADLINE_VIEW_TRANSITION_NAME,
                              }
                            : undefined
                        }
                      >
                        <DraftHeroHeadline
                          activeProjectRef={activeProjectRef}
                          activeProjectTitle={activeProject?.title ?? null}
                        />
                      </div>
                      <ComposerBannerStack className="relative z-0" items={composerBannerItems} />
                    </div>
                  ) : (
                    <ComposerBannerStack className="relative z-0" items={composerBannerItems} />
                  )}
                  {threadSyncPhase && !activeEnvironmentUnavailable ? (
                    <ThreadSyncStatusPill phase={threadSyncPhase} />
                  ) : null}
                  <div
                    className="relative"
                    style={
                      forceExpandedMobileComposer
                        ? { viewTransitionName: MOBILE_COMPOSER_VIEW_TRANSITION_NAME }
                        : undefined
                    }
                  >
                    <div
                      className={cn(
                        "chat-composer-glass-shell relative mx-auto w-full max-w-(--chat-content-max-width)",
                        showComposerContextStrip && "chat-composer-glass-shell-with-context",
                      )}
                    >
                      <div className="chat-composer-glass-host relative z-10 w-full rounded-[22px]">
                        <div ref={attachDraftHeroComposerAnchorRef} className="relative z-10">
                          <ChatComposer
                            composerRef={composerRef}
                            composerDraftTarget={composerDraftTarget}
                            environmentId={environmentId}
                            routeKind={routeKind}
                            routeThreadRef={routeThreadRef}
                            draftId={draftId}
                            activeThreadId={activeThreadId}
                            activeThreadEnvironmentId={activeThread?.environmentId}
                            activeThread={activeThread}
                            threadContextCandidates={threadContextCandidates}
                            isServerThread={isServerThread}
                            isLocalDraftThread={isLocalDraftThread}
                            forceExpandedOnMobile={forceExpandedMobileComposer && isDraftHeroState}
                            projectSelectionRequired={isLocalDraftThread && activeProject === null}
                            phase={phase}
                            isConnecting={isConnecting}
                            isSendBusy={isSendBusy}
                            sendDisabledReason={threadDetailLoading ? "Messages loading" : null}
                            isPreparingWorktree={isPreparingWorktree}
                            environmentUnavailable={activeEnvironmentUnavailableState}
                            hasQueuedTurn={hasQueuedTurn}
                            activePendingApproval={activePendingApproval}
                            pendingApprovals={pendingApprovals}
                            pendingUserInputs={pendingUserInputs}
                            activePendingProgress={activePendingProgress}
                            activePendingResolvedAnswers={activePendingResolvedAnswers}
                            activePendingIsResponding={activePendingIsResponding}
                            activePendingDraftAnswers={activePendingDraftAnswers}
                            activePendingQuestionIndex={activePendingQuestionIndex}
                            respondingRequestIds={respondingRequestIds}
                            showPlanFollowUpPrompt={showPlanFollowUpPrompt}
                            activeProposedPlan={activeProposedPlan}
                            linkedPlanReviewThreadId={linkedPlanReview?.id ?? null}
                            activePlan={activePlan as { turnId?: TurnId } | null}
                            sidebarProposedPlan={sidebarProposedPlan as { turnId?: TurnId } | null}
                            planSidebarLabel={planSidebarLabel}
                            planSidebarOpen={planSidebarOpen}
                            runtimeMode={runtimeMode}
                            interactionMode={effectiveInteractionMode}
                            interactionModeLockedByPlan={interactionModeLockedByPlan}
                            lockedProvider={lockedProvider}
                            providerStatuses={providerStatuses as ServerProvider[]}
                            providerDiscoveryState={providerDiscoveryState}
                            activeProjectDefaultModelSelection={
                              activeProject?.defaultModelSelection
                            }
                            activeThreadModelSelection={activeThread?.modelSelection}
                            activeThreadActivities={activeThread?.activities}
                            resolvedTheme={resolvedTheme}
                            settings={settings}
                            providerSelectionScopeKey={
                              settings.projectScopedProviderSelectionEnabled && activeProject
                                ? scopedProjectKey(
                                    scopeProjectRef(activeProject.environmentId, activeProject.id),
                                  )
                                : null
                            }
                            keybindings={keybindings}
                            terminalOpen={Boolean(terminalUiState.terminalOpen)}
                            gitCwd={gitCwd}
                            promptRef={promptRef}
                            composerImagesRef={composerImagesRef}
                            composerTerminalContextsRef={composerTerminalContextsRef}
                            composerElementContextsRef={composerElementContextsRef}
                            onSend={onSend}
                            planImplementIntentRef={planImplementIntentRef}
                            onInterrupt={onInterrupt}
                            onImplementPlanInNewThread={onImplementPlanInNewThread}
                            onReviewPlanWithCodex={onReviewPlanWithCodex}
                            onOpenLinkedPlanReview={onOpenLinkedPlanReview}
                            onRespondToApproval={onRespondToApproval}
                            onSelectActivePendingUserInputOption={
                              onSelectActivePendingUserInputOption
                            }
                            onPreviousActivePendingUserInputQuestion={
                              onPreviousActivePendingUserInputQuestion
                            }
                            onChangeActivePendingUserInputCustomAnswer={
                              onChangeActivePendingUserInputCustomAnswer
                            }
                            onProviderModelSelect={onProviderModelSelect}
                            onRefreshProviderUsage={onRefreshProviderUsage}
                            getModelDisabledReason={getModelDisabledReason}
                            toggleInteractionMode={toggleInteractionMode}
                            handleRuntimeModeChange={handleRuntimeModeChange}
                            handleInteractionModeChange={handleInteractionModeChange}
                            togglePlanSidebar={togglePlanSidebar}
                            focusComposer={focusComposer}
                            scheduleComposerFocus={scheduleComposerFocus}
                            setThreadError={setThreadError}
                            onExpandImage={onExpandTimelineImage}
                          />
                        </div>
                      </div>
                      <div className="min-h-0">
                        <div
                          data-terminal-open={terminalUiState.terminalOpen ? "true" : undefined}
                          className="relative z-0"
                        >
                          {showComposerContextStrip && (
                            <div className="pointer-events-auto">
                              <BranchToolbar
                                environmentId={activeThread.environmentId}
                                threadId={activeThread.id}
                                {...(routeKind === "draft" && draftId ? { draftId } : {})}
                                onEnvModeChange={onEnvModeChange}
                                startFromOrigin={startFromOrigin}
                                onStartFromOriginChange={onStartFromOriginChange}
                                {...(canOverrideServerThreadEnvMode
                                  ? { effectiveEnvModeOverride: envMode }
                                  : {})}
                                {...(canOverrideServerThreadEnvMode
                                  ? {
                                      activeThreadBranchOverride: activeThreadBranch,
                                      onActiveThreadBranchOverrideChange:
                                        setPendingServerThreadBranch,
                                    }
                                  : {})}
                                envLocked={envLocked}
                                onComposerFocusRequest={scheduleComposerFocus}
                                {...(canCheckoutPullRequestIntoThread
                                  ? { onCheckoutPullRequestRequest: openPullRequestDialog }
                                  : {})}
                                {...(hasMultipleEnvironments ? { onEnvironmentChange } : {})}
                                availableEnvironments={logicalProjectEnvironments}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    <div
                      aria-hidden
                      className="h-[calc(env(safe-area-inset-bottom)+1rem)] sm:h-[calc(env(safe-area-inset-bottom)+1.25rem)]"
                    />
                  </div>
                </div>
              </div>
            </div>

            {activeThreadRef && activePreviewMiniPlayer ? (
              <ThreadPreviewMiniPlayer
                key={`${activeThreadKey}:${activePreviewMiniPlayer.tabId}`}
                threadRef={activeThreadRef}
                tabId={activePreviewMiniPlayer.tabId}
                bottomInset={isDraftHeroState ? 0 : composerOverlayHeight}
              />
            ) : null}

            <AlertDialog open={branchRestoreConfirmOpen} onOpenChange={setBranchRestoreConfirmOpen}>
              <AlertDialogPopup>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    Switch to{" "}
                    <code className="font-medium">
                      {localCheckoutBranchMismatch?.threadBranch ?? ""}
                    </code>
                    ?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    You have uncommitted changes. They'll carry over to the other branch, or block
                    the switch if they conflict.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogClose render={<Button variant="outline" />}>Cancel</AlertDialogClose>
                  <Button
                    variant="default"
                    onClick={() => {
                      setBranchRestoreConfirmOpen(false);
                      void handleSwitchCheckoutToThread();
                    }}
                  >
                    Switch branch
                  </Button>
                </AlertDialogFooter>
              </AlertDialogPopup>
            </AlertDialog>

            {pullRequestDialogState ? (
              <PullRequestThreadDialog
                key={pullRequestDialogState.key}
                open
                environmentId={activeThread.environmentId}
                threadId={activeThread.id}
                cwd={activeProject?.workspaceRoot ?? null}
                initialReference={pullRequestDialogState.initialReference}
                onOpenChange={(open) => {
                  if (!open) {
                    closePullRequestDialog();
                  }
                }}
                onPrepared={handlePreparedPullRequestThread}
              />
            ) : null}
          </div>
          {/* end chat column */}
        </div>
        {/* end horizontal flex container */}

        {mountedTerminalThreadRefs.map(({ key: mountedThreadKey, threadRef: mountedThreadRef }) => (
          <PersistentThreadTerminalDrawer
            key={mountedThreadKey}
            threadRef={mountedThreadRef}
            threadId={mountedThreadRef.threadId}
            visible={mountedThreadKey === activeThreadKey && terminalUiState.terminalOpen}
            launchContext={
              mountedThreadKey === activeThreadKey ? (activeTerminalLaunchContext ?? null) : null
            }
            focusRequestId={mountedThreadKey === activeThreadKey ? terminalFocusRequestId : 0}
            splitShortcutLabel={splitTerminalShortcutLabel ?? undefined}
            splitVerticalShortcutLabel={splitTerminalVerticalShortcutLabel ?? undefined}
            newShortcutLabel={newTerminalShortcutLabel ?? undefined}
            closeShortcutLabel={closeTerminalShortcutLabel ?? undefined}
            keybindings={keybindings}
            onAddTerminalContext={addTerminalContextToDraft}
          />
        ))}
      </div>

      {!shouldUsePlanSidebarSheet && rightPanelOpen && activeThreadRef ? (
        <RightPanelTabs
          mode="inline"
          maximized={rightPanelMaximized}
          {...(inlineSplitPane ? { splitPane: inlineSplitPane } : {})}
          surfaces={rightPanelState.surfaces}
          activeSurfaceId={activeRightPanelSurface?.id ?? null}
          pendingSurfaceIds={pendingFileSurfaceIds}
          previewSessions={activePreviewState.sessions}
          terminalLabelsById={activeTerminalLabelsById}
          onActivate={activateRightPanelSurface}
          onCloseSurface={closeRightPanelSurface}
          onCloseOtherSurfaces={closeOtherRightPanelSurfaces}
          onCloseSurfacesToRight={closeRightPanelSurfacesToRight}
          onCloseAllSurfaces={closeAllRightPanelSurfaces}
          onCopyFilePath={copyRightPanelFilePath}
          onAddBrowser={createBrowserSurface}
          onAddTerminal={addTerminalSurface}
          onAddDiff={addDiffSurface}
          onAddFiles={addFilesSurface}
          browserAvailable={isPreviewSupportedInRuntime()}
          diffAvailable={isServerThread && isGitRepo}
          filesAvailable={activeProject !== null}
        >
          {rightPanelContent}
        </RightPanelTabs>
      ) : null}
      {shouldUsePlanSidebarSheet && rightPanelOpen && activeThreadRef ? (
        <RightPanelSheet open onClose={planSidebarOpen ? closePlanSidebar : closePreviewPanel}>
          <RightPanelTabs
            mode="sheet"
            surfaces={rightPanelState.surfaces}
            activeSurfaceId={activeRightPanelSurface?.id ?? null}
            pendingSurfaceIds={pendingFileSurfaceIds}
            previewSessions={activePreviewState.sessions}
            terminalLabelsById={activeTerminalLabelsById}
            onActivate={activateRightPanelSurface}
            onCloseSurface={closeRightPanelSurface}
            onCloseOtherSurfaces={closeOtherRightPanelSurfaces}
            onCloseSurfacesToRight={closeRightPanelSurfacesToRight}
            onCloseAllSurfaces={closeAllRightPanelSurfaces}
            onCopyFilePath={copyRightPanelFilePath}
            onAddBrowser={createBrowserSurface}
            onAddTerminal={addTerminalSurface}
            onAddDiff={addDiffSurface}
            onAddFiles={addFilesSurface}
            browserAvailable={isPreviewSupportedInRuntime()}
            diffAvailable={isServerThread && isGitRepo}
            filesAvailable={activeProject !== null}
          >
            {rightPanelContent}
          </RightPanelTabs>
        </RightPanelSheet>
      ) : null}

      {expandedImage && (
        <ExpandedImageDialog
          key={`${expandedImage.images[expandedImage.index]?.src ?? "image"}:${expandedImage.index}`}
          preview={expandedImage}
          onClose={closeExpandedImage}
        />
      )}
    </div>
  );
}

export default function ChatView(props: ChatViewProps) {
  return (
    <DiffWorkerPoolProvider>
      <ChatViewContent {...props} />
    </DiffWorkerPoolProvider>
  );
}
