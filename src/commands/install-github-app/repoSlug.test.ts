import assert from 'node:assert/strict'
import test from 'node:test'

import { extractGitHubRepoSlug } from './repoSlug.ts'

test('keeps owner/repo input as-is', () => {
  assert.equal(extractGitHubRepoSlug('kaltdev/kalt-code'), 'kaltdev/kalt-code')
})

test('extracts slug from https GitHub URLs', () => {
  assert.equal(
    extractGitHubRepoSlug('https://github.com/kaltdev/kalt-code'),
    'kaltdev/kalt-code',
  )
  assert.equal(
    extractGitHubRepoSlug('https://www.github.com/kaltdev/kalt-code.git'),
    'kaltdev/kalt-code',
  )
})

test('extracts slug from ssh GitHub URLs', () => {
  assert.equal(
    extractGitHubRepoSlug('git@github.com:kaltdev/kalt-code.git'),
    'kaltdev/kalt-code',
  )
  assert.equal(
    extractGitHubRepoSlug('ssh://git@github.com/kaltdev/kalt-code'),
    'kaltdev/kalt-code',
  )
})

test('rejects malformed or non-GitHub URLs', () => {
  assert.equal(extractGitHubRepoSlug('https://gitlab.com/kaltdev/kalt-code'), null)
  assert.equal(extractGitHubRepoSlug('https://github.com/kaltdev'), null)
  assert.equal(extractGitHubRepoSlug('not actually github.com/kaltdev/kalt-code'), null)
  assert.equal(
    extractGitHubRepoSlug('https://evil.example/?next=github.com/kaltdev/kalt-code'),
    null,
  )
  assert.equal(
    extractGitHubRepoSlug('https://github.com.evil.example/kaltdev/kalt-code'),
    null,
  )
  assert.equal(
    extractGitHubRepoSlug('https://example.com/github.com/kaltdev/kalt-code'),
    null,
  )
})
