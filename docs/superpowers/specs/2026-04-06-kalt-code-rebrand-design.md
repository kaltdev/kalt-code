# Kalt Code Rebrand Design

Date: 2026-04-06
Status: Approved design, pending implementation

## Goal

Fully rebrand the project from the legacy project identity to `Kalt Code` and replace the legacy owner username with `kaltdev` across the entire repository, with no compatibility aliases left behind.

This includes branding text, commands, package names, environment variables, filenames, repository URLs, asset names, extension metadata, tests, comments, and generated or hidden checked-in files.

## Required Replacements

Apply the approved branding replacements everywhere they are semantically part of the project identity:

- Product display name -> `Kalt Code`
- Kebab-case product identifier -> `kalt-code`
- Upper snake-case product identifier -> `KALT_CODE`
- Snake-case product identifier -> `kalt_code`
- Owner username and URL segments -> `kaltdev`

## Scope

The rebrand covers:

- Documentation and markdown content
- Source files and test files
- CLI entrypoints and executable names
- Package metadata such as `name`, `bin`, `author`, `repository`, `homepage`, and `bugs`
- Environment variable names and configuration keys
- Persisted profile filenames and references
- VS Code extension metadata, commands, identifiers, labels, views, theme names, and asset paths
- CI/workflow labels, issue templates, PR templates, and badges
- HTML metadata such as `<title>`, Open Graph tags, and descriptions
- Docker or automation files if present
- Checked-in asset filenames that include the old brand

## Non-Goals

- No feature work
- No logic changes beyond what is required to keep renamed identifiers wired correctly
- No compatibility shims for old names unless an unremovable external constraint is discovered during implementation

## Recommended Approach

Use a single atomic rebrand on a dedicated branch.

Reasons:

- The user explicitly wants a full rename with no exceptions.
- Splitting branding from identifiers would leave the repo inconsistent.
- Compatibility aliases would conflict with the requirement to fully replace the old identity.

## Execution Plan

1. Inventory all path names and checked-in assets containing the old brand.
2. Rename files and directories that encode the legacy product identifier in their path.
3. Apply repository-wide text replacements for the approved mapping.
4. Perform targeted cleanup where direct replacement can produce invalid or incomplete results.
5. Run verification searches for old brand and owner references.
6. Run practical project checks to catch rename-related breakage.
7. Create a dedicated branch for the rebrand work and commit the finished change.

## Targeted Cleanup Areas

These locations need focused review after bulk replacement:

- npm package names and scopes
- CLI bin names and launch commands
- environment variable readers and writers
- persisted config/profile filenames
- links, badges, and repository metadata
- tests that assert exact branded strings
- VS Code extension IDs, command IDs, icon paths, and theme references
- any custom non-GitHub repository URLs that still need to point to the new repository identity

## Validation

Validation is complete only when all of the following are true:

- Zero occurrences remain for the legacy product identifiers in display, kebab-case, upper snake-case, and snake-case forms
- Zero occurrences remain for the old owner username
- Repository URLs point to `github.com/kaltdev/kalt-code` where GitHub URLs are expected
- Primary package metadata reflects the new name and owner
- README title shows `Kalt Code`
- LICENSE ownership text is updated if legally appropriate within the checked-in license text
- Renamed files, commands, variables, and extension metadata are internally consistent
- No import, path, or config breakage is introduced by renamed files or identifiers

## Risks

- Renaming commands, env vars, and profile filenames can break tests or internal wiring if any references are missed.
- Extension command IDs and asset paths can fail silently if metadata and files diverge.
- Some URLs may be custom-hosted mirrors rather than GitHub, so those need manual judgment instead of blind replacement.
- Legal or attribution text may require careful wording rather than a mechanical rename.

## Implementation Notes

- Preserve formatting and file structure while editing.
- Do not touch unrelated worktree changes.
- If an occurrence looks ambiguous between branding and functional data, prefer the explicit full-rebrand instruction and update it unless doing so would corrupt third-party data or syntax.

## Deliverables

- Fully rebranded repository content
- Verification evidence showing no stale brand or owner references remain
- Dedicated git branch for the rename
- Commit containing the completed rebrand
