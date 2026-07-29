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
  /** Fetches a short-lived Deepgram token from the server. */
  readonly requestToken: () => Promise<{ accessToken: string }>;
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

export function useDictation(options: UseDictationOptions): UseDictationResult {
  const [status, setStatus] = useState<DictationStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  // Everything the teardown path touches is held in refs so `stop`/`cancel`
  // stay stable and usable from a keydown handler without re-subscribing.
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const socketReadyRef = useRef(false);
  const audioBufferRef = useRef<Blob[]>([]);
  const transcriptRef = useRef<TranscriptState>(emptyTranscript);
  const cancelledRef = useRef(false);
  /** Guards against a second start while the first is still awaiting a token. */
  const startingRef = useRef(false);

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
      cancelledRef.current = cancelled;
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
    cancelledRef.current = false;
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
      if (cancelledRef.current) {
        for (const track of stream.getTracks()) track.stop();
        return;
      }
      streamRef.current = stream;

      // Start capturing before the socket exists and buffer the chunks, so the
      // first word isn't clipped while the token round-trip completes.
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

      const { accessToken } = await optionsRef.current.requestToken();
      if (cancelledRef.current) return;

      // Avi Code addition: browsers cannot set Deepgram's Authorization header.
      // Authenticate the temporary JWT with the documented Bearer subprotocol.
      const socket = new WebSocket(
        buildDeepgramSocketUrl({}),
        buildDeepgramSocketProtocols(accessToken),
      );
      socketRef.current = socket;

      socket.onopen = () => {
        for (const chunk of audioBufferRef.current) socket.send(chunk);
        audioBufferRef.current = [];
        socketReadyRef.current = true;
        setStatus("recording");
      };

      socket.onmessage = (event) => {
        if (cancelledRef.current) return;
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

      socket.onerror = () => {
        if (cancelledRef.current) return;
        setError("Lost the connection to Deepgram.");
        finish(true);
      };
    } catch (caught) {
      setError(describeStartFailure(caught));
      teardown();
      transcriptRef.current = emptyTranscript;
      startingRef.current = false;
      setStatus("idle");
    }
  }, [finish, teardown]);

  const stop = useCallback(() => {
    if (!startingRef.current) return;
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

  return { status, error, isActive, start: () => void start(), stop, cancel, toggle, dismissError };
}
