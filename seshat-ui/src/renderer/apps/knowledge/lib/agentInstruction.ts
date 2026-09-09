export function buildAgentInstruction(query: string, corpusName?: string): string {
  const scope = corpusName ? `Search only in the "${corpusName}" knowledge base.` : 'Search across the available knowledge bases.'
  return `${query}\n\n(${scope} Use the knowledge_search tool and answer only from retrieved knowledge. Cite sources inline with bracketed numbers like [1], [2] matching the tool results.)`
}
