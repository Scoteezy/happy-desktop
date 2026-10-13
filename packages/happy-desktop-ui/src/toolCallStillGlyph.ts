/**
 * The still mark for a tool call that holds a turn open without doing any work:
 * a scheduled `wait`/`wait_until` sits out the clock, and `request_user_input`
 * is stopped on the reader. Neither is work happening, so while one runs its row
 * and the turn's footer show this glyph instead of a spinner or a shimmer.
 * Every other tool answers `undefined` and spins while it runs.
 */
export function toolCallStillGlyph(toolName: string): "clock" | "question" | undefined {
    switch (toolName) {
        case "wait":
        case "wait_until":
            return "clock";
        case "request_user_input":
            return "question";
        default:
            return undefined;
    }
}
