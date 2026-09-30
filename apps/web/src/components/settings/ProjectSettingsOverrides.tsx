/**
 * Avi Code addition. Per-project overrides of a few server settings: worktree
 * defaults, git writing style and the text generation models. Each setting is
 * either "Use default" (the global value, shown inline) or a project value.
 * Resolution lives in `@t3tools/shared/projectSettings`.
 */
import { useAtomValue } from "@effect/atom-react";
import {
  AVICODE_PROJECT_OVERRIDABLE_SETTING_KEYS,
  type AviCodeProjectOverridableSettingKey,
  type AviCodeProjectSettingsOverride,
  type ModelSelection,
  type ProjectId,
  type SourceControlWritingStyleMode,
} from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";
import {
  getProjectSettingsOverride,
  withProjectSettingOverride,
} from "@t3tools/shared/projectSettings";
import { FolderCogIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { usePrimarySettings, useUpdatePrimarySettings } from "../../hooks/useSettings";
import {
  getCustomModelOptionsByInstance,
  resolveAppModelSelectionState,
} from "../../modelSelection";
import {
  applyProviderInstanceSettings,
  deriveProviderInstanceEntries,
  sortProviderInstanceEntries,
} from "../../providerInstances";
import { useProjects } from "../../state/entities";
import { usePrimaryEnvironmentId } from "../../state/environments";
import { primaryServerConfigAtom, primaryServerProvidersAtom } from "../../state/server";
import { ProviderModelPicker } from "../chat/ProviderModelPicker";
import { Button } from "../ui/button";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Textarea } from "../ui/textarea";
import { SOURCE_CONTROL_WRITING_MODE_OPTIONS } from "./SourceControlWritingSettings";
import { SettingResetButton, SettingsRow, SettingsSection } from "./settingsLayout";

const DEFAULT_VALUE = "default";

const ENV_MODE_LABELS = { local: "Local", worktree: "New worktree" } as const;

function describeModel(selection: ModelSelection | null): string {
  return selection ? `${selection.instanceId} / ${selection.model}` : "Text generation model";
}

function countOverrides(override: AviCodeProjectSettingsOverride): number {
  return AVICODE_PROJECT_OVERRIDABLE_SETTING_KEYS.filter((key) => Object.hasOwn(override, key))
    .length;
}

export function ProjectSettingsOverridesSection() {
  const supported =
    useAtomValue(primaryServerConfigAtom)?.environment.capabilities
      .aviCodeProjectSettingsOverrides === true;
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const allProjects = useProjects();
  const settings = usePrimarySettings();
  const updateSettings = useUpdatePrimarySettings();
  const serverProviders = useAtomValue(primaryServerProvidersAtom);
  const [selectedProjectId, setSelectedProjectId] = useState<ProjectId | null>(null);

  // Overrides live in the primary environment's settings and are resolved by
  // that server, so only its projects are offered.
  const projects = useMemo(
    () =>
      allProjects
        .filter((project) => project.environmentId === primaryEnvironmentId)
        .toSorted((left, right) => left.title.localeCompare(right.title)),
    [allProjects, primaryEnvironmentId],
  );
  const project =
    projects.find((candidate) => candidate.id === selectedProjectId) ?? projects[0] ?? null;

  const instanceEntries = sortProviderInstanceEntries(
    applyProviderInstanceSettings(deriveProviderInstanceEntries(serverProviders), settings),
  );
  const globalTextModel = resolveAppModelSelectionState(settings, serverProviders);

  if (!supported || project === null) {
    return (
      <SettingsSection title="Project overrides" icon={<FolderCogIcon className="size-5" />}>
        <SettingsRow
          title="Per-project settings"
          description="Override worktree, git writing and model defaults for a single project."
          status={
            supported
              ? "Add a project to set overrides for it."
              : "Needs a newer Avi Code server. Restart the app after updating."
          }
        />
      </SettingsSection>
    );
  }

  const projectId = project.id;
  const override = getProjectSettingsOverride(settings, projectId);
  const setOverride = <K extends AviCodeProjectOverridableSettingKey>(
    key: K,
    value: AviCodeProjectSettingsOverride[K] | undefined,
  ) =>
    updateSettings({
      aviCodeProjectSettingsOverrides: {
        [projectId]: withProjectSettingOverride(override, key, value),
      },
    });
  const resetButton = (key: AviCodeProjectOverridableSettingKey, label: string) =>
    Object.hasOwn(override, key) ? (
      <SettingResetButton label={label} onClick={() => setOverride(key, undefined)} />
    ) : null;

  const envMode = override.defaultThreadEnvMode;
  const startFromOrigin = override.newWorktreesStartFromOrigin;
  const textModel = override.textGenerationModelSelection;
  const writerModel = override.sourceControlWriterModelSelection;
  const style = override.sourceControlWritingStyle;
  const writerChoice =
    writerModel === undefined ? DEFAULT_VALUE : writerModel === null ? "shared" : "dedicated";
  const modelPicker = (
    selection: ModelSelection,
    ariaLabel: string,
    onChange: (selection: ModelSelection) => void,
  ) => (
    <ProviderModelPicker
      activeInstanceId={selection.instanceId}
      model={selection.model}
      lockedProvider={null}
      instanceEntries={instanceEntries}
      modelOptionsByInstance={getCustomModelOptionsByInstance(
        settings,
        serverProviders,
        selection.instanceId,
        selection.model,
      )}
      triggerVariant="outline"
      triggerClassName="min-w-0 max-w-none shrink-0 text-foreground/90 hover:text-foreground"
      triggerAriaLabel={ariaLabel}
      onInstanceModelChange={(instanceId, model) =>
        onChange(createModelSelection(instanceId, model))
      }
    />
  );
  const overrideCount = countOverrides(override);

  return (
    <SettingsSection
      title="Project overrides"
      icon={<FolderCogIcon className="size-5" />}
      headerAction={
        overrideCount > 0 ? (
          <Button
            size="xs"
            variant="outline"
            onClick={() =>
              updateSettings({ aviCodeProjectSettingsOverrides: { [projectId]: null } })
            }
          >
            Clear all for this project
          </Button>
        ) : null
      }
    >
      <SettingsRow
        title="Project"
        description="Settings below apply only to this project. Use default follows the global setting, so changing it later still reaches this project."
        control={
          <Select
            value={projectId}
            onValueChange={(value) => setSelectedProjectId(value as ProjectId)}
          >
            <SelectTrigger className="w-full sm:w-64" aria-label="Project to override">
              <SelectValue>{project.title}</SelectValue>
            </SelectTrigger>
            <SelectPopup align="end" alignItemWithTrigger={false}>
              {projects.map((candidate) => {
                const count = countOverrides(getProjectSettingsOverride(settings, candidate.id));
                return (
                  <SelectItem key={candidate.id} hideIndicator value={candidate.id}>
                    {count > 0 ? `${candidate.title} (${count})` : candidate.title}
                  </SelectItem>
                );
              })}
            </SelectPopup>
          </Select>
        }
      />

      <SettingsRow
        title="New threads"
        description="Workspace mode for new threads in this project."
        resetAction={resetButton("defaultThreadEnvMode", "project new threads")}
        control={
          <Select
            value={envMode ?? DEFAULT_VALUE}
            onValueChange={(value) =>
              setOverride(
                "defaultThreadEnvMode",
                value === "local" || value === "worktree" ? value : undefined,
              )
            }
          >
            <SelectTrigger className="w-full sm:w-56" aria-label="Project default thread mode">
              <SelectValue>
                {envMode
                  ? ENV_MODE_LABELS[envMode]
                  : `Use default (${ENV_MODE_LABELS[settings.defaultThreadEnvMode]})`}
              </SelectValue>
            </SelectTrigger>
            <SelectPopup align="end" alignItemWithTrigger={false}>
              <SelectItem hideIndicator value={DEFAULT_VALUE}>
                Use default ({ENV_MODE_LABELS[settings.defaultThreadEnvMode]})
              </SelectItem>
              <SelectItem hideIndicator value="local">
                Local
              </SelectItem>
              <SelectItem hideIndicator value="worktree">
                New worktree
              </SelectItem>
            </SelectPopup>
          </Select>
        }
      />

      <SettingsRow
        title="Start from origin"
        description="New worktrees in this project start from the latest matching branch on origin."
        resetAction={resetButton("newWorktreesStartFromOrigin", "project start from origin")}
        control={
          <Select
            value={startFromOrigin === undefined ? DEFAULT_VALUE : startFromOrigin ? "on" : "off"}
            onValueChange={(value) =>
              setOverride(
                "newWorktreesStartFromOrigin",
                value === "on" ? true : value === "off" ? false : undefined,
              )
            }
          >
            <SelectTrigger className="w-full sm:w-56" aria-label="Project start from origin">
              <SelectValue>
                {startFromOrigin === undefined
                  ? `Use default (${settings.newWorktreesStartFromOrigin ? "On" : "Off"})`
                  : startFromOrigin
                    ? "On"
                    : "Off"}
              </SelectValue>
            </SelectTrigger>
            <SelectPopup align="end" alignItemWithTrigger={false}>
              <SelectItem hideIndicator value={DEFAULT_VALUE}>
                Use default ({settings.newWorktreesStartFromOrigin ? "On" : "Off"})
              </SelectItem>
              <SelectItem hideIndicator value="on">
                On
              </SelectItem>
              <SelectItem hideIndicator value="off">
                Off
              </SelectItem>
            </SelectPopup>
          </Select>
        }
      />

      <SettingsRow
        title="Source control writing style"
        description="How change descriptions and change request titles are written for this project."
        resetAction={resetButton("sourceControlWritingStyle", "project writing style")}
        control={
          <Select
            value={style?.mode ?? DEFAULT_VALUE}
            onValueChange={(value) => {
              if (value === DEFAULT_VALUE) {
                setOverride("sourceControlWritingStyle", undefined);
                return;
              }
              setOverride("sourceControlWritingStyle", {
                ...(style ?? settings.sourceControlWritingStyle),
                mode: value as SourceControlWritingStyleMode,
              });
            }}
          >
            <SelectTrigger className="w-full sm:w-56" aria-label="Project writing style">
              <SelectValue>
                {style
                  ? SOURCE_CONTROL_WRITING_MODE_OPTIONS[style.mode].label
                  : `Use default (${SOURCE_CONTROL_WRITING_MODE_OPTIONS[settings.sourceControlWritingStyle.mode].label})`}
              </SelectValue>
            </SelectTrigger>
            <SelectPopup align="end" alignItemWithTrigger={false}>
              <SelectItem hideIndicator value={DEFAULT_VALUE}>
                Use default (
                {SOURCE_CONTROL_WRITING_MODE_OPTIONS[settings.sourceControlWritingStyle.mode].label}
                )
              </SelectItem>
              {(
                Object.keys(SOURCE_CONTROL_WRITING_MODE_OPTIONS) as SourceControlWritingStyleMode[]
              ).map((mode) => (
                <SelectItem key={mode} hideIndicator value={mode}>
                  {SOURCE_CONTROL_WRITING_MODE_OPTIONS[mode].label}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
        }
      >
        {style?.mode === "custom" ? (
          <div className="mt-3 max-w-2xl pb-3.5">
            <Textarea
              key={`${projectId}:${style.customInstructions}`}
              defaultValue={style.customInstructions}
              onBlur={(event) => {
                const customInstructions = event.target.value.trim();
                if (customInstructions !== style.customInstructions) {
                  setOverride("sourceControlWritingStyle", { ...style, customInstructions });
                }
              }}
              rows={4}
              placeholder="Keep titles concise. Use short bullet points in descriptions."
              aria-label="Project custom source control writing instructions"
            />
          </div>
        ) : null}
      </SettingsRow>

      <SettingsRow
        title="Text generation model"
        description="Model for thread titles and generated text in this project."
        status={textModel ? null : `Using default: ${describeModel(globalTextModel)}`}
        resetAction={resetButton("textGenerationModelSelection", "project text generation model")}
        control={
          <div className="flex flex-wrap items-center justify-end gap-2">
            {textModel
              ? modelPicker(textModel, "Project text generation model", (selection) =>
                  setOverride("textGenerationModelSelection", selection),
                )
              : null}
            <Button
              size="xs"
              variant="outline"
              onClick={() =>
                setOverride(
                  "textGenerationModelSelection",
                  textModel
                    ? undefined
                    : createModelSelection(globalTextModel.instanceId, globalTextModel.model),
                )
              }
            >
              {textModel ? "Use default" : "Override"}
            </Button>
          </div>
        }
      />

      <SettingsRow
        title="Source control writer model"
        description="Model for change descriptions, change request content and branch names in this project."
        resetAction={resetButton("sourceControlWriterModelSelection", "project writer model")}
        control={
          <div className="flex flex-wrap items-center justify-end gap-2">
            {writerModel
              ? modelPicker(writerModel, "Project source control writer model", (selection) =>
                  setOverride("sourceControlWriterModelSelection", selection),
                )
              : null}
            <Select
              value={writerChoice}
              onValueChange={(value) =>
                setOverride(
                  "sourceControlWriterModelSelection",
                  value === "shared"
                    ? null
                    : value === "dedicated"
                      ? (writerModel ??
                        settings.sourceControlWriterModelSelection ??
                        createModelSelection(globalTextModel.instanceId, globalTextModel.model))
                      : undefined,
                )
              }
            >
              <SelectTrigger className="w-full sm:w-56" aria-label="Project writer model mode">
                <SelectValue>
                  {writerChoice === "shared"
                    ? "Text generation model"
                    : writerChoice === "dedicated"
                      ? "Dedicated model"
                      : `Use default (${describeModel(settings.sourceControlWriterModelSelection)})`}
                </SelectValue>
              </SelectTrigger>
              <SelectPopup align="end" alignItemWithTrigger={false}>
                <SelectItem hideIndicator value={DEFAULT_VALUE}>
                  Use default ({describeModel(settings.sourceControlWriterModelSelection)})
                </SelectItem>
                <SelectItem hideIndicator value="shared">
                  Text generation model
                </SelectItem>
                <SelectItem hideIndicator value="dedicated">
                  Dedicated model
                </SelectItem>
              </SelectPopup>
            </Select>
          </div>
        }
      />
    </SettingsSection>
  );
}
