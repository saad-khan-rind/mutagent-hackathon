import assert from "node:assert/strict";
import test from "node:test";
import { loadCatalog, navigateCase } from "../agent/resource-navigator.js";

test("grounds every recommendation in the resource catalog", () => {
  const catalogIds = new Set(loadCatalog().resources.map((resource) => resource.id));
  const plan = navigateCase({
    id: "unit-grounding",
    text: "I lost my ID and need food benefits help.",
    city: "Lakeview",
    zip: "94210",
    household: { has_id: false },
  });

  assert.ok(plan.recommended_resources.length > 0);
  for (const resource of plan.recommended_resources) {
    assert.ok(catalogIds.has(resource.id));
    assert.equal(resource.citation, `catalog:${resource.id}`);
  }
});

test("places safety handoff before ordinary domestic violence referrals", () => {
  const plan = navigateCase({
    id: "unit-safety",
    text: "I am unsafe with my partner and need legal help.",
    city: "Riverside",
    zip: "94110",
  });

  assert.equal(plan.risk_level, "emergency");
  assert.ok(plan.flags.includes("safety_escalation"));
  assert.equal(plan.recommended_resources[0].id, "DV-SAFE-HARBOR");
  assert.match(plan.message, /safety handoff/i);
});

test("asks material missing questions without blocking resource recommendations", () => {
  const plan = navigateCase({
    id: "unit-missing",
    text: "I need shelter tonight.",
    city: "Lakeview",
    zip: "94201",
  });

  assert.ok(plan.recommended_resources.some((resource) => resource.id === "SHELTER-WINTER-EMERGENCY"));
  assert.ok(plan.questions.some((question) => question.toLowerCase().includes("how many people")));
  assert.ok(plan.questions.length <= 4);
});
