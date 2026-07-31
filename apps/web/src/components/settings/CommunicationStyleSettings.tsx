import { useState } from "react";
import { MessageSquareTextIcon, PlusIcon, Trash2Icon } from "lucide-react";
import type { AviCodeCommunicationStylePreset } from "@t3tools/contracts";
import {
  BUILT_IN_COMMUNICATION_STYLES,
  COMMUNICATION_STYLE_MAX_CUSTOM,
  COMMUNICATION_STYLE_MAX_INSTRUCTION_CHARS,
  COMMUNICATION_STYLE_MAX_LABEL_CHARS,
  customCommunicationStyleId,
} from "@t3tools/shared/communicationStyles";

import { useClientSettings, useUpdateClientSettings } from "~/hooks/useSettings";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { SettingsRow, SettingsSection } from "./settingsLayout";

/**
 * Avi Code addition: the editor for user-authored communication styles. The
 * built-ins are listed read-only so the page explains what a style is before
 * asking anyone to write one.
 */
export function CommunicationStyleSettings() {
  const customStyles = useClientSettings((settings) => settings.aviCodeCommunicationStyles);
  const updateSettings = useUpdateClientSettings();
  const [draftLabel, setDraftLabel] = useState("");
  const [draftInstruction, setDraftInstruction] = useState("");

  const atLimit = customStyles.length >= COMMUNICATION_STYLE_MAX_CUSTOM;
  const trimmedLabel = draftLabel.trim();
  const trimmedInstruction = draftInstruction.trim();
  const duplicateLabel = customStyles.some(
    (style) => style.label.toLocaleLowerCase() === trimmedLabel.toLocaleLowerCase(),
  );
  const canAdd =
    trimmedLabel.length > 0 && trimmedInstruction.length > 0 && !atLimit && !duplicateLabel;

  const writeStyles = (next: ReadonlyArray<AviCodeCommunicationStylePreset>) => {
    updateSettings({ aviCodeCommunicationStyles: next });
  };

  const addStyle = () => {
    if (!canAdd) return;
    // Ids must stay unique even when two labels slugify the same way, since the
    // id is what a thread's saved selection points at.
    const baseId = customCommunicationStyleId(trimmedLabel);
    const taken = new Set(customStyles.map((style) => style.id));
    let id = baseId;
    let suffix = 2;
    while (taken.has(id)) {
      id = `${baseId}-${suffix}`;
      suffix += 1;
    }
    writeStyles([
      ...customStyles,
      { id, label: trimmedLabel, instruction: trimmedInstruction },
    ]);
    setDraftLabel("");
    setDraftInstruction("");
  };

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
      {BUILT_IN_COMMUNICATION_STYLES.filter((style) => style.instruction.length > 0).map(
        (style) => (
          <SettingsRow
            key={style.id}
            title={style.label}
            description={style.description}
            control={<span className="text-muted-foreground text-xs">Built in</span>}
          />
        ),
      )}
      {customStyles.map((style) => (
        <SettingsRow
          key={style.id}
          title={style.label}
          description={style.instruction}
          control={
            <Button
              type="button"
              size="sm"
              variant="ghost"
              aria-label={`Delete the ${style.label} style`}
              onClick={() => writeStyles(customStyles.filter((entry) => entry.id !== style.id))}
            >
              <Trash2Icon className="size-4" />
            </Button>
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
}
