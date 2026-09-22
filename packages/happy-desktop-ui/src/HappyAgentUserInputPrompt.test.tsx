import { expect, it, vi } from "vitest";
import { useState } from "react";
import type { HappyAgentUserInputRequest } from "happy-desktop-state";
import "./theme.css";
import "./styles/icon.css";
import "./styles/vector-icon.css";
import "./styles/button.css";
import "./styles/checkbox.css";
import "./styles/happy-agent-chat.css";
import "./styles/shimmer-text.css";
import {
    HappyAgentUserInputPrompt,
    type HappyAgentUserInputAnswerMap,
} from "./HappyAgentUserInputPrompt";
import { createRenderer } from "./testing";

const request: HappyAgentUserInputRequest = {
    requestId: "req-1",
    questions: [
        {
            id: "approach",
            header: "Approach",
            question: "How?",
            multiSelect: false,
            required: true,
            options: [
                { label: "One transaction", description: "atomic" },
                { label: "Batches", description: "slower" },
            ],
        },
        {
            id: "notify",
            header: "Notify",
            question: "Who?",
            multiSelect: true,
            required: false,
            options: [
                { label: "On-call", description: "page" },
                { label: "Channel", description: "post" },
            ],
        },
    ],
};

function control(view: ReturnType<typeof createRenderer>, questionId: string, index: number) {
    const options = view.container.querySelectorAll(
        `[data-question-id="${questionId}"] [data-happy-desktop-ui="happy-agent-user-input-option"] .happy-checkbox__control`,
    );
    return options[index] as HTMLInputElement;
}

it("gates submit on required questions and reports single/multi select answers", async () => {
    const answers: { requestId: string; answers: HappyAgentUserInputAnswerMap }[] = [];
    const view = createRenderer();
    view.render(
        () => (
            <HappyAgentUserInputPrompt
                data-testid="input"
                onAnswer={(requestId, map) => answers.push({ requestId, answers: map })}
                request={request}
            />
        ),
        { width: 560, height: 440, padding: 16 },
    );
    await view.ready();

    const submit = view.$('[data-testid="input"] [data-action="submit"]')
        .element as HTMLButtonElement;
    expect(submit.disabled, "submit blocked until required answered").toBe(true);

    // Multi-select: accumulate both notify options.
    control(view, "notify", 0).click();
    control(view, "notify", 1).click();
    // Single-select: choose the second, then switch to the first (clears the second).
    control(view, "approach", 1).click();
    control(view, "approach", 0).click();

    await vi.waitFor(() => expect(submit.disabled).toBe(false));

    submit.click();
    await vi.waitFor(() => expect(answers.length).toBe(1));
    expect(answers[0]!.requestId).toBe("req-1");
    expect(answers[0]!.answers.approach).toEqual(["One transaction"]);
    expect(answers[0]!.answers.notify).toEqual(["On-call", "Channel"]);

    await view.screenshot("HappyAgentUserInputPrompt.test");

    view.render(
        () => (
            <HappyAgentUserInputPrompt
                data-testid="answered-input"
                request={request}
                resolvedAnswers={{
                    approach: ["One transaction"],
                }}
            />
        ),
        { width: 560, height: 440, padding: 16 },
    );
    await view.ready();

    const answered = view.$('[data-testid="answered-input"]');
    expect(answered.element.getAttribute("data-state")).toBe("answered");
    expect(answered.element.querySelector('[data-action="submit"]')).toBeNull();
    expect(answered.element.querySelectorAll('input[type="checkbox"]')).toHaveLength(0);
    expect(
        answered.element.querySelector('[data-happy-desktop-ui="happy-agent-user-input-answers"]')
            ?.textContent,
    ).toContain("One transaction");
    expect(answered.element.querySelector('[data-question-id="notify"]')?.textContent).toContain(
        "Skipped",
    );
    await view.screenshot("HappyAgentUserInputPrompt.answered.test");
}, 120_000);

it("shimmers on Submit without moving the button, choices, or following content", async () => {
    const view = createRenderer();
    const releases: (() => void)[] = [];
    const submissions: string[] = [];
    function Harness({ variant }: { variant: "card" | "flat" }) {
        const [pending, setPending] = useState(false);
        releases[variant === "card" ? 0 : 1] = () => setPending(false);
        return (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <HappyAgentUserInputPrompt
                    data-testid={`loading-${variant}`}
                    onAnswer={() => {
                        submissions.push(variant);
                        setPending(true);
                    }}
                    pending={pending}
                    request={request}
                    variant={variant}
                />
                <div data-testid={`following-${variant}`}>Waiting for answer</div>
            </div>
        );
    }
    view.render(() => <Harness variant="card" />, { width: 560, height: 440, padding: 16 });
    view.render(() => <Harness variant="flat" />, { width: 360, height: 520, padding: 16 });
    await view.ready();
    expect(window.devicePixelRatio).toBe(2);

    for (const variant of ["card", "flat"] as const) {
        const root = view.$(`[data-testid="loading-${variant}"]`).element;
        const submit = root.querySelector<HTMLButtonElement>('[data-action="submit"]')!;
        const checkbox = root.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
        checkbox.click();
        await vi.waitFor(() => expect(submit.disabled).toBe(false));
        const elements = [
            root,
            ...root.querySelectorAll(
                '.happy-agent-input__question, .happy-agent-input__option, .happy-agent-input__footer, [data-action="submit"], .happy-button__label',
            ),
            view.$(`[data-testid="following-${variant}"]`).element,
        ];
        const geometry = () => elements.map((element) => element.getBoundingClientRect().toJSON());
        const before = geometry();
        submit.click();
        await vi.waitFor(() => expect(submit.getAttribute("aria-busy")).toBe("true"));
        const shimmer = root.querySelector<HTMLElement>('[data-happy-desktop-ui="shimmer-text"]')!;
        expect(shimmer.textContent).toBe("Submit");
        expect(getComputedStyle(shimmer).animationName).toBe("happy-shimmer-text-sweep");
        expect(getComputedStyle(submit).opacity).toBe("1");
        expect(submit.disabled).toBe(true);
        expect(checkbox.disabled).toBe(true);
        expect(checkbox.checked).toBe(true);
        expect(root.querySelector('[data-action="submit"]')).toBe(submit);
        expect(root.querySelector('input[type="checkbox"]')).toBe(checkbox);
        expect(geometry(), `${variant}: pending transition must not reflow`).toEqual(before);
        submit.click();
        expect(submissions.filter((value) => value === variant)).toHaveLength(1);

        // Sample the actual sweep at its start, middle, and end. Freezing also
        // makes the stored Retina fixture deterministic in every browser.
        for (const time of [0, 800, 1599]) {
            for (const animation of shimmer.getAnimations()) {
                animation.pause();
                animation.currentTime = time;
            }
            await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
            expect(geometry(), `${variant}: shimmer frame ${time} must not reflow`).toEqual(before);
        }
    }
    await view.screenshot("HappyAgentUserInputPrompt.loading.test");

    for (const [index, variant] of (["card", "flat"] as const).entries()) {
        const root = view.$(`[data-testid="loading-${variant}"]`).element;
        const submit = root.querySelector<HTMLButtonElement>('[data-action="submit"]')!;
        const before = submit.getBoundingClientRect().toJSON();
        releases[index]!();
        await vi.waitFor(() => expect(submit.disabled).toBe(false));
        expect(root.querySelector('[data-action="submit"]')).toBe(submit);
        expect(root.querySelector('[data-happy-desktop-ui="shimmer-text"]')).toBeNull();
        expect(submit.getBoundingClientRect().toJSON()).toEqual(before);
        expect(root.querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked).toBe(true);
    }
}, 120_000);
