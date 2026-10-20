// The production renderer build with component names kept, so the gym can attribute renders.
import { mergeConfig } from "vite";

import base from "../vite.config";

export default mergeConfig(base, {
    build: { rolldownOptions: { output: { keepNames: true } } },
});
