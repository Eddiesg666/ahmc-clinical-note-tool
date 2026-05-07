export type Disposition = "Admit" | "Observe" | "Discharge" | "Unknown";

export type StructuredResult = {
  chiefComplaint: string;
  hpiSummary: string;
  keyFindings: string[];
  suspectedConditions: string[];
  dispositionRecommendation: Disposition;
  uncertainties: string[];
  revisedHpi: string;
  evidence: {
    demographics?: string;
    symptoms: string[];
    exam: string[];
    labs: string[];
    treatments: string[];
    dispositionSignals: string[];
  };
  generatedBy: "rule_based_engine";
};

type ExtractedFacts = {
  age?: number;
  sex?: "male" | "female";
  chiefComplaint?: string;
  diabetesType?: string;
  symptoms: string[];
  exam: string[];
  labs: {
    glucose?: string;
    ketones?: string;
    acetone?: string;
    ph?: string;
    bicarbonate?: string;
    co2?: string;
    sodium?: string;
    creatinine?: string;
    anionGap?: string;
    lactate?: string;
    wbc?: string;
  };
  treatments: string[];
  diagnoses: string[];
  dispositionSignals: string[];
  uncertainties: string[];
};

function normalize(note: string): string {
  return note
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function lower(note: string): string {
  return normalize(note).toLowerCase();
}

function firstMatch(text: string, patterns: RegExp[]): string | undefined {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return undefined;
}

function hasAny(text: string, phrases: string[]): boolean {
  return phrases.some((phrase) => text.includes(phrase.toLowerCase()));
}

function addUnique(arr: string[], value?: string) {
  if (value && !arr.includes(value)) arr.push(value);
}

function extractDemographics(raw: string, lraw: string, facts: ExtractedFacts) {
  const compactAgeSex = raw.match(/\b(\d{1,3})\s*([MF])\b/i);
  const ageYearOld = raw.match(/\b(\d{1,3})[- ]year[- ]old\s+(male|female|man|woman|m|f)\b/i);

  if (compactAgeSex) {
    facts.age = Number(compactAgeSex[1]);
    facts.sex = compactAgeSex[2].toUpperCase() === "M" ? "male" : "female";
  } else if (ageYearOld) {
    facts.age = Number(ageYearOld[1]);
    const sexWord = ageYearOld[2].toLowerCase();
    facts.sex = ["male", "man", "m"].includes(sexWord) ? "male" : "female";
  }

  if (!facts.sex) {
    if (/\b(yof|female|woman)\b/i.test(raw)) facts.sex = "female";
    if (/\b(yom|male|man)\b/i.test(raw)) facts.sex = "male";
  }

  if (lraw.includes("insulin-dependent diabetes") || lraw.includes("iddm") || lraw.includes("t1dm")) {
    facts.diabetesType = "insulin-dependent diabetes";
  } else if (lraw.includes("recent diagnosis of diabetes") || lraw.includes("new onset diabetes")) {
    facts.diabetesType = "recently diagnosed diabetes";
  } else if (lraw.includes("diabetes")) {
    facts.diabetesType = "diabetes";
  }
}

function extractChiefComplaint(raw: string): string | undefined {
  return firstMatch(raw, [
    /chief complaint[:\s]+([^\n]+)/i,
    /physician chart chief complaint[:\s]+([^\n]+)/i
  ]);
}

function extractSymptoms(lraw: string, symptoms: string[]) {
  if (hasAny(lraw, ["altered mental status", "ams"])) addUnique(symptoms, "altered mental status");
  if (hasAny(lraw, ["nausea"])) addUnique(symptoms, "nausea");
  if (hasAny(lraw, ["vomiting", "emesis"])) addUnique(symptoms, "vomiting");
  if (hasAny(lraw, ["weakness"])) addUnique(symptoms, "weakness");

  if (
    hasAny(lraw, [
      "unable to tolerate p.o",
      "unable to tolerate oral",
      "unable to tolerate po",
      "unable to tolerate diet"
    ])
  ) {
    addUnique(symptoms, "poor oral intake");
  }

  if (hasAny(lraw, ["unable to take deep breaths", "difficulty taking deep breaths"])) {
    addUnique(symptoms, "difficulty taking deep breaths");
  }

  if (hasAny(lraw, ["unable to sleep", "sleep well", "restless"])) {
    addUnique(symptoms, "restlessness or inability to sleep");
  }

  if (hasAny(lraw, ["3 days nausea", "3 days of nausea", "three days nausea"])) {
    addUnique(symptoms, "3 days of nausea/vomiting");
  }
}

function extractExam(lraw: string, exam: string[]) {
  if (hasAny(lraw, ["kussmaul breathing"])) addUnique(exam, "Kussmaul breathing");
  if (hasAny(lraw, ["tachycardic", "tachycardia was present", "mildly tachycardic"])) {
    addUnique(exam, "tachycardia");
  }
  if (hasAny(lraw, ["tachypneic", "mildly tachypneic"])) addUnique(exam, "tachypnea");
  if (hasAny(lraw, ["ill-appearing", "ill appearing"])) addUnique(exam, "ill-appearing");
  if (hasAny(lraw, ["lethargic"])) addUnique(exam, "lethargy");
  if (hasAny(lraw, ["not alert", "not oriented", "responding to painful stimuli", "reactive to noxious stimuli"])) {
    addUnique(exam, "altered mentation on exam");
  }
}

function extractLabValue(raw: string, labelPatterns: RegExp[]): string | undefined {
  for (const pattern of labelPatterns) {
    const match = raw.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return undefined;
}

function extractLabs(raw: string, lraw: string, labs: ExtractedFacts["labs"]) {
  labs.glucose = extractLabValue(raw, [
    /\b(?:glucose|glu)\b[^0-9<]{0,20}(<*\s*\d{2,4})\s*(?:HH|H|mg\/dL)?/i,
    /serum glucose of\s*(\d{2,4})/i,
    /glucose\s*(?:remained|was)?\s*(?:in the normal range)?[^0-9]{0,20}(\d{2,4})/i
  ]);

  labs.ph = extractLabValue(raw, [
    /\b(?:ApH|V pH|pH)\b[^0-9]{0,20}(\d\.\d{1,3})/i,
    /pH of\s*(\d\.\d{1,3})/i,
    /pH\s*(\d\.\d{1,3})/i
  ]);

  labs.bicarbonate = extractLabValue(raw, [
    /\b(?:AHCO3|HCO3|bicarb|bicarbonate)\b[^0-9<]{0,20}(<*\s*\d{1,2}(?:\.\d+)?)/i,
    /bicarb(?:onate)?\s*(?:of)?\s*(less than\s*\d+|<\s*\d+|\d{1,2}(?:\.\d+)?)/i
  ]);

  labs.co2 = extractLabValue(raw, [
    /\bCO2\b[^0-9<]{0,20}(<*\s*\d{1,2})/i,
    /carbon dioxide[^0-9<]{0,20}(<*\s*\d{1,2})/i
  ]);

  labs.sodium = extractLabValue(raw, [
    /\bSODIUM\b[^0-9]{0,20}(\d{2,3})/i,
    /sodium of\s*(\d{2,3})/i
  ]);

  labs.creatinine = extractLabValue(raw, [
    /\bCREATININE\.?\b[^0-9]{0,20}(\d+(?:\.\d+)?)/i,
    /creatinine of\s*(\d+(?:\.\d+)?)/i
  ]);

  labs.anionGap = extractLabValue(raw, [
    /anion gap[^0-9]{0,20}(\d+(?:\.\d+)?)/i
  ]);

  labs.lactate = extractLabValue(raw, [
    /\b(?:lactic acid|lactate)\b[^0-9]{0,20}(\d+(?:\.\d+)?)/i
  ]);

  labs.wbc = extractLabValue(raw, [
    /\bWBC\b[^0-9]{0,20}(\d+(?:\.\d+)?)/i
  ]);

  if (hasAny(lraw, ["large acetone", "acetone large"])) {
    labs.acetone = "large";
  }

  if (hasAny(lraw, ["ketones large", "large ketones", "ketone: 60", "ketone 60", "ketonuria", "ketonemia"])) {
    labs.ketones = hasAny(lraw, ["ketone: 60", "ketone 60"]) ? "urine ketones 60" : "large";
  }
}

function extractTreatments(lraw: string, treatments: string[]) {
  if (hasAny(lraw, ["insulin drip", "insulin infusion"])) addUnique(treatments, "insulin drip/infusion");
  if (hasAny(lraw, ["normal saline", "ns ", "iv fluids", "intravenous fluids", "fluid resuscitation"])) {
    addUnique(treatments, "intravenous fluids");
  }
  if (
  hasAny(lraw, [
    "given bicarb",
    "received bicarb",
    "administered bicarb",
    "given bicarbonate",
    "received bicarbonate",
    "administered bicarbonate",
    "bicarbonate therapy"
  ])
) {
  addUnique(treatments, "bicarbonate therapy");
}
  if (hasAny(lraw, ["antibiotics", "broad-spectrum antibiotics", "empiric antibiotics"])) {
    addUnique(treatments, "empiric antibiotics");
  }
  if (hasAny(lraw, ["electrolyte monitoring", "potassium supplementation", "bmp q4h", "serial electrolyte"])) {
    addUnique(treatments, "electrolyte and serial laboratory monitoring");
  }
  if (hasAny(lraw, ["fingerstick q1h", "bedside glucose", "blood glucose levels will be closely monitored"])) {
    addUnique(treatments, "frequent glucose monitoring");
  }
}

function extractDiagnoses(lraw: string, diagnoses: string[]) {
  if (hasAny(lraw, ["euglycemic dka", "euglycemic diabetic ketoacidosis"])) {
    addUnique(diagnoses, "euglycemic diabetic ketoacidosis");
  } else if (hasAny(lraw, ["diabetic ketoacidosis", " dka"])) {
    addUnique(diagnoses, "diabetic ketoacidosis");
  }

  if (hasAny(lraw, ["hyperglycemia", "elevated blood glucose"])) addUnique(diagnoses, "hyperglycemia");
  if (hasAny(lraw, ["lactic acidosis"])) addUnique(diagnoses, "lactic acidosis");
  if (hasAny(lraw, ["possible infection", "sepsis", "blood cultures", "empiric antibiotics"])) {
    addUnique(diagnoses, "possible infectious trigger");
  }
}

function extractDispositionSignals(lraw: string, signals: string[]) {
  if (hasAny(lraw, ["admit to icu", "admission to the icu", "icu admission", "critical care"])) {
    addUnique(signals, "ICU-level care documented");
  }
  if (hasAny(lraw, ["critical care time"])) addUnique(signals, "critical care involvement");
  if (hasAny(lraw, ["admission requested", "patient admitted", "requires admission"])) {
    addUnique(signals, "admission requested/documented");
  }
  if (hasAny(lraw, ["aggressive management", "close monitoring", "life-threatening"])) {
    addUnique(signals, "need for aggressive management and close monitoring");
  }
}

function buildUncertainties(raw: string, lraw: string, facts: ExtractedFacts) {
  if (hasAny(lraw, ["history limited", "unable to complete portions", "limited by mentation"])) {
    addUnique(facts.uncertainties, "History and review of systems were limited by the patient's altered mentation or urgent condition.");
  }
  if (hasAny(lraw, ["unclear dm2 versus dm 1", "unclear dm2 versus dm1"])) {
    addUnique(facts.uncertainties, "Diabetes type is not fully clear in the source note.");
  }
  if (hasAny(lraw, ["social history is unknown", "social history: unknown"])) {
    addUnique(facts.uncertainties, "Social history is unknown.");
  }
  if (hasAny(lraw, ["family history: unknown", "family history is unknown"])) {
    addUnique(facts.uncertainties, "Family history is unknown.");
  }
  if (hasAny(lraw, ["possible infection", "sepsis", "pending further evaluation", "cultures and imaging"])) {
    addUnique(facts.uncertainties, "Possible infection was considered as a precipitating factor, but the source note does not confirm a specific infection.");
  }
  if (hasAny(lraw, ["taking asa and lisinopril for unknown reason"])) {
    addUnique(facts.uncertainties, "Reason for aspirin and lisinopril use is not confirmed.");
  }
  if (!facts.chiefComplaint) {
  addUnique(
    facts.uncertainties,
    "Chief complaint was not clearly labeled and was inferred from the available note."
  );
}
}

function numberFromValue(value?: string): number | undefined {
  if (!value) return undefined;
  const cleaned = value.replace(/less than/i, "").replace(/[^\d.]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : undefined;
}

function determineDisposition(facts: ExtractedFacts): Disposition {
  const glucose = numberFromValue(facts.labs.glucose);
  const ph = numberFromValue(facts.labs.ph);
  const bicarbonate = numberFromValue(facts.labs.bicarbonate ?? facts.labs.co2);

  const hasDka = facts.diagnoses.some((d) => d.includes("ketoacidosis"));
  const hasKetones = Boolean(facts.labs.ketones || facts.labs.acetone);
  const hasAcidosis =
    (ph !== undefined && ph < 7.3) ||
    (bicarbonate !== undefined && bicarbonate <= 18) ||
    Boolean(facts.labs.anionGap);

  const inpatientTriggers = [
    facts.exam.includes("altered mentation on exam"),
    facts.symptoms.includes("altered mental status"),
    facts.treatments.includes("insulin drip/infusion"),
    facts.dispositionSignals.some((s) => s.includes("ICU")),
    bicarbonate !== undefined && bicarbonate < 15,
    ph !== undefined && ph <= 7.25,
    glucose !== undefined && glucose >= 600
  ];

  if ((hasDka || (hasKetones && hasAcidosis)) && inpatientTriggers.some(Boolean)) {
    return "Admit";
  }

  if (hasDka || hasKetones || hasAcidosis) {
    return "Observe";
  }

  return "Unknown";
}

function formatPatientIntro(facts: ExtractedFacts): string {
  const ageSex =
    facts.age && facts.sex
      ? `${facts.age}-year-old ${facts.sex === "male" ? "man" : "woman"}`
      : facts.age
        ? `${facts.age}-year-old patient`
        : "The patient";

  const diabetes = facts.diabetesType ? ` with ${facts.diabetesType}` : "";
  return `${ageSex}${diabetes}`;
}

function formatSymptomsForNarrative(facts: ExtractedFacts): string {
  const symptoms = facts.symptoms;

  const hasAms = symptoms.includes("altered mental status");
  const hasThreeDayGi = symptoms.includes("3 days of nausea/vomiting");
  const hasNausea = symptoms.includes("nausea");
  const hasVomiting = symptoms.includes("vomiting");
  const hasWeakness = symptoms.includes("weakness");

  if (hasAms && hasThreeDayGi && hasWeakness) {
    return "altered mental status after approximately three days of nausea, vomiting, and weakness";
  }

  if (hasThreeDayGi && hasWeakness) {
    return "approximately three days of nausea, vomiting, and weakness";
  }

  const cleaned = symptoms.filter((symptom) => {
    if (hasThreeDayGi && (symptom === "nausea" || symptom === "vomiting")) return false;
    return true;
  });

  return cleaned.length ? cleaned.join(", ") : "emergency evaluation";
}

function buildHpiSummary(facts: ExtractedFacts): string {
  const intro = formatPatientIntro(facts);
  const symptomText = formatSymptomsForNarrative(facts);

  const dxText = facts.diagnoses.length
    ? `Evaluation was concerning for ${facts.diagnoses.join(", ")}.`
    : "The available note does not clearly document a final suspected condition.";

  return `${intro} presented with ${symptomText}. ${dxText}`;
}

function buildKeyFindings(facts: ExtractedFacts): string[] {
  const findings: string[] = [];

  for (const symptom of facts.symptoms) addUnique(findings, `Symptom: ${symptom}`);
  for (const exam of facts.exam) addUnique(findings, `Exam: ${exam}`);

  if (facts.labs.glucose) addUnique(findings, `Glucose: ${facts.labs.glucose} mg/dL`);
  if (facts.labs.acetone) addUnique(findings, `Acetone: ${facts.labs.acetone}`);
  if (facts.labs.ketones) addUnique(findings, `Ketones: ${facts.labs.ketones}`);
  if (facts.labs.ph) addUnique(findings, `pH: ${facts.labs.ph}`);
  if (facts.labs.bicarbonate) addUnique(findings, `Bicarbonate: ${facts.labs.bicarbonate}`);
  if (facts.labs.co2) addUnique(findings, `CO2: ${facts.labs.co2}`);
  if (facts.labs.sodium) addUnique(findings, `Sodium: ${facts.labs.sodium} mmol/L`);
  if (facts.labs.creatinine) addUnique(findings, `Creatinine: ${facts.labs.creatinine} mg/dL`);
  if (facts.labs.anionGap) addUnique(findings, `Anion gap: ${facts.labs.anionGap}`);
  if (facts.labs.lactate) addUnique(findings, `Lactate/lactic acid: ${facts.labs.lactate}`);
  if (facts.labs.wbc) addUnique(findings, `WBC: ${facts.labs.wbc}`);

  for (const treatment of facts.treatments) addUnique(findings, `Treatment/plan: ${treatment}`);
  for (const signal of facts.dispositionSignals) addUnique(findings, `Disposition signal: ${signal}`);

  return findings;
}

function formatExamForNarrative(facts: ExtractedFacts): string {
  const exam = facts.exam;

  const descriptors: string[] = [];
  const findings: string[] = [];

  if (exam.includes("ill-appearing")) descriptors.push("ill-appearing");
  if (exam.includes("lethargy")) descriptors.push("lethargic");

  if (exam.includes("tachycardia")) findings.push("tachycardia");
  if (exam.includes("tachypnea")) findings.push("tachypnea");
  if (exam.includes("Kussmaul breathing")) findings.push("Kussmaul breathing");
  if (exam.includes("altered mentation on exam")) findings.push("altered mentation");

  if (descriptors.length && findings.length) {
    return `was described as ${descriptors.join(" and ")}, with ${findings.join(", ")}`;
  }

  if (descriptors.length) {
    return `was described as ${descriptors.join(" and ")}, with ${joinWithAnd(findings)}`;
  }

  if (findings.length) {
    return `was documented to have ${findings.join(", ")}`;
  }

  return `was documented to have ${exam.join(", ")}`;
}

function joinWithAnd(items: string[]): string {
  if (items.length <= 1) return items.join("");
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function buildRevisedHpi(facts: ExtractedFacts, disposition: Disposition): string {
  const sentences: string[] = [];
  const intro = formatPatientIntro(facts);
  const symptomText = formatSymptomsForNarrative(facts);

  sentences.push(`${intro} presented to the emergency department with ${symptomText}.`);

  if (facts.uncertainties.some((item) => item.toLowerCase().includes("history and review"))) {
    sentences.push("History was limited by the patient's mentation and urgency of condition.");
  }

  if (facts.exam.length > 0) {
    sentences.push(`On evaluation, the patient ${formatExamForNarrative(facts)}.`);
  }

  const labParts: string[] = [];
  if (facts.labs.glucose) labParts.push(`glucose ${facts.labs.glucose} mg/dL`);
  if (facts.labs.acetone) labParts.push(`${facts.labs.acetone} acetone`);
  if (facts.labs.ketones) labParts.push(`${facts.labs.ketones} ketones`);
  if (facts.labs.ph) labParts.push(`pH ${facts.labs.ph}`);
  if (facts.labs.bicarbonate) labParts.push(`bicarbonate ${facts.labs.bicarbonate}`);
  if (facts.labs.co2) labParts.push(`CO2 ${facts.labs.co2}`);
  if (facts.labs.sodium) labParts.push(`sodium ${facts.labs.sodium}`);
  if (facts.labs.creatinine) labParts.push(`creatinine ${facts.labs.creatinine}`);

  if (labParts.length > 0) {
    sentences.push(
      `Laboratory evaluation demonstrated ${labParts.join(", ")}, supporting clinically significant ketoacidosis and metabolic derangement.`
    );
  }

  if (facts.diagnoses.length > 0) {
    sentences.push(`Emergency clinicians documented concern for ${facts.diagnoses.join(", ")}.`);
  }

  if (facts.treatments.length > 0) {
    sentences.push(`Emergency department management included ${facts.treatments.join(", ")}.`);
  }

  if (disposition === "Admit") {
    const reasons = [
      facts.labs.ph ? "documented acidosis" : undefined,
      facts.labs.bicarbonate || facts.labs.co2 ? "markedly low bicarbonate/CO2" : undefined,
      facts.labs.acetone || facts.labs.ketones ? "ketosis" : undefined,
      facts.symptoms.includes("altered mental status") || facts.exam.includes("altered mentation on exam")
        ? "altered mental status"
        : undefined,
      facts.treatments.includes("insulin drip/infusion") ? "need for continuous insulin therapy" : undefined,
      facts.dispositionSignals.some((s) => s.includes("ICU")) ? "ICU-level monitoring" : undefined
    ].filter(Boolean) as string[];

    sentences.push(
      `Taken together, the ${joinWithAnd(reasons)} supported inpatient admission rather than discharge or routine outpatient management.`
    );
  } else if (disposition === "Observe") {
    sentences.push(
      "The available findings suggest the patient may require continued monitoring, though the note does not clearly document enough inpatient-level triggers for a deterministic admission recommendation."
    );
  } else {
    sentences.push(
      "The note does not contain enough clearly extractable information to make a confident disposition recommendation."
    );
  }

  return sentences.join(" ");
}

function inferChiefComplaint(facts: ExtractedFacts): string {
  if (facts.chiefComplaint) return facts.chiefComplaint;

  const hasAms =
    facts.symptoms.includes("altered mental status") ||
    facts.exam.includes("altered mentation on exam");

  const hasHyperglycemia =
    facts.diagnoses.includes("hyperglycemia") ||
    Boolean(facts.labs.glucose && Number(facts.labs.glucose.replace(/[^\d.]/g, "")) >= 200);

  if (hasAms && hasHyperglycemia) return "Altered mental status and hyperglycemia";
  if (hasAms) return "Altered mental status";
  if (hasHyperglycemia) return "Hyperglycemia";
  if (facts.diagnoses.some((d) => d.includes("ketoacidosis"))) return "Diabetic ketoacidosis";

  return "Unknown";
}

function buildTitle(facts: ExtractedFacts): string {
  const cc = facts.chiefComplaint || facts.diagnoses[0] || "Clinical note";
  const ageSex = facts.age ? `${facts.age}${facts.sex ? facts.sex[0].toUpperCase() : ""}` : "Unknown patient";
  return `${ageSex} - ${cc}`.slice(0, 100);
}

export function structureClinicalNote(note: string): { title: string; result: StructuredResult } {
  const raw = normalize(note);
  const lraw = lower(note);

  const facts: ExtractedFacts = {
    symptoms: [],
    exam: [],
    labs: {},
    treatments: [],
    diagnoses: [],
    dispositionSignals: [],
    uncertainties: []
  };

  facts.chiefComplaint = extractChiefComplaint(raw);
  extractDemographics(raw, lraw, facts);
  extractSymptoms(lraw, facts.symptoms);
  extractExam(lraw, facts.exam);
  extractLabs(raw, lraw, facts.labs);
  extractTreatments(lraw, facts.treatments);
  extractDiagnoses(lraw, facts.diagnoses);
  extractDispositionSignals(lraw, facts.dispositionSignals);
  buildUncertainties(raw, lraw, facts);

  const disposition = determineDisposition(facts);

  const result: StructuredResult = {
    chiefComplaint: inferChiefComplaint(facts),
    hpiSummary: buildHpiSummary(facts),
    keyFindings: buildKeyFindings(facts),
    suspectedConditions: facts.diagnoses.length ? facts.diagnoses : ["Unknown"],
    dispositionRecommendation: disposition,
    uncertainties: facts.uncertainties.length
      ? facts.uncertainties
      : ["No major missing information detected by the rule-based parser."],
    revisedHpi: buildRevisedHpi(facts, disposition),
    evidence: {
      demographics:
        facts.age || facts.sex || facts.diabetesType
          ? [facts.age ? `${facts.age} years old` : undefined, facts.sex, facts.diabetesType].filter(Boolean).join(", ")
          : undefined,
      symptoms: facts.symptoms,
      exam: facts.exam,
      labs: Object.entries(facts.labs)
        .filter(([, value]) => Boolean(value))
        .map(([key, value]) => `${key}: ${value}`),
      treatments: facts.treatments,
      dispositionSignals: facts.dispositionSignals
    },
    generatedBy: "rule_based_engine"
  };

  return {
    title: buildTitle(facts),
    result
  };
}