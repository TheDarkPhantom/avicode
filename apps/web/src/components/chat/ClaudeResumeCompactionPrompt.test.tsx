import { ApprovalRequestId } from "@t3tools/contracts";
import { formatClaudeResumeCompactionQuestion } from "@t3tools/shared/claudeCompaction";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { ComposerPendingUserInputPanel } from "./ComposerPendingUserInputPanel";

function renderPanel(question: string) {
  return renderToStaticMarkup(
    <ComposerPendingUserInputPanel
      pendingUserInputs={[
        {
          requestId: ApprovalRequestId.make("request-1"),
          createdAt: "2026-09-30T10:00:00.000Z",
          questions: [
            {
              id: "resume",
              header: "Resume session",
              question,
              options: [
                { label: "Compact and continue", description: "Resume with a summary." },
                { label: "Keep full history", description: "Resume unchanged." },
                { label: "Don't ask again", description: "Skip future prompts." },
              ],
              multiSelect: false,
            },
          ],
        },
      ]}
      isResponding={false}
      answers={{}}
      questionIndex={0}
      onToggleOption={() => {}}
      onDismiss={() => {}}
    />,
  );
}

describe("ComposerPendingUserInputPanel resume compaction", () => {
  it("renders Claude's resume dialog as the dedicated prompt", () => {
    const markup = renderPanel(
      formatClaudeResumeCompactionQuestion({ ageMinutes: 125, estimatedTokens: 250_000 }),
    );

    expect(markup).toContain('data-claude-resume-compaction-prompt="true"');
    expect(markup).toContain("Resume with less context");
    expect(markup).toContain("2h 5m old and uses 250,000 tokens");
    expect(markup).toContain("Compact and continue");
    expect(markup).toContain("Keep full history");
    expect(markup).toContain("Don&#x27;t ask again");
    // The generic questionnaire's option descriptions stay out of the prompt.
    expect(markup).not.toContain("Resume with a summary.");
  });

  it("keeps the generic questionnaire for other questions", () => {
    const markup = renderPanel("Compact the build cache before continuing?");

    expect(markup).not.toContain("data-claude-resume-compaction-prompt");
    expect(markup).toContain("Resume with a summary.");
  });
});
