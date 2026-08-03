import { describe, expect, it } from "vite-plus/test";

import {
  describeProjectFileError,
  isProjectFileTargetUnreachable,
} from "./projectFileErrorMessage";

function readFileError(fields: Record<string, unknown>) {
  return {
    _tag: "ProjectReadFileError",
    cwd: "C:/Users/avi/dev/advisoravi-business",
    relativePath: "docs/RECORDINGS_COLLECTOR_SETUP.md",
    message: "Failed to read workspace file 'docs/x.md' in 'C:/repo'.",
    ...fields,
  };
}

describe("describeProjectFileError", () => {
  it("names a missing file instead of a generic read failure", () => {
    // The real case: realpath on the target raises ENOENT, and the panel used to
    // show the same sentence it shows for a permissions or containment problem.
    expect(
      describeProjectFileError(
        readFileError({
          failure: "operation_failed",
          operation: "realpath-target",
          cause: Object.assign(new Error("ENOENT: no such file or directory"), {
            code: "ENOENT",
          }),
        }),
      ),
    ).toBe("File not found: docs/RECORDINGS_COLLECTOR_SETUP.md");
  });

  it("finds ENOENT nested inside a wrapped platform error", () => {
    expect(
      describeProjectFileError(
        readFileError({
          failure: "operation_failed",
          operation: "open",
          cause: { cause: { code: "ENOENT" } },
        }),
      ),
    ).toBe("File not found: docs/RECORDINGS_COLLECTOR_SETUP.md");
  });

  it("keeps the server message when the operation failed for another reason", () => {
    expect(
      describeProjectFileError(
        readFileError({
          failure: "operation_failed",
          operation: "read",
          cause: Object.assign(new Error("permission denied"), { code: "EACCES" }),
        }),
      ),
    ).toBe("Failed to read workspace file 'docs/x.md' in 'C:/repo'.");
  });

  it("does not claim a missing file when the workspace root itself failed", () => {
    expect(
      describeProjectFileError(
        readFileError({
          failure: "operation_failed",
          operation: "realpath-workspace-root",
          cause: { code: "ENOENT" },
        }),
      ),
    ).toBe("Failed to read workspace file 'docs/x.md' in 'C:/repo'.");
  });

  it("says a path sits outside the folder rather than that it failed to read", () => {
    expect(
      describeProjectFileError(readFileError({ failure: "workspace_path_outside_root" })),
    ).toBe("docs/RECORDINGS_COLLECTOR_SETUP.md is outside C:/Users/avi/dev/advisoravi-business.");
    expect(describeProjectFileError(readFileError({ failure: "resolved_path_outside_root" }))).toBe(
      "docs/RECORDINGS_COLLECTOR_SETUP.md is outside C:/Users/avi/dev/advisoravi-business.",
    );
  });

  it("distinguishes a directory from a file", () => {
    expect(describeProjectFileError(readFileError({ failure: "path_not_file" }))).toBe(
      "docs/RECORDINGS_COLLECTOR_SETUP.md is a folder, not a file.",
    );
  });

  it("explains a binary file", () => {
    expect(describeProjectFileError(readFileError({ failure: "binary_file" }))).toBe(
      "docs/RECORDINGS_COLLECTOR_SETUP.md is a binary file, so there is nothing to show.",
    );
  });

  it("leaves unrelated failures to the caller", () => {
    expect(describeProjectFileError(new Error("socket closed"))).toBeNull();
    expect(describeProjectFileError(null)).toBeNull();
    expect(describeProjectFileError(readFileError({}))).toBeNull();
  });
});

describe("isProjectFileTargetUnreachable", () => {
  it("is true for every failure that stopped at the target itself", () => {
    // The platform error's `code` does not survive the wire, so this cannot ask
    // for a confirmed ENOENT; reaching the target and failing is the signal.
    for (const operation of ["realpath-target", "open", "stat", "read"]) {
      expect(
        isProjectFileTargetUnreachable(readFileError({ failure: "operation_failed", operation })),
        operation,
      ).toBe(true);
    }
  });

  it("is false when the workspace root itself is the problem", () => {
    expect(
      isProjectFileTargetUnreachable(
        readFileError({ failure: "operation_failed", operation: "realpath-workspace-root" }),
      ),
    ).toBe(false);
  });

  it("is false when the file was reached and rejected", () => {
    // Looking in another repo for a file that is right here would be wrong.
    for (const failure of [
      "workspace_path_outside_root",
      "resolved_path_outside_root",
      "path_not_file",
      "binary_file",
    ]) {
      expect(isProjectFileTargetUnreachable(readFileError({ failure })), failure).toBe(false);
    }
  });

  it("is false for anything that is not a project file error", () => {
    expect(isProjectFileTargetUnreachable(new Error("socket closed"))).toBe(false);
    expect(isProjectFileTargetUnreachable(null)).toBe(false);
  });
});
