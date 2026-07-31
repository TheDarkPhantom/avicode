import type { AviCodeCommunicationStylePreset } from "@t3tools/contracts";
import {
  COMMUNICATION_STYLE_DEFAULT_ID,
  resolveCommunicationStyle,
  type CommunicationStyle,
} from "@t3tools/shared/communicationStyles";

/**
 * Avi Code addition. Resolution rules for the composer's communication style,
 * kept pure so the precedence is testable without a store.
 *
 * A thread's own choice wins. A thread that has never chosen inherits the global
 * last-picked style, which is what makes a new thread start where the previous
 * one left off. There is deliberately no per-project layer: a style is a
 * per-task decision, so scoping it to a repo would bind it to the wrong thing.
 */
export function toCommunicationStyles(
  presets: ReadonlyArray<AviCodeCommunicationStylePreset> | undefined,
): ReadonlyArray<CommunicationStyle> {
  return (presets ?? []).map((preset) => ({
    id: preset.id,
    label: preset.label,
    description: "Your own style.",
    instruction: preset.instruction,
    builtIn: false,
  }));
}

export function resolveEffectiveStyleId(input: {
  threadStyleId: string | null | undefined;
  globalStyleId: string | null | undefined;
}): string {
  return input.threadStyleId ?? input.globalStyleId ?? COMMUNICATION_STYLE_DEFAULT_ID;
}

/**
 * The directive sent with a turn, or undefined for the default style. Undefined
 * rather than an empty directive keeps the wire payload absent entirely, which
 * is what tells the server not to record a style on the message.
 */
export function toCommunicationStyleDirective(
  styleId: string,
  customStyles: ReadonlyArray<CommunicationStyle>,
): { label: string; instruction: string } | undefined {
  const style = resolveCommunicationStyle(styleId, customStyles);
  const instruction = style.instruction.trim();
  if (instruction.length === 0) return undefined;
  return { label: style.label, instruction };
}
