import type { HappyAgentEvent, Surface, SurfaceMember, Todo } from "@slopus/happy-agent-client";
import { stringCompare } from "../utils/orderKeyDecimal.js";
import type {
    HappyAgentSurface,
    HappyAgentSurfaceId,
    HappyAgentSurfaceMember,
    HappyAgentSurfaceType,
    HappyAgentSurfaceTodo,
    HappyAgentSurfaceTodoId,
} from "./surfaceTypes.js";

/** The `surface.*` events a catalog follows. */
export const HAPPY_AGENT_SURFACE_EVENT_TYPES = [
    "surface.created",
    "surface.updated",
] as const satisfies readonly HappyAgentEvent["type"][];

/** The `todo.*` events an open todo list follows. */
export const HAPPY_AGENT_TODO_EVENT_TYPES = [
    "todo.created",
    "todo.updated",
] as const satisfies readonly HappyAgentEvent["type"][];

/** The daemon's type name, as the one view this build has for it, or as unsupported. */
export function happyAgentSurfaceTypeProject(type: string): HappyAgentSurfaceType {
    return type === "todo" ? { kind: "todo" } : { kind: "unsupported", type };
}

function memberProject(member: SurfaceMember): HappyAgentSurfaceMember {
    return { userId: member.userId, orderKey: member.orderKey, joinedAt: member.joinedAt };
}

export function happyAgentSurfaceProject(endpoint: string, surface: Surface): HappyAgentSurface {
    const base = endpoint.replace(/\/$/u, "");
    return {
        id: surface.id as HappyAgentSurfaceId,
        type: happyAgentSurfaceTypeProject(surface.type),
        name: surface.name,
        image:
            surface.image === null
                ? null
                : {
                      url: `${base}/v0/surfaces/${encodeURIComponent(surface.id)}/image`,
                      thumbhash: surface.image.thumbhash,
                  },
        members: surface.members.map(memberProject),
        // A daemon from before creators leaves the field out; that credits nobody.
        creatorUserId: surface.creatorUserId ?? null,
        version: surface.version,
        updatedAt: surface.updatedAt,
    };
}

export function happyAgentTodoProject(todo: Todo): HappyAgentSurfaceTodo {
    const fields = {
        id: todo.id as HappyAgentSurfaceTodoId,
        surfaceId: todo.surfaceId as HappyAgentSurfaceId,
        text: todo.text,
        // A daemon from before authors leaves the field out; that credits nobody.
        authorUserId: todo.authorUserId ?? null,
        createdAt: todo.createdAt,
        updatedAt: todo.updatedAt,
        version: todo.version,
    };
    switch (todo.status) {
        case "active":
            return {
                ...fields,
                status: "active",
                orderKey: todo.orderKey,
                completedAt: null,
                deletedAt: null,
            };
        case "completed":
            return {
                ...fields,
                status: "completed",
                orderKey: null,
                completedAt: todo.completedAt,
                deletedAt: null,
            };
        case "deleted":
            return {
                ...fields,
                status: "deleted",
                orderKey: null,
                completedAt: todo.completedAt,
                deletedAt: todo.deletedAt,
            };
    }
}

/** One Surface change from the event stream, projected out of its wire envelope. */
export type HappyAgentSurfaceEvent =
    | { readonly type: "created"; readonly surface: HappyAgentSurface }
    | {
          readonly type: "updated";
          readonly surfaceId: HappyAgentSurfaceId;
          readonly previousVersion: string;
          readonly version: string;
          readonly members: readonly HappyAgentSurfaceMember[];
          readonly updatedAt: number;
      };

export function happyAgentSurfaceEventProject(
    endpoint: string,
    event: HappyAgentEvent,
): HappyAgentSurfaceEvent | undefined {
    switch (event.type) {
        case "surface.created":
            return {
                type: "created",
                surface: happyAgentSurfaceProject(endpoint, event.payload.surface),
            };
        case "surface.updated":
            return {
                type: "updated",
                surfaceId: event.payload.surfaceId as HappyAgentSurfaceId,
                previousVersion: event.payload.previousVersion,
                version: event.payload.version,
                members: event.payload.changes.members.map(memberProject),
                updatedAt: event.payload.changes.updatedAt,
            };
        default:
            return undefined;
    }
}

/** The mutable fields a todo update carries; absent fields are unchanged. */
export interface HappyAgentTodoChanges {
    readonly text?: string;
    readonly status?: HappyAgentSurfaceTodo["status"];
    readonly orderKey?: string | null;
    readonly completedAt?: number | null;
    readonly deletedAt?: number | null;
    readonly updatedAt: number;
}

/** One todo change from the event stream, projected out of its wire envelope. */
export type HappyAgentTodoEvent =
    | { readonly type: "created"; readonly todo: HappyAgentSurfaceTodo }
    | {
          readonly type: "updated";
          readonly surfaceId: HappyAgentSurfaceId;
          readonly todoId: HappyAgentSurfaceTodoId;
          readonly previousVersion: string;
          readonly version: string;
          readonly changes: HappyAgentTodoChanges;
      };

export function happyAgentTodoEventProject(
    event: HappyAgentEvent,
): HappyAgentTodoEvent | undefined {
    switch (event.type) {
        case "todo.created":
            return { type: "created", todo: happyAgentTodoProject(event.payload.todo) };
        case "todo.updated": {
            const { changes } = event.payload;
            return {
                type: "updated",
                surfaceId: event.payload.surfaceId as HappyAgentSurfaceId,
                todoId: event.payload.todoId as HappyAgentSurfaceTodoId,
                previousVersion: event.payload.previousVersion,
                version: event.payload.version,
                changes: {
                    updatedAt: changes.updatedAt,
                    ...(changes.text === undefined ? {} : { text: changes.text }),
                    ...(changes.status === undefined ? {} : { status: changes.status }),
                    ...(changes.orderKey === undefined ? {} : { orderKey: changes.orderKey }),
                    ...(changes.completedAt === undefined
                        ? {}
                        : { completedAt: changes.completedAt }),
                    ...(changes.deletedAt === undefined ? {} : { deletedAt: changes.deletedAt }),
                },
            };
        }
        default:
            return undefined;
    }
}

/**
 * A todo with an update's changes applied, or `undefined` when the result is
 * not a todo the daemon could hold — which means the change was not the one
 * this client thought it was, and the todo should be read again.
 */
export function happyAgentTodoChangesApply(
    todo: HappyAgentSurfaceTodo,
    changes: HappyAgentTodoChanges,
    version: string,
): HappyAgentSurfaceTodo | undefined {
    const status = changes.status ?? todo.status;
    const orderKey = changes.orderKey === undefined ? todo.orderKey : changes.orderKey;
    const completedAt = changes.completedAt === undefined ? todo.completedAt : changes.completedAt;
    const deletedAt = changes.deletedAt === undefined ? todo.deletedAt : changes.deletedAt;
    const fields = {
        id: todo.id,
        surfaceId: todo.surfaceId,
        text: changes.text ?? todo.text,
        authorUserId: todo.authorUserId,
        createdAt: todo.createdAt,
        updatedAt: changes.updatedAt,
        version,
    };
    if (status === "active")
        return orderKey === null
            ? undefined
            : { ...fields, status, orderKey, completedAt: null, deletedAt: null };
    if (status === "completed")
        return completedAt === null
            ? undefined
            : { ...fields, status, orderKey: null, completedAt, deletedAt: null };
    return deletedAt === null
        ? undefined
        : { ...fields, status, orderKey: null, completedAt, deletedAt };
}

/**
 * Whether `candidate` is a later version than `current`. Resource versions are
 * UUIDv7s, minted at the moment the resource changed, so their plain string
 * order is their order in time.
 */
export function happyAgentVersionNewer(candidate: string, current: string): boolean {
    return stringCompare(candidate, current) > 0;
}
