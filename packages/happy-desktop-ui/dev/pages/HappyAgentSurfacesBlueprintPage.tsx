import { useState, type ReactNode } from "react";
import {
    UserError,
    type HappyAgentSurfaceActiveTodo,
    type HappyAgentSurfaceCompletedTodo,
    type HappyAgentSurfaceId,
    type HappyAgentSurfaceTodoId,
    type HappyAgentTodoListSnapshot,
} from "happy-desktop-state";
import {
    HappyAgentSurfaceBrowseDialog,
    type HappyAgentSurfaceBrowseEntry,
} from "../../src/pages/surfaces/HappyAgentSurfaceBrowseDialog";
import { HappyAgentSurfaceCreateDialog } from "../../src/pages/surfaces/HappyAgentSurfaceCreateDialog";
import { HappyAgentSurfaceUnsupportedPage } from "../../src/pages/surfaces/HappyAgentSurfaceUnsupportedPage";
import { HappyAgentTodoSurfacePage } from "../../src/pages/surfaces/HappyAgentTodoSurfacePage";
import type { HappyAgentSurfaceView } from "../../src/pages/surfaces/surfacePresentation";
import { ComponentPage, FullScreenSpecimen, Specimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "P-019";

const SURFACE_ID = "surface-groceries" as HappyAgentSurfaceId;

function picture(from: string, to: string): string {
    return `data:image/svg+xml;utf8,${encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect width="64" height="64" fill="url(#g)"/><circle cx="32" cy="32" r="14" fill="white" fill-opacity="0.5"/></svg>`,
    )}`;
}

const TEAL = { url: picture("#2baccc", "#1f6f8b"), thumbhash: "4bYFRwx0d4d/iIh4h4iHeHiICJeHcHQH" };
const AMBER = { url: picture("#ff9500", "#c2410c"), thumbhash: "5FsCTwpwd4dwiId3iHh3eHiHePd4eo8I" };

const MEMBERS = [
    { key: "u1", name: "Steve Korshakov", photo: TEAL },
    { key: "u2", name: "Ada Park" },
    { key: "u3", name: "Grace Lin", photo: AMBER },
    { key: "u4", name: "Linus Moe" },
] as const;

const GROCERIES: HappyAgentSurfaceView = {
    name: "Groceries",
    image: TEAL,
    type: { kind: "todo" },
    members: MEMBERS,
    joined: true,
};

const KANBAN: HappyAgentSurfaceView = {
    name: "Launch board",
    image: AMBER,
    type: { kind: "unsupported", type: "kanban" },
    members: MEMBERS.slice(0, 2),
    joined: true,
};

function active(id: string, text: string, index: number): HappyAgentSurfaceActiveTodo {
    return {
        id: id as HappyAgentSurfaceTodoId,
        surfaceId: SURFACE_ID,
        text,
        createdAt: 1_760_000_000_000 + index,
        updatedAt: 1_760_000_000_000 + index,
        version: `v-${id}`,
        status: "active",
        orderKey: String(index + 1),
        completedAt: null,
        deletedAt: null,
    };
}

function completed(todo: HappyAgentSurfaceActiveTodo, at: number): HappyAgentSurfaceCompletedTodo {
    return { ...todo, status: "completed", orderKey: null, completedAt: at };
}

const ACTIVE: readonly HappyAgentSurfaceActiveTodo[] = [
    active("t1", "Oat milk", 0),
    active("t2", "Sourdough loaf", 1),
    active("t3", "Two lemons and a bunch of coriander for Thursday", 2),
    active("t4", "Coffee beans", 3),
    active("t5", "Dish soap", 4),
];

const DONE: readonly HappyAgentSurfaceCompletedTodo[] = [
    completed(active("t6", "Eggs", 5), 1_760_000_100_000),
    completed(active("t7", "Butter", 6), 1_760_000_050_000),
];

const LIST: HappyAgentTodoListSnapshot = {
    surfaceId: SURFACE_ID,
    status: "ready",
    active: ACTIVE,
    completed: DONE,
    completedShown: false,
    draft: "",
};

const noop = () => undefined;

const handlers = {
    onJoin: noop,
    onLeave: noop,
    onDraftChange: noop,
    onDraftSubmit: noop,
    onTodoCompletedChange: noop,
    onTodoMove: noop,
    onTodoDelete: noop,
    onTodoEditStart: noop,
    onTodoEditTextChange: noop,
    onTodoEditCommit: noop,
    onTodoEditCancel: noop,
    onCompletedShownChange: noop,
};

/**
 * The page against a list held here, so the drag, the checkbox, editing, and
 * the completed section can be tried in the workbench. The application holds
 * the same snapshot in its store.
 */
function LiveTodoPage() {
    const [list, setList] = useState(LIST);
    const [next, setNext] = useState(10);
    const set = (patch: Partial<HappyAgentTodoListSnapshot>) => setList({ ...list, ...patch });
    const textSet = (id: HappyAgentSurfaceTodoId, text: string) =>
        set({
            active: list.active.map((todo) => (todo.id === id ? { ...todo, text } : todo)),
            completed: list.completed.map((todo) => (todo.id === id ? { ...todo, text } : todo)),
            editing: undefined,
        });
    return (
        <HappyAgentTodoSurfacePage
            {...handlers}
            list={list}
            onCompletedShownChange={(shown) => set({ completedShown: shown })}
            onDraftChange={(draft) => set({ draft })}
            onDraftSubmit={() => {
                const text = list.draft.trim();
                if (text.length === 0) return;
                setNext(next + 1);
                set({
                    active: [...list.active, active(`n${String(next)}`, text, next)],
                    draft: "",
                });
            }}
            onTodoCompletedChange={(id, done) => {
                if (done) {
                    const todo = list.active.find((entry) => entry.id === id);
                    if (!todo) return;
                    set({
                        active: list.active.filter((entry) => entry !== todo),
                        completed: [completed(todo, 1_760_000_200_000 + next), ...list.completed],
                    });
                    setNext(next + 1);
                } else {
                    const todo = list.completed.find((entry) => entry.id === id);
                    if (!todo) return;
                    set({
                        active: [...list.active, active(todo.id, todo.text, next)],
                        completed: list.completed.filter((entry) => entry !== todo),
                    });
                    setNext(next + 1);
                }
            }}
            onTodoDelete={(id) =>
                set({
                    active: list.active.filter((todo) => todo.id !== id),
                    completed: list.completed.filter((todo) => todo.id !== id),
                })
            }
            onTodoEditCancel={() => set({ editing: undefined })}
            onTodoEditCommit={() => {
                if (list.editing) textSet(list.editing.todoId, list.editing.text);
            }}
            onTodoEditStart={(id) => {
                const todo = [...list.active, ...list.completed].find((entry) => entry.id === id);
                if (todo) set({ editing: { todoId: id, text: todo.text } });
            }}
            onTodoEditTextChange={(text) => {
                if (list.editing) set({ editing: { todoId: list.editing.todoId, text } });
            }}
            onTodoMove={(id, toIndex) => {
                const from = list.active.findIndex((todo) => todo.id === id);
                if (from < 0 || from === toIndex) return;
                const moved = [...list.active];
                const [todo] = moved.splice(from, 1);
                moved.splice(toIndex, 0, todo!);
                set({ active: moved });
            }}
            surface={GROCERIES}
        />
    );
}

/** Gives each fixed overlay a desktop-sized, clipping-safe specimen window. */
function frame(children: ReactNode) {
    return (
        <div
            style={{
                background: "var(--groupped-background)",
                border: "1px solid var(--surface-pressed-overlay)",
                borderRadius: "8px",
                height: "560px",
                overflow: "hidden",
                position: "relative",
                transform: "translateZ(0)",
                width: "760px",
            }}
        >
            {children}
        </div>
    );
}

const BROWSE: readonly HappyAgentSurfaceBrowseEntry[] = [
    { ...GROCERIES, id: "s1" },
    { ...KANBAN, id: "s2", joined: false },
    {
        id: "s3",
        name: "Release checklist for the October build, every platform",
        type: { kind: "todo" },
        members: MEMBERS.slice(1, 2),
        joined: false,
        membershipPending: true,
    },
    { id: "s4", name: "Reading list", type: { kind: "todo" }, members: [], joined: false },
];

export function HappyAgentSurfacesBlueprintPage() {
    return (
        <ComponentPage
            contract="Props only"
            number={componentNumber}
            summary="Shared Surfaces on a Happy Agent: a todo list whose active todos are dragged into a shared order, the state for a type this build cannot show, and the dialogs to browse and make them."
            title="HappyAgentSurfaces"
        >
            <FullScreenSpecimen
                detail="Live. Drag an active todo by its body; the checkbox, the delete control, and the field while editing never start a drag. Completed todos are below, newest first, and never move."
                label="Todo list"
                number="01"
                screen="01-todo-1100x760"
                window={{ width: 1100, height: 760 }}
            >
                <LiveTodoPage />
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail="Completed shown, one todo being edited, and a refused change."
                label="Completed and editing"
                number="02"
                screen="02-completed-1100x760"
                window={{ width: 1100, height: 760 }}
            >
                <HappyAgentTodoSurfacePage
                    {...handlers}
                    list={{
                        ...LIST,
                        completedShown: true,
                        editing: { todoId: ACTIVE[1]!.id, text: "Sourdough loaf, sliced" },
                        failure: new UserError("That todo was deleted by someone else."),
                    }}
                    surface={GROCERIES}
                />
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail="Not yet read, then an empty list the reader has not joined."
                label="Loading"
                number="03"
                screen="03-loading-720x640"
            >
                <HappyAgentTodoSurfacePage
                    {...handlers}
                    list={{ ...LIST, status: "loading", active: [], completed: [] }}
                    surface={{ ...GROCERIES, image: undefined, members: [] }}
                />
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail="Empty and not joined: the header offers Join."
                label="Empty"
                number="04"
                screen="04-empty-720x640"
            >
                <HappyAgentTodoSurfacePage
                    {...handlers}
                    list={{ ...LIST, active: [], completed: [] }}
                    surface={{ ...GROCERIES, joined: false, members: MEMBERS.slice(0, 1) }}
                />
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail="A “kanban” Surface: its name, picture, and members, with Leave, and no guessed content."
                label="Unsupported type"
                number="05"
                screen="05-unsupported-1100x760"
                window={{ width: 1100, height: 760 }}
            >
                <HappyAgentSurfaceUnsupportedPage onJoin={noop} onLeave={noop} surface={KANBAN} />
            </FullScreenSpecimen>

            <Specimen
                detail="480px · every type · joined row offers Open · one join in flight"
                label="Browse"
                number="06"
                stage="app"
            >
                {frame(
                    <HappyAgentSurfaceBrowseDialog
                        onClose={noop}
                        onCreate={noop}
                        onJoin={noop}
                        onOpen={noop}
                        surfaces={BROWSE}
                    />,
                )}
            </Specimen>

            <Specimen detail="480px · nothing yet" label="Browse, empty" number="07" stage="app">
                {frame(
                    <HappyAgentSurfaceBrowseDialog
                        onClose={noop}
                        onCreate={noop}
                        onJoin={noop}
                        onOpen={noop}
                        surfaces={[]}
                    />,
                )}
            </Specimen>

            <Specimen
                detail="480px · name and an optional picture"
                label="Create"
                number="08"
                stage="app"
            >
                {frame(
                    <HappyAgentSurfaceCreateDialog
                        onClose={noop}
                        onSubmit={noop}
                        pending={false}
                    />,
                )}
            </Specimen>

            <Specimen detail="480px · refused" label="Create, refused" number="09" stage="app">
                {frame(
                    <HappyAgentSurfaceCreateDialog
                        error="The name is longer than 200 characters."
                        onClose={noop}
                        onSubmit={noop}
                        pending={false}
                    />,
                )}
            </Specimen>
        </ComponentPage>
    );
}
