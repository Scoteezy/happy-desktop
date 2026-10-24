# Interaction stability depths

Run from `packages/happy-desktop-ui`:

```sh
node ../../scripts/run-ui-alignment-tests.mjs --depth=cheap src/ConversationInteractionFuzz.test.tsx
node ../../scripts/run-ui-alignment-tests.mjs --depth=full src/ConversationInteractionFuzz.test.tsx
```

`HAPPY_TEST_DEPTH=cheap|full` also works with direct Vitest runs. The CLI overrides
the environment; invalid values fail before browser launch. Cheap is the default.
The runner preserves the existing remote CI skip.

Both depths use the real chat/workspace stores, retained conversation views,
deterministic transport callbacks and the same DOM geometry oracle. The four
named regression tapes always run in full. Cheap adds four pinned generated seeds
with ten shuffled action groups each; dependencies such as Stop/dequeue/stream
stay together. Full runs the certified twenty seeds in each of Chromium, Firefox
and WebKit. Focused regression tests run at both depths. The retained hidden-width
warm/cold tape variants use Chromium because their step numbers refer to its zoom
deck; the pending native resize warm/cold cases run in every engine.

After the normal full run, the runner repeats the original concurrent stress
schedule twenty times: Firefox seeds 1/1021/32749/214013 and Chromium seed65521.
An explicit `--project` limits this schedule to selected engines. Unrelated test
files and watch mode do not start stress. Each round validates its complete seed
and action counts, stops on the first failure, and preserves logs/results in the
package's ignored `.context/interaction-fuzz-stress-*` directory. No debug buffer
or production instrumentation is installed. Direct Vitest runs omit this extra
process schedule; use the runner for release validation.

Every seeded failure includes its initial history and complete action tape.
Replay a full tape with `VITE_CHAT_FUZZ_SEED=32749` and a test-name filter such as
`-t 'holds transcript geometry'`. This diagnostic override replaces the matrix;
it cannot certify the normal release matrix. To validate a saved complete log:

```sh
node ../../scripts/validate-interaction-fuzz.mjs --depth=cheap path/to/vitest.log
```

Pass `--browser=chromium` (repeat for multiple engines) for deliberately limited
runs. The validator rejects missing engines/seeds, duplicate runs and shortened
decks, using the same pinned PRNG/deck definition. Browser-specific native zoom
cases keep their existing engine exclusions; changing depth changes the budget,
not the assertions.
