import { describe, expect, it } from "vite-plus/test";

import { resolveComposerProviderSendContext } from "./ChatComposer";

describe("resolveComposerProviderSendContext", () => {
  it("keeps the last valid provider snapshot while the environment is unavailable", () => {
    const cached = { instanceId: "codex", model: "gpt-5.6-sol" };
    expect(
      resolveComposerProviderSendContext({
        current: { instanceId: "t3code_no_provider", model: "gpt-5.6-sol" },
        lastAvailable: cached,
        providerAvailable: false,
        environmentUnavailable: true,
      }),
    ).toBe(cached);
  });

  it("uses the current provider snapshot while connected", () => {
    const current = { instanceId: "codex", model: "gpt-5.6-sol" };
    expect(
      resolveComposerProviderSendContext({
        current,
        lastAvailable: { instanceId: "claude", model: "claude-opus-4-6" },
        providerAvailable: true,
        environmentUnavailable: false,
      }),
    ).toBe(current);
  });
});
