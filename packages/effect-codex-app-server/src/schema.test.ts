import * as Schema from "effect/Schema";
import { assert, it } from "@effect/vitest";

import * as CodexSchema from "./schema.ts";

const decodeAccountResponse = Schema.decodeUnknownSync(CodexSchema.V2GetAccountResponse);

it("accepts account plan slugs newer than the pinned protocol", () => {
  const planTypes = ["pro", "promax", "edu_plus", "some_future_plan"];

  for (const planType of planTypes) {
    const decoded = decodeAccountResponse({
      account: { email: "user@example.com", planType, type: "chatgpt" },
      requiresOpenaiAuth: true,
    });
    assert.deepStrictEqual(decoded.account, {
      email: "user@example.com",
      planType,
      type: "chatgpt",
    });
  }
});
