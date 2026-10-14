/**
 * Mints CUID2-shaped identifiers for resources this client names before the
 * daemon has seen them: a lowercase letter, the time, a counter, and random
 * base-36 digits, 24 characters in all. Naming a resource here is what makes
 * creating it safe to retry, because the daemon answers a repeated ID with the
 * resource it already made.
 */
export function cuid2Create(now: () => number): () => string {
    const digits = "0123456789abcdefghijklmnopqrstuvwxyz";
    const letters = "abcdefghijklmnopqrstuvwxyz";
    let counter = 0;
    return () => {
        const random = globalThis.crypto.getRandomValues(new Uint8Array(13));
        counter = (counter + 1) % 46_656;
        const time = Math.max(0, Math.floor(now())).toString(36).slice(-8).padStart(8, "0");
        const count = counter.toString(36).padStart(3, "0");
        let tail = "";
        for (let index = 1; index < random.length; index += 1)
            tail += digits[(random[index] ?? 0) % digits.length];
        return `${letters[(random[0] ?? 0) % letters.length] ?? "a"}${time}${count}${tail}`;
    };
}
