# Build Report

Subject: CivicAid Navigator  
Spec: `agentspec.yaml` (`civicaid-navigator`, agentspec.v0.2.0)  
Target: `harness:codex`  
Runtime: Node.js ESM  
Eval framework: Mutagent evaluator, code-check substrate

## Planned Layout

```text
submissions/codex-civicaid-navigator/
  agentspec.yaml
  agent/
    cli.js
    resource-navigator.js
  data/
    resource_catalog.json
  eval/
    cases.json
    run-evals.js
    results/
  tests/
    resource-navigator.test.js
  extensions/
    risk-drill/
  adl/
  transcripts/
```

## Implemented Code Tools

| Spec tool id | Module | Test coverage |
|---|---|---|
| `need-classifier` | `agent/resource-navigator.js` | `tests/resource-navigator.test.js`, `eval/run-evals.js` |
| `safety-escalator` | `agent/resource-navigator.js` | `tests/resource-navigator.test.js`, `eval/run-evals.js` |
| `resource-ranker` | `agent/resource-navigator.js` | `tests/resource-navigator.test.js`, `eval/run-evals.js` |
| `response-composer` | `agent/resource-navigator.js` | `tests/resource-navigator.test.js`, `eval/run-evals.js` |
| `handoff-writer` | `agent/resource-navigator.js` | `eval/run-evals.js` |

## Verification

- `*validate-spec`: PASS
- Unit tests: PASS, 3/3
- `*risk-drill`: PASS after dataset coverage fix
- Initial `*evaluate`: FAIL, 161/168 checks
- Final `*evaluate`: PASS, 168/168 checks

## Observability

The eval runner writes `eval/results/scorecard.json`, `eval/results/scorecard.md`, and `adl/diagnostics-handoff.json`. The CLI can also write reviewed handoff packets to a JSONL outbox with `--outbox`.
