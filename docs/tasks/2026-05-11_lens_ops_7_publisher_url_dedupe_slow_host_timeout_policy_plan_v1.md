# Lens Ops 7 Publisher URL Dedupe And Slow-Host Timeout Policy Plan v1

Date: 2026-05-11

## Status

Plan only. No implementation in this gate.

This document picks up the queue observation that was intentionally kept out of
Lens Ops 6 capture-abort UX:

- Slow Donga / Dong-A media can consume a large share of a GDN batch.
- Duplicate-looking YNA-like rows can be confused with a duplicate current
  request when older history rows are visible beside the new batch.

This plan covers publisher URL normalization, per-batch dedupe, history
interpretation, slow-host budgets, retry/fallback behavior, operator copy, and
verification. It does not alter cancel/abort behavior.

## Scope

Ownership for this gate is docs-only:

- Created this plan file only under `docs/tasks`.
- No product code, capture code, assets, golden PNGs, environment files,
  database schema, storage objects, capture runs, browser sessions, uploads,
  cleanup jobs, or authenticated workflows were changed or executed.

Out of scope:

- Capture abort UX, stop buttons, cancel confirmation, and runtime abort copy.
- Hard-kill browser/session controls.
- Storage cleanup for skipped, failed, or orphaned rows.
- Publisher-specific rendering fidelity changes.
- Live publisher capture proof.

## Observed Batch Behavior

The triggering operator observation had two separate failure modes:

- Donga / Dong-A was materially slower than neighboring GDN publishers in the
  same batch.
- YNA-like entries appeared duplicated in history, but the duplicate-looking
  display may have mixed the current request with older history rows.

The product problem is therefore not only "do not create duplicates." Operators
also need to see which rows belong to the current batch, which rows were
normalized together, and which rows were skipped by policy before they spend
time diagnosing a phantom duplicate.

## Current Baseline To Preserve

Existing behavior already includes useful guardrails that a future
implementation should preserve:

- Incoming publisher URLs are normalized to include an HTTP(S) scheme where
  needed.
- Server-side request creation dedupes normalized publisher URLs before row
  insertion.
- Batch execution tracks source URL keys to skip duplicate source URLs that
  still reach execution.
- Slow GDN batch handling can skip known slow hosts when the remaining
  per-capture budget is too low.
- Donga already has host-scoped lightweight lazy loading, navigation timeout,
  slot priority, and centered screenshot policy.

The next gate should make those rules easier to reason about and easier to
verify. It should not broaden host-specific capture heuristics without a
separate fidelity task.

## Canonical URL Policy

Create one shared publisher URL canonicalization contract for GDN batch inputs.

Canonicalization should be deterministic and visible in tests:

- Trim surrounding whitespace.
- Add `https://` when the operator enters a bare domain.
- Lowercase protocol and hostname.
- Normalize known default ports away: `:80` for HTTP and `:443` for HTTPS.
- Remove trailing slashes from non-root paths.
- Preserve root path as `/` for display if needed, but treat empty path and `/`
  as the same canonical key.
- Preserve meaningful path segments for article or section URLs.
- Sort query parameters only if product confirms order is not meaningful for
  supported publishers.
- Drop tracking-only query parameters by allowlist/denylist only after product
  approval. Candidate drop prefixes: `utm_`, `fbclid`, `gclid`, `wbraid`,
  `gbraid`.
- Do not merge `m.` and desktop hosts by default. Mobile and desktop publisher
  surfaces can be materially different ad inventory.
- Do not merge unrelated subdomains by registrable domain alone.

Recommended canonical key shape:

```text
<scheme>://<lowercase-host><normalized-path>?<approved-query>
```

Recommended display fields:

- `submittedUrl`: exactly what the operator submitted after trimming.
- `normalizedUrl`: URL sent to capture creation.
- `canonicalSourceKey`: dedupe key used within the batch.
- `displayHost`: host shown in history and batch grouping.

## Per-Batch Dedupe Policy

Per-batch dedupe should happen before row creation and remain guarded during
execution.

Creation-time dedupe:

- Deduplicate the canonical source key within a single submitted batch.
- Keep the first occurrence as the row that will be created.
- Record skipped duplicates in the API response so the UI can tell the
  operator what was ignored.
- Do not create failed rows for duplicates removed before insertion unless the
  product wants an auditable skipped-row history.

Execution-time dedupe:

- Keep a second guard inside batch execution because older rows, manual execute
  paths, or future API callers may bypass the creation surface.
- If execution sees a duplicate source key inside the same execution list, mark
  the later row as skipped/failed with the existing duplicate message and
  metadata code.
- The execution guard must be scoped to the current execution list, not global
  history.

Response contract proposal:

```json
{
  "createdCount": 3,
  "dedupedCount": 1,
  "dedupedPublisherUrls": [
    {
      "submittedUrl": "www.yna.co.kr/",
      "canonicalSourceKey": "https://www.yna.co.kr/",
      "keptUrl": "https://www.yna.co.kr/"
    }
  ]
}
```

The exact JSON shape can change, but the UI needs both a count and enough
sanitized detail to explain skipped duplicates.

## History Grouping And Batch Identity

Duplicate confusion should be solved in the history UI separately from dedupe.

Batch identity goal:

- Every row created from one submit action should share a visible batch group.
- The list should make it clear when an older YNA row is history, not a second
  row from the current request.

Recommended display model:

- Show a compact batch header for recently submitted multi-publisher batches.
- Include created time, channel, count, and a short batch id.
- Within the group, show row index such as `2 / 4`.
- Show duplicate/skipped rows in the group only if a row was actually persisted.
- Keep older history outside the current batch group even when host names match.

Batch id options:

- Best: persisted `batch_id` or equivalent metadata shared by rows created from
  the same request.
- Acceptable interim: client-generated request id returned by the POST response
  and stored in row metadata.
- Read-only fallback: group by exact `created_at` window plus POST response
  capture ids, but do not treat this as a durable identity.

Operator-facing history should not imply that same-host history rows are
duplicates unless they share the same batch id and canonical source key.

## Slow-Host Timeout Budget Policy

Slow-host handling should protect the whole batch while giving known slow media
a fair, bounded attempt.

Budget principles:

- Keep the serverless batch budget as the outer limit.
- Do not start a known slow host when the remaining budget cannot cover its
  host timeout plus result persistence margin.
- Keep per-host timeout policy in a single host-strategy module.
- Prefer skip-before-start over starting a capture that is likely to time out
  and block later rows.
- Treat known slow-host skip as an operator-facing policy result, not a generic
  runtime failure.

Proposed budget tiers:

- `normal`: default GDN publishers.
- `slow-known`: Donga / Dong-A and any future host with repeated batch delay.
- `isolated`: hosts that should be run alone or in a separate small batch.
- `excluded`: hosts that should not be attempted.

Initial Donga / Dong-A policy for a future implementation gate:

- Keep Donga in `slow-known`, not `excluded`.
- Require enough remaining budget for host navigation timeout plus at least
  10 seconds of capture/upload/DB margin before starting it.
- When the remaining budget is too low, skip before browser work starts and
  tell the operator to run that host separately.
- Do not lower screenshot quality, DPR, output dimensions, or ad slot fidelity
  to make the host fit a crowded batch.

## Retry And Fallback Behavior

Retry policy should distinguish slow-host budget decisions from transient
browser failures.

Recommended behavior:

- Do not retry a duplicate source URL inside the same batch.
- Do not retry a known slow host when it was skipped before start due to
  insufficient remaining budget.
- Retry only transient navigation/browser failures when enough batch budget
  remains after applying the same host budget gate.
- Do not fall back to Browserbase or another remote browser solely because a
  host is slow unless product approves the cost and side effects.
- If fallback is enabled in a later gate, it must inherit the same canonical URL
  key and batch id so history does not split into confusing duplicate groups.
- Mark final failure/skipped metadata with a machine-readable reason:
  `duplicate_source_url_in_batch`, `slow_host_budget_skip`,
  `slow_host_timeout`, or `transient_capture_retry_exhausted`.

Retry copy should avoid suggesting that retrying the same crowded batch is the
best answer for Donga. The preferred operator action is to run slow-known hosts
alone or in a smaller batch.

## Operator Copy

Korean copy candidates for future UI work:

Batch dedupe summary:

- `중복 URL 1개를 제외하고 캡처를 시작했습니다.`
- `같은 배치 안에서 동일한 게시자 URL은 한 번만 캡처합니다.`

Duplicate detail:

- `이번 배치의 중복 URL로 건너뛰었습니다.`
- `이전 기록의 같은 매체 행은 현재 배치 중복이 아닐 수 있습니다.`

Batch group:

- `이번 배치`
- `배치 ID`
- `4개 중 2번째`

Slow-host skip:

- `느린 매체는 남은 배치 시간이 부족해 시작하지 않았습니다.`
- `동아일보 계열 매체는 단독 또는 작은 배치로 다시 실행해 주세요.`

Slow-host timeout:

- `매체 로딩 시간이 초과되어 캡처하지 못했습니다.`
- `다른 매체 결과는 유지됩니다. 느린 매체만 따로 다시 시도해 주세요.`

The copy must not mention capture abort controls or imply that pressing cancel
is the normal remedy for known slow-host policy.

## Verification Plan

Docs gate validation:

- `git diff --check -- docs/tasks/2026-05-11_lens_ops_7_publisher_url_dedupe_slow_host_timeout_policy_plan_v1.md`
- `npm run verify:harness`, because this repo defines it as static harness
  validation through surface-registry and capture-metadata checks.

Future implementation gate, local/static:

- Unit-test canonical URL keys:
  - bare host becomes HTTPS.
  - scheme/host case folds.
  - root slash and empty path match.
  - non-root trailing slash is removed.
  - mobile and desktop hosts do not merge.
  - tracking query decisions match the approved policy.
- Unit-test creation-time dedupe with duplicate YNA-like input.
- Unit-test execution-time duplicate guard within one execution list.
- Unit-test that global history rows with the same host but different batch ids
  are not labeled as current-batch duplicates.
- Unit-test slow-known host budget skip when remaining budget is below the
  host threshold.
- Unit-test that slow-host skip does not invoke capture execution.
- Component-test batch group display, row index, dedupe summary, and slow-host
  operator copy.

Future human-gated proof:

- Use a controlled local/staging fixture before live publisher capture.
- Confirm exact publisher URLs, account/session, upload permission, and cleanup
  owner before any live run.
- Start with no-browser canonicalization and response-contract tests.
- Then run one small mocked or fixture-backed multi-URL batch.
- Only after separate approval, test one Donga / Dong-A URL alone and then in a
  two-row batch.

## No-Touch Boundaries

This plan does not authorize:

- Capture execution.
- Browser automation.
- Browserbase session creation or termination.
- Upload.
- Storage cleanup or deletion.
- DB/Auth mutation.
- Schema changes or new status enum.
- Golden PNG generation, promotion, or pixel validation.
- Asset/golden updates.
- Product code changes.
- Production authenticated workflows.
- Running cleanup scripts.

## Exit Criteria For Next Gate

The next implementation gate is ready only when:

- Product approves the canonical URL policy, especially query handling and
  whether mobile/desktop hosts stay separate.
- Product chooses whether pre-insert duplicates are response-only or persisted
  as skipped history rows.
- A durable batch identity approach is selected.
- Slow-known host tiers and minimum remaining-budget thresholds are approved.
- Retry/fallback rules are accepted without mixing them into capture-abort UX.
- Verification remains local/static until a human explicitly approves live
  capture, upload, DB mutation, or cleanup.
