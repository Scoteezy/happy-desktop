import type {
    Space,
    SpaceBatch,
    SpaceBatchPosition,
    SpaceIcon,
    SpaceSection,
    SpaceTarget,
} from "@slopus/happy-agent-client";

/** A sidebar entry: Happy, or one piece of work. */
export type HappyAgentSpaceId = string & { readonly __brand: "HappyAgentSpaceId" };
/** A flat sidebar section. */
export type HappyAgentSpaceSectionId = string & { readonly __brand: "HappyAgentSpaceSectionId" };

/** What a row wears in its leading lane, as the manager decided it. */
export type HappyAgentSpaceIcon = SpaceIcon;

/** What a click opens, resolved by the daemon. */
export type HappyAgentSpaceTarget = SpaceTarget;

/** One row, with the daemon's IDs branded. `title` is `null` until the work has a name. */
export type HappyAgentSpace = Omit<Space, "id" | "sectionId"> & {
    readonly id: HappyAgentSpaceId;
    readonly sectionId: HappyAgentSpaceSectionId | null;
};

export type HappyAgentSpaceSection = Omit<SpaceSection, "id"> & {
    readonly id: HappyAgentSpaceSectionId;
};

/** Where a row stood on one side of a batch. */
export type HappyAgentSpacePosition = Omit<SpaceBatchPosition, "sectionId"> & {
    readonly sectionId: HappyAgentSpaceSectionId | null;
};

/** One calm reorganisation the manager applied, with the note it wrote in Happy's chat. */
export type HappyAgentSpaceBatch = Omit<SpaceBatch, "changes"> & {
    readonly changes: readonly {
        readonly spaceId: HappyAgentSpaceId;
        readonly title: string;
        readonly from: HappyAgentSpacePosition;
        readonly to: HappyAgentSpacePosition;
    }[];
};
