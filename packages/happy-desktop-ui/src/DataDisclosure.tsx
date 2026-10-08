import { Icon } from "./Icon";

/** One side of a disclosure: what is shared, or what never is. */
export interface DataDisclosureGroup {
    readonly kind: "shared" | "withheld";
    readonly title: string;
    readonly items: readonly string[];
}

export interface DataDisclosureProps {
    readonly groups: readonly DataDisclosureGroup[];
    readonly "data-testid"?: string;
}

/**
 * Says plainly what a feature sends and what it never sends, as side-by-side
 * lists. Shared items carry a check, withheld items a cross, so the two lists
 * read apart at a glance without relying on colour alone.
 */
export function DataDisclosure(props: DataDisclosureProps) {
    return (
        <div
            className="happy-data-disclosure"
            data-happy-desktop-ui="data-disclosure"
            data-testid={props["data-testid"]}
        >
            {props.groups.map((group) => (
                <section
                    className="happy-data-disclosure__group"
                    data-kind={group.kind}
                    key={group.kind}
                >
                    <h3 className="happy-data-disclosure__title">{group.title}</h3>
                    <ul className="happy-data-disclosure__items">
                        {group.items.map((item) => (
                            <li className="happy-data-disclosure__item" key={item}>
                                <span className="happy-data-disclosure__mark">
                                    <Icon
                                        name={group.kind === "shared" ? "check" : "close"}
                                        size={14}
                                    />
                                </span>
                                <span className="happy-data-disclosure__text">{item}</span>
                            </li>
                        ))}
                    </ul>
                </section>
            ))}
        </div>
    );
}
