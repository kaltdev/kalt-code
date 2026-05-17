import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import axios from 'axios'
import {
  acquireSharedMutationLock,
  releaseSharedMutationLock,
} from '../../test/sharedMutationLock.js'

const originalAxiosGet = axios.get
const originalEnv = {
  CLAUDE_CODE_USE_OPENAI: process.env.CLAUDE_CODE_USE_OPENAI,
  CLAUDE_CODE_USE_GEMINI: process.env.CLAUDE_CODE_USE_GEMINI,
  CLAUDE_CODE_USE_GITHUB: process.env.CLAUDE_CODE_USE_GITHUB,
}

function restoreEnv(key: keyof typeof originalEnv): void {
  const value = originalEnv[key]
  if (value === undefined) {
    delete process.env[key]
  } else {
    process.env[key] = value
  }
}

async function importFreshModule() {
  mock.restore()
  return import(`./utils.ts?ts=${Date.now()}-${Math.random()}`)
}

beforeEach(async () => {
  await acquireSharedMutationLock('WebFetchTool/domainCheck.test.ts')
  restoreEnv('CLAUDE_CODE_USE_OPENAI')
  restoreEnv('CLAUDE_CODE_USE_GEMINI')
  restoreEnv('CLAUDE_CODE_USE_GITHUB')
  axios.get = originalAxiosGet
})

afterEach(() => {
  try {
    mock.restore()
    restoreEnv('CLAUDE_CODE_USE_OPENAI')
    restoreEnv('CLAUDE_CODE_USE_GEMINI')
    restoreEnv('CLAUDE_CODE_USE_GITHUB')
    axios.get = originalAxiosGet
  } finally {
    releaseSharedMutationLock()
  }
})

describe('checkDomainBlocklist', () => {
  test('returns allowed without API call in OpenAI mode', async () => {
    process.env.CLAUDE_CODE_USE_OPENAI = '1'
    const actual = await import('../../utils/model/providers.js')
    mock.module('../../utils/model/providers.js', () => ({
      ...actual,
      getAPIProvider: () => 'openai',
      isFirstPartyAnthropicBaseUrl: () => false,
    }))
    const getSpy = mock(() =>
      Promise.resolve({ status: 200, data: { can_fetch: true } }),
    )
    axios.get = getSpy as typeof axios.get

    const { checkDomainBlocklist } = await importFreshModule()
    const result = await checkDomainBlocklist('example.com')

    expect(result.status).toBe('allowed')
    expect(getSpy).not.toHaveBeenCalled()
  })

  test('returns allowed without API call in Gemini mode', async () => {
    process.env.CLAUDE_CODE_USE_GEMINI = '1'
    const actual = await import('../../utils/model/providers.js')
    mock.module('../../utils/model/providers.js', () => ({
      ...actual,
      getAPIProvider: () => 'gemini',
      isFirstPartyAnthropicBaseUrl: () => false,
    }))
    const getSpy = mock(() =>
      Promise.resolve({ status: 200, data: { can_fetch: true } }),
    )
    axios.get = getSpy as typeof axios.get

    const { checkDomainBlocklist } = await importFreshModule()
    const result = await checkDomainBlocklist('example.com')

    expect(result.status).toBe('allowed')
    expect(getSpy).not.toHaveBeenCalled()
  })

  test('calls Anthropic domain check in first-party mode', async () => {
    delete process.env.CLAUDE_CODE_USE_OPENAI
    delete process.env.CLAUDE_CODE_USE_GEMINI
    delete process.env.CLAUDE_CODE_USE_GITHUB

    const actual = await import('../../utils/model/providers.js')
    mock.module('../../utils/model/providers.js', () => ({
      ...actual,
      getAPIProvider: () => 'firstParty',
      isFirstPartyAnthropicBaseUrl: () => true,
    }))
    const getSpy = mock(() =>
      Promise.resolve({ status: 200, data: { can_fetch: true } }),
    )
    axios.get = getSpy as typeof axios.get

    const { checkDomainBlocklist } = await importFreshModule()
    const result = await checkDomainBlocklist('example.com')

    expect(result.status).toBe('allowed')
    expect(getSpy).toHaveBeenCalledTimes(1)
  })
})
