# SupplySignal Engineering Rules

These rules apply permanently across the repository:

- Preserve an evidence-first architecture; the database is the system of record.
- Never invent customer relationships. Store and use only explicit customer/master data.
- Customer access is membership-based. Reviewers have no global customer access; only `ADMIN` has platform-wide access.
- In future source phases, always preserve original source URLs and source metadata.
- Validate every structured AI output against an explicit schema before use.
- High-impact intelligence requires human review in V1.
- Prefer deterministic business rules over LLM reasoning wherever practical.
- Never create fake UI functionality. Every visible action must work or be explicitly unavailable.
- Never commit secrets; use validated environment configuration.
- Before completing work, run tests, typecheck, lint, and the production build and fix all failures.
- Do not implement future phases unless the user explicitly requests them.
