import { createSideQuestionCommand } from "@t3tools/client-runtime/state/sideQuestion";

import { connectionAtomRuntime } from "../connection/runtime";

/** Avi Code addition: the `/btw` side-question command, bound to this client's runtime. */
export const askSideQuestionCommand = createSideQuestionCommand(connectionAtomRuntime);

export {
  EMPTY_SIDE_QUESTION_STATE,
  sideQuestionStateAtom,
  type SideQuestionState,
} from "@t3tools/client-runtime/state/sideQuestion";
