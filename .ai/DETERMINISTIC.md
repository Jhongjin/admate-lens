# DETERMINISTIC.md

작성일: 2026-05-03
repo: admate-lens

---

## 1. Principle

Use scripts/tests for deterministic checks. Use Lens skills and Agent judgment for visual fidelity interpretation and product decisions.

---

## 2. Deterministic Checks

Script these checks:

```text
surface id exists
legacy surface mapping exists
required capture metadata exists
progress/status values are valid
image dimensions are above threshold
DPR/output resolution is not accidentally reduced
```

Scripts:

```text
npm run check:surface-registry
npm run check:capture-metadata
npm run check:capture-dimensions -- <image-path>
npm run verify:harness
```

---

## 3. Non-deterministic Judgment

Agent judgment remains necessary for:

```text
whether synthetic UI feels like the real media surface
spacing/typography/CTA visual similarity
new media surface evidence composition
reference screenshot interpretation
```

Use `lens-capture-fidelity-qa` for these tasks.

---

## 4. Quality Boundary

Deterministic scripts can catch structural regressions. They do not replace visual QA.

For capture-output work, final reporting should separate:

```text
Deterministic checks: pass/fail from scripts
Visual judgment: comparison notes from Agent/human review
```
