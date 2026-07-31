import { memo } from "react";
import { MessageSquareTextIcon } from "lucide-react";
import {
  allCommunicationStyles,
  isDefaultCommunicationStyle,
  resolveCommunicationStyle,
  type CommunicationStyle,
} from "@t3tools/shared/communicationStyles";

import { cn } from "~/lib/utils";
import {
  Menu,
  MenuGroup,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuTrigger,
} from "../ui/menu";
import { ComposerControl, ComposerControlChevron, ComposerControlIcon } from "./ComposerControl";

/**
 * Avi Code addition: the composer's communication-style control. It sits in the
 * slot the Threads button used to occupy, and shows the style name only when a
 * non-default style is active — "Style" alone is enough the rest of the time,
 * which is most of the time.
 */
export const CommunicationStylePicker = memo(function CommunicationStylePicker(props: {
  styleId: string;
  customStyles: ReadonlyArray<CommunicationStyle>;
  compact: boolean;
  onStyleChange: (styleId: string) => void;
}) {
  const styles = allCommunicationStyles(props.customStyles);
  const active = resolveCommunicationStyle(props.styleId, props.customStyles);
  const isDefault = isDefaultCommunicationStyle(active.id);

  return (
    <Menu>
      <MenuTrigger
        render={
          <ComposerControl
            type="button"
            className={cn("shrink-0", !isDefault && "text-foreground/80")}
            aria-label={`Communication style: ${active.label}`}
          />
        }
      >
        <ComposerControlIcon icon={MessageSquareTextIcon} />
        {props.compact ? null : (
          <span className="whitespace-nowrap">{isDefault ? "Style" : active.label}</span>
        )}
        <ComposerControlChevron />
      </MenuTrigger>
      <MenuPopup align="start" className="max-w-72">
        <div className="px-2 pt-1.5 pb-1 font-medium text-muted-foreground text-xs">
          Communication style
        </div>
        <MenuGroup>
          <MenuRadioGroup
            value={active.id}
            onValueChange={(value) => {
              if (!value || value === active.id) return;
              props.onStyleChange(value);
            }}
          >
            {styles.map((style) => (
              <MenuRadioItem key={style.id} value={style.id} hideIndicator>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate">{style.label}</span>
                  <span className="truncate text-muted-foreground/70 text-xs">
                    {style.description}
                  </span>
                </span>
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
        </MenuGroup>
        <div className="px-2 pt-1 pb-1.5 text-muted-foreground/70 text-xs">
          Applies to this thread from the next message. Add your own in Settings → Avi Code.
        </div>
      </MenuPopup>
    </Menu>
  );
});
