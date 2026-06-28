# Diagnosis Report

Command: `*diagnose`  
Input: initial `*evaluate` scorecard (`eval/results/scorecard.initial.json`)  
Initial verdict: FAIL, 161/168 checks, 17/24 cases passing

## Findings

| Rank | Failure | Root cause | Fix |
|---:|---|---|---|
| 1 | False document/benefits needs in C02, C07, C19 | The keyword `id` matched inside unrelated words like `confidential` and `ride`. | Use word-boundary matching for short classifier tokens. |
| 2 | Missing pet need in C11 | Household pet facts and dog/cat language did not add the `pet` category. | Add pet keywords and map `household.pets` to the `pet` need. |
| 3 | Medical emergency flag without handoff in C03 and C17 | Critical medicine/equipment cases set `safety_escalation` but did not add a medical emergency handoff. | Add explicit emergency handoff for insulin/oxygen interruption. |
| 4 | Dialysis ride over-escalated in C07 | Dialysis appeared in the emergency branch even when the case described a future appointment ride. | Escalate dialysis only when missed or unreachable, not for routine transport. |
| 5 | Specialized resources over-ranked in C19 | Disability, veteran, pet, youth, and DV resources could rank for generic categories without matching eligibility. | Add eligibility gating before resource scoring. |
| 6 | Medical-device utility case missing medical category in C23 | `medical device` was handled by resources but not by the need classifier. | Add `medical` and `medical device` vocabulary to the medical need. |
| 7 | `*risk-drill` safety coverage failure | Dataset had only two cases labeled with safety need. | Mark the suicide crisis case as both `mental_health` and `safety`. |

## Recommended Remedy

Apply all seven changes as one bounded improvement because they affect the same deterministic routing layer and can be verified by the existing 24-case scorecard.
