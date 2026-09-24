import type { CSSProperties } from "react";
import { KeyCap } from "./Badge";
import type { KeyboardShortcut } from "./keyboardShortcut";
import { Modal } from "./Modal";

export interface ShortcutHelpRow {
    readonly label: string;
    readonly shortcut: KeyboardShortcut;
}

export interface ShortcutHelpGroup {
    readonly label: string;
    readonly rows: readonly ShortcutHelpRow[];
}

export interface ShortcutHelpSheetProps {
    readonly groups: readonly ShortcutHelpGroup[];
    readonly onClose: () => void;
    readonly className?: string;
    readonly "data-testid"?: string;
    readonly style?: CSSProperties;
}

/**
 * ShortcutHelpSheet — every chord the window answers, grouped by what it is
 * about, each wearing the same cap the palette and the controls wear. It is
 * a reading surface: it lists what the caller hands it and offers nothing to
 * press but Close, so the list can never promise a chord the window does not
 * bind.
 */
export function ShortcutHelpSheet(props: ShortcutHelpSheetProps) {
    return (
        <Modal
            className={["happy-shortcut-help", props.className].filter(Boolean).join(" ")}
            closeLabel="Close"
            data-testid={props["data-testid"]}
            icon="tasks"
            onClose={props.onClose}
            size="medium"
            style={props.style}
            title="Keyboard shortcuts"
        >
            <div
                className="happy-shortcut-help__groups"
                data-happy-desktop-ui="shortcut-help-groups"
            >
                {props.groups.map((group) => (
                    <section
                        className="happy-shortcut-help__group"
                        data-happy-desktop-ui="shortcut-help-group"
                        key={group.label}
                    >
                        <h3 className="happy-shortcut-help__group-label">{group.label}</h3>
                        <dl className="happy-shortcut-help__rows">
                            {group.rows.map((row) => (
                                <div
                                    className="happy-shortcut-help__row"
                                    data-happy-desktop-ui="shortcut-help-row"
                                    key={row.label}
                                >
                                    <dt className="happy-shortcut-help__row-label">{row.label}</dt>
                                    <dd className="happy-shortcut-help__row-keys">
                                        <KeyCap keys={row.shortcut.caps} />
                                    </dd>
                                </div>
                            ))}
                        </dl>
                    </section>
                ))}
            </div>
        </Modal>
    );
}
