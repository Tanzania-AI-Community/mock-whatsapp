# PR #27 merge readiness — 2026-10-20

Merged the current main branch into observe-mode. Kept main's API-route message
transport, concurrent sends, optimistic reconciliation, and local clear behavior.

Conflict resolutions:
- Replaced the deleted WhatsApp Server Action with the read-only guard in
  POST /api/inbound (HTTP 403 in observe mode).
- Kept server-side prefetch and passed the observed user ID on every API poll.
- Rejected missing/invalid observer IDs before any database query.
- Remounted the chat when the observed user changes to discard prior user state.
- Kept localhost binding for both dev commands.
- Included lib/*.test.ts in the regular test command.

Validation:
- Frozen dependency install passed.
- All 51 tests passed, including observe API scope and send-block regressions.
- Lint and TypeScript passed.
- Production build compiled with observe mode and dummy local service URLs.
  The packaging step initially failed because no public directory exists; the
  build script now copies that optional directory only when present.
- Formatting checked; corrected the existing provider import formatting issue.

No database migration is included: the schema maps the existing external
messages.user_id column. The connected database must already have that column.

Human verification remains: run pnpm observe with the intended database, select a
known user, confirm visible messages and no composer, refresh, then change users.
Run pnpm dev and confirm normal sending still works against the intended chatbot.
No visual inspection or live database/chatbot verification was performed.
