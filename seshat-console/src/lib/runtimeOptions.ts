export const permissionModeOptions = [
  { value: '', label: 'Default' },
  { value: 'onRequest', label: 'On Request' },
  { value: 'never', label: 'Never' },
  { value: 'auto', label: 'Auto' },
  { value: 'acceptEdits', label: 'Accept Edits' },
  { value: 'bypass', label: 'Bypass' },
  { value: 'granular', label: 'Granular' },
]

export const isolationModeOptions = [
  { value: '', label: 'Default' },
  { value: 'worktree', label: 'Worktree' },
  { value: 'chroot', label: 'Chroot' },
]

export const memoryTypeOptions = [
  { value: 'fact', label: 'Fact' },
  { value: 'preference', label: 'Preference' },
  { value: 'instruction', label: 'Instruction' },
  { value: 'pattern', label: 'Pattern' },
  { value: 'context', label: 'Context' },
]
