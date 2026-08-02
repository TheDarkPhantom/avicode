import { useMemo } from "react";

import { useProjects } from "./entities";

/**
 * Avi Code addition: the workspace root of every registered project.
 *
 * The file viewer uses this to open a file that sits outside the current
 * thread's workspace. Agents routinely read and edit across repos, and matching
 * such a file against the projects the user already has means the viewer can
 * show that repo by name, with its own tree, instead of refusing the file.
 */
export function useProjectWorkspaceRoots(): readonly string[] {
  const projects = useProjects();
  return useMemo(() => projects.map((project) => project.workspaceRoot), [projects]);
}
