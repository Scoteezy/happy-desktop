import type { HappyAgentBot, HappyAgentBotSubtask } from "./happyAgentTypes.js";

/** Preorder projection of the explicit tree, for addressing and group membership. */
export function happyAgentBotSubtasks(
    bots: readonly HappyAgentBot[],
): readonly HappyAgentBotSubtask[] {
    const result: HappyAgentBotSubtask[] = [];
    const visit = (tasks: readonly HappyAgentBotSubtask[]): void => {
        for (const task of tasks) {
            result.push(task);
            visit(task.subtasks);
        }
    };
    for (const bot of bots) visit(bot.subtasks);
    return result;
}
