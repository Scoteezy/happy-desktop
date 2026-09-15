/** Recording overlays only: neither helper edits a message or textarea value. */
export async function textareaMarker(page, from, to) {
    await page.evaluate(
        ({ from, to }) => {
            const input = document.querySelector('[data-happy-desktop-ui="composer-textarea"]');
            const style = getComputedStyle(input);
            const inputBox = input.getBoundingClientRect();
            const mirror = document.createElement("div");
            for (const property of [
                "fontFamily",
                "fontSize",
                "fontWeight",
                "fontStyle",
                "fontVariant",
                "letterSpacing",
                "lineHeight",
                "padding",
                "border",
                "boxSizing",
                "textIndent",
                "textTransform",
                "wordSpacing",
                "tabSize",
                "overflowWrap",
                "wordBreak",
            ])
                mirror.style[property] = style[property];
            Object.assign(mirror.style, {
                position: "fixed",
                left: "-10000px",
                top: "0",
                width: `${inputBox.width}px`,
                whiteSpace: "pre-wrap",
                visibility: "hidden",
            });
            mirror.textContent = input.value;
            document.body.append(mirror);
            const range = document.createRange();
            range.setStart(mirror.firstChild, from);
            range.setEnd(mirror.firstChild, to);
            const mirrorBox = mirror.getBoundingClientRect();
            document.getElementById("core-typing-marker")?.remove();
            const overlay = document.createElement("div");
            overlay.id = "core-typing-marker";
            overlay.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:2147483646";
            for (const box of range.getClientRects()) {
                const mark = document.createElement("div");
                Object.assign(mark.style, {
                    position: "absolute",
                    left: `${inputBox.x + box.x - mirrorBox.x - input.scrollLeft}px`,
                    top: `${inputBox.y + box.y - mirrorBox.y - input.scrollTop + 2}px`,
                    width: `${box.width}px`,
                    height: `${box.height - 2}px`,
                    background: "rgba(255,214,82,0.23)",
                    borderRadius: "2px",
                });
                overlay.append(mark);
            }
            document.body.append(overlay);
            mirror.remove();
        },
        { from, to },
    );
}

export async function transcriptMarker(
    page,
    phrases,
    root = '[data-happy-desktop-ui="conversation-view"]',
) {
    await page.evaluate(
        ({ phrases, root }) => {
            if (!document.getElementById("core-highlight-style")) {
                const style = document.createElement("style");
                style.id = "core-highlight-style";
                style.textContent =
                    "::highlight(core-demo) { background-color: rgba(255,214,82,0.3); color: inherit; }";
                document.head.append(style);
            }
            const ranges = [];
            const walker = document.createTreeWalker(
                document.querySelector(root),
                NodeFilter.SHOW_TEXT,
            );
            let node;
            while ((node = walker.nextNode()))
                for (const phrase of phrases) {
                    const index = node.textContent.indexOf(phrase);
                    if (index < 0) continue;
                    const range = document.createRange();
                    range.setStart(node, index);
                    range.setEnd(node, index + phrase.length);
                    ranges.push(range);
                }
            CSS.highlights.set("core-demo", new Highlight(...ranges));
        },
        { phrases, root },
    );
}

export async function markersClear(page) {
    await page.evaluate(() => {
        document.getElementById("core-typing-marker")?.remove();
        CSS.highlights.delete("core-demo");
    });
}
