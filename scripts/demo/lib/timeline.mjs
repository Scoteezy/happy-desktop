/** Compress only explicitly marked work. All other footage remains 1:1. */
export function timelineEdit(frames, sounds) {
    const edited = [];
    const sourceToOutput = [];
    let untilNext = 0;
    let previousSpeed = 1;
    for (const [index, frame] of frames.entries()) {
        const speed = frame.playbackSpeed ?? 1;
        if (speed !== previousSpeed) untilNext = 0;
        previousSpeed = speed;
        sourceToOutput[index] = edited.length;
        if (untilNext === 0) {
            edited.push({ ...frame, sourceTimelineFrame: index });
            untilNext = speed;
        }
        untilNext -= 1;
    }
    return {
        frames: edited,
        sounds: sounds
            .filter((event) => (frames[event.frame]?.playbackSpeed ?? 1) === 1)
            .map((event) => ({
                ...event,
                frame: sourceToOutput[event.frame] ?? edited.length - 1,
            })),
    };
}

/** Human voiceover timing, exported beside the burned-in subtitles. */
export function subtitlesSrt(frames, fps) {
    const cues = [];
    let active;
    for (let index = 0; index <= frames.length; index += 1) {
        const text = frames[index]?.caption;
        if (text === active?.text) continue;
        if (active) cues.push({ ...active, end: index / fps });
        active = text ? { text, start: index / fps } : undefined;
    }
    const stamp = (seconds) => {
        const milliseconds = Math.round(seconds * 1000);
        return `${String(Math.floor(milliseconds / 3600000)).padStart(2, "0")}:${String(Math.floor(milliseconds / 60000) % 60).padStart(2, "0")}:${String(Math.floor(milliseconds / 1000) % 60).padStart(2, "0")},${String(milliseconds % 1000).padStart(3, "0")}`;
    };
    return cues
        .map(
            (cue, index) =>
                `${index + 1}\n${stamp(cue.start)} --> ${stamp(cue.end)}\n${cue.text}\n`,
        )
        .join("\n");
}
