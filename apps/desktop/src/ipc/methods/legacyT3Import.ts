import {
  DesktopLegacyT3ImportResultSchema,
  DesktopLegacyT3ImportStatusSchema,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import * as LegacyT3Import from "../../app/LegacyT3Import.ts";
import * as IpcChannels from "../channels.ts";
import * as DesktopIpc from "../DesktopIpc.ts";

export const getLegacyT3ImportStatus = DesktopIpc.makeIpcMethod({
  channel: IpcChannels.GET_LEGACY_T3_IMPORT_STATUS_CHANNEL,
  payload: Schema.Void,
  result: DesktopLegacyT3ImportStatusSchema,
  handler: Effect.fn("desktop.ipc.legacyT3Import.status")(function* () {
    return yield* LegacyT3Import.getLegacyT3ImportStatus();
  }),
});

export const importLegacyT3Data = DesktopIpc.makeIpcMethod({
  channel: IpcChannels.IMPORT_LEGACY_T3_DATA_CHANNEL,
  payload: Schema.Void,
  result: DesktopLegacyT3ImportResultSchema,
  handler: Effect.fn("desktop.ipc.legacyT3Import.import")(function* () {
    return yield* LegacyT3Import.importLatestT3Data();
  }),
});
