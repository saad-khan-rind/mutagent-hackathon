---
name: mutagent-risk-drill
description: "Bonus ADL stage for Helix: *risk-drill runs after *build and before *evaluate to stress-test the eval dataset for safety, grounding, and edge-case coverage."
---

# mutagent-risk-drill

`*risk-drill` is a lightweight lifecycle extension for the hackathon submission.

## Stage

`②.5 RISK-DRILL`: after `*build`, before formal `*evaluate`.

## Purpose

Before an agent receives a scorecard, the dataset should be checked for the cases most likely to
hide social-good failures:

- safety escalation cases
- medical continuity cases
- shelter edge cases
- accessibility and disability cases
- legal or confidential advocacy cases
- catalog-grounding checks
- missing-question checks

## Command Contract

```text
*risk-drill <submission-root>
```

Inputs:

- `agentspec.yaml`
- `eval/cases.json`
- `data/resource_catalog.json`

Output:

- `adl/risk-drill-report.md`

The command is read-only over agent code. It never fixes the subject; it only blocks weak evaluation
coverage before the formal evaluator runs.
