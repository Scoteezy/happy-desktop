/** Real Surface content for the isolated redesign walkthrough and browser checks. */
export async function seedSurfaces(ok) {
    const create = async (body) => (await ok("POST", "/v0/surfaces", body)).surface;
    const checklist = await create({ type: "todo", name: "Release checklist" });
    for (const text of [
        "Kirill · Verify the Windows signing certificate before Friday",
        "Steve · Smoke-test the preview on macOS and Windows",
        "Record the walkthrough and attach the review notes",
    ])
        await ok("POST", `/v0/surfaces/todo/${checklist.id}`, { text });
    const notes = await create({
        type: "document",
        name: "Design notes",
        text: "# Desktop design notes\n\nKeep the three header lanes stable while the sidebar and right pane change.\n\n## Release review\n\n- Drag a whole task with its worktrees and connectors.\n- Use the same row geometry for new work and named work.\n- Share the release checklist with the team.\n",
    });
    const calendar = await create({ type: "calendar", name: "Team calendar" });
    const start = new Date();
    start.setUTCDate(start.getUTCDate() + 1);
    start.setUTCHours(10, 0, 0, 0);
    await ok("POST", `/v0/surfaces/calendar/${calendar.id}`, {
        title: "Preview release go/no-go",
        notes: "Kirill and Steve review signing, smoke tests and the walkthrough.",
        location: "Team call",
        timing: { kind: "timed", start: +start, end: +start + 30 * 60 * 1000, timeZone: "UTC" },
    });
    return { checklist: checklist.id, notes: notes.id, calendar: calendar.id };
}
