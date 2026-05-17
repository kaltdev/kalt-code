# Smoke Test Isolation Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the Bun smoke/test suite so process-global state mutations do not leak across tests at any concurrency level.

**Architecture:** Keep production changes limited to reset/build/mutex infrastructure, and serialize only tests that mutate process-global state through `src/test/sharedMutationLock.ts`. Preserve existing test intent while moving cleanup into lock-protected `try`/`finally` sections and replacing fixed async sleeps with predicate-based waits.

**Tech Stack:** TypeScript, Bun runtime/test runner/build plugins, Bun `mock.module`, Node-compatible `fs`/`os`/`path` APIs.

---

## File Structure

Infrastructure files:

- Modify `src/entrypoints/sdk/shared.ts`: encapsulate env mutex state and export `createEnvMutexForTesting()`.
- Modify `scripts/build.ts`: add `featureFlagPreprocessPlugin` and apply it to CLI and SDK builds; keep build source non-mutating.
- Modify `src/utils/knowledgeGraph.ts`: make reset cleanup attempt SQLite, JSON, and Orama independently.
- Modify `src/utils/storage/SQLiteProvider.ts`: make `reset()` and self-heal deletion paths non-throwing and handle sidecars after close.

High-risk tests:

- Modify `tests/sdk/shared-utils.test.ts`: use `createEnvMutexForTesting()` for timeout behavior.
- Modify `scripts/no-telemetry-growthbook-stub.test.ts`: protect env/file mutations with the SDK env mutex pattern or shared lock.
- Modify `src/integrations/discoveryService.test.ts`: hold lock until fetch/env/config dir cleanup is complete.
- Modify `src/utils/knowledgeGraph.test.ts`, `src/utils/knowledgeGraph.stress.test.ts`, `src/utils/storage/SQLiteProvider.test.ts`, `src/utils/storage/SQLiteMasterpiece.test.ts`: hold lock while temp config dirs and persistence are reset.
- Modify `vscode-extension/kalt-code-vscode/src/extension.test.js`: use the JS import path to the shared mutation lock and restore env/mocks under lock.

Bulk test files:

- Modify all named files in the task request that mutate `process.env`, `globalThis`, `mock.module`, temp config dirs, or fixed waits.
- Also modify additional same-pattern files discovered by search or validation.

## Task 1: Confirm Baseline And Inventory

**Files:**
- Inspect: `scripts/build.ts`
- Inspect: `src/entrypoints/sdk/shared.ts`
- Inspect: `src/utils/knowledgeGraph.ts`
- Inspect: `src/utils/storage/SQLiteProvider.ts`
- Inspect: all files returned by the search commands below

- [ ] **Step 1: Verify branch and clean worktree**

Run:

```bash
git status --short --branch
```

Expected: branch is `smoke-work`. Any pre-existing dirty files must be understood before editing and must not be reverted unless they are from this task.

- [ ] **Step 2: Confirm build preprocessing shape**

Run:

```bash
rg -n "preProcessFeatureFlags|restoreModifiedFiles|applyFeatureFlagTransforms|featureFlagPreprocessPlugin|feature\\(" scripts/build.ts src -g '*.ts' -g '*.tsx'
```

Expected: `feature(...)` callsites exist. If `preProcessFeatureFlags()` or `restoreModifiedFiles()` exist, remove them in Task 3. If they do not exist, still add an identity-safe build plugin in Task 3 so source transforms are explicitly non-mutating.

- [ ] **Step 3: Inventory global mutation tests**

Run:

```bash
rg -n "process\\.env\\.[A-Z0-9_]+\\s*=|delete process\\.env|globalThis\\.|mock\\.module\\(|Bun\\.sleep\\(" src tests scripts vscode-extension/kalt-code-vscode/src -g '*.test.ts' -g '*.test.tsx' -g '*.test.js'
```

Expected: every matching test file either already uses `acquireSharedMutationLock()` correctly or is added to the implementation worklist.

## Task 2: SDK Env Mutex Factory

**Files:**
- Modify: `src/entrypoints/sdk/shared.ts`
- Modify: `tests/sdk/shared-utils.test.ts`
- Test: `tests/sdk/shared-utils.test.ts`

- [ ] **Step 1: Add mutex state helpers**

In `src/entrypoints/sdk/shared.ts`, replace the module-level `envMutationQueue` and `envMutationLocked` variables with this structure:

```typescript
type EnvMutexCallback = () => void

type EnvMutexState = {
  queue: EnvMutexCallback[]
  locked: boolean
}

function createEnvMutexState(): EnvMutexState {
  return {
    queue: [],
    locked: false,
  }
}
```

- [ ] **Step 2: Route acquire/release/reset through state**

Add internal helpers that accept `EnvMutexState`:

```typescript
async function acquireEnvMutexFromState(
  state: EnvMutexState,
  options?: MutexAcquireOptions,
): Promise<MutexAcquireResult> {
  if (!state.locked) {
    state.locked = true
    return { acquired: true }
  }

  if (options?.timeoutMs === undefined) {
    return new Promise(resolve => {
      state.queue.push(() => resolve({ acquired: true }))
    })
  }

  return new Promise(resolve => {
    let resolved = false
    let callback: EnvMutexCallback

    const timeoutId = setTimeout(() => {
      if (!resolved) {
        resolved = true
        const index = state.queue.indexOf(callback)
        if (index !== -1) {
          state.queue.splice(index, 1)
        }
        resolve({ acquired: false, reason: 'timeout' })
      }
    }, options.timeoutMs)

    callback = () => {
      if (!resolved) {
        resolved = true
        clearTimeout(timeoutId)
        resolve({ acquired: true })
      }
    }

    state.queue.push(callback)
  })
}

function releaseEnvMutexFromState(state: EnvMutexState): void {
  if (state.queue.length > 0) {
    const next = state.queue.shift()
    if (next) {
      try {
        next()
      } catch {
        state.locked = false
      }
    }
  } else {
    state.locked = false
  }
}

function resetEnvMutexStateForTesting(state: EnvMutexState): void {
  state.queue.length = 0
  state.locked = false
}
```

- [ ] **Step 3: Preserve global exports and add isolated factory**

Add the global state and exports:

```typescript
const globalEnvMutexState = createEnvMutexState()

export async function acquireEnvMutex(options?: MutexAcquireOptions): Promise<MutexAcquireResult> {
  return acquireEnvMutexFromState(globalEnvMutexState, options)
}

export function releaseEnvMutex(): void {
  releaseEnvMutexFromState(globalEnvMutexState)
}

export function resetEnvMutexForTesting(): void {
  resetEnvMutexStateForTesting(globalEnvMutexState)
}

export function createEnvMutexForTesting(): {
  acquireEnvMutex: (options?: MutexAcquireOptions) => Promise<MutexAcquireResult>
  releaseEnvMutex: () => void
} {
  const state = createEnvMutexState()
  return {
    acquireEnvMutex: options => acquireEnvMutexFromState(state, options),
    releaseEnvMutex: () => releaseEnvMutexFromState(state),
  }
}
```

- [ ] **Step 4: Update timeout tests to use isolated mutexes**

In `tests/sdk/shared-utils.test.ts`, import `createEnvMutexForTesting` and remove `resetEnvMutexForTesting()` from the timeout `beforeEach`/`afterEach`. Each timeout test should start with:

```typescript
const envMutex = createEnvMutexForTesting()
const firstResult = await envMutex.acquireEnvMutex()
```

Use `envMutex.releaseEnvMutex()` for that test's cleanup.

- [ ] **Step 5: Run targeted SDK mutex tests**

Run:

```bash
bun test tests/sdk/shared-utils.test.ts
```

Expected: all tests in `tests/sdk/shared-utils.test.ts` pass.

- [ ] **Step 6: Commit**

Run:

```bash
git add src/entrypoints/sdk/shared.ts tests/sdk/shared-utils.test.ts
git commit -m "test: isolate sdk env mutex timeout tests"
```

## Task 3: Non-Mutating Build Feature Preprocessing

**Files:**
- Modify: `scripts/build.ts`
- Test: `bun run build`

- [ ] **Step 1: Import the Bun plugin type**

At the top of `scripts/build.ts`, add:

```typescript
import type { BunPlugin, Loader } from "bun";
```

- [ ] **Step 2: Add transform helper**

Near `enabledFeatures`, add this helper. If an existing transform function is found by Task 1, move its logic into this function instead of using the identity body:

```typescript
function applyFeatureFlagTransforms(source: string): string {
    return source;
}
```

- [ ] **Step 3: Add the build plugin**

Add this plugin after `applyFeatureFlagTransforms`:

```typescript
const featureFlagPreprocessPlugin: BunPlugin = {
    name: "feature-flag-preprocessor",
    setup(build) {
        build.onLoad({ filter: /\.tsx?$/ }, async ({ path }) => {
            const source = await Bun.file(path).text();
            const transformed = applyFeatureFlagTransforms(source);
            const loader: Loader = path.endsWith(".tsx") ? "tsx" : "ts";
            return { contents: transformed, loader };
        });
    },
};
```

- [ ] **Step 4: Remove in-place preprocessing if present**

If `preProcessFeatureFlags()`, `restoreModifiedFiles()`, or a `finally` block that restores modified files exists, delete those functions and calls. Do not delete unrelated build validation or bundle stub code.

- [ ] **Step 5: Apply plugin to both builds**

In the CLI `plugins` array, put `featureFlagPreprocessPlugin` before `noTelemetryPlugin`:

```typescript
plugins: [
    featureFlagPreprocessPlugin,
    noTelemetryPlugin,
    // existing plugins remain after this
],
```

In the SDK `plugins` array, also put `featureFlagPreprocessPlugin` before `noTelemetryPlugin`:

```typescript
plugins: [
    featureFlagPreprocessPlugin,
    noTelemetryPlugin,
    // existing plugins remain after this
],
```

- [ ] **Step 6: Run build**

Run:

```bash
bun run build
```

Expected: build succeeds and prints successful CLI and SDK bundle messages.

- [ ] **Step 7: Commit**

Run:

```bash
git add scripts/build.ts
git commit -m "build: preprocess feature flags through bun plugin"
```

## Task 4: Knowledge Graph And SQLite Reset Hardening

**Files:**
- Modify: `src/utils/knowledgeGraph.ts`
- Modify: `src/utils/storage/SQLiteProvider.ts`
- Test: `src/utils/knowledgeGraph.test.ts`
- Test: `src/utils/knowledgeGraph.stress.test.ts`
- Test: `src/utils/storage/SQLiteProvider.test.ts`

- [ ] **Step 1: Harden SQLiteProvider file deletion**

In `src/utils/storage/SQLiteProvider.ts`, update `removeDatabaseFiles()` so every `existsSync`, `statSync`, and `unlinkSync` call is protected. Keep deleting `knowledge.db`, `knowledge.db-wal`, and `knowledge.db-shm`.

```typescript
private removeDatabaseFiles(): boolean {
    let ok = true;
    const sidecars = [
        this.dbPath,
        `${this.dbPath}-wal`,
        `${this.dbPath}-shm`,
    ];

    for (const file of sidecars) {
        try {
            if (!existsSync(file)) continue;
            unlinkSync(file);
        } catch (error) {
            ok = false;
            console.warn(`Failed to remove SQLite state at ${file}:`, error);
        }
    }

    return ok;
}
```

- [ ] **Step 2: Harden empty-file removal in init**

Replace the direct empty-file check in `init()` with a protected block:

```typescript
try {
    if (existsSync(this.dbPath) && statSync(this.dbPath).size === 0) {
        unlinkSync(this.dbPath);
    }
} catch (error) {
    console.warn(`Failed to inspect SQLite database at ${this.dbPath}:`, error);
    this.removeDatabaseFiles();
}
```

- [ ] **Step 3: Make reset non-throwing**

Update `reset()`:

```typescript
public reset(): boolean {
    let ok = true;
    try {
        this.close();
    } catch (error) {
        ok = false;
        console.warn(`Failed to close SQLite database at ${this.dbPath}:`, error);
    }
    return this.removeDatabaseFiles() && ok;
}
```

- [ ] **Step 4: Add independent reset helper in knowledgeGraph**

In `src/utils/knowledgeGraph.ts`, near `resetGlobalGraph()`, add:

```typescript
function resetBackend(name: string, reset: () => boolean): boolean {
    try {
        return reset();
    } catch (error) {
        console.warn(`Failed to reset knowledge graph ${name} backend:`, error);
        return false;
    }
}
```

- [ ] **Step 5: Update resetGlobalGraph() to attempt all backends**

Replace the current `sqliteReset`/`jsonReset` gated cleanup with:

```typescript
const sqliteReset = resetBackend("SQLite", () => sqlite.reset());
const jsonReset = resetBackend("JSON", () => json.reset());
const oramaReset = resetBackend("Orama", () => {
    rmSync(oramaPath, { force: true });
    return true;
});

if (!sqliteReset || !jsonReset || !oramaReset) {
    console.warn(
        `Knowledge graph reset encountered cleanup failures for ${projectDir}.`,
    );
}
```

Keep the existing in-memory resets and `providerCache.delete(projectDir)` after those cleanup attempts.

- [ ] **Step 6: Run targeted storage tests**

Run:

```bash
bun test src/utils/storage/SQLiteProvider.test.ts src/utils/knowledgeGraph.test.ts src/utils/knowledgeGraph.stress.test.ts
```

Expected: all targeted tests pass.

- [ ] **Step 7: Commit**

Run:

```bash
git add src/utils/knowledgeGraph.ts src/utils/storage/SQLiteProvider.ts
git commit -m "fix: harden knowledge graph reset cleanup"
```

## Task 5: Critical Test Isolation Updates

**Files:**
- Modify: `scripts/no-telemetry-growthbook-stub.test.ts`
- Modify: `src/integrations/discoveryService.test.ts`
- Modify: `src/utils/knowledgeGraph.test.ts`
- Modify: `src/utils/knowledgeGraph.stress.test.ts`
- Modify: `src/utils/storage/SQLiteProvider.test.ts`
- Modify: `src/utils/storage/SQLiteMasterpiece.test.ts`
- Modify: `vscode-extension/kalt-code-vscode/src/extension.test.js`

- [ ] **Step 1: Apply shared lock skeleton to each critical test**

For TypeScript test files, import:

```typescript
import {
    acquireSharedMutationLock,
    releaseSharedMutationLock,
} from "../test/sharedMutationLock.js";
```

Adjust the relative import per file:

- `scripts/no-telemetry-growthbook-stub.test.ts`: `../src/test/sharedMutationLock.js`
- `src/integrations/discoveryService.test.ts`: `../test/sharedMutationLock.js`
- `src/utils/knowledgeGraph.test.ts`: `../test/sharedMutationLock.js`
- `src/utils/knowledgeGraph.stress.test.ts`: `../test/sharedMutationLock.js`
- `src/utils/storage/SQLiteProvider.test.ts`: `../../test/sharedMutationLock.js`
- `src/utils/storage/SQLiteMasterpiece.test.ts`: `../../test/sharedMutationLock.js`

For `vscode-extension/kalt-code-vscode/src/extension.test.js`, import from:

```javascript
import {
  acquireSharedMutationLock,
  releaseSharedMutationLock,
} from '../../../src/test/sharedMutationLock.js'
```

- [ ] **Step 2: Make lock acquisition the first beforeEach statement**

Every affected file should use:

```typescript
beforeEach(async () => {
    await acquireSharedMutationLock("relative/file.test.ts");
    // existing setup follows
});
```

For JS:

```javascript
beforeEach(async () => {
  await acquireSharedMutationLock('vscode-extension/kalt-code-vscode/src/extension.test.js')
  // existing setup follows
})
```

- [ ] **Step 3: Restore env and temp dirs before lock release**

Use this cleanup shape for config-dir tests:

```typescript
afterEach(() => {
    try {
        resetGlobalGraph();
        if (originalConfigDir === undefined) {
            delete process.env.CLAUDE_CONFIG_DIR;
        } else {
            process.env.CLAUDE_CONFIG_DIR = originalConfigDir;
        }
    } finally {
        const dirToRemove = configDir;
        configDir = "";
        try {
            if (dirToRemove) {
                rmSync(dirToRemove, { recursive: true, force: true });
            }
        } finally {
            releaseSharedMutationLock();
        }
    }
});
```

When the file also mutates `KALTCODE_CONFIG_DIR`, restore it with the same `undefined`-aware delete/assign rule before deleting the temp directory.

- [ ] **Step 4: Ensure mock.restore() happens before lock release**

For files with `mock.module()` or `mock.restore()`, use:

```typescript
afterEach(() => {
    try {
        mock.restore();
        // existing env/global/temp cleanup follows
    } finally {
        releaseSharedMutationLock();
    }
});
```

- [ ] **Step 5: Run critical tests**

Run:

```bash
bun test scripts/no-telemetry-growthbook-stub.test.ts src/integrations/discoveryService.test.ts src/utils/knowledgeGraph.test.ts src/utils/knowledgeGraph.stress.test.ts src/utils/storage/SQLiteProvider.test.ts
```

Expected: all targeted tests pass.

- [ ] **Step 6: Commit**

Run:

```bash
git add scripts/no-telemetry-growthbook-stub.test.ts src/integrations/discoveryService.test.ts src/utils/knowledgeGraph.test.ts src/utils/knowledgeGraph.stress.test.ts src/utils/storage/SQLiteProvider.test.ts src/utils/storage/SQLiteMasterpiece.test.ts vscode-extension/kalt-code-vscode/src/extension.test.js
git commit -m "test: isolate critical smoke mutation tests"
```

## Task 6: Bulk Lock Integration For Listed Test Files

**Files:**
- Modify: every named test file in the user task under `src/commands`, `src/components`, `src/constants`, `src/cost-tracker.cacheIntegration.test.ts`, `src/entrypoints`, `src/hooks`, `src/ink`, `src/integrations`, `src/services`, `src/tools`, `src/utils`, `tests/sdk`, and `vscode-extension/kalt-code-vscode/src/extension.test.js`.

- [ ] **Step 1: Add imports to files without the lock**

For each file that mutates process-global state and does not already import the lock, add:

```typescript
import {
    acquireSharedMutationLock,
    releaseSharedMutationLock,
} from "<relative path to src/test/sharedMutationLock.js>";
```

Use these common relative paths:

- `src/commands/*/*.test.ts`: `../../test/sharedMutationLock.js`
- `src/commands/*.test.ts`: `../test/sharedMutationLock.js`
- `src/components/*.test.tsx`: `../test/sharedMutationLock.js`
- `src/components/design-system/*.test.tsx`: `../../test/sharedMutationLock.js`
- `src/services/*/*.test.ts`: `../../test/sharedMutationLock.js`
- `src/tools/*/*.test.ts`: `../../test/sharedMutationLock.js`
- `src/tools/WebSearchTool/providers/*.test.ts`: `../../../test/sharedMutationLock.js`
- `src/utils/*.test.ts`: `../test/sharedMutationLock.js`
- `src/utils/model/*.test.ts`: `../../test/sharedMutationLock.js`
- `src/utils/plugins/*.test.ts`: `../../test/sharedMutationLock.js`
- `tests/sdk/*.test.ts`: `../../src/test/sharedMutationLock.js`

- [ ] **Step 2: Convert setup to async and lock first**

Use this shape:

```typescript
beforeEach(async () => {
    await acquireSharedMutationLock("path/from/repo-root.test.ts");
    // existing setup follows unchanged
});
```

If a file only has `beforeAll`/`afterAll` env setup, convert that global mutation to a locked `beforeEach`/`afterEach` unless the test file needs one shared fixture. For one shared fixture, acquire in `beforeAll` and release in `afterAll` with a boolean guard.

- [ ] **Step 3: Restore process.env values correctly**

For every env key assigned in a file, capture original values at module scope:

```typescript
const originalEnv = {
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    CLAUDE_CONFIG_DIR: process.env.CLAUDE_CONFIG_DIR,
};
```

Restore using:

```typescript
function restoreEnvValue(key: keyof typeof originalEnv): void {
    const value = originalEnv[key];
    if (value === undefined) {
        delete process.env[key];
    } else {
        process.env[key] = value;
    }
}
```

- [ ] **Step 4: Restore globalThis properties correctly**

For files mutating `globalThis.fetch` or custom globals:

```typescript
const originalFetch = globalThis.fetch;
const originalMacro = (globalThis as { MACRO?: unknown }).MACRO;
```

Cleanup:

```typescript
globalThis.fetch = originalFetch;
if (originalMacro === undefined) {
    delete (globalThis as { MACRO?: unknown }).MACRO;
} else {
    (globalThis as { MACRO?: unknown }).MACRO = originalMacro;
}
```

- [ ] **Step 5: Keep mock cleanup before release**

Use this shape in every file that calls `mock.module()`:

```typescript
afterEach(() => {
    try {
        mock.restore();
        // env/global/temp cleanup
    } finally {
        releaseSharedMutationLock();
    }
});
```

- [ ] **Step 6: Run grouped tests**

Run:

```bash
bun test src/commands src/components src/constants src/cost-tracker.cacheIntegration.test.ts src/entrypoints src/hooks src/ink src/integrations
```

Expected: grouped tests pass.

Run:

```bash
bun test src/services src/tools src/utils tests/sdk vscode-extension/kalt-code-vscode/src/extension.test.js
```

Expected: grouped tests pass.

- [ ] **Step 7: Commit**

Run:

```bash
git add src tests scripts vscode-extension/kalt-code-vscode/src/extension.test.js
git commit -m "test: serialize shared global mutations"
```

## Task 7: SDK Query Predicate Waiting And Env Isolation

**Files:**
- Modify: `tests/sdk/query-happy-path.test.ts`
- Modify: `tests/sdk/query-lifecycle.test.ts`
- Modify: `tests/sdk/helpers/query-test-doubles.ts`
- Modify: `tests/sdk/engine-mutators.test.ts`
- Modify: `tests/sdk/mcp-cleanup.test.ts`
- Modify: `tests/sdk/query-methods.test.ts`
- Modify: `tests/sdk/tool-schema-cache.test.ts`

- [ ] **Step 1: Add lock to SDK env mutating tests**

Use this import in each affected SDK test:

```typescript
import {
  acquireSharedMutationLock,
  releaseSharedMutationLock,
} from '../../src/test/sharedMutationLock.js'
```

Use this setup/cleanup for `ANTHROPIC_API_KEY`:

```typescript
const AUTH_KEY = 'ANTHROPIC_API_KEY'
const originalAuthKey = process.env[AUTH_KEY]

beforeEach(async () => {
  await acquireSharedMutationLock('tests/sdk/query-happy-path.test.ts')
  process.env[AUTH_KEY] = 'sk-test-happy-path-stub'
})

afterEach(() => {
  try {
    if (originalAuthKey === undefined) {
      delete process.env[AUTH_KEY]
    } else {
      process.env[AUTH_KEY] = originalAuthKey
    }
  } finally {
    releaseSharedMutationLock()
  }
})
```

Adjust the file name and stub value per file.

- [ ] **Step 2: Add a shared wait helper for SDK query output if fixed sleeps remain**

In `tests/sdk/helpers/query-test-doubles.ts`, add:

```typescript
export async function waitForCondition<T>(
  read: () => T,
  predicate: (value: T) => boolean,
  timeoutMs = 2500,
): Promise<T> {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    const value = read()
    if (predicate(value)) return value
    await Bun.sleep(10)
  }
  throw new Error(`Timed out after ${timeoutMs}ms waiting for condition`)
}
```

- [ ] **Step 3: Replace fixed sleeps in SDK tests**

Find fixed sleeps:

```bash
rg -n "Bun\\.sleep\\(" tests/sdk
```

Replace output-dependent sleeps with `waitForCondition`. For example:

```typescript
const output = await waitForCondition(
  () => messages.map((message: any) => message?.type).join(","),
  value => value.includes("assistant") || value.includes("result"),
)
expect(output.length).toBeGreaterThan(0)
```

Keep a short sleep only when the test is explicitly verifying timer behavior rather than waiting for eventual output.

- [ ] **Step 4: Run SDK tests**

Run:

```bash
bun test tests/sdk/query-happy-path.test.ts tests/sdk/query-lifecycle.test.ts tests/sdk/engine-mutators.test.ts tests/sdk/mcp-cleanup.test.ts tests/sdk/query-methods.test.ts tests/sdk/tool-schema-cache.test.ts
```

Expected: all targeted SDK tests pass.

- [ ] **Step 5: Commit**

Run:

```bash
git add tests/sdk
git commit -m "test: isolate sdk query globals"
```

## Task 8: Additional Leak Search And Fixes

**Files:**
- Modify: any additional test file found by this task with the same leak patterns.

- [ ] **Step 1: Search for unlocked env mutations**

Run:

```bash
rg -l "process\\.env\\.[A-Z0-9_]+\\s*=|delete process\\.env" src tests scripts vscode-extension/kalt-code-vscode/src -g '*.test.ts' -g '*.test.tsx' -g '*.test.js' | while read -r file; do rg -q "acquireSharedMutationLock|acquireEnvMutex" "$file" || echo "$file"; done
```

Expected: no output, except files that only read env or run isolated child processes with local env objects.

- [ ] **Step 2: Search for unlocked mock modules**

Run:

```bash
rg -l "mock\\.module\\(" src tests scripts vscode-extension/kalt-code-vscode/src -g '*.test.ts' -g '*.test.tsx' -g '*.test.js' | while read -r file; do rg -q "acquireSharedMutationLock" "$file" || echo "$file"; done
```

Expected: no output. Every Bun module mock is either protected by the shared lock or consciously moved into a test-specific isolated import pattern.

- [ ] **Step 3: Search for fixed sleeps**

Run:

```bash
rg -n "Bun\\.sleep\\(" src tests scripts -g '*.test.ts' -g '*.test.tsx'
```

Expected: remaining fixed sleeps are timer-behavior tests, not arbitrary waits for output or side effects.

- [ ] **Step 4: Fix each additional leak with the same pattern**

For each additional file, apply the same import, `beforeEach(async)`, env/global/mock cleanup, and release-in-`finally` patterns from Task 6. Add the file to the next commit.

- [ ] **Step 5: Commit additional leak fixes**

Run:

```bash
git add src tests scripts vscode-extension/kalt-code-vscode/src
git commit -m "test: cover additional global mutation leaks"
```

If Task 8 finds no additional changes, skip this commit.

## Task 9: Final Validation

**Files:**
- Validate: entire repository

- [ ] **Step 1: Build**

Run:

```bash
bun run build
```

Expected: CLI and SDK bundles build successfully, SDK React/Ink leakage check passes, external list validation passes.

- [ ] **Step 2: Full test suite at default concurrency**

Run:

```bash
bun test
```

Expected: all tests pass. If failures expose additional leak patterns, return to Task 8 and fix them before rerunning this command.

- [ ] **Step 3: Full test suite sequential**

Run:

```bash
bun test --max-concurrency=1
```

Expected: all tests pass. If failures expose order-dependent state, fix the leaking file and rerun this command.

- [ ] **Step 4: Smoke suite**

Run:

```bash
bun run smoke
```

Expected: build succeeds and `node dist/cli.mjs --version` succeeds.

- [ ] **Step 5: Spot checks**

Run:

```bash
bun test src/integrations/discoveryService.test.ts
bun test src/services/api/openaiShim.test.ts
bun test scripts/no-telemetry-growthbook-stub.test.ts
bun test tests/sdk/query-happy-path.test.ts tests/sdk/query-lifecycle.test.ts
```

Expected: every spot check passes.

- [ ] **Step 6: Final status**

Run:

```bash
git status --short
git log --oneline -5
```

Expected: only intentional changes remain, and the recent commits correspond to the task checkpoints.
