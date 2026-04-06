// In its own file to avoid circular dependencies
export const FILE_EDIT_TOOL_NAME = 'Edit'

// Permission pattern for granting session-level access to the project's .kalt-code/ folder
export const KALT_CODE_FOLDER_PERMISSION_PATTERN = '/.kalt-code/**'

// Permission pattern for granting session-level access to the global ~/.kalt-code/ folder
export const GLOBAL_KALT_CODE_FOLDER_PERMISSION_PATTERN = '~/.kalt-code/**'

export const FILE_UNEXPECTEDLY_MODIFIED_ERROR =
  'File has been unexpectedly modified. Read it again before attempting to write it.'
