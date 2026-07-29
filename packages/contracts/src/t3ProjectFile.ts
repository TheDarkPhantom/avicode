import * as Schema from "effect/Schema";
import * as SchemaTransformation from "effect/SchemaTransformation";

import { ProjectScriptIcon } from "./orchestration.ts";

/** File name of the checked-in T3 project file, resolved at the workspace root. */
export const T3_PROJECT_FILE_NAME = "t3.json";

/** Public URL of the published JSON Schema for {@link T3ProjectFile}. */
export const T3_PROJECT_FILE_SCHEMA_URL = "https://t3.codes/schema/t3.json";

const T3_PROJECT_FILE_PATH_MAX_LENGTH = 512;
const T3_PROJECT_FILE_MAX_SCRIPTS = 50;
const T3_PROJECT_FILE_MAX_PROMOTION_REFS = 3;

// Annotations go on the encoded (string) side so they survive into the
// published JSON Schema; decoding still trims and re-validates non-emptiness.
const trimmedNonEmpty = (annotations: { readonly description: string }, maxLength?: number) => {
  const annotated = Schema.String.annotate(annotations);
  const encoded =
    maxLength === undefined
      ? annotated.check(Schema.isNonEmpty())
      : annotated.check(Schema.isNonEmpty(), Schema.isMaxLength(maxLength));
  return encoded.pipe(Schema.decodeTo(encoded, SchemaTransformation.trim()));
};

export const T3ProjectFileScript = Schema.Struct({
  name: trimmedNonEmpty({
    description: "Display name for the script, shown in the Avi Code scripts menu.",
  }),
  command: trimmedNonEmpty({
    description: "Shell command executed in an Avi Code terminal at the project root.",
  }),
  icon: Schema.optionalKey(
    ProjectScriptIcon.annotate({
      description: 'Icon shown next to the script in the scripts menu. Defaults to "play".',
    }),
  ),
  runOnWorktreeCreate: Schema.optionalKey(
    Schema.Boolean.annotate({
      description:
        "When true, the script runs automatically after a worktree is created for a new thread.",
    }),
  ),
  previewUrl: Schema.optionalKey(
    trimmedNonEmpty({
      description:
        "URL opened in the in-app browser preview when this script runs. Only honored on the desktop build.",
    }),
  ),
  autoOpenPreview: Schema.optionalKey(
    Schema.Boolean.annotate({
      description:
        "When true, automatically open the preview panel at `previewUrl` the moment the script starts.",
    }),
  ),
}).annotate({
  description: "A project script that team members can import into Avi Code.",
});
export type T3ProjectFileScript = typeof T3ProjectFileScript.Type;

const promotionRefs = Schema.Array(
  trimmedNonEmpty({
    description: "A target ref in promotion order, for example avi-dev, staging, then main.",
  }),
)
  .check(Schema.isMinLength(1), Schema.isMaxLength(T3_PROJECT_FILE_MAX_PROMOTION_REFS))
  .annotate({
    description: "Ordered refs that Auto merge promotes the chat worktree branch through.",
  });

const requireMainApproval = Schema.optionalKey(
  Schema.Boolean.annotate({
    description:
      "When true, Auto merge stops after creating the final change request targeting main.",
  }),
);

export const T3ProjectAutoMerge = Schema.Union([
  Schema.Struct({
    mode: Schema.Literal("solo"),
    promotionRefs: Schema.optionalKey(promotionRefs),
    requireMainApproval,
  }),
  Schema.Struct({
    mode: Schema.Literal("collaborative"),
    promotionRefs,
    requireMainApproval,
  }),
]).annotate({
  description: "Per-repository Auto merge workflow for Avi Code chat worktrees.",
});
export type T3ProjectAutoMerge = typeof T3ProjectAutoMerge.Type;

export const T3ProjectFile = Schema.Struct({
  $schema: Schema.optionalKey(
    Schema.String.annotate({
      description: `URL of the JSON Schema for this file, typically "${T3_PROJECT_FILE_SCHEMA_URL}".`,
    }),
  ),
  iconPath: Schema.optionalKey(
    trimmedNonEmpty(
      {
        description:
          'Workspace-relative path to the project icon (e.g. "assets/logo.svg"). Checked before Avi Code\'s built-in icon locations.',
      },
      T3_PROJECT_FILE_PATH_MAX_LENGTH,
    ),
  ),
  scripts: Schema.optionalKey(
    Schema.Array(T3ProjectFileScript)
      .annotate({
        description: "Project scripts shared with everyone who opens this repository in Avi Code.",
      })
      .check(Schema.isMaxLength(T3_PROJECT_FILE_MAX_SCRIPTS)),
  ),
  autoMerge: Schema.optionalKey(T3ProjectAutoMerge),
}).annotate({
  title: "T3 project file",
  description: "Checked-in project configuration for Avi Code (t3.json at the repository root).",
});
export type T3ProjectFile = typeof T3ProjectFile.Type;
