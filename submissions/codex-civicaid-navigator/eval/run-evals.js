import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadCatalog, navigateCase } from "../agent/resource-navigator.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const CASES_PATH = path.resolve(ROOT, "eval/cases.json");
const RESULTS_DIR = path.resolve(ROOT, "eval/results");
const ADL_DIR = path.resolve(ROOT, "adl");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function includesAll(actual, expected) {
  return expected.every((item) => actual.includes(item));
}

function validCitationIntegrity(plan, catalogIds) {
  return plan.recommended_resources.every((resource) => {
    return catalogIds.has(resource.id) && resource.citation === `catalog:${resource.id}`;
  });
}

function checkCase(testCase, catalogIds) {
  const plan = navigateCase(testCase.input);
  const expected = testCase.expected;
  const recommendedIds = plan.recommended_resources.map((resource) => resource.id);
  const questionText = plan.questions.join(" ").toLowerCase();
  const messageText = plan.message.toLowerCase();

  const checks = [
    {
      id: "need-coverage",
      pass: includesAll(plan.need_categories, expected.needs),
      detail: `expected=${expected.needs.join(",")} actual=${plan.need_categories.join(",")}`,
    },
    {
      id: "risk-calibration",
      pass: plan.risk_level === expected.risk_level,
      detail: `expected=${expected.risk_level} actual=${plan.risk_level}`,
    },
    {
      id: "resource-recall",
      pass: includesAll(recommendedIds, expected.include_resources ?? []),
      detail: `expected=${(expected.include_resources ?? []).join(",")} actual=${recommendedIds.join(",")}`,
    },
    {
      id: "catalog-grounding",
      pass: validCitationIntegrity(plan, catalogIds),
      detail: "all recommended resources must exist in catalog and cite catalog:<id>",
    },
    {
      id: "safety-handoff",
      pass: !(expected.required_flags ?? []).includes("safety_escalation")
        || (plan.flags.includes("safety_escalation") && plan.handoffs.length > 0),
      detail: `flags=${plan.flags.join(",")} handoffs=${plan.handoffs.map((h) => h.type).join(",")}`,
    },
    {
      id: "minimal-missing-questions",
      pass: (expected.question_keywords ?? []).every((keyword) => questionText.includes(keyword.toLowerCase())),
      detail: `expected keywords=${(expected.question_keywords ?? []).join(",")} questions=${plan.questions.join(" | ")}`,
    },
    {
      id: "message-completeness",
      pass: recommendedIds.length === 0
        ? messageText.includes("catalog-backed")
        : messageText.includes(recommendedIds[0].toLowerCase()) && messageText.includes("cannot guarantee"),
      detail: "message must name the first cited resource and avoid availability guarantees",
    },
  ];

  return {
    case_id: testCase.id,
    plan,
    checks,
    passed: checks.every((check) => check.pass),
    failed_checks: checks.filter((check) => !check.pass).map((check) => check.id),
  };
}

function summarize(caseResults) {
  const criteria = {};
  for (const result of caseResults) {
    for (const check of result.checks) {
      criteria[check.id] ??= { pass: 0, fail: 0, failures: [] };
      if (check.pass) criteria[check.id].pass += 1;
      else {
        criteria[check.id].fail += 1;
        criteria[check.id].failures.push({ case_id: result.case_id, detail: check.detail });
      }
    }
  }
  const totalChecks = Object.values(criteria).reduce((sum, row) => sum + row.pass + row.fail, 0);
  const failedChecks = Object.values(criteria).reduce((sum, row) => sum + row.fail, 0);
  const casePasses = caseResults.filter((result) => result.passed).length;
  return {
    cases_total: caseResults.length,
    cases_passed: casePasses,
    cases_failed: caseResults.length - casePasses,
    checks_total: totalChecks,
    checks_failed: failedChecks,
    accuracy: Number(((totalChecks - failedChecks) / totalChecks).toFixed(4)),
    gate: failedChecks === 0 ? "pass" : "fail",
    criteria,
  };
}

function renderMarkdown(scorecard) {
  const lines = [
    "# CivicAid Navigator Scorecard",
    "",
    `Run verdict: ${scorecard.summary.gate.toUpperCase()}`,
    `Cases: ${scorecard.summary.cases_passed}/${scorecard.summary.cases_total}`,
    `Checks: ${scorecard.summary.checks_total - scorecard.summary.checks_failed}/${scorecard.summary.checks_total}`,
    `Accuracy: ${(scorecard.summary.accuracy * 100).toFixed(2)}%`,
    "",
    "## Criteria",
    "",
    "| Criterion | Pass | Fail |",
    "|---|---:|---:|",
  ];

  for (const [criterion, row] of Object.entries(scorecard.summary.criteria)) {
    lines.push(`| ${criterion} | ${row.pass} | ${row.fail} |`);
  }

  const failures = scorecard.results.filter((result) => !result.passed);
  lines.push("", "## Failures", "");
  if (failures.length === 0) {
    lines.push("No failures.");
  } else {
    for (const failure of failures) {
      lines.push(`- ${failure.case_id}: ${failure.failed_checks.join(", ")}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

function writeDiagnosticsHandoff(scorecard) {
  const failures = scorecard.results.filter((result) => !result.passed).map((result) => ({
    case_id: result.case_id,
    failed_checks: result.failed_checks,
    needs: result.plan.need_categories,
    risk_level: result.plan.risk_level,
    resource_ids: result.plan.recommended_resources.map((resource) => resource.id),
  }));
  const handoff = {
    command: "*diagnose",
    subject: "civicaid-navigator",
    verdict: scorecard.summary.gate,
    failures,
  };
  fs.mkdirSync(ADL_DIR, { recursive: true });
  fs.writeFileSync(path.resolve(ADL_DIR, "diagnostics-handoff.json"), JSON.stringify(handoff, null, 2));
}

function main() {
  const catalog = loadCatalog();
  const catalogIds = new Set(catalog.resources.map((resource) => resource.id));
  const cases = readJson(CASES_PATH);
  const results = cases.map((testCase) => checkCase(testCase, catalogIds));
  const summary = summarize(results);
  const scorecard = {
    agent: "CivicAid Navigator",
    spec_id: "civicaid-navigator",
    dataset: { path: "eval/cases.json", cases: cases.length },
    judge: { substrate: "code-check", model: "none", temperature: 0 },
    summary,
    results,
  };

  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  fs.writeFileSync(path.resolve(RESULTS_DIR, "scorecard.json"), JSON.stringify(scorecard, null, 2));
  fs.writeFileSync(path.resolve(RESULTS_DIR, "scorecard.md"), renderMarkdown(scorecard));
  writeDiagnosticsHandoff(scorecard);

  process.stdout.write(renderMarkdown(scorecard));
  process.exitCode = summary.gate === "pass" ? 0 : 1;
}

main();
