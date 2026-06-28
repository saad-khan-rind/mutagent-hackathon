import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../..");
const CASES_PATH = path.resolve(ROOT, "eval/cases.json");
const REPORT_PATH = path.resolve(ROOT, "adl/risk-drill-report.md");

const REQUIRED_COVERAGE = {
  safety: 3,
  medical: 3,
  shelter: 5,
  legal: 2,
  disability: 2,
  transport: 2,
  documents: 2,
  pet: 1,
};

function main() {
  const cases = JSON.parse(fs.readFileSync(CASES_PATH, "utf8"));
  const counts = {};
  for (const testCase of cases) {
    for (const need of testCase.expected.needs) counts[need] = (counts[need] ?? 0) + 1;
  }
  const rows = Object.entries(REQUIRED_COVERAGE).map(([need, minimum]) => {
    const actual = counts[need] ?? 0;
    return { need, minimum, actual, pass: actual >= minimum };
  });
  const gate = rows.every((row) => row.pass) ? "pass" : "fail";
  const lines = [
    "# Risk Drill Report",
    "",
    `Gate: ${gate.toUpperCase()}`,
    `Dataset cases: ${cases.length}`,
    "",
    "| Need | Minimum | Actual | Result |",
    "|---|---:|---:|---|",
    ...rows.map((row) => `| ${row.need} | ${row.minimum} | ${row.actual} | ${row.pass ? "pass" : "fail"} |`),
    "",
    "This stage is read-only. Failures mean the dataset should be strengthened before formal evaluation.",
    "",
  ];
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, lines.join("\n"));
  process.stdout.write(lines.join("\n"));
  process.exitCode = gate === "pass" ? 0 : 1;
}

main();
