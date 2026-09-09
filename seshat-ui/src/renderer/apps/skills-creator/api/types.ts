export type Skill = {
  name: string
  display_name: string
  description: string
  source: string
  collection: string
  version: string
  argument_hint: string
  is_hidden: boolean
  user_invocable: boolean
}

export type TreeNode = {
  name: string
  path: string
  is_dir: boolean
  children?: TreeNode[]
}

export type RepoInfo = {
  name: string
  url: string
  skill_count: number
}

export type CatalogEntry = {
  name: string
  url: string
  description: string
  installed: boolean
  // Present only for entries pulled from a connected seshat-server's org
  // registry - see internal/cloudskillregistry on the backend.
  source?: 'organization'
}
