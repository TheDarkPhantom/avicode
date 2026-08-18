import { useState } from "react";
import { PlusIcon, Trash2Icon, ZapIcon } from "lucide-react";
import {
  AVICODE_CHIP_MAX,
  AVICODE_CHIP_MAX_LABEL_CHARS,
  AVICODE_CHIP_MAX_TEXT_CHARS,
  type AviCodeChip,
} from "@t3tools/contracts";

import { useClientSettings, useUpdateClientSettings } from "~/hooks/useSettings";
import { ColorSelector } from "../color-selector";
import { CHIP_COLOR_TOKENS, chipTintStyle, DEFAULT_CHIP_COLOR } from "../chat/composerChips";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { SettingsRow, SettingsSection } from "./settingsLayout";

/**
 * Avi Code addition: the editor for quick-send composer chips.
 *
 * Each chip is a saved `label + colour + text`. In the composer, chips render
 * while the input is empty and clicking one sends its text. This panel is a
 * plain add/edit/delete list capped at {@link AVICODE_CHIP_MAX}, mirroring the
 * communication-styles editor.
 */
export function ChipsSettings() {
  const chips = useClientSettings((settings) => settings.aviCodeChips);
  const updateSettings = useUpdateClientSettings();
  const [draftLabel, setDraftLabel] = useState("");
  const [draftColor, setDraftColor] = useState<string>(DEFAULT_CHIP_COLOR);
  const [draftText, setDraftText] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editColor, setEditColor] = useState<string>(DEFAULT_CHIP_COLOR);
  const [editText, setEditText] = useState("");

  const writeChips = (next: ReadonlyArray<AviCodeChip>) => {
    updateSettings({ aviCodeChips: next });
  };

  const atLimit = chips.length >= AVICODE_CHIP_MAX;
  const trimmedLabel = draftLabel.trim();
  const trimmedText = draftText.trim();
  const duplicateLabel = chips.some(
    (chip) => chip.label.toLocaleLowerCase() === trimmedLabel.toLocaleLowerCase(),
  );
  const canAdd =
    trimmedLabel.length > 0 && trimmedText.length > 0 && !atLimit && !duplicateLabel;

  const beginEdit = (chip: AviCodeChip) => {
    setEditingId(chip.id);
    setEditLabel(chip.label);
    setEditColor(chip.color);
    setEditText(chip.text);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditLabel("");
    setEditColor(DEFAULT_CHIP_COLOR);
    setEditText("");
  };

  const saveEdit = (chipId: string) => {
    const label = editLabel.trim();
    const text = editText.trim();
    if (label.length === 0 || text.length === 0) return;
    writeChips(
      chips.map((chip) => (chip.id === chipId ? { id: chipId, label, color: editColor, text } : chip)),
    );
    cancelEdit();
  };

  const removeChip = (chipId: string) => {
    writeChips(chips.filter((chip) => chip.id !== chipId));
    if (editingId === chipId) cancelEdit();
  };

  const editor = (chipId: string) => (
    <div className="flex w-full max-w-md flex-col gap-2">
      <Input
        value={editLabel}
        maxLength={AVICODE_CHIP_MAX_LABEL_CHARS}
        aria-label="Chip label"
        placeholder="Label, e.g. pr merge"
        onChange={(event) => setEditLabel(event.target.value)}
      />
      <Textarea
        value={editText}
        maxLength={AVICODE_CHIP_MAX_TEXT_CHARS}
        rows={3}
        aria-label="Chip message"
        placeholder="Message to send when the chip is clicked"
        onChange={(event) => setEditText(event.target.value)}
      />
      <ColorSelector
        colors={[...CHIP_COLOR_TOKENS]}
        defaultValue={editColor}
        onColorSelect={setEditColor}
      />
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          disabled={editLabel.trim().length === 0 || editText.trim().length === 0}
          onClick={() => saveEdit(chipId)}
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
    <SettingsSection title="Quick chips" icon={<ZapIcon className="size-5" />}>
      <SettingsRow
        title="How chips work"
        description="A chip is a saved shortcut with a label and a message. Chips appear inside the composer while the input is empty; clicking one sends its message immediately. Use them for commands you send often, like a merge and deploy."
        control={null}
      />
      {chips.map((chip) => (
        <SettingsRow
          key={chip.id}
          title={<ChipPreview label={chip.label} color={chip.color} />}
          description={chip.text}
          control={
            editingId === chip.id ? (
              editor(chip.id)
            ) : (
              <div className="flex items-center gap-1">
                <Button type="button" size="sm" variant="ghost" onClick={() => beginEdit(chip)}>
                  Edit
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  aria-label={`Delete the ${chip.label} chip`}
                  onClick={() => removeChip(chip.id)}
                >
                  <Trash2Icon className="size-4" />
                </Button>
              </div>
            )
          }
        />
      ))}
      <SettingsRow
        title="Add a chip"
        description="Give it a short label, pick a color, and write the message it should send."
        status={
          atLimit
            ? `You have reached the limit of ${AVICODE_CHIP_MAX} chips.`
            : duplicateLabel && trimmedLabel.length > 0
              ? "You already have a chip with that label."
              : undefined
        }
        control={
          <div className="flex w-full max-w-md flex-col gap-2">
            <Input
              value={draftLabel}
              maxLength={AVICODE_CHIP_MAX_LABEL_CHARS}
              placeholder="Label, e.g. pr merge"
              aria-label="Chip label"
              disabled={atLimit}
              onChange={(event) => setDraftLabel(event.target.value)}
            />
            <Textarea
              value={draftText}
              maxLength={AVICODE_CHIP_MAX_TEXT_CHARS}
              rows={3}
              placeholder="Message to send when the chip is clicked"
              aria-label="Chip message"
              disabled={atLimit}
              onChange={(event) => setDraftText(event.target.value)}
            />
            <ColorSelector
              colors={[...CHIP_COLOR_TOKENS]}
              defaultValue={draftColor}
              onColorSelect={setDraftColor}
            />
            <Button type="button" size="sm" disabled={!canAdd} onClick={addChip}>
              <PlusIcon className="size-4" />
              Add chip
            </Button>
          </div>
        }
      />
    </SettingsSection>
  );

  function addChip() {
    if (!canAdd) return;
    const baseId = slugifyChipId(trimmedLabel);
    const taken = new Set(chips.map((chip) => chip.id));
    let id = baseId;
    let suffix = 2;
    while (taken.has(id)) {
      id = `${baseId}-${suffix}`;
      suffix += 1;
    }
    writeChips([...chips, { id, label: trimmedLabel, color: draftColor, text: trimmedText }]);
    setDraftLabel("");
    setDraftText("");
    setDraftColor(DEFAULT_CHIP_COLOR);
  }
}

function slugifyChipId(label: string): string {
  const slug = label
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.length > 0 ? slug : "chip";
}

function ChipPreview({ label, color }: { label: string; color: string }) {
  return (
    <span
      style={chipTintStyle(color)}
      className="inline-flex max-w-full items-center rounded-md border border-l-2 px-2 py-0.5 text-[12px] font-medium text-foreground/80"
    >
      <span className="truncate">{label}</span>
    </span>
  );
}
