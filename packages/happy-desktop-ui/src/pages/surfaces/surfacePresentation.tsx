import type { HappyAgentSurfaceType } from "happy-desktop-state";
import { Avatar } from "../../Avatar";
import { Icon, type IconName } from "../../Icon";
import { thumbhashDataUrl } from "../../thumbhashDataUrl";

/** A picture the daemon serves, and the ThumbHash that stands in until it loads. */
export interface HappyAgentSurfacePicture {
    readonly url: string;
    readonly thumbhash: string;
}

/** A person a Surface names, as the owner could name them. */
export interface HappyAgentSurfacePersonView {
    readonly name: string;
    readonly photo?: HappyAgentSurfacePicture;
}

/** One person who joined a Surface. */
export interface HappyAgentSurfaceMemberView extends HappyAgentSurfacePersonView {
    /** Stable for the person: their user ID, or a fixed key for the standalone one. */
    readonly key: string;
}

/**
 * A Surface as every view of it shows it, whatever its type: what it is
 * called, its picture, who made it, and who is in it.
 */
export interface HappyAgentSurfaceView {
    readonly name: string;
    readonly image?: HappyAgentSurfacePicture;
    readonly type: HappyAgentSurfaceType;
    /** Who made it, once they are known; absent when the Surface credits nobody. */
    readonly creator?: HappyAgentSurfacePersonView;
    readonly members: readonly HappyAgentSurfaceMemberView[];
}

/** The glyph a Surface wears when it has no picture of its own. */
export function surfaceTypeIcon(type: HappyAgentSurfaceType): IconName {
    return type.kind === "todo" ? "tasks" : "package";
}

/** What a Surface is, in words: the kind this build shows, or the daemon's own name for one it cannot. */
export function surfaceTypeLabel(type: HappyAgentSurfaceType): string {
    return type.kind === "todo" ? "Todo list" : `Unsupported type “${type.type}”`;
}

/** Who is in a Surface, in words: up to two names, then how many more. */
export function surfaceMembersText(members: readonly HappyAgentSurfaceMemberView[]): string {
    if (members.length === 0) return "Nobody has joined";
    if (members.length === 1) return members[0]!.name;
    if (members.length === 2) return `${members[0]!.name} and ${members[1]!.name}`;
    const others = members.length - 2;
    return `${members[0]!.name}, ${members[1]!.name} and ${String(others)} ${others === 1 ? "other" : "others"}`;
}

/** Up to two initials from a name, for a face with no photo. */
export function initialsOf(name: string): string {
    return name
        .trim()
        .split(/\s+/u)
        .filter((word) => word.length > 0)
        .slice(0, 2)
        .map((word) => word.slice(0, 1).toUpperCase())
        .join("");
}

export type SurfaceAvatarProps = {
    image?: HappyAgentSurfacePicture;
    type: HappyAgentSurfaceType;
    /** 20px in a dense row, 28px beside a title. */
    size: "xs" | "sm";
};

/**
 * A Surface's picture in a rounded tile. The ThumbHash paints the tile at once
 * and the picture covers it when it arrives; a Surface without a picture wears
 * its type's glyph instead.
 */
export function SurfaceAvatar(props: SurfaceAvatarProps) {
    const placeholder =
        props.image === undefined ? undefined : thumbhashDataUrl(props.image.thumbhash);
    return (
        <span
            aria-hidden="true"
            className="happy-surface-avatar"
            data-happy-desktop-ui="surface-avatar"
            data-image={props.image ? "" : undefined}
            data-size={props.size}
            style={placeholder ? { backgroundImage: `url("${placeholder}")` } : undefined}
        >
            {props.image ? (
                <img
                    alt=""
                    className="happy-surface-avatar__image"
                    draggable={false}
                    key={props.image.url}
                    onError={(event) => {
                        // The placeholder stays rather than a broken-image glyph.
                        event.currentTarget.hidden = true;
                    }}
                    src={props.image.url}
                />
            ) : (
                <Icon name={surfaceTypeIcon(props.type)} size={props.size === "xs" ? 12 : 16} />
            )}
        </span>
    );
}

/** The faces of the first few people in a Surface, overlapping, and how many more. */
export function SurfaceMemberStack(props: {
    members: readonly HappyAgentSurfaceMemberView[];
    /** How many faces are drawn before the rest become a count. */
    limit?: number;
}) {
    const limit = props.limit ?? 3;
    const shown = props.members.slice(0, limit);
    const rest = props.members.length - shown.length;
    if (shown.length === 0) return null;
    return (
        <span
            aria-label={surfaceMembersText(props.members)}
            className="happy-surface-members"
            data-happy-desktop-ui="surface-members"
            role="img"
        >
            {shown.map((member) => (
                <Avatar
                    className="happy-surface-members__face"
                    imageUrl={member.photo?.url}
                    initials={initialsOf(member.name)}
                    key={member.key}
                    size="xs"
                />
            ))}
            {rest > 0 ? <span className="happy-surface-members__more">+{String(rest)}</span> : null}
        </span>
    );
}
