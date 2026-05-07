---
name: openclaw-agent-core
description: Use when working in admate-agent-core on AdMate Agent Core, Openclaw, Hermes, Sentinel Live Monitoring, Slack/Email alerts, operator_actions, audit_logs, users/permissions, Command Center Auth/DB/API, and LLM cost tracking.
---

# Openclaw Agent Core Skill

Use this skill for `admate-agent-core`.

## Required Reading

1. `AGENTS.md`
2. `README.md`
3. `docs/strategy/05_AdMate_Product_Map_v1.md`
4. `docs/strategy/06_AdMate_Agent_Core_Operating_Model_v1.md`
5. `docs/strategy/08_AdMate_Unified_Data_Learning_Governance_v1.md`
6. `docs/strategy/14_AdMate_Repo_Codex_Integration_Guide_v1.md`
7. `docs/design/openclaw-theme-reference.md`

If the Command Center is involved, also read:

```text
D:\Projects\AdMate\admate-docs\strategy\15_AdMate_Command_Center_Executive_Dashboard_PRD_v1.md
```

## Workflow

1. Inspect current auth, users, permissions, Supabase/Postgres, and API route structure.
2. Report candidate files, schema changes, risks, and test plan before editing.
3. Treat `admate-agent-core` as the source of truth for operational data, Auth, DB, APIs, permissions, and audit logs.
4. For Command Center work, design login/input/admin APIs here. Do not put operational DB ownership in `admate-homepage`.
5. Preserve Hermes learning governance:
   - trusted signals only
   - reviewer/admin approval for learning changes
   - smoke test data excluded from default learning
6. Record meaningful user/system actions in `operator_actions` or `audit_logs`.
7. Run build/test and report results.

## Non-negotiable Rules

- Do not output service role keys, Slack tokens, ingest keys, Meta tokens, SMTP passwords, n8n credentials, or LLM provider keys.
- Do not expose service role keys or ingest keys to the browser.
- Do not change DB schema without reporting migration impact first.
- Do not weaken user permissions or Hermes learning authority.
- Do not commit/push without user approval.

## Command Center Responsibilities

- project owner login/input flow
- weekly progress tables
- read-only API for `admate-homepage`
- update history
- audit log
- role-based edit permissions
