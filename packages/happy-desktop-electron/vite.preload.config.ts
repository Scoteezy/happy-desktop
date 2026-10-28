import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
    publicDir: false,
    build: {
        emptyOutDir: false,
        lib: {
            entry: {
                preload: resolve(import.meta.dirname, "sources/preload/preload.ts"),
                browserPasswordGuestPreload: resolve(
                    import.meta.dirname,
                    "sources/preload/browserPasswordGuestPreload.ts",
                ),
            },
            formats: ["cjs"],
            fileName: (_format, entryName) => `${entryName}.cjs`,
        },
        outDir: "dist",
        rollupOptions: {
            external: ["electron"],
        },
    },
});
