export function buildAgentInstruction(query: string, corpusName?: string): string {
  const scope = corpusName ? `Search only in the "${corpusName}" knowledge base.` : 'Search across the available knowledge bases.'
  return `${query}\n\n(${scope} Use the knowledge_search tool and answer only from retrieved knowledge. Mention source names or document titles naturally when useful, but do not add raw numeric citations like [1], [2], or [3, 7] unless the user explicitly asks for numbered references.)`
}
