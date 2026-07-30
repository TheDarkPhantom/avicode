/**
 * Avi Code addition. Read-only shortcut reference, shown as the Shortcuts tab on
 * the Avi Code settings page.
 *
 * The upstream Keybindings page stays the editor — raw `mod+j` strings, `when`
 * expressions, one row per rule. This is the "what can I press" view: grouped by
 * area, platform-correct labels, and it also covers the shortcuts hardcoded in
 * components, which the editor cannot show because they are not config rules.
 */
import { Link } from "@tanstack/react-router";
import { useAtomValue } from "@effect/atom-react";
import { KeyboardIcon, PencilIcon, SearchIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { DEFAULT_RESOLVED_KEYBINDINGS } from "@t3tools/shared/keybindings";

import { isElectron } from "../../env";
import { primaryServerKeybindingsAtom } from "../../state/server";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Kbd, KbdGroup } from "../ui/kbd";
import {
  buildBuiltInShortcutGroups,
  buildConfigurableShortcutGroups,
  filterShortcutGroups,
  splitChordParts,
  type ShortcutEntry,
  type ShortcutGroup,
} from "./AviCodeShortcuts.logic";
import { SettingsSection } from "./settingsLayout";

function ChordPill({ chord }: { chord: string }) {
  return (
    <KbdGroup className="shrink-0">
      {splitChordParts(chord).map((part) => (
        <Kbd key={part} className="min-w-6 justify-center px-1.5">
          {part}
        </Kbd>
      ))}
    </KbdGroup>
  );
}

function ShortcutRow({ entry }: { entry: ShortcutEntry }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg px-3 py-2 even:bg-muted/15 sm:px-4">
      <div className="min-w-0 space-y-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-medium text-foreground">{entry.label}</span>
          {entry.customized ? (
            <span className="rounded-sm bg-primary/10 px-1.5 py-px text-[10px] font-medium uppercase tracking-[0.06em] text-primary">
              Custom
            </span>
          ) : null}
        </div>
        {entry.context ? (
          <div className="text-[11px] text-muted-foreground/80">{entry.context}</div>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
        {entry.chords.map((chord, index) => (
          // Chords are deduplicated per entry, so the label itself is a stable key.
          <span key={chord} className="flex items-center gap-1.5">
            {index > 0 ? (
              <span className="text-[10px] uppercase tracking-[0.06em] text-muted-foreground/70">
                {entry.chordJoin === "through" ? "…" : "or"}
              </span>
            ) : null}
            <ChordPill chord={chord} />
          </span>
        ))}
      </div>
    </div>
  );
}

function ShortcutGroupList({ groups }: { groups: ReadonlyArray<ShortcutGroup> }) {
  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <div key={group.id} className="space-y-1">
          <h3 className="px-3 text-[11px] font-semibold uppercase tracking-[0.07em] text-muted-foreground sm:px-4">
            {group.title}
          </h3>
          <div className="divide-y divide-border/40">
            {group.entries.map((entry) => (
              <ShortcutRow key={entry.id} entry={entry} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function AviCodeShortcutsPanel() {
  const keybindings = useAtomValue(primaryServerKeybindingsAtom);
  const [query, setQuery] = useState("");
  // Read once per render like the rest of the settings UI; the platform cannot
  // change under a live window.
  const platform = navigator.platform;

  const configurableGroups = useMemo(
    () => buildConfigurableShortcutGroups(keybindings, DEFAULT_RESOLVED_KEYBINDINGS, platform),
    [keybindings, platform],
  );
  const builtInGroups = useMemo(() => buildBuiltInShortcutGroups(platform), [platform]);

  const filteredConfigurable = useMemo(
    () => filterShortcutGroups(configurableGroups, query),
    [configurableGroups, query],
  );
  const filteredBuiltIn = useMemo(
    () => filterShortcutGroups(builtInGroups, query),
    [builtInGroups, query],
  );
  const hasResults = filteredConfigurable.length > 0 || filteredBuiltIn.length > 0;

  return (
    <div className="flex flex-col gap-12">
      <SettingsSection
        title="Shortcuts"
        icon={<KeyboardIcon className="size-5" />}
        headerAction={
          <Button
            size="xs"
            variant="ghost"
            render={<Link to="/settings/keybindings" />}
            aria-label="Edit keybindings"
          >
            <PencilIcon className="size-3.5" />
            Edit
          </Button>
        }
      >
        <div className="px-3 sm:px-4">
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape" && query.length > 0) {
                  event.preventDefault();
                  event.stopPropagation();
                  setQuery("");
                }
              }}
              placeholder="Search shortcuts"
              aria-label="Search shortcuts"
              className="h-8 w-full pl-8 sm:h-8 sm:w-72"
            />
          </div>
        </div>

        {!hasResults ? (
          <div className="px-3 py-10 text-center text-sm text-muted-foreground sm:px-4">
            No shortcuts match “{query}”.
          </div>
        ) : null}

        {filteredConfigurable.length > 0 ? (
          <div className="space-y-6 pt-2">
            <ShortcutGroupList groups={filteredConfigurable} />
          </div>
        ) : null}
      </SettingsSection>

      {filteredBuiltIn.length > 0 ? (
        <SettingsSection title="Built in">
          <p className="px-3 pb-2 text-[13px] leading-[1.45] text-muted-foreground/80 sm:px-4">
            These are wired into the app itself rather than the keybindings file, so they cannot be
            rebound and do not appear on the Keybindings page.
          </p>
          <ShortcutGroupList groups={filteredBuiltIn} />
        </SettingsSection>
      ) : null}

      {!isElectron ? (
        <p className="px-3 text-[12px] leading-relaxed text-muted-foreground/80 sm:px-4">
          In a browser tab some of these chords are claimed by the browser before Avi Code sees
          them. The desktop app receives all of them.
        </p>
      ) : null}
    </div>
  );
}
