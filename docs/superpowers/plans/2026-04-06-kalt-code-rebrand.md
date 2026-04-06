# Kalt Code Rebrand Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fully rebrand the repository from the legacy project identity to Kalt Code, rename all owner references to kaltdev, update path-based identifiers, and leave the codebase internally consistent with no stale references.

**Architecture:** This work is an atomic identity migration across repository paths, metadata, runtime-facing identifiers, and documentation. Start by renaming files and directories that embed the old brand, then update text references and code-level identifiers, then run targeted searches and project checks before creating the dedicated branch and final commit.

**Tech Stack:** Bun, TypeScript, Markdown, JSON, YAML, VS Code extension metadata, git

---

### Task 1: Create the rebrand branch and capture the rename inventory

**Files:**
- Modify: `docs/superpowers/plans/2026-04-06-kalt-code-rebrand.md`
- Inspect: `package.json`
- Inspect: `README.md`
- Inspect: the legacy VS Code extension package metadata before renaming

- [ ] **Step 1: Create the dedicated branch before code changes**

```bash
git checkout -b chore/kalt-code-rebrand
```

Expected: switch to a new branch named `chore/kalt-code-rebrand`

- [ ] **Step 2: Record all path-level items containing the old brand**

```bash
find . \
  \( -path './.git' -o -path './node_modules' -o -path './dist' -o -path './build' \) -prune -o \
  -print
```

Expected: a finite list including the legacy CLI entrypoint, legacy extension directory, and any branded assets

- [ ] **Step 3: Record all content references that must be cleared**

```bash
grep -RIn --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=build \
  -E 'Kalt Code|kalt-code|KALT_CODE|kalt_code|kaltdev' .
```

Expected: a list of source, docs, metadata, and tests that need updates

- [ ] **Step 4: Commit the branch creation checkpoint after inventory is understood**

```bash
git status --short
```

Expected: current branch is `chore/kalt-code-rebrand`; no implementation files changed yet besides tracked planning artifacts

### Task 2: Rename branded files, directories, and assets first

**Files:**
- Rename: prior CLI entrypoint -> `bin/kalt-code`
- Rename: prior extension directory -> `vscode-extension/kalt-code-vscode`
- Rename: prior theme asset -> `vscode-extension/kalt-code-vscode/themes/Kalt-Code-Terminal-Black.json`
- Rename: prior icon asset -> `vscode-extension/kalt-code-vscode/media/kalt-code.svg`

- [ ] **Step 1: Rename the CLI entrypoint**

```bash
test -f bin/kalt-code
```

Expected: `bin/kalt-code` exists and the previous CLI entrypoint no longer exists

- [ ] **Step 2: Rename the VS Code extension directory**

```bash
test -d vscode-extension/kalt-code-vscode
```

Expected: extension files now live under `vscode-extension/kalt-code-vscode`

- [ ] **Step 3: Rename branded theme and icon assets inside the extension**

```bash
test -f vscode-extension/kalt-code-vscode/themes/Kalt-Code-Terminal-Black.json
test -f vscode-extension/kalt-code-vscode/media/kalt-code.svg
```

Expected: old asset filenames are gone and new filenames exist

- [ ] **Step 4: Verify path renames before content edits**

```bash
find . \
  \( -path './.git' -o -path './node_modules' -o -path './dist' -o -path './build' \) -prune -o \
  -print
```

Expected: only content references remain; renamed tracked paths no longer appear

- [ ] **Step 5: Commit the path rename checkpoint**

```bash
git add bin/kalt-code vscode-extension/kalt-code-vscode
git commit -m "refactor: rename branded file paths to Kalt Code"
```

Expected: commit succeeds with renamed paths staged cleanly

### Task 3: Update repository metadata, docs, and owner URLs

**Files:**
- Modify: `package.json`
- Modify: `README.md`
- Modify: `LICENSE`
- Modify: `CONTRIBUTING.md`
- Modify: `SECURITY.md`
- Modify: `PLAYBOOK.md`
- Modify: `ANDROID_INSTALL.md`
- Modify: `docs/advanced-setup.md`
- Modify: `docs/non-technical-setup.md`
- Modify: `docs/quick-start-mac-linux.md`
- Modify: `docs/quick-start-windows.md`
- Modify: `.env.example`
- Modify: `.github/ISSUE_TEMPLATE/feature_request.md`
- Modify: `.github/ISSUE_TEMPLATE/bug_report.md`
- Modify: `.github/ISSUE_TEMPLATE/config.yml`
- Modify: `.github/pull_request_template.md`
- Modify: `.github/workflows/pr-checks.yml`

- [ ] **Step 1: Update root package metadata to the new package, bin, and repository identity**

```json
{
  "name": "@kaltdev/kalt-code",
  "bin": {
    "kalt-code": "./bin/kalt-code"
  },
  "repository": {
    "type": "git",
    "url": "https://github.com/kaltdev/kalt-code"
  }
}
```

Expected: `package.json` no longer references the legacy package or owner

- [ ] **Step 2: Update README branding, install commands, badges, and repo links**

```md
# Kalt Code

Kalt Code is an open-source coding-agent CLI for cloud and local model providers.

[![PR Checks](https://github.com/kaltdev/kalt-code/actions/workflows/pr-checks.yml/badge.svg?branch=main)](https://github.com/kaltdev/kalt-code/actions/workflows/pr-checks.yml)
[![Release](https://img.shields.io/github/v/tag/kaltdev/kalt-code?label=release&color=0ea5e9)](https://github.com/kaltdev/kalt-code/tags)
```

Expected: top-level docs consistently use Kalt Code and the new GitHub repo

- [ ] **Step 3: Update install and clone examples everywhere**

```bash
npm install -g @kaltdev/kalt-code
git clone https://github.com/kaltdev/kalt-code.git
cd kalt-code
kalt-code
```

Expected: docs no longer instruct users to install, clone, or launch any legacy-branded artifact

- [ ] **Step 4: Update owner references in license, contributing, security, and templates**

```text
Copyright (c) 2026 kaltdev contributors
https://github.com/kaltdev/kalt-code/issues
https://github.com/kaltdev/kalt-code/discussions
```

Expected: visible owner and support channels reference `kaltdev`

- [ ] **Step 5: Commit the metadata and docs checkpoint**

```bash
git add package.json README.md LICENSE CONTRIBUTING.md SECURITY.md PLAYBOOK.md ANDROID_INSTALL.md docs .env.example .github
git commit -m "docs: rebrand metadata and documentation to Kalt Code"
```

Expected: commit succeeds with metadata and docs updated

### Task 4: Update runtime identifiers, source strings, and tests

**Files:**
- Modify: `src/constants/system.ts`
- Modify: `src/constants/prompts.ts`
- Modify: `src/constants/promptIdentity.test.ts`
- Modify: `src/utils/attribution.ts`
- Modify: `src/utils/buildConfig.ts`
- Modify: `src/utils/providerProfile.ts`
- Modify: `src/utils/envUtils.ts`
- Modify: `src/utils/providerFlag.ts`
- Modify: `src/utils/githubModelsCredentials.ts`
- Modify: `src/utils/gracefulShutdown.ts`
- Modify: `src/services/api/codexShim.ts`
- Modify: `src/services/api/codexUsage.ts`
- Modify: `src/tools/WebSearchTool/WebSearchTool.ts`
- Modify: `src/tools/AgentTool/built-in/exploreAgent.ts`
- Modify: `src/tools/AgentTool/built-in/generalPurposeAgent.ts`
- Modify: `src/components/StartupScreen.ts`
- Modify: `src/components/Feedback.tsx`
- Modify: `src/commands/provider/provider.tsx`
- Modify: `src/entrypoints/cli.tsx`
- Modify: `src/entrypoints/mcp.ts`
- Modify: `scripts/build.ts`
- Modify: `scripts/no-telemetry-plugin.ts`
- Modify: `scripts/provider-recommend.ts`
- Modify: `scripts/system-check.ts`
- Modify: test files under `src/**` and `scripts/**`

- [ ] **Step 1: Update runtime-facing product strings and prompts**

```ts
`You are Kalt Code, an open-source fork of Claude Code.`
`You are an agent for Kalt Code, an open-source fork of Claude Code.`
```

Expected: startup messaging, system prompts, attribution text, and tool prompts reference `Kalt Code`

- [ ] **Step 2: Rename command, profile file, env vars, and originator identifiers**

```ts
export const PROFILE_FILE_NAME = '.kalt-code-profile.json'

process.env.KALT_CODE_DISABLE_CO_AUTHORED_BY
process.env.KALT_CODE_PROFILE_GOAL
process.env.KALT_CODE_ENABLE_EXTENDED_KEYS
process.env.KALT_CODE_USE_READABLE_STDIN

headers.originator ??= 'kalt-code'
```

Expected: code no longer reads or writes any legacy-prefixed env vars, legacy dotfiles, or legacy originator values

- [ ] **Step 3: Update CLI/help text and startup screen labels**

```ts
lines.push('Restart Kalt Code to use it.')
out.push(`  ${DIM}${rgb(...DIMCOL)}kalt-code ${RESET}${rgb(...ACCENT)}v${MACRO.DISPLAY_VERSION ?? MACRO.VERSION}${RESET}`)
```

Expected: terminal-visible text and resume commands reference `kalt-code`

- [ ] **Step 4: Update exact-string tests to match renamed identifiers**

```ts
test('CLI identity prefixes describe Kalt Code instead of Claude Code', () => {
  expect(getCLISyspromptPrefix()).toContain('Kalt Code')
})

assert.equal(extractGitHubRepoSlug('kaltdev/kalt-code'), 'kaltdev/kalt-code')
```

Expected: tests assert the new product and repository identity instead of the old one

- [ ] **Step 5: Commit the runtime and test rename checkpoint**

```bash
git add src scripts
git commit -m "refactor: rename runtime identifiers to Kalt Code"
```

Expected: source and tests are committed with matching identifiers

### Task 5: Update the VS Code extension metadata and identifiers

**Files:**
- Modify: `vscode-extension/kalt-code-vscode/package.json`
- Modify: `vscode-extension/kalt-code-vscode/README.md`
- Modify: `vscode-extension/kalt-code-vscode/themes/Kalt-Code-Terminal-Black.json`
- Modify: extension source files under `vscode-extension/kalt-code-vscode/src` if present

- [ ] **Step 1: Rename the extension package and display metadata**

```json
{
  "name": "kalt-code-vscode",
  "displayName": "Kalt Code",
  "description": "Practical VS Code companion for Kalt Code with project-aware launch behavior and a real Control Center."
}
```

Expected: extension metadata shows the new product name

- [ ] **Step 2: Rename command IDs, view IDs, categories, and asset paths**

```json
{
  "activationEvents": [
    "onCommand:kalt-code.start",
    "onView:kalt-code.controlCenter"
  ],
  "contributes": {
    "viewsContainers": {
      "activitybar": [
        {
          "id": "kalt-code",
          "title": "Kalt Code",
          "icon": "media/kalt-code.svg"
        }
      ]
    }
  }
}
```

Expected: extension command and view identifiers align with renamed paths and assets

- [ ] **Step 3: Update extension README and theme naming**

```md
# Kalt Code VS Code Extension
```

```json
{
  "name": "Kalt Code Terminal Black"
}
```

Expected: extension docs and theme labels no longer mention the legacy project name

- [ ] **Step 4: Commit the extension checkpoint**

```bash
git add vscode-extension/kalt-code-vscode
git commit -m "refactor: rebrand VS Code extension to Kalt Code"
```

Expected: extension metadata, assets, and docs are committed together

### Task 6: Run verification searches and project checks

**Files:**
- Verify: repository-wide search results
- Verify: `package.json`
- Verify: `README.md`
- Verify: `vscode-extension/kalt-code-vscode/package.json`

- [ ] **Step 1: Prove old brand strings are gone**

```bash
grep -RIn --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=build \
  -E 'Kalt Code|kalt-code|KALT_CODE|kalt_code|kaltdev' .
```

Expected: no output

- [ ] **Step 2: Prove GitHub repo URLs point at the new repository**

```bash
grep -RIn --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=build \
  'github.com/kaltdev/kalt-code' .
```

Expected: output shows README, metadata, templates, and source links using the new repo URL

- [ ] **Step 3: Run focused project checks for rename-induced breakage**

```bash
bun test src/constants/promptIdentity.test.ts src/commands/install-github-app/repoSlug.test.ts
```

Expected: PASS

- [ ] **Step 4: Run one broader validation command**

```bash
bun test
```

Expected: PASS, or a documented pre-existing failure unrelated to the rename

- [ ] **Step 5: Inspect final worktree state**

```bash
git status --short
```

Expected: only intended rebrand changes are present

### Task 7: Final commit and handoff

**Files:**
- Modify: all staged rebrand files

- [ ] **Step 1: Create the final atomic rebrand commit**

```bash
git add .
git commit -m "refactor: complete Kalt Code rebrand"
```

Expected: final commit captures the complete repository-wide rebrand

- [ ] **Step 2: Capture the final branch and commit identifiers for handoff**

```bash
git branch --show-current
git log --oneline -1
```

Expected: output shows branch `chore/kalt-code-rebrand` and the final rebrand commit hash

- [ ] **Step 3: Summarize validation evidence for the user**

```text
Zero stale legacy brand or owner matches remain.
Root package metadata points to @kaltdev/kalt-code.
README title is Kalt Code.
Repository URLs point to github.com/kaltdev/kalt-code.
```

Expected: handoff includes the branch name, final commit, verification status, and any residual caveats
