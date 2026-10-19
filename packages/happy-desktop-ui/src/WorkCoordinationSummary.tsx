import { Button } from "./Button";

export type WorkCoordinationSummaryProps = {
    title: string;
    text: string;
    links: readonly { id: string; label: string; onOpen: () => void }[];
};

/** The useful outcome of agent coordination, with links to the work it affects. */
export function WorkCoordinationSummary(props: WorkCoordinationSummaryProps) {
    return (
        <section className="happy-work-coordination" data-happy-desktop-ui="work-coordination">
            <div className="happy-work-coordination__heading">
                <h3>{props.title}</h3>
            </div>
            <p>{props.text}</p>
            {props.links.length ? (
                <div className="happy-work-coordination__links">
                    {props.links.map((link) => (
                        <Button
                            key={link.id}
                            onClick={link.onOpen}
                            size="small"
                            variant="secondary"
                        >
                            {link.label}
                        </Button>
                    ))}
                </div>
            ) : null}
        </section>
    );
}
