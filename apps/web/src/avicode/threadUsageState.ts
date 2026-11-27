import { WS_METHODS } from "@t3tools/contracts";
import { createEnvironmentRpcQueryAtomFamily } from "@t3tools/client-runtime/state/runtime";

import { connectionAtomRuntime } from "../connection/runtime";

export const threadUsageQuery = createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
  label: "environment-data:avicode:thread-usage",
  tag: WS_METHODS.avicodeGetThreadUsage,
  staleTimeMs: 60_000,
});
