import { useState } from "react";
import { MessageSquareTextIcon, PlusIcon, RotateCcwIcon, Trash2Icon } from "lucide-react";
import type { AviCodeCommunicationStylePreset } from "@t3tools/contracts";
import {
  allCommunicationStyles,
  COMMUNICATION_STYLE_MAX_CUSTOM,
  COMMUNICATION_STYLE_MAX_INSTRUCTION_CHARS,
  COMMUNICATION_STYLE_MAX_LABEL_CHARS,
  customCommunicationStyleId,
  customCommunicationStyles,
  isCommunicationStyleEdited,
  type CommunicationStyle,
} from "@t3tools/shared/communicationStyles";

import { useClientSettings, useUpdateClientSettings } from "~/hooks/useSettings";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { SettingsRow, SettingsSection } from "./settingsLayout";

/**
 * Avi Code addition: the editor for communication styles.
 *
 * Built-ins are editable rather than read-only. An edit is stored under the
 * built-in's own id, so resetting is just deleting that entry and the shipped
 * wording applies again. That also means a thread already pointing at `business`
 * keeps resolving across an edit and a reset, which a rename-to-a-new-id
 * approach would break.
 */
export function CommunicationStyleSettings() {
  const storedStyles = useClientSettings((settings) => settings.aviCodeCommunicationStyles);
  const updateSettings = useUpdateClientSettings();
  const [draftLabel, setDraftLabel] = useState("");
  const [draftInstruction, setDraftInstruction] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editInstruction, setEditInstruction] = useState("");

  const asStyles: ReadonlyArray<CommunicationStyle> = storedStyles.map((preset) => ({
    id: preset.id,
    label: preset.label,
    description: "Your own style.",
    instruction: preset.instruction,
    builtIn: false,
  }));
  // The default style has no instruction to edit, so it is not listed.
  const editableBuiltIns = allCommunicationStyles(asStyles).filter(
    (style) => style.builtIn && style.instruction.length > 0,
  );
  const ownStyles = customCommunicationStyles(asStyles);

  // Only genuinely custom styles count toward the limit. Editing a built-in
  // stores an entry too, and consuming a slot for that would be a surprise.
  const atLimit = ownStyles.length >= COMMUNICATION_STYLE_MAX_CUSTOM;
  const trimmedLabel = draftLabel.trim();
  const trimmedInstruction = draftInstruction.trim();
  const duplicateLabel = ownStyles.some(
    (style) => style.label.toLocaleLowerCase() === trimmedLabel.toLocaleLowerCase(),
  );
  const canAdd =
    trimmedLabel.length > 0 && trimmedInstruction.length > 0 && !atLimit && !duplicateLabel;

  const writeStyles = (next: ReadonlyArray<AviCodeCommunicationStylePreset>) => {
    updateSettings({ aviCodeCommunicationStyles: next });
  };

  const beginEdit = (style: CommunicationStyle) => {
    setEditingId(style.id);
    setEditLabel(style.label);
    setEditInstruction(style.instruction);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditLabel("");
    setEditInstruction("");
  };

  const saveEdit = (styleId: string) => {
    const label = editLabel.trim();
    const instruction = editInstruction.trim();
    if (label.length === 0 || instruction.length === 0) return;
    const without = storedStyles.filter((entry) => entry.id !== styleId);
    writeStyles([...without, { id: styleId, label, instruction }]);
    cancelEdit();
  };

  const resetStyle = (styleId: string) => {
    writeStyles(storedStyles.filter((entry) => entry.id !== styleId));
    if (editingId === styleId) cancelEdit();
  };

  const editor = (styleId: string) => (
    <div className="flex w-full max-w-md flex-col gap-2">
      <Input
        value={editLabel}
        maxLength={COMMUNICATION_STYLE_MAX_LABEL_CHARS}
        aria-label="Style name"
        onChange={(event) => setEditLabel(event.target.value)}
      />
      <Textarea
        value={editInstruction}
        maxLength={COMMUNICATION_STYLE_MAX_INSTRUCTION_CHARS}
        rows={5}
        aria-label="Style instruction"
        onChange={(event) => setEditInstruction(event.target.value)}
      />
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          disabled={editLabel.trim().length === 0 || editInstruction.trim().length === 0}
          onClick={() => saveEdit(styleId)}
        >
          Save
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={cancelEdit}>
          Cancel
        </Button>
      </div>
    </div>
  );

  return (
    <SettingsSection
      title="Communication styles"
      icon={<MessageSquareTextIcon className="size-5" />}
    >
      <SettingsRow
        title="How styles work"
        description="A style is an instruction added to what the agent receives, changing how it writes back without changing what you asked for. Pick one from the Style control in the composer. It applies from your next message and sticks for the rest of that chat, and whichever you picked last is where new chats start."
        status="The instruction is never written into the chat transcript, so your messages read exactly as you typed them. Chats record only the style's name, shown on the message it applied to."
        control={null}
      />
      {editableBuiltIns.map((style) => {
        const edited = isCommunicationStyleEdited(style.id, asStyles);
        return (
          <SettingsRow
            key={style.id}
            title={style.label}
            description={edited ? style.instruction : style.description}
            status={edited ? "Edited. Reset restores the wording Avi Code ships." : undefined}
            control={
              editingId === style.id ? (
                editor(style.id)
              ) : (
                <div className="flex items-center gap-1">
                  <Button type="button" size="sm" variant="ghost" onClick={() => beginEdit(style)}>
                    Edit
                  </Button>
                  {edited ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      aria-label={`Reset the ${style.label} style`}
                      onClick={() => resetStyle(style.id)}
                    >
                      <RotateCcwIcon className="size-4" />
                    </Button>
                  ) : null}
                </div>
              )
            }
          />
        );
      })}
      {ownStyles.map((style) => (
        <SettingsRow
          key={style.id}
          title={style.label}
          description={style.instruction}
          control={
            editingId === style.id ? (
              editor(style.id)
            ) : (
              <div className="flex items-center gap-1">
                <Button type="button" size="sm" variant="ghost" onClick={() => beginEdit(style)}>
                  Edit
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  aria-label={`Delete the ${style.label} style`}
                  onClick={() => resetStyle(style.id)}
                >
                  <Trash2Icon className="size-4" />
                </Button>
              </div>
            )
          }
        />
      ))}
      <SettingsRow
        title="Add a style"
        description="Give it a short name and the instruction the agent should follow. Write it as a direct instruction, for example: keep every answer under five sentences and do not use em dashes."
        status={
          atLimit
            ? `You have reached the limit of ${COMMUNICATION_STYLE_MAX_CUSTOM} custom styles.`
            : duplicateLabel && trimmedLabel.length > 0
              ? "You already have a style with that name."
              : undefined
        }
        control={
          <div className="flex w-full max-w-md flex-col gap-2">
            <Input
              value={draftLabel}
              maxLength={COMMUNICATION_STYLE_MAX_LABEL_CHARS}
              placeholder="Name, e.g. Terse"
              aria-label="Style name"
              disabled={atLimit}
              onChange={(event) => setDraftLabel(event.target.value)}
            />
            <Textarea
              value={draftInstruction}
              maxLength={COMMUNICATION_STYLE_MAX_INSTRUCTION_CHARS}
              rows={3}
              placeholder="Instruction the agent should follow when writing back"
              aria-label="Style instruction"
              disabled={atLimit}
              onChange={(event) => setDraftInstruction(event.target.value)}
            />
            <Button type="button" size="sm" disabled={!canAdd} onClick={addStyle}>
              <PlusIcon className="size-4" />
              Add style
            </Button>
          </div>
        }
      />
    </SettingsSection>
  );

  function addStyle() {
    if (!canAdd) return;
    // Ids must stay unique even when two labels slugify the same way, since the
    // id is what a thread's saved selection points at.
    const baseId = customCommunicationStyleId(trimmedLabel);
    const taken = new Set(storedStyles.map((style) => style.id));
    let id = baseId;
    let suffix = 2;
    while (taken.has(id)) {
      id = `${baseId}-${suffix}`;
      suffix += 1;
    }
    writeStyles([...storedStyles, { id, label: trimmedLabel, instruction: trimmedInstruction }]);
    setDraftLabel("");
    setDraftInstruction("");
  }
}
