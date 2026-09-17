import { readFile } from "node:fs/promises";

export const releaseCoordinatorName = "Release Coordinator";
const username = "release_coordinator";

/** One real bot, seeded only in the isolated recording daemon. */
export async function releaseCoordinatorPrepare(gym) {
    const { bots } = await gym.client.listBots();
    let bot = bots.find((entry) => entry.username === username);
    if (!bot) {
        ({ bot } = await gym.client.createBot({
            id: "corebotreleasecoordinator",
            name: releaseCoordinatorName,
            username,
            isAdmin: false,
        }));
    }
    if (bot.name !== releaseCoordinatorName || bot.status !== "active")
        throw new Error("The demo's Release Coordinator identity changed unexpectedly.");
    const image = await readFile(new URL("./assets/release-coordinator.png", import.meta.url));
    ({ bot } = await gym.client.setBotAvatar(
        bot.id,
        { contentType: "image/png", data: image },
        { ifMatch: bot.version },
    ));
    return bot;
}
