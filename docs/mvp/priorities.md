# MVP Priorities

Seshat already has broad functionality.

The priority is now depth, correctness, isolation, reliability, evaluation,
grounding, observability and UI polish.

## P0 Product Priorities

1. Finish Chat as the main product surface.
2. Ensure Workspace Chat sessions are bound to `user_id`.
3. Ensure Workspace Chat sessions are bound to `organization_id`.
4. Verify ownership before cache hits.
5. Verify ownership before resume.
6. Verify ownership in turn persistence.
7. Add cross-user and cross-organization tests.
8. Add single-flight protection for concurrent session turns.

## P0 Runtime Priorities

1. Fix critical memory correctness issues.
2. Define and enforce concurrent session lifecycle.
3. Ensure tool execution preserves metadata.
4. Keep permission behavior fail-closed where needed.
5. Strengthen restart/resume behavior.

## P1 Chat Priorities

1. Unified source format for Knowledge, Web, attachments and MCP.
2. Context budgeting.
3. Tool selection evals.
4. Attachments plus Knowledge in the same turn.
5. Provider/model switching tests.
6. Async session title generation.
7. Error taxonomy.
8. Product metrics and traces.
9. Persistence enrichment:
   - provider
   - model
   - token usage
   - finish reason
   - latency
   - tool names
   - source IDs
   - error class

## P1 Knowledge Priorities

1. Retrieval eval suite.
2. Recall@K.
3. MRR.
4. NDCG.
5. Reranker evaluation.
6. Query rewriting.
7. Deduplication.
8. Source provenance.
9. Page citations.
10. Ingestion versioning.
11. Stale chunk cleanup.
12. Incremental connector sync.
13. ACL sync tests.
14. Large corpus performance.

## Do Not Prioritize Now

Avoid spending MVP time on:

- new vector stores
- new specialized agents
- new Inbox channels
- new workflow nodes
- rare providers
- nice-to-have tools
- any automation or scheduling work in SeshatOS (it is SeshatCloud's)
- Team/Companion expansion

## Success Criteria

The important milestone is not:

```text
Seshat has many tools.
```

The important milestone is:

```text
An end user can ask a free-form question. Seshat chooses between conversation,
attachments, Knowledge, Web, MCP and subagents, gives a grounded answer, keeps
the session isolated, and does not mix data between users or organizations.
```

