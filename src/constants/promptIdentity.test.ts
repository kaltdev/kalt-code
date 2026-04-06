import { afterEach, expect, test } from 'bun:test'

import { getSystemPrompt, DEFAULT_AGENT_PROMPT } from './prompts.js'
import { CLI_SYSPROMPT_PREFIXES, getCLISyspromptPrefix } from './system.js'
import { GENERAL_PURPOSE_AGENT } from '../tools/AgentTool/built-in/generalPurposeAgent.js'
import { EXPLORE_AGENT } from '../tools/AgentTool/built-in/exploreAgent.js'

const originalSimpleEnv = process.env.KALT_CODE_SIMPLE

afterEach(() => {
  process.env.KALT_CODE_SIMPLE = originalSimpleEnv
})

test('CLI identity prefixes describe Kalt Code instead of Kalt Code', () => {
  expect(getCLISyspromptPrefix()).toContain('Kalt Code')
  expect(getCLISyspromptPrefix()).not.toContain("Anthropic's official CLI for Claude")

  for (const prefix of CLI_SYSPROMPT_PREFIXES) {
    expect(prefix).toContain('Kalt Code')
    expect(prefix).not.toContain("Anthropic's official CLI for Claude")
  }
})

test('simple mode identity describes Kalt Code instead of Kalt Code', async () => {
  process.env.KALT_CODE_SIMPLE = '1'

  const prompt = await getSystemPrompt([], 'gpt-4o')

  expect(prompt[0]).toContain('Kalt Code')
  expect(prompt[0]).not.toContain("Anthropic's official CLI for Claude")
})

test('built-in agent prompts describe Kalt Code instead of Kalt Code', () => {
  expect(DEFAULT_AGENT_PROMPT).toContain('Kalt Code')
  expect(DEFAULT_AGENT_PROMPT).not.toContain("Anthropic's official CLI for Claude")

  const generalPrompt = GENERAL_PURPOSE_AGENT.getSystemPrompt({
    toolUseContext: { options: {} as never },
  })
  expect(generalPrompt).toContain('Kalt Code')
  expect(generalPrompt).not.toContain("Anthropic's official CLI for Claude")

  const explorePrompt = EXPLORE_AGENT.getSystemPrompt({
    toolUseContext: { options: {} as never },
  })
  expect(explorePrompt).toContain('Kalt Code')
  expect(explorePrompt).not.toContain("Anthropic's official CLI for Claude")
})
