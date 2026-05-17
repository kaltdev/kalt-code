# Smoke Test Isolation Hardening Design

Date: 2026-05-17

## Purpose

Smoke stability is currently vulnerable to tests that mutate process-global state without complete setup and teardown isolation. The hardening work will make test behavior deterministic at normal Bun concurrency, forced sequential execution, and smoke validation.

The implementation will apply the requested isolation patterns to the named files and will also fix additional files found during validation when they have the same leakage classes: `process.env`, `globalThis`, `mock.module`, SDK env mutex state, temporary config directories, persistent knowledge graph state, or fixed sleep-based async waits.

## Scope

In scope:

- Refactor SDK environment mutex internals into an isolated state factory.
- Convert build-time feature flag source transforms to a Bun build plugin applied to both CLI and SDK builds.
- Harden knowledge graph and SQLite cleanup paths so partial cleanup failures do not preserve unrelated backend state or throw during reset.
- Add shared mutation lock usage and correct restoration to the requested test files.
- Fix additional same-pattern test leaks discovered by search or validation.
- Replace fixed async sleeps in SDK query tests with predicate-based waiting where the test depends on eventual output.
- Run the requested validation sequence before reporting completion.

Out of scope:

- Broad test harness serialization.
- Large production refactors unrelated to cleanup or isolation.
- Changing product behavior beyond cleanup/reset robustness and build preprocessing mechanics.

## Existing Context

The repository already has `src/test/sharedMutationLock.ts`, using a `Symbol.for("kaltcode.sharedMutationLock")` global state to serialize tests that mutate process globals. Several test files already use it, but many files still mutate globals without acquiring it first or release it before all cleanup is complete.

`scripts/build.ts` already uses Bun plugins for stubs and bundle shims. The current file does not show explicit `preProcessFeatureFlags()` or `restoreModifiedFiles()` functions, so implementation will first locate any remaining source-transform logic and migrate only real in-place preprocessing if present. The target shape is a `BunPlugin` with `build.onLoad({ filter: /\.tsx?$/ })` returning transformed contents and a TypeScript-compatible loader.

The requested VS Code extension path appears to be `vscode-extension/kalt-code-vscode/src/extension.test.js` in this checkout.

## Architecture

### Shared Mutation Lock Usage

Each test file that mutates process-global state will acquire `acquireSharedMutationLock(fileName)` as the first statement of its outer `beforeEach`. Cleanup will restore local state inside a `try` block and call `releaseSharedMutationLock()` in a `finally` block.

When temporary directories are involved, removal will happen inside the cleanup chain before lock release. This avoids a window where another test can observe stale config state.

### Environment Restoration

Files that assign `process.env` keys will capture original values at module scope. Cleanup will restore by deleting keys that were originally `undefined`, otherwise assigning the original string value. The implementation will avoid `process.env.KEY = undefined` because it leaves a string-like environment entry in Node-compatible runtimes.

### Global Object Restoration

Files that replace `globalThis` properties, such as `fetch` or custom globals, will capture originals at module scope and restore them before releasing the shared mutation lock. Optional properties that were originally absent will be deleted.

### Mock Module Isolation

Files using `mock.module()` will run `mock.restore()` before releasing the shared lock. Where module mocks are currently installed at module scope, the implementation will either move them into locked setup or ensure the file is serialized before those mocks can affect other tests, choosing the smallest change that keeps test semantics intact.

### SDK Mutex Isolation

`src/entrypoints/sdk/shared.ts` will introduce a `createEnvMutexState()` factory for queue and locked state. The existing global `acquireEnvMutex`, `releaseEnvMutex`, and `resetEnvMutexForTesting` exports will continue to operate on one global state instance.

`createEnvMutexForTesting()` will return fresh `acquireEnvMutex` and `releaseEnvMutex` functions backed by a new independent state. Timeout behavior tests will use this factory instead of resetting or locking the global SDK mutex.

### Build Feature Flag Preprocessing

Feature flag preprocessing will run through a Bun build plugin instead of modifying files on disk. The plugin will load `.ts` and `.tsx` source, apply the existing feature flag transform logic, and return transformed contents. It will be included in both the CLI and SDK `plugins` arrays so the two bundles cannot drift.

If no in-place preprocessing exists in this checkout, the implementation will keep the build non-mutating and avoid inventing dead code. The final build must still pass.

### Knowledge Graph Cleanup

`resetGlobalGraph()` will attempt SQLite, JSON, and Orama cleanup independently. A SQLite failure must not prevent JSON or Orama cleanup from running. Provider connections will be closed before deleting database files, including WAL and SHM sidecars, so Windows-style path and file-handle behavior is less fragile.

Cleanup will clear in-memory graph and Orama state after backend cleanup attempts. Warnings will identify failed backend cleanup without throwing during reset.

### SQLite Reset Robustness

`SQLiteProvider.reset()` will close any open database handle, attempt to remove the main DB and sidecars, and return a boolean reflecting cleanup success without throwing. Self-heal and init paths will tolerate empty, corrupt, or partial files by closing handles and recreating state where possible, otherwise falling back to JSON-backed behavior.

Tests that exercise SQLite persistence will use isolated config directories and project paths so persistence does not leak between tests.

### Predicate-Based Waiting

SDK query tests that currently wait with fixed `Bun.sleep()` before checking output will switch to a small polling helper. The helper will read the latest output, normalize it as the test already does, and return when a predicate matches or throw a timeout error with enough context to debug.

## Implementation Order

1. Infrastructure: SDK mutex factory, build plugin migration, knowledge graph cleanup, SQLite reset hardening.
2. Critical non-standard files: SDK mutex timeout tests, growthbook stub test, knowledge graph tests, discovery service tests, and VS Code extension test path correction.
3. Bulk lock integration in the requested order: commands, components, services, tools, utilities, SDK, and VS Code extension.
4. Additional same-pattern leak fixes found by search or validation.
5. Final validation sequence.

## Validation

Commands will be run in this order:

```bash
bun run build
bun test
bun test --max-concurrency=1
bun run smoke
bun test src/integrations/discoveryService.test.ts
bun test src/services/api/openaiShim.test.ts
bun test scripts/no-telemetry-growthbook-stub.test.ts
bun test tests/sdk/query-happy-path.test.ts tests/sdk/query-lifecycle.test.ts
```

Expected final state is all tests passing with zero cross-test state leakage. If validation exposes additional leak patterns, those fixes are part of this scope and the affected validation step will be rerun before moving on.

## Risks And Mitigations

- Risk: moving module mocks can change import timing. Mitigation: preserve existing test import order where possible and only relocate mocks when required for process-global isolation.
- Risk: build plugin transforms can affect loaders for non-TS assets. Mitigation: scope the plugin to `.ts` and `.tsx` files and preserve existing text, native, and missing-module plugins.
- Risk: cleanup failures can hide behind broad `force` deletion. Mitigation: each backend cleanup will attempt independently and warn on failure, while still releasing locks.
- Risk: broad automated edits can damage unrelated tests. Mitigation: use targeted search and test-driven fixes, keeping edits within files that mutate shared state or fail validation.

## Acceptance Criteria

- Global state mutations happen only after acquiring the shared mutation lock in affected tests.
- Cleanup restores env, globals, mocks, and temp directories before releasing the lock.
- SDK timeout tests use isolated mutex instances.
- Build no longer relies on in-place source preprocessing.
- Knowledge graph and SQLite reset paths tolerate partial/corrupt state.
- The full requested validation sequence passes.
