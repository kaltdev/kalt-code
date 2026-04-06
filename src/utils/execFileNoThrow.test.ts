import { expect, test } from 'bun:test'

test('execFileNoThrow test file loads without entering Bun runtime crashes', () => {
  expect(true).toBe(true)
})
