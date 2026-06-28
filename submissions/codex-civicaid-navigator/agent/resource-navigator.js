import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_CATALOG_PATH = path.resolve(__dirname, "../data/resource_catalog.json");

const NEED_KEYWORDS = {
  shelter: [
    "shelter",
    "homeless",
    "sleep",
    "hotel",
    "motel",
    "evacuated",
    "evacuation",
    "flooded",
    "house burned",
    "nowhere",
    "tent",
    "couch",
  ],
  food: ["food", "meal", "hungry", "groceries", "pantry", "snap", "formula"],
  medical: [
    "medicine",
    "medical",
    "medical device",
    "medication",
    "insulin",
    "prescription",
    "doctor",
    "clinic",
    "asthma",
    "oxygen",
    "dialysis",
    "wound",
  ],
  mental_health: [
    "suicide",
    "kill myself",
    "panic",
    "depressed",
    "crisis",
    "mental",
    "trauma",
  ],
  safety: [
    "unsafe",
    "domestic",
    "violence",
    "partner",
    "threatened",
    "stalking",
    "assault",
    "hit me",
    "weapon",
  ],
  legal: ["eviction", "landlord", "notice", "court", "legal", "lease", "restraining"],
  transport: ["ride", "transport", "bus", "gas", "appointment", "pickup", "car broke"],
  documents: ["id", "documents", "birth certificate", "social security", "papers", "lost my wallet"],
  pet: ["pet", "dog", "cat", "service animal"],
  utilities: ["electric", "utility", "power", "water bill", "shutoff", "heat"],
  childcare: ["childcare", "daycare", "watch my kids", "babysit", "school closed"],
  veteran: ["veteran", "va ", "served", "military"],
  disability: ["wheelchair", "disabled", "disability", "mobility", "blind", "deaf"],
  youth: ["17", "teen", "youth", "minor", "under 18"],
  hygiene: ["shower", "laundry", "hygiene", "diapers", "clean clothes"],
};

const EMERGENCY_TERMS = [
  "suicide",
  "kill myself",
  "overdose",
  "not breathing",
  "chest pain",
  "weapon",
  "hit me",
  "assault",
  "unsafe with my partner",
  "partner will hurt",
  "domestic violence",
  "child is unsafe",
  "no insulin",
  "lost insulin",
  "oxygen tank empty",
];

const URGENT_TERMS = [
  "tonight",
  "today",
  "24 hours",
  "eviction notice",
  "out of food",
  "no food",
  "no ride",
  "sleeping outside",
  "car with my kids",
  "power shutoff",
];

function lowerText(inputCase) {
  return [
    inputCase.text,
    inputCase.notes,
    ...(inputCase.explicit_needs ?? []),
    inputCase.household?.language,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function containsTerm(text, keyword) {
  if (/^[a-z0-9]{1,3}$/i.test(keyword.trim())) {
    return new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text);
  }
  return text.includes(keyword);
}

export function loadCatalog(catalogPath = DEFAULT_CATALOG_PATH) {
  return JSON.parse(fs.readFileSync(catalogPath, "utf8"));
}

// @implements need-classifier
export function detectNeedCategories(inputCase) {
  const text = lowerText(inputCase);
  const explicit = new Set(inputCase.explicit_needs ?? []);
  const needs = new Set(explicit);

  for (const [need, keywords] of Object.entries(NEED_KEYWORDS)) {
    if (keywords.some((keyword) => containsTerm(text, keyword))) needs.add(need);
  }

  const household = inputCase.household ?? {};
  if ((household.children ?? 0) > 0 && needs.has("shelter")) needs.add("childcare");
  if (household.veteran) needs.add("veteran");
  if (household.disability || household.mobility_device) needs.add("disability");
  if (household.pets) needs.add("pet");
  if (household.age !== undefined && household.age < 18) needs.add("youth");
  if (needs.has("documents")) needs.add("benefits");
  if (needs.has("food")) needs.add("benefits");
  if (needs.has("safety") && /somewhere|stay|shelter|safe place|confidential/.test(text)) needs.add("shelter");
  if (needs.has("mental_health") && /suicide|kill myself|overdose/.test(text)) needs.add("safety");

  if (needs.size === 0) needs.add("stability");
  return [...needs].sort();
}

// @implements safety-escalator
export function assessRisk(inputCase, needs) {
  const text = lowerText(inputCase);
  const flags = [];
  const handoffs = [];
  let risk = "standard";

  if (EMERGENCY_TERMS.some((term) => text.includes(term))) {
    risk = "emergency";
    flags.push("safety_escalation");
    handoffs.push({
      type: "emergency",
      label: "If there is immediate danger or a medical emergency, call local emergency services now.",
    });
  } else if (URGENT_TERMS.some((term) => text.includes(term))) {
    risk = "urgent";
  }

  if (needs.includes("safety")) {
    risk = "emergency";
    if (!flags.includes("safety_escalation")) flags.push("safety_escalation");
    handoffs.push({
      type: "confidential-safety",
      label: "Use confidential domestic violence support and avoid messages that could increase risk.",
    });
  }

  if (needs.includes("medical") && (text.includes("insulin") || text.includes("oxygen") || text.includes("dialysis"))) {
    const criticalMedication = text.includes("insulin") || text.includes("oxygen");
    const missedDialysis = /missed dialysis|no dialysis|cannot get dialysis/.test(text);
    if (criticalMedication || missedDialysis) {
      risk = "emergency";
      if (!flags.includes("safety_escalation")) flags.push("safety_escalation");
      if (!handoffs.some((handoff) => handoff.type === "emergency")) {
        handoffs.push({
          type: "emergency",
          label: "Use emergency medical support for critical medication or equipment interruption.",
        });
      }
    }
  }

  if (needs.includes("shelter") && /tonight|sleeping outside|car with my kids|nowhere/.test(text)) {
    risk = risk === "emergency" ? "emergency" : "urgent";
  }

  return { risk, flags, handoffs };
}

function locationScore(resource, inputCase) {
  const city = (inputCase.city ?? "").toLowerCase();
  const zip = String(inputCase.zip ?? "");
  const service = resource.service_area ?? {};
  if (service.statewide) return 3;
  if ((service.cities ?? []).map((c) => c.toLowerCase()).includes(city)) return 4;
  if ((service.zip_prefixes ?? []).some((prefix) => zip.startsWith(prefix))) return 4;
  if ((service.counties ?? []).map((c) => c.toLowerCase()).includes((inputCase.county ?? "").toLowerCase())) return 3;
  return 0;
}

function eligibilityScore(resource, inputCase, needs) {
  const household = inputCase.household ?? {};
  const eligibility = resource.eligibility ?? {};
  let score = 0;

  if (eligibility.families && (household.children ?? 0) > 0) score += 2;
  if (eligibility.youth && (household.age ?? 99) < 18) score += 3;
  if (eligibility.veterans && household.veteran) score += 3;
  if (eligibility.disability && (household.disability || household.mobility_device)) score += 3;
  if (eligibility.pets && household.pets) score += 3;
  if (eligibility.domestic_violence && needs.includes("safety")) score += 5;
  if ((resource.languages ?? []).includes(household.language)) score += 1;
  if (eligibility.open_to_all) score += 1;

  return score;
}

function eligibilityAllowed(resource, inputCase, needs) {
  const household = inputCase.household ?? {};
  const eligibility = resource.eligibility ?? {};
  if (eligibility.veterans && !household.veteran) return false;
  if (eligibility.youth && (household.age ?? 99) >= 18) return false;
  if (eligibility.disability && !(household.disability || household.mobility_device || needs.includes("disability"))) return false;
  if (eligibility.pets && !(household.pets || needs.includes("pet"))) return false;
  if (eligibility.domestic_violence && !needs.includes("safety")) return false;
  return true;
}

// @implements resource-ranker
export function rankResources(inputCase, needs, catalog) {
  return catalog.resources
    .filter((resource) => eligibilityAllowed(resource, inputCase, needs))
    .map((resource) => {
      const categoryMatches = resource.categories.filter((category) => needs.includes(category));
      const categoryScore = categoryMatches.length * 10;
      const geoScore = locationScore(resource, inputCase);
      const eligScore = eligibilityScore(resource, inputCase, needs);
      const urgencyScore = resource.urgency === "emergency" ? 3 : resource.urgency === "urgent" ? 2 : 0;
      const score = categoryScore + geoScore + eligScore + urgencyScore;
      return {
        resource,
        score,
        categoryMatches,
        reason: [
          categoryMatches.length ? `matches ${categoryMatches.join(", ")}` : "",
          geoScore ? "serves the resident location" : "",
          eligScore ? "fits household eligibility details" : "",
          urgencyScore ? `supports ${resource.urgency} cases` : "",
        ]
          .filter(Boolean)
          .join("; "),
      };
    })
    .filter((candidate) => candidate.score >= 10)
    .sort((a, b) => b.score - a.score || a.resource.id.localeCompare(b.resource.id));
}

function topRecommendations(candidates, needs) {
  const selected = [];
  const covered = new Set();

  for (const need of needs) {
    const hit = candidates.find((candidate) => candidate.resource.categories.includes(need));
    if (hit && !selected.some((entry) => entry.resource.id === hit.resource.id)) {
      selected.push(hit);
      hit.categoryMatches.forEach((category) => covered.add(category));
    }
  }

  for (const candidate of candidates) {
    if (selected.length >= 5) break;
    if (!selected.some((entry) => entry.resource.id === candidate.resource.id)) selected.push(candidate);
  }

  return selected.slice(0, 5);
}

function buildQuestions(inputCase, needs) {
  const household = inputCase.household ?? {};
  const questions = [];
  if (!inputCase.city && !inputCase.zip) questions.push("What city or ZIP should we use for nearby resources?");
  if (needs.includes("shelter") && household.people === undefined) {
    questions.push("How many people need shelter tonight, including children?");
  }
  if (needs.includes("shelter") && household.pets === undefined) {
    questions.push("Do any pets need to stay with you or be sheltered safely?");
  }
  if (needs.includes("medical") && !inputCase.text?.toLowerCase().includes("prescription")) {
    questions.push("Do you have a current prescription, medication label, or clinic contact?");
  }
  if (needs.includes("transport") && !inputCase.pickup_location) {
    questions.push("What pickup location and appointment time should transportation support use?");
  }
  if (needs.includes("documents") && !household.has_id) {
    questions.push("Which documents were lost, and do you have any photo or digital copy?");
  }
  return questions.slice(0, 4);
}

// @implements response-composer
export function composeMessage(plan) {
  const first = plan.recommended_resources[0];
  const safety = plan.flags.includes("safety_escalation")
    ? "Start with the safety handoff before ordinary referrals. "
    : "";
  const resourceLine = first
    ? `The strongest first resource is ${first.name} (${first.id}) because it ${first.reason}.`
    : "I do not have a catalog-backed resource match yet.";
  const questionLine = plan.questions.length
    ? `Please confirm: ${plan.questions.join(" ")}`
    : "No extra intake questions are needed before a human reviews this plan.";
  return `${safety}${resourceLine} ${questionLine} I cannot guarantee availability; contact the resource or a case worker to confirm.`;
}

// @implements handoff-writer
export function createAudit(inputCase, needs, risk, candidates, recommendations) {
  return {
    case_id: inputCase.id ?? "case-unlabeled",
    needs,
    risk_level: risk.risk,
    flags: risk.flags,
    candidate_count: candidates.length,
    selected_resource_ids: recommendations.map((rec) => rec.id),
    rejected_top_candidates: candidates
      .filter((candidate) => !recommendations.some((rec) => rec.id === candidate.resource.id))
      .slice(0, 3)
      .map((candidate) => ({ id: candidate.resource.id, score: candidate.score, reason: candidate.reason })),
  };
}

export function navigateCase(inputCase, options = {}) {
  const catalog = options.catalog ?? loadCatalog(options.catalogPath);
  const needs = detectNeedCategories(inputCase);
  const risk = assessRisk(inputCase, needs);
  const candidates = rankResources(inputCase, needs, catalog);
  const selected = topRecommendations(candidates, needs);
  const recommended = selected.map((candidate) => ({
    id: candidate.resource.id,
    name: candidate.resource.name,
    categories: candidate.resource.categories,
    contact: candidate.resource.contact,
    citation: `catalog:${candidate.resource.id}`,
    reason: candidate.reason,
  }));

  const plan = {
    case_id: inputCase.id ?? "case-unlabeled",
    risk_level: risk.risk,
    need_categories: needs,
    flags: risk.flags,
    handoffs: risk.handoffs,
    recommended_resources: recommended,
    questions: buildQuestions(inputCase, needs),
    audit: createAudit(inputCase, needs, risk, candidates, recommended),
  };
  plan.message = composeMessage(plan);
  return plan;
}

export function writeOutbox(plan, outboxPath) {
  const line = JSON.stringify({
    case_id: plan.case_id,
    risk_level: plan.risk_level,
    selected_resource_ids: plan.recommended_resources.map((r) => r.id),
    message: plan.message,
  });
  fs.mkdirSync(path.dirname(outboxPath), { recursive: true });
  fs.appendFileSync(outboxPath, `${line}\n`, "utf8");
}
