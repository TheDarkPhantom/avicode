import { useCallback, useEffect, useRef, useState } from "react";
import { buildDeepgramSocketProtocols, buildDeepgramSocketUrl } from "./deepgramUrl.ts";
import {
  applyDeepgramResult,
  emptyTranscript,
  parseDeepgramMessage,
  renderTranscript,
  type TranscriptState,
} from "./transcript.ts";

export type DictationStatus = "idle" | "starting" | "recording" | "stopping";

export interface UseDictationOptions {
  /** Fetches the Deepgram API key the socket authenticates with. */
  readonly requestCredential: () => Promise<{ apiKey: string }>;
  /**
   * Called on every transcript update. `isFinal` marks the last call of a
   * session, after which the consumer should stop tracking the inserted range.
   */
  readonly onTranscript: (text: string, isFinal: boolean) => void;
  /** Called when dictation is cancelled so the consumer can undo its insert. */
  readonly onCancel?: () => void;
}

export interface UseDictationResult {
  readonly status: DictationStatus;
  readonly error: string | null;
  readonly isActive: boolean;
  /**
   * Avi Code addition: the live capture stream, for the level meter. Exposed as
   * state rather than a ref because the meter has to rebuild its audio graph
   * when the stream changes, and refs do not re-render.
   */
  readonly stream: MediaStream | null;
  readonly start: () => void;
  readonly stop: () => void;
  readonly cancel: () => void;
  readonly toggle: () => void;
  readonly dismissError: () => void;
}

/** Deepgram's recommended chunk cadence — small enough to feel live. */
const AUDIO_TIMESLICE_MS = 100;

const MIC_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};

function describeStartFailure(error: unknown): string {
  if (typeof DOMException !== "undefined" && error instanceof DOMException) {
    if (error.name === "NotAllowedError" || error.name === "SecurityError") {
      return "Microphone access was blocked. Allow it for this site and try again.";
    }
    if (error.name === "NotFoundError") {
      return "No microphone was found.";
    }
  }
  if (error instanceof Error && error.message.length > 0) return error.message;
  return "Could not start dictation.";
}

/**
 * Deepgram reports a rejected stream (unsupported model or language pair, a
 * token that expired before connect) by closing the socket with a reason
 * rather than by sending an error message, so the reason is the only detail
 * available.
 */
function describeSocketClose(event: CloseEvent): string {
  const reason = event.reason.trim();
  if (reason.length > 0) return `Deepgram ended the dictation stream: ${reason}`;
  return `Deepgram ended the dictation stream (code ${event.code}).`;
}

export function useDictation(options: UseDictationOptions): UseDictationResult {
  const [status, setStatus] = useState<DictationStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  // Avi Code addition: mirrors `streamRef` for the level meter. The ref stays
  // the source of truth for teardown, which must not wait on a render.
  const [stream, setStream] = useState<MediaStream | null>(null);

  // Everything the teardown path touches is held in refs so `stop`/`cancel`
  // stay stable and usable from a keydown handler without re-subscribing.
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const socketReadyRef = useRef(false);
  const audioBufferRef = useRef<Blob[]>([]);
  const transcriptRef = useRef<TranscriptState>(emptyTranscript);
  /** Guards against a second start while the first is still awaiting a token. */
  const startingRef = useRef(false);
  /**
   * Bumped by every `start` and every `finish`. `start` awaits the microphone
   * permission and then a credential, and the user can stop or cancel during either;
   * comparing the captured id lets everything that resolves late recognise that
   * its session is already over. Socket handlers use it the same way, so a
   * previous session's socket can never write into the current one.
   */
  const sessionRef = useRef(0);
  /** Set for the flush window in `stop`, so the expected close stays quiet. */
  const stoppingRef = useRef(false);

  const optionsRef = useRef(options);
  optionsRef.current = options;

  const teardown = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
    recorderRef.current = null;

    for (const track of streamRef.current?.getTracks() ?? []) {
      // Releases the OS-level recording indicator; skipping this leaves the
      // browser tab showing as "recording" after dictation ends.
      track.stop();
    }
    streamRef.current = null;
    setStream(null);

    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      // Tells Deepgram to flush and close cleanly rather than dropping the
      // tail of the last utterance.
      socket.send(JSON.stringify({ type: "CloseStream" }));
      socket.close();
    }
    socketRef.current = null;
    socketReadyRef.current = false;
    audioBufferRef.current = [];
  }, []);

  const finish = useCallback(
    (cancelled: boolean) => {
      // Retire the session before tearing down, so the close this triggers and
      // anything still in flight in `start` both see themselves as stale.
      sessionRef.current += 1;
      stoppingRef.current = false;
      teardown();
      if (cancelled) {
        optionsRef.current.onCancel?.();
      } else {
        optionsRef.current.onTranscript(renderTranscript(transcriptRef.current), true);
      }
      transcriptRef.current = emptyTranscript;
      startingRef.current = false;
      setStatus("idle");
    },
    [teardown],
  );

  const start = useCallback(async () => {
    if (startingRef.current) return;
    startingRef.current = true;
    stoppingRef.current = false;
    const session = ++sessionRef.current;
    transcriptRef.current = emptyTranscript;
    audioBufferRef.current = [];
    socketReadyRef.current = false;
    setError(null);
    setStatus("starting");

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        // getUserMedia is only exposed in a secure context, so this is the
        // shape a plain-HTTP tailnet share URL takes.
        throw new Error("Microphone capture needs a secure connection (https or localhost).");
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: MIC_CONSTRAINTS });
      if (sessionRef.current !== session) {
        // Stopped while the permission prompt was up. Nothing else holds this
        // stream yet, so releasing it here is the only way the mic goes off.
        for (const track of stream.getTracks()) track.stop();
        return;
      }
      streamRef.current = stream;
      // Published before the credential round trip so the meter is live during
      // "starting" — that window is exactly when a dead microphone should show.
      setStream(stream);

      // Start capturing before the socket exists and buffer the chunks, so the
      // first word isn't clipped while the credential round-trip completes.
      // VibeSpeak does the same (renderer/overlay.js).
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size === 0) return;
        const socket = socketRef.current;
        if (socketReadyRef.current && socket?.readyState === WebSocket.OPEN) {
          socket.send(event.data);
        } else {
          audioBufferRef.current.push(event.data);
        }
      };
      recorder.start(AUDIO_TIMESLICE_MS);

      const { apiKey } = await optionsRef.current.requestCredential();
      // Stopped mid-credential-request; `finish` already released the recorder and
      // the stream, so opening a socket now would leak one nothing can close.
      if (sessionRef.current !== session) return;

      // Avi Code addition: browsers cannot set Deepgram's Authorization header,
      // so the key rides the WebSocket subprotocol instead.
      const socket = new WebSocket(
        buildDeepgramSocketUrl({}),
        buildDeepgramSocketProtocols(apiKey),
      );
      socketRef.current = socket;

      socket.onopen = () => {
        if (sessionRef.current !== session) return;
        for (const chunk of audioBufferRef.current) socket.send(chunk);
        audioBufferRef.current = [];
        socketReadyRef.current = true;
        setStatus("recording");
      };

      socket.onmessage = (event) => {
        if (sessionRef.current !== session) return;
        let payload: unknown;
        try {
          payload = JSON.parse(String(event.data));
        } catch {
          return;
        }
        const result = parseDeepgramMessage(payload);
        if (!result) return;
        transcriptRef.current = applyDeepgramResult(transcriptRef.current, result);
        optionsRef.current.onTranscript(renderTranscript(transcriptRef.current), false);
      };

      // A failed handshake surfaces as a bare error with no detail; a stream
      // Deepgram refuses after connecting surfaces as a close with a reason.
      // Both end the session, and both keep whatever was transcribed already —
      // losing a minute of dictation to a dropped socket is worse than the
      // drop itself.
      socket.onerror = () => {
        if (sessionRef.current !== session) return;
        setError("Lost the connection to Deepgram.");
        finish(false);
      };

      socket.onclose = (event) => {
        // `stop` closes the stream deliberately and waits for the flush, so
        // that close is expected and says nothing about the session.
        if (sessionRef.current !== session || stoppingRef.current) return;
        if (event.code !== 1000 && event.code !== 1005) {
          setError(describeSocketClose(event));
        }
        finish(false);
      };
    } catch (caught) {
      // A stop during the await already ran the whole teardown; reporting the
      // abandoned attempt on top of it would be noise.
      if (sessionRef.current !== session) return;
      setError(describeStartFailure(caught));
      teardown();
      transcriptRef.current = emptyTranscript;
      startingRef.current = false;
      setStatus("idle");
    }
  }, [finish, teardown]);

  const stop = useCallback(() => {
    if (!startingRef.current) return;
    stoppingRef.current = true;
    setStatus("stopping");
    // Give Deepgram a moment to return the final result for audio already sent;
    // without it the last word or two is routinely dropped.
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "CloseStream" }));
      window.setTimeout(() => finish(false), 250);
      return;
    }
    finish(false);
  }, [finish]);

  const cancel = useCallback(() => {
    if (!startingRef.current) return;
    finish(true);
  }, [finish]);

  const isActive = status === "starting" || status === "recording" || status === "stopping";

  const toggle = useCallback(() => {
    if (startingRef.current) {
      stop();
    } else {
      void start();
    }
  }, [start, stop]);

  // Escape cancels and discards, matching VibeSpeak's overlay.
  useEffect(() => {
    if (!isActive) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      cancel();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [cancel, isActive]);

  // Releasing the mic on unmount matters more than usual here: the composer
  // unmounts on thread switch, and a leaked track keeps the recording
  // indicator lit for the whole session.
  useEffect(() => () => teardown(), [teardown]);

  const dismissError = useCallback(() => setError(null), []);

  return {
    status,
    error,
    isActive,
    stream,
    start: () => void start(),
    stop,
    cancel,
    toggle,
    dismissError,
  };
}
