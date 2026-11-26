import {
  AVICODE_CHIP_MAX,
  AVICODE_CHIP_MAX_LABEL_CHARS,
  AVICODE_CHIP_MAX_TEXT_CHARS,
  DEFAULT_CLIENT_SETTINGS,
  type AviCodeChip,
} from "@t3tools/contracts/settings";
import { msg, T, useGT, useMessages, Var } from "gt-react";
import { CheckIcon, PencilIcon, PlusIcon, XIcon } from "lucide-react";
import { useState, type FormEvent } from "react";

import { SettingResetButton, SettingsRow } from "~/components/settings/settingsLayout";
import { useSearchableSetting } from "~/components/settings/settingsSearch";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import { updateClientSettings, useClientSettings } from "~/hooks/useSettings";
import { cn } from "~/lib/utils";
import { ComposerChipDot } from "./ComposerChipRow";
import {
  CHIP_COLOR_TOKENS,
  chipDotClass,
  DEFAULT_CHIP_COLOR,
  isChipColorToken,
  nextChipId,
  sameChips,
  type ChipColorToken,
} from "./composerChips";

const DEFAULT_CHIPS = DEFAULT_CLIENT_SETTINGS.aviCodeChips;

const COLOR_LABELS: Record<ChipColorToken, string> = {
  blue: msg("Blue"),
  green: msg("Green"),
  teal: msg("Teal"),
  purple: msg("Purple"),
  pink: msg("Pink"),
  rose: msg("Rose"),
  orange: msg("Orange"),
  amber: msg("Amber"),
};

/** `id` is null while adding a new chip. */
interface ChipDraft {
  readonly id: string | null;
  readonly label: string;
  readonly color: string;
  readonly text: string;
}

const EMPTY_DRAFT: ChipDraft = { id: null, label: "", color: DEFAULT_CHIP_COLOR, text: "" };

function saveChips(chips: ReadonlyArray<AviCodeChip>) {
  void updateClientSettings({ aviCodeChips: chips });
}

export function QuickSendChipsRow() {
  const setting = useSearchableSetting();
  const gt = useGT();
  const chips = useClientSettings((settings) => settings.aviCodeChips);
  const [draft, setDraft] = useState<ChipDraft | null>(null);
  const atLimit = chips.length >= AVICODE_CHIP_MAX;

  const commitDraft = (next: ChipDraft) => {
    const label = next.label.trim();
    const text = next.text.trim();
    if (next.id === null) {
      const id = nextChipId(
        label,
        chips.map((chip) => chip.id),
      );
      saveChips([...chips, { id, label, color: next.color, text }]);
    } else {
      const id = next.id;
      saveChips(
        chips.map((chip) => (chip.id === id ? { id, label, color: next.color, text } : chip)),
      );
    }
    setDraft(null);
  };

  const form = (current: ChipDraft) => (
    <ChipForm
      draft={current}
      takenLabels={chips
        .filter((chip) => chip.id !== current.id)
        .map((chip) => chip.label.toLocaleLowerCase())}
      onChange={setDraft}
      onSave={commitDraft}
      onCancel={() => setDraft(null)}
    />
  );

  return (
    <SettingsRow
      {...setting("avicode-quick-send-chips")}
      devicePreference
      description={gt(
        "Chips sit under the message box while it is empty. Clicking one sends its message right away.",
      )}
      resetAction={
        sameChips(chips, DEFAULT_CHIPS) ? null : (
          <SettingResetButton
            ariaLabel={gt("Reset quick-send chips to default")}
            onClick={() => {
              setDraft(null);
              saveChips(DEFAULT_CHIPS);
            }}
          />
        )
      }
    >
      <div className="flex flex-col gap-1.5 pt-3 pb-2">
        {chips.map((chip) =>
          draft?.id === chip.id ? (
            <div key={chip.id}>{form(draft)}</div>
          ) : (
            <div key={chip.id} className="flex min-w-0 items-center gap-2">
              <ComposerChipDot color={chip.color} />
              <span className="shrink-0 text-sm font-medium text-foreground">{chip.label}</span>
              <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                {chip.text}
              </span>
              <Button
                variant="ghost-muted"
                size="icon-sm"
                aria-label={gt("Edit the {label} chip", { label: chip.label })}
                onClick={() =>
                  setDraft({ id: chip.id, label: chip.label, color: chip.color, text: chip.text })
                }
              >
                <PencilIcon />
              </Button>
              <Button
                variant="ghost-muted"
                size="icon-sm"
                aria-label={gt("Remove the {label} chip", { label: chip.label })}
                onClick={() => {
                  if (draft?.id === chip.id) setDraft(null);
                  saveChips(chips.filter((candidate) => candidate.id !== chip.id));
                }}
              >
                <XIcon />
              </Button>
            </div>
          ),
        )}
        {draft !== null && draft.id === null ? (
          form(draft)
        ) : (
          <div>
            <Button
              variant="ghost-muted"
              size="compact"
              disabled={atLimit}
              onClick={() => setDraft(EMPTY_DRAFT)}
            >
              <PlusIcon />
              <T>Add chip</T>
            </Button>
            {atLimit ? (
              <span className="ps-2 text-xs text-muted-foreground">
                <T>
                  Up to <Var>{AVICODE_CHIP_MAX}</Var> chips
                </T>
              </span>
            ) : null}
          </div>
        )}
      </div>
    </SettingsRow>
  );
}

function ChipForm(props: {
  readonly draft: ChipDraft;
  readonly takenLabels: ReadonlyArray<string>;
  readonly onChange: (draft: ChipDraft) => void;
  readonly onSave: (draft: ChipDraft) => void;
  readonly onCancel: () => void;
}) {
  const gt = useGT();
  const m = useMessages();
  const { draft, onChange } = props;
  const label = draft.label.trim();
  const duplicate = label.length > 0 && props.takenLabels.includes(label.toLocaleLowerCase());
  const canSave = label.length > 0 && draft.text.trim().length > 0 && !duplicate;
  const selectedColor = isChipColorToken(draft.color) ? draft.color : DEFAULT_CHIP_COLOR;
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (canSave) props.onSave(draft);
  };

  return (
    <form
      aria-label={draft.id === null ? gt("New chip") : gt("Edit chip")}
      className="flex max-w-md flex-col gap-2 py-1"
      onSubmit={submit}
    >
      <Input
        nativeInput
        size="sm"
        autoFocus
        value={draft.label}
        maxLength={AVICODE_CHIP_MAX_LABEL_CHARS}
        placeholder={gt("Label, like pr merge")}
        aria-label={gt("Chip label")}
        aria-invalid={duplicate || undefined}
        onChange={(event) => onChange({ ...draft, label: event.target.value })}
      />
      <Textarea
        size="sm"
        rows={3}
        value={draft.text}
        maxLength={AVICODE_CHIP_MAX_TEXT_CHARS}
        placeholder={gt("Message to send")}
        aria-label={gt("Chip message")}
        onChange={(event) => onChange({ ...draft, text: event.target.value })}
      />
      <div role="group" aria-label={gt("Chip color")} className="flex items-center gap-1.5">
        {CHIP_COLOR_TOKENS.map((token) => (
          <button
            key={token}
            type="button"
            aria-pressed={selectedColor === token}
            aria-label={m(COLOR_LABELS[token])}
            className={cn(
              "flex size-5 cursor-pointer items-center justify-center rounded-full text-white outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
              chipDotClass(token),
            )}
            onClick={() => onChange({ ...draft, color: token })}
          >
            {selectedColor === token ? <CheckIcon aria-hidden className="size-3" /> : null}
          </button>
        ))}
      </div>
      {duplicate ? (
        <p className="text-xs text-destructive-foreground">
          <T>Another chip already has this label.</T>
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" size="compact" disabled={!canSave}>
          <T>Save</T>
        </Button>
        <Button type="button" size="compact" variant="ghost-muted" onClick={props.onCancel}>
          <T>Cancel</T>
        </Button>
      </div>
    </form>
  );
}
