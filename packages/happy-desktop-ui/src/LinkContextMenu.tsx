import { ContextMenu, type ContextMenuProps } from "./ContextMenu";

export interface LinkContextMenuProps extends Omit<ContextMenuProps, "items" | "onSelect"> {
    /** The destination carried by the link, including any custom scheme or file fragment. */
    readonly href: string;
    readonly items?: ContextMenuProps["items"];
    readonly onSelect?: ContextMenuProps["onSelect"];
}

/** A link's optional open actions followed by its clipboard action. */
export function LinkContextMenu({ href, items = [], onSelect, ...props }: LinkContextMenuProps) {
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(href);
            props.onClose();
        } catch {
            // Clipboard permission belongs to the browser; leave the menu open to retry.
        }
    };
    return (
        <ContextMenu
            {...props}
            items={[
                ...items,
                ...(items.length > 0 ? [{ kind: "separator" } as const] : []),
                { kind: "item", id: "copy-link", label: "Copy link", icon: "copy" },
            ]}
            onSelect={(id) => {
                if (id === "copy-link") {
                    void copy();
                    return;
                }
                onSelect?.(id);
            }}
        />
    );
}
