import {
  KeybindingRule as KeybindingRuleSchema,
  type KeybindingCommand,
  type KeybindingRule,
  type ResolvedKeybindingsConfig,
  type ServerUpsertKeybindingInput,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";

export const PROJECT_SCRIPT_KEYBINDING_INVALID_MESSAGE = "Invalid keybinding.";

const decodeKeybindingRule = Schema.decodeUnknownOption(KeybindingRuleSchema);

function normalizeProjectScriptKeybindingInput(
  keybinding: string | null | undefined,
): string | null {
  const trimmed = keybinding?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

export function decodeProjectScriptKeybindingRule(input: {
  keybinding: string | null | undefined;
  command: KeybindingCommand;
}): KeybindingRule | null {
  const normalizedKey = normalizeProjectScriptKeybindingInput(input.keybinding);
  if (!normalizedKey) return null;

  const decoded = decodeKeybindingRule({
    key: normalizedKey,
    command: input.command,
  });
  if (decoded._tag === "None") {
    throw new Error(PROJECT_SCRIPT_KEYBINDING_INVALID_MESSAGE);
  }
  return decoded.value;
}

export function keybindingValueForCommand(
  keybindings: ResolvedKeybindingsConfig,
  command: KeybindingCommand,
): string | null {
  for (let index = keybindings.length - 1; index >= 0; index -= 1) {
    const binding = keybindings[index];
    if (!binding || binding.command !== command) continue;

    const parts: string[] = [];
    if (binding.shortcut.modKey) parts.push("mod");
    if (binding.shortcut.ctrlKey) parts.push("ctrl");
    if (binding.shortcut.metaKey) parts.push("meta");
    if (binding.shortcut.altKey) parts.push("alt");
    if (binding.shortcut.shiftKey) parts.push("shift");
    const keyToken =
      binding.shortcut.key === " "
        ? "space"
        : binding.shortcut.key === "escape"
          ? "esc"
          : binding.shortcut.key;
    parts.push(keyToken);
    return parts.join("+");
  }
  return null;
}

/**
 * Avi Code addition (port of upstream #15394): the keybinding writes that keep
 * a project script's shortcut in step with the script. Changing the shortcut
 * replaces the old rule instead of adding a second one, and clearing it or
 * deleting the script removes the rule, unless another project in the same
 * environment still has a script with this id (script commands are keyed by
 * id, so the rule is shared). Only plain rules are touched: a rule with a
 * `when` clause was written by hand and stays.
 */
export function planProjectScriptKeybindingWrites(input: {
  command: KeybindingCommand;
  nextRule: KeybindingRule | null;
  scriptWasSaved: boolean;
  scriptRetainedElsewhere: boolean;
  keybindings: ResolvedKeybindingsConfig;
}): { remove: KeybindingRule[]; upsert: ServerUpsertKeybindingInput | null } {
  const none = { remove: [], upsert: null };
  // A new script saved without a shortcut has no rule to clean up.
  if (!input.nextRule && !input.scriptWasSaved) return none;
  if (!input.nextRule && input.scriptRetainedElsewhere) return none;

  const previousRules = input.keybindings.flatMap((binding) => {
    if (binding.command !== input.command || binding.whenAst) return [];
    const previous = decodeProjectScriptKeybindingRule({
      keybinding: keybindingValueForCommand([binding], input.command),
      command: input.command,
    });
    return previous ? [previous] : [];
  });
  if (!input.nextRule) return { remove: previousRules, upsert: null };

  const previous = previousRules.at(-1);
  return {
    remove: previousRules.slice(0, -1),
    upsert:
      previous && previous.key !== input.nextRule.key
        ? { ...input.nextRule, replace: previous }
        : input.nextRule,
  };
}
