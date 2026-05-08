# Gate Lens-Auth-5 Post-Merge Production Smoke v1

Date: 2026-05-08
Repo: `admate-lens`
Product: AdMate Lens
Environment: production
Domain: `https://lens.admate.ai.kr`
Mode: read-only smoke only

## 1. Goal

Confirm that the merged Auth-4 guard work is visible in production without logging in, uploading files, or executing captures.

This gate does not:

- log in
- upload assets
- execute captures
- change code, DB, schema, env, storage, or assets

## 2. Main Commit Baseline

Expected merged `origin/main` target:

```text
0fe7d1423aa799a9ed8e0f9bd02612434ccc2973
```

Observed GitHub production deployment entry:

- deployment ref/sha: `0fe7d1423aa799a9ed8e0f9bd02612434ccc2973`
- deployment created at: `2026-05-08T14:08:16Z`
- deployment state: `success`
- environment URL: `https://admate-lens-olzkiyhld-jeonhongjins-projects.vercel.app`

Interpretation:

- production deployment metadata exists for the merged commit itself
- this is sufficient evidence that the production rollout is at the merged commit or later

## 3. Root No-Session Behavior

Read-only request to:

```text
https://lens.admate.ai.kr/
```

Observed result:

- HTTP status: `307`
- `Location`: `/login?next=%2F`
- `Server`: `Vercel`
- `X-Powered-By`: `Next.js`

Conclusion:

- no-session root access is redirected to the Lens-local login entry as intended

## 4. Login Shell Copy Smoke

Read-only fetch to:

```text
https://lens.admate.ai.kr/login
```

Confirmed visible copy in production HTML:

- `AdMate Lens 로그인`
- `광고 캡처 기능을 이용하려면 AdMate 계정으로 로그인하세요`
- `이용 신청`

Additional observed production shell traits:

- Lens-local branding remains visible
- Sentinel access-request guidance is present
- no secret/token/storage-path-like strings were found in the fetched login HTML

## 5. No-Session API Guard Smoke

### 5.1 `GET /api/captures`

Request:

```text
GET https://lens.admate.ai.kr/api/captures
```

Observed result:

- HTTP status: `401`
- body:

```json
{
  "error": "로그인이 필요합니다.",
  "code": "auth_required"
}
```

### 5.2 `POST /api/captures/execute`

Request:

```text
POST https://lens.admate.ai.kr/api/captures/execute
```

Observed result:

- HTTP status: `401`
- body:

```json
{
  "error": "로그인이 필요합니다.",
  "code": "auth_required"
}
```

### 5.3 `POST /api/upload`

Request:

```text
POST https://lens.admate.ai.kr/api/upload
```

Observed result:

- HTTP status: `401`
- body:

```json
{
  "error": "로그인이 필요합니다.",
  "code": "auth_required"
}
```

Conclusion:

- the three targeted no-session API guards are active in production
- the failure mode is fail-closed before any protected operation proceeds

## 6. Sensitive Output Review

Checked public no-session responses for:

- secret values
- token values
- storage path exposure
- raw provider data

Observed result:

- login HTML: no obvious secret/token/storage-path leakage detected
- no-session API responses: only auth-required error payload returned

Conclusion:

- public no-session smoke did not expose sensitive operational fields

## 7. Capture Boundary Confirmation

This smoke gate did not:

- log in
- submit capture requests
- upload files
- trigger execution through an authenticated path

Because production no-session requests to `/api/captures`, `/api/captures/execute`, and `/api/upload` all returned `401`, the smoke path did not proceed into capture execution flow.

Operational interpretation:

- capture engine/rendering/composite/injection were not exercised by this production smoke

## 8. Result

Auth-4 production smoke outcome:

```text
pass
```

Summary:

- merged main commit has a successful production deployment entry
- root no-session redirect is active
- Lens-local login shell copy is visible in production
- targeted API routes return no-session `401`
- no sensitive public response leakage was observed in this smoke scope

## 9. Follow-Up

Recommended next gate:

```text
Gate Lens-Auth-6 authenticated return-flow and logout UX smoke
```

Suggested scope:

- approved operator test account flow
- valid `next` return-path behavior
- logout return behavior
- no-session vs post-login alignment check
