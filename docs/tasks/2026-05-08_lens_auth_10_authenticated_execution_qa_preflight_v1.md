# Gate Lens-Auth-10 Authenticated Execution QA Preflight v1

Date: 2026-05-08
Repo: `admate-lens`
Product: AdMate Lens
Scope: preflight review only

## 1. Goal

Confirm the final preconditions for authenticated AdMate Lens capture flow QA before any real login, upload, capture request, or capture execution occurs.

This gate does not:

- log in
- upload assets
- create capture requests
- execute capture
- create storage objects
- mutate DB/API state intentionally
- modify code

## 2. Preflight Outcome Definition

This gate should answer one question:

```text
Are the account, fixture, side-effect boundaries, and reporting rules clear enough to proceed to authenticated execution QA?
```

If any required condition is not confirmed, execution QA should not begin.

## 3. Account Approval Checklist

Authenticated execution QA must use an already approved Lens-access account.

Required conditions:

- account already has AdMate Lens access
- account is approved for operator use
- account is not newly created for this gate
- account does not require privilege escalation for this gate
- account is not a broad super-admin unless no lower-risk account exists
- account use is explicitly approved for QA by the operator/owner side

Recommended account profile:

- internal QA or operator account
- lowest privilege that can still verify the authenticated flow
- no unnecessary access to unrelated production-sensitive surfaces

Preflight decision rule:

- if Lens access cannot be confirmed in advance, stop before execution QA
- if the account scope is broader than necessary, prefer a lower-risk approved account before execution QA

## 4. Safe Fixture Candidate Checklist

Authenticated execution QA must use only safe fixture inputs that are pre-reviewed as low risk.

Candidate fixture categories:

- safe publisher URL already approved for Lens QA
- safe creative image already approved for internal QA use
- safe click URL or landing URL that is not customer-sensitive
- safe metadata sample for preview/history inspection

Required fixture conditions:

- not a real advertiser-sensitive asset
- not tied to a live customer reporting obligation
- not carrying sensitive campaign naming
- not containing personally identifiable data
- not revealing private operational parameters
- not requiring any unapproved third-party credentials or access

## 5. Fixture Input Candidate Format

Before execution QA starts, the tester should be able to name the candidate inputs in a short structured note.

Minimum expected note:

1. account label only, not secret values
2. publisher URL candidate
3. creative source type
4. click/landing URL candidate if needed
5. reason the fixture is considered safe

If any part of that note cannot be written without hesitation, fixture approval is not ready yet.

## 6. Sensitive Data Rejection Rules

Do not proceed with authenticated execution QA if the fixture includes any of the following:

- real client-confidential creative
- real internal campaign identifiers that should not appear in QA evidence
- advertiser naming that could leak operational relationships
- non-public landing URLs with sensitive query parameters
- any asset that might later be mistaken for approved production evidence

## 7. Expected Side Effects From Execution QA

Even a minimal authenticated Lens QA can create real system artifacts.

Expected artifact classes:

- DB row for capture request
- DB row updates for capture status transitions
- upload storage object if image upload is exercised
- capture output storage object if execution completes
- server/runtime logs associated with the request
- preview/history-visible records in the operator UI

Possible result classes:

- pending capture record
- processing capture record
- completed capture record
- failed capture record

## 8. Storage And Artifact Boundary

Execution QA must assume that generated objects are real product artifacts unless explicitly marked and handled otherwise.

Preflight rules:

- do not assume automatic deletion
- do not assume silent cleanup after the run
- do not create more artifacts than needed for the smallest valid QA case
- do not create multiple variants when one approved fixture is enough

Minimum-side-effect target:

- one approved QA account
- one smallest safe fixture set
- one smallest authenticated execution path

## 9. Preservation / Deletion / Cleanup Rule

Cleanup remains prohibited unless separately approved.

That means:

- do not delete QA-created DB rows casually
- do not delete QA-created storage objects casually
- do not use manual storage cleanup as an unreviewed habit
- do not treat rollback as part of this preflight gate

If future execution QA creates artifacts, the report must note whether they were intentionally preserved for evidence review.

If later cleanup is desired, it should be handled by a separate approved cleanup gate.

## 10. Authenticated API Verification Target

When execution QA is eventually approved, the authenticated checks should cover:

### 10.1 `/api/captures`

- authenticated `GET` returns usable operator data
- authenticated `POST` can create the approved QA request only when execution is approved
- no secret, token, or raw provider-auth data appears in the response path used for QA

### 10.2 `/api/captures/execute`

- authenticated call is no longer blocked by `401`
- execution path begins only for the explicitly approved QA request
- no extra capture jobs are triggered beyond the intended QA case

### 10.3 `/api/upload`

- authenticated call is no longer blocked by `401`
- upload is used only if the fixture requires it
- created object count is minimized

## 11. Preview / History UI Target

Authenticated execution QA should later confirm:

- capture form is usable after login
- preview/history list updates for the approved QA record
- metadata inspector can be reviewed safely
- action states remain understandable for the approved safe record
- session-expiry and logout UX can still be evaluated without widening scope unnecessarily

## 12. Post-Execution Reporting Requirements

If execution QA is later approved and run, the report must include:

1. which approved account class was used
2. which safe fixture set was used
3. whether upload occurred
4. whether capture request creation occurred
5. whether execution completed, failed, or remained pending
6. whether DB rows were created or updated
7. whether storage objects were created
8. which preview/history states were observed
9. whether session expiry/logout UX was also checked
10. whether any artifact should be retained for visual QA evidence review

Do not include secret values, tokens, or sensitive raw auth data in that report.

## 13. Evidence Scope For Visual QA

Only a narrow subset of authenticated execution artifacts should be handed to visual QA.

Allowed evidence candidates:

- one approved safe capture record
- one approved safe preview/history state
- one approved safe output image if execution was explicitly approved and completed
- one approved metadata snapshot if it contains no sensitive raw data

Not allowed as evidence by default:

- arbitrary production-like captures
- unreviewed uploads
- raw storage listings
- ad hoc batches of generated images

## 14. Golden PNG / Asset Rule

Golden PNG and asset-generation restrictions remain unchanged.

Still prohibited:

- adding golden PNG
- updating golden PNG
- creating new baseline image assets
- reclassifying ad hoc QA outputs as baseline assets

## 15. Go / No-Go Criteria

Execution QA may proceed only if all of the following are true:

- approved Lens-access account is identified
- safe fixture candidate is identified
- fixture is confirmed non-sensitive
- expected DB/storage/log artifact classes are acknowledged
- cleanup is not assumed
- reporting requirements are understood
- visual QA evidence boundary is understood
- golden PNG / asset prohibition remains accepted

If any item above is uncertain, the correct preflight result is `no-go`.

## 16. Recommended Next Gate

Recommended next gate:

```text
Gate Lens-Auth-11 authenticated execution QA
```

Recommended scope for that gate:

- use approved account only
- use one approved safe fixture set only
- perform the smallest authenticated upload/capture flow only if explicitly approved
- observe resulting preview/history state
- stop after collecting the minimum evidence needed for follow-up visual QA
