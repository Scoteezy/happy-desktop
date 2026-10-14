/**
 * Closed product projections of a Happy Agent's Surfaces: shared instances of
 * predefined features, such as a todo list, that people join into their own
 * sidebar in their own order. The wire shapes are projected at the state
 * boundary in `surfaceProject.ts`; application code and the UI only ever see
 * these.
 */

declare const happyAgentSurfaceIdBrand: unique symbol;
declare const happyAgentSurfaceTodoIdBrand: unique symbol;

/** Branded Surface identifier (CUID2 on the wire). */
export type HappyAgentSurfaceId = string & { readonly [happyAgentSurfaceIdBrand]: true };

/** Branded todo identifier (CUID2 on the wire). */
export type HappyAgentSurfaceTodoId = string & { readonly [happyAgentSurfaceTodoIdBrand]: true };

/**
 * What a Surface is, which decides only what its content view shows. The
 * daemon's set of types grows with the product, so a type this build has no
 * view for keeps the daemon's own name and is marked unsupported. Its name,
 * picture, members, and place in the sidebar are the same as any other
 * Surface's; only its content cannot be shown here.
 */
export type HappyAgentSurfaceType =
    | { readonly kind: "todo" }
    | { readonly kind: "unsupported"; readonly type: string };

/** A Surface's picture: the daemon's bytes, and the ThumbHash that stands in until they load. */
export interface HappyAgentSurfaceImage {
    readonly url: string;
    readonly thumbhash: string;
}

/**
 * One person who has the Surface in their sidebar. `userId` is `null` for the
 * one person of a standalone installation. `orderKey` places the Surface in
 * that person's sidebar only.
 */
export interface HappyAgentSurfaceMember {
    readonly userId: string | null;
    readonly orderKey: string;
    readonly joinedAt: number;
}

export interface HappyAgentSurface {
    readonly id: HappyAgentSurfaceId;
    readonly type: HappyAgentSurfaceType;
    readonly name: string;
    readonly image: HappyAgentSurfaceImage | null;
    /** Everyone who joined, by user ID. Empty means nobody has. */
    readonly members: readonly HappyAgentSurfaceMember[];
    /**
     * Who made it, by installation-local user ID, set once when it is made.
     * `null` when nobody is credited: on a standalone installation, for a
     * Surface made before creators were recorded, from a daemon that does not
     * record them, and for a list this window made until the daemon answers.
     */
    readonly creatorUserId: string | null;
    /** The resource version, covering the Surface and every member record. */
    readonly version: string;
    readonly updatedAt: number;
}

/** A person a Surface names, as far as this connection could learn about them. */
export interface HappyAgentSurfacePerson {
    /** `null` when the person never gave a name. */
    readonly name: string | null;
    readonly photo: HappyAgentSurfaceImage | null;
}

/**
 * Whether this Happy Agent has Surfaces at all. An older daemon answers the
 * catalog with 404 or 501, which means no Surfaces rather than an empty
 * catalog, and every surface hides itself rather than reporting a failure.
 */
export type HappyAgentSurfacesAvailability = "checking" | "available" | "unsupported";

interface HappyAgentSurfaceTodoFields {
    readonly id: HappyAgentSurfaceTodoId;
    readonly surfaceId: HappyAgentSurfaceId;
    readonly text: string;
    /**
     * Who wrote it, by installation-local user ID, set once when it is made.
     * `null` when nobody is credited: on a standalone installation, for a
     * todo made before authors were recorded, from a daemon that does not
     * record them, and for a todo this window added until the daemon answers.
     */
    readonly authorUserId: string | null;
    readonly createdAt: number;
    readonly updatedAt: number;
    /** The resource version an update must name. */
    readonly version: string;
}

/**
 * One todo. Only an active todo has a place in the list; a completed one keeps
 * when it was completed, and a deleted one is a tombstone that keeps its
 * completion time, if it had one.
 */
export type HappyAgentSurfaceTodo =
    | (HappyAgentSurfaceTodoFields & {
          readonly status: "active";
          readonly orderKey: string;
          readonly completedAt: null;
          readonly deletedAt: null;
      })
    | (HappyAgentSurfaceTodoFields & {
          readonly status: "completed";
          readonly orderKey: null;
          readonly completedAt: number;
          readonly deletedAt: null;
      })
    | (HappyAgentSurfaceTodoFields & {
          readonly status: "deleted";
          readonly orderKey: null;
          readonly completedAt: number | null;
          readonly deletedAt: number;
      });

export type HappyAgentSurfaceTodoStatus = HappyAgentSurfaceTodo["status"];

/** An active todo: the ones that have a place in the list and can be moved. */
export type HappyAgentSurfaceActiveTodo = Extract<
    HappyAgentSurfaceTodo,
    { readonly status: "active" }
>;

/** A completed todo: listed newest completion first, and never moved. */
export type HappyAgentSurfaceCompletedTodo = Extract<
    HappyAgentSurfaceTodo,
    { readonly status: "completed" }
>;
