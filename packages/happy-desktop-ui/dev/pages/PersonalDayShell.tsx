import { useState, type ReactNode } from "react";
import { AppShell, APP_SHELL_SIDEBAR_DEFAULT_WIDTH } from "../../src/AppShell";
import { CommandPalette } from "../../src/CommandPalette";
import { CommandPaletteResults } from "../../src/CommandPaletteResults";
import { ModalOverlay } from "../../src/ModalOverlay";
import { PersonalDaySidebar, type PersonalDaySidebarProps } from "./PersonalDaySidebar";
import { dayWork } from "./personalDayFixtures";

/** Every day specimen uses the existing app-shell toggle and search geometry. */
export function PersonalDayShell(
    props: PersonalDaySidebarProps & {
        children?: ReactNode;
        connectionRail?: boolean;
        sidebarOnly?: boolean;
    },
) {
    const [collapsed, setCollapsed] = useState(false);
    const [searchOpen, setSearchOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [index, setIndex] = useState(0);
    const rows = Object.entries(dayWork)
        .filter(([, work]) => work.label.toLowerCase().includes(query.toLowerCase()))
        .map(([id, work]) => ({ kind: "command" as const, id, title: work.label }));
    const open = (id: string) => {
        props.onSelect(id);
        setSearchOpen(false);
    };
    return (
        <>
            <AppShell
                connectionRail={props.connectionRail}
                embedded
                navigationChrome="integrated"
                windowControls
                windowFullScreen
                sidebarCollapsible
                sidebarCollapsedLayout="overlay"
                sidebarCollapsed={collapsed}
                onSidebarCollapsedChange={setCollapsed}
                sidebarDefaultWidth={props.sidebarOnly ? 280 : APP_SHELL_SIDEBAR_DEFAULT_WIDTH}
                sidebarMinWidth={props.sidebarOnly ? 280 : undefined}
                sidebarMaxWidth={props.sidebarOnly ? 280 : undefined}
                sidebarSearchAction={{ label: "Search", onClick: () => setSearchOpen(true) }}
                sidebarCollapsedAction={{
                    label: "Make Stuff",
                    onClick: () => props.onSelect("new"),
                }}
                sidebar={<PersonalDaySidebar {...props} />}
            >
                {props.children}
            </AppShell>
            {searchOpen ? (
                <ModalOverlay placement="top" onDismiss={() => setSearchOpen(false)}>
                    <CommandPalette
                        query={query}
                        onQueryChange={(value) => {
                            setQuery(value);
                            setIndex(0);
                        }}
                        onClose={() => setSearchOpen(false)}
                        onSelectionMove={(delta) =>
                            setIndex(Math.max(0, Math.min(rows.length - 1, index + delta)))
                        }
                        onSelectionCommit={() => {
                            const row = rows[index];
                            if (row) open(row.id);
                        }}
                    >
                        <CommandPaletteResults
                            sections={[{ id: "work", rows }]}
                            activeIndex={index}
                            onActiveIndexChange={setIndex}
                            onSelect={open}
                        />
                    </CommandPalette>
                </ModalOverlay>
            ) : null}
        </>
    );
}
