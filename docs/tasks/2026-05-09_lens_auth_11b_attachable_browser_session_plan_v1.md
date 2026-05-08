# Gate Lens-Auth-11B Attachable Browser Session Plan v1

Date: 2026-05-09
Repo: `admate-lens`
Product: AdMate Lens
Scope: browser-session preparation planning only

## 1. Goal

Design a safe preparation method for authenticated AdMate Lens capture QA where:

- the user performs login directly
- the agent can later use the authenticated browser session
- password, cookie, token, and raw session material are never shared with the agent

This gate does not:

- log in
- execute capture
- upload assets
- extract cookies or tokens
- modify code

## 2. Recommended Direction

Preferred approach:

```text
new temporary browser profile
-> remote debugging enabled on an isolated local port
-> user logs in directly in that browser window
-> agent attaches only to that temporary QA session
-> one authenticated Lens QA run
```

This is preferred over trying to reuse the user's already-running default Chrome profile.

## 3. User-Performed Login Rule

The user must continue to perform login manually.

Required principles:

- the agent must not type or receive the password
- the agent must not collect or display cookie values
- the agent must not collect or display token values
- the agent must not request the user to paste auth/session material

The user interaction boundary should be:

1. launch the temporary QA browser profile
2. user opens Lens login shell in that window
3. user types credentials directly
4. user confirms login success
5. agent attaches to the already-authenticated temporary QA browser only

## 4. Temporary Browser Profile Strategy

Use a fresh temporary browser profile dedicated to this QA run.

Required properties:

- isolated from the user's normal Chrome profile
- used only for the Lens QA session
- disposable after the QA process is complete
- not copied from an existing signed-in browser profile

Recommended characteristics:

- a unique temp directory under a user-approved workspace-safe location
- only one Lens QA session active in that profile
- no unrelated personal browsing history or credentials

## 5. Remote Debugging Isolation Rules

If remote debugging is used, it must be isolated.

### 5.1 Port Rule

- use a dedicated localhost-only port
- do not reuse a port already attached to another browser session
- treat the port as QA-session-local only

Example shape:

```text
127.0.0.1:<dedicated-port>
```

### 5.2 Profile Rule

- one remote-debugging browser instance
- one temporary user-data directory
- no sharing with the default Chrome or Edge profile

### 5.3 Attachment Rule

The agent may attach only to:

- the explicit temporary QA browser profile
- the explicit remote-debugging endpoint created for that QA run

The agent must not scan broadly for unrelated browser sessions.

## 6. Privacy And Secret-Handling Rules

The following rules remain strict.

Do not:

- collect password input
- print password input
- dump cookies
- dump auth tokens
- copy session files
- inspect browser local storage for secrets unless explicitly required and separately approved
- print signed URLs or raw provider responses

The purpose is authenticated workflow verification, not auth material inspection.

## 7. Explicitly Forbidden Approaches

The following methods are not allowed.

### 7.1 Existing Profile Reuse

- attaching to the user's already-running default Chrome profile
- attaching to a browser profile that contains unrelated personal or operational sessions
- forcing a launch against a locked default profile

### 7.2 Profile Copying

- copying the user's Chrome profile
- cloning browser session folders
- duplicating cookie databases or local storage files

### 7.3 Secret Workarounds

- asking the user to paste cookies
- asking the user to paste tokens
- exporting session data for the agent
- capturing screenshots specifically to read secrets

### 7.4 Over-Broad Browser Access

- scanning arbitrary local browser sessions
- attaching to unknown remote-debugging ports
- reusing a debugging endpoint not explicitly prepared for this QA gate

## 8. Preconditions Before QA Execution

Before authenticated Lens QA begins, all of the following should be true:

- a new temporary browser profile exists
- remote debugging is enabled on a dedicated local port
- the user personally logged in within that temporary profile
- the user confirmed Lens home/workspace is visible
- the agent can attach to only that dedicated QA browser session
- no password, cookie, token, or signed URL has been shared

If any condition fails, execution QA should not proceed.

## 9. One-Time QA Run Rule

Once the attachable temporary session is ready, the downstream authenticated QA gate should remain minimal.

Allowed target:

- one authenticated session
- one approved safe fixture
- one capture flow execution only

Not allowed:

- repeated capture retries unless separately approved
- repeated uploads
- broad exploratory browsing beyond the QA scope

## 10. Failure / Stop Conditions

The execution gate should stop immediately if any of the following occurs:

- the temporary profile is not isolated
- the remote-debugging port is not dedicated or not reachable
- the user cannot confirm successful direct login
- the agent can only proceed by reading secrets
- the browser context appears to be the user's existing default profile
- the QA would require more than the approved single execution

## 11. Security Rationale

This pattern is safer because it separates:

- human authentication
- machine-controlled post-login workflow

It reduces the chance of:

- accidental credential exposure
- accidental reuse of unrelated browser sessions
- contamination of personal or operational browser state
- unsafe secret handling by logs or transcripts

## 12. Recommended Operator Procedure

Suggested human procedure for the next gate:

1. launch a new temporary Chrome or Edge profile with remote debugging enabled
2. confirm the port and temp profile path are dedicated to this QA run
3. user opens `https://lens.admate.ai.kr/`
4. user logs in manually
5. user confirms authenticated Lens workspace is visible
6. agent attaches to that temporary QA browser only
7. agent runs the single approved authenticated QA flow

## 13. Next Gate Recommendation

Recommended next gate:

```text
Gate Lens-Auth-11C authenticated execution QA with isolated remote-debug session
```

Recommended scope for that gate:

- verify attachable temporary QA browser is ready
- attach without reading or printing credentials/session material
- run one authenticated Lens capture QA flow only
- record only sanitized ids/paths and non-secret evidence
