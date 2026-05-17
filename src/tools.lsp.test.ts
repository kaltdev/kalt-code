import { afterEach, beforeEach, expect, mock, test } from 'bun:test'
import {
  acquireSharedMutationLock,
  releaseSharedMutationLock,
} from './test/sharedMutationLock.js'
import { getEmptyToolPermissionContext } from './Tool.js'

let lspConnected = false

beforeEach(async () => {
  await acquireSharedMutationLock('tools.lsp.test.ts')
  lspConnected = false
  mock.module('./services/lsp/manager.js', () => ({
    _resetLspManagerForTesting: () => {},
    getInitializationStatus: () => ({ status: 'success' }),
    initializeLspServerManager: () => {},
    getLspServerManager: () => undefined,
    isLspConnected: () => lspConnected,
    reinitializeLspServerManager: () => {},
    shutdownLspServerManager: async () => {},
    waitForInitialization: async () => {},
  }))
})

afterEach(() => {
  try {
    mock.restore()
  } finally {
    releaseSharedMutationLock()
  }
})

async function importToolsForTest() {
  return import(`./tools.js?lsp-test=${Date.now()}-${Math.random()}`)
}

test('LSPTool is part of the base tool pool', async () => {
  const { getAllBaseTools } = await importToolsForTest()
  expect(getAllBaseTools().map(tool => tool.name)).toContain('LSP')
})

test('LSPTool is filtered from usable tools until a server is connected', async () => {
  const { getTools } = await importToolsForTest()
  const permissionContext = getEmptyToolPermissionContext()

  expect(getTools(permissionContext).map(tool => tool.name)).not.toContain('LSP')

  lspConnected = true

  expect(getTools(permissionContext).map(tool => tool.name)).toContain('LSP')
})
