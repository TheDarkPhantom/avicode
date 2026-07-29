import {
  T3_PROJECT_FILE_NAME,
  type EnvironmentId,
  type T3ProjectAutoMerge,
  type T3ProjectFileScript,
} from "@t3tools/contracts";
import { T3ProjectFileFromJson } from "@t3tools/shared/t3ProjectFile";
import * as Exit from "effect/Exit";
import * as Schema from "effect/Schema";
import { useMemo } from "react";

import { useProjectFileQuery } from "~/components/files/projectFilesQueryState";

const decodeT3ProjectFile = Schema.decodeExit(T3ProjectFileFromJson);

const NO_SCRIPTS: ReadonlyArray<T3ProjectFileScript> = [];

function useT3ProjectFile(environmentId: EnvironmentId, cwd: string | null) {
  const query = useProjectFileQuery(environmentId, cwd ?? "", T3_PROJECT_FILE_NAME, cwd !== null);
  const contents = query.data && !query.data.truncated ? query.data.contents : null;
  return useMemo(() => {
    if (contents === null) return null;
    const decoded = decodeT3ProjectFile(contents);
    return Exit.isFailure(decoded) ? null : decoded.value;
  }, [contents]);
}

/**
 * Scripts declared in the project's checked-in `t3.json`, offered in the
 * scripts menu for import. Missing, truncated, or invalid files resolve to
 * an empty list.
 */
export function useT3ProjectFileScripts(
  environmentId: EnvironmentId,
  cwd: string | null,
): ReadonlyArray<T3ProjectFileScript> {
  return useT3ProjectFile(environmentId, cwd)?.scripts ?? NO_SCRIPTS;
}

export function useT3ProjectFileAutoMerge(
  environmentId: EnvironmentId,
  cwd: string | null,
): T3ProjectAutoMerge | null {
  return useT3ProjectFile(environmentId, cwd)?.autoMerge ?? null;
}
