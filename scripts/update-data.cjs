#!/usr/bin/env node
/**
 * IRCC Express Entry Draw Data Updater (React version)
 *
 * Fetches draw data from the official IRCC JSON API and updates
 * the latestDraws section in src/data/crsData.js.
 *
 * Usage:  npm run update-data
 * Or:     node scripts/update-data.js
 */

const https = require("https");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// ── Config ──
const IRCC_JSON_URL = process.env.IRCC_JSON_URL ||
  "https://www.canada.ca/content/dam/ircc/documents/json/ee_rounds_123_en.json";
const IRCC_JSON_OVERRIDE_FILE = process.env.IRCC_JSON_OVERRIDE_FILE;
const DATA_JS_PATH = process.env.CRS_DATA_PATH || path.join(__dirname, "..", "src", "data", "crsData.js");
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const MAX_CEC_DRAWS = 6;
const MAX_CATEGORY_DRAWS = 7;
const MAX_PNP_DRAWS = 5;

const CATEGORY_BASELINES = [
  {
    id: "french",
    name: "French-Language Proficiency",
    icon: "FR",
    description: "For candidates with strong French language skills. Cutoffs are significantly lower than general draws.",
    eligibility: "You need NCLC/CLB 7 or higher in ALL four French abilities (listening, reading, writing, speaking).",
    recentCutoff: 400,
    cutoffRange: "379–416",
  },
  {
    id: "healthcare",
    name: "Healthcare Occupations",
    icon: "HC",
    description: "For candidates working in healthcare and social services (nurses, doctors, pharmacists, medical technicians, etc.).",
    eligibility: "Your primary occupation must be in a healthcare or social services NOC code (e.g., NOC 31, 32, 33).",
    recentCutoff: 476,
    cutoffRange: "422–476",
  },
  {
    id: "stem",
    name: "STEM Occupations",
    icon: "ST",
    description: "For candidates in Science, Technology, Engineering, and Mathematics fields (software developers, engineers, data scientists, etc.).",
    eligibility: "Your primary occupation must be in a STEM-related NOC code (e.g., NOC 21, 22).",
    recentCutoff: 481,
    cutoffRange: "470–500",
  },
  {
    id: "trade",
    name: "Trade Occupations",
    icon: "TR",
    description: "For candidates in skilled trades (electricians, plumbers, welders, carpenters, etc.).",
    eligibility: "Your primary occupation must be in a trade-related NOC code (e.g., NOC 72, 73).",
    recentCutoff: 433,
    cutoffRange: "388–433",
  },
  {
    id: "transport",
    name: "Transport Occupations",
    icon: "TP",
    description: "For candidates in transport occupations (truck drivers, pilots, railway workers, etc.).",
    eligibility: "Your primary occupation must be in a transport-related NOC code (e.g., NOC 73, 75).",
    recentCutoff: 435,
    cutoffRange: "410–435",
  },
  {
    id: "agriculture",
    name: "Agriculture & Agri-food",
    icon: "AG",
    description: "For candidates in agriculture and agri-food occupations (farm workers, food processing, meat cutters, etc.).",
    eligibility: "Your primary occupation must be in an agriculture or agri-food NOC code (e.g., NOC 82, 84, 85).",
    recentCutoff: 440,
    cutoffRange: "354–440",
  },
];

const CATEGORY_MATCHERS = {
  french: (program) => program.includes("french"),
  healthcare: (program) => program.includes("healthcare") || program.includes("social services"),
  stem: (program) => program.includes("stem"),
  trade: (program) => program.includes("trade"),
  transport: (program) => program.includes("transport"),
  agriculture: (program) => program.includes("agri") || program.includes("agriculture"),
};

function canSyncToSupabase() {
  return Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
}

function sha256(input) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function getSupabaseHeaders() {
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
  };
}

function looksLikeMissingTable(detail = "") {
  const lower = String(detail).toLowerCase();
  return lower.includes("relation") && lower.includes("does not exist")
    || lower.includes("table") && lower.includes("not found");
}

function formatRange(min, max) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return "N/A";
  return `${Math.min(min, max)}–${Math.max(min, max)}`;
}

function buildCategoryConfigs(draws) {
  const sourceDraws = Array.isArray(draws) ? draws : [];
  return CATEGORY_BASELINES.map((base) => {
    const matcher = CATEGORY_MATCHERS[base.id] || (() => false);
    const relevant = sourceDraws
      .filter((draw) => matcher(String(draw.program || "").toLowerCase()))
      .slice(0, 12);
    if (!relevant.length) {
      return {
        ...base,
      };
    }
    const scores = relevant.map((draw) => Number(draw.score)).filter(Number.isFinite);
    const recentCutoff = scores[0] || base.recentCutoff;
    const min = scores.length ? Math.min(...scores) : base.recentCutoff;
    const max = scores.length ? Math.max(...scores) : base.recentCutoff;
    return {
      ...base,
      recentCutoff,
      cutoffRange: formatRange(min, max),
    };
  });
}

async function syncLatestDrawsToSupabase(latestDraws, rowsParsed, categoryConfigs = []) {
  if (!canSyncToSupabase()) {
    console.log("Supabase sync skipped (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set).");
    return { status: "skipped" };
  }

  let runId = null;
  let snapshotId = null;
  const source = "ircc_json";
  const startedAt = new Date().toISOString();
  const checksum = sha256(JSON.stringify(latestDraws));
  const baseUrl = SUPABASE_URL.replace(/\/+$/, "");

  const startRunRes = await fetch(`${baseUrl}/rest/v1/draw_update_runs`, {
    method: "POST",
    headers: {
      ...getSupabaseHeaders(),
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      source,
      status: "started",
      rows_parsed: rowsParsed,
      started_at: startedAt,
      message: "Draw update run started",
    }),
  });
  if (startRunRes.ok) {
    const runRows = await startRunRes.json();
    runId = runRows?.[0]?.id || null;
  }

  try {
    const snapshotPayload = {
      source,
      last_updated: latestDraws.lastUpdated,
      average_cutoff: latestDraws.averageCutoff,
      payload: latestDraws,
      checksum,
    };
    const snapshotRes = await fetch(`${baseUrl}/rest/v1/draw_snapshots?on_conflict=source,last_updated`, {
      method: "POST",
      headers: {
        ...getSupabaseHeaders(),
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify(snapshotPayload),
    });
    if (!snapshotRes.ok) {
      const detail = await snapshotRes.text();
      throw new Error(`Supabase draw snapshot upsert failed (${snapshotRes.status}): ${detail}`);
    }
    const snapshotRows = await snapshotRes.json();
    snapshotId = snapshotRows?.[0]?.id || null;

    let categorySyncStatus = "skipped";
    if (Array.isArray(categoryConfigs) && categoryConfigs.length > 0) {
      const categoryPayload = categoryConfigs.map((category) => ({
        id: category.id,
        source,
        is_active: true,
        name: category.name,
        icon: category.icon,
        description: category.description,
        eligibility: category.eligibility,
        recent_cutoff: Number(category.recentCutoff) || 0,
        cutoff_range: category.cutoffRange || "N/A",
        updated_at: new Date().toISOString(),
      }));

      const categoryRes = await fetch(`${baseUrl}/rest/v1/category_draw_configs?on_conflict=id,source`, {
        method: "POST",
        headers: {
          ...getSupabaseHeaders(),
          Prefer: "resolution=merge-duplicates,return=minimal",
        },
        body: JSON.stringify(categoryPayload),
      });
      if (!categoryRes.ok) {
        const detail = await categoryRes.text();
        if (looksLikeMissingTable(detail)) {
          categorySyncStatus = "table-missing";
          console.warn("Category config sync skipped: category_draw_configs table not found.");
        } else {
          throw new Error(`Supabase category config upsert failed (${categoryRes.status}): ${detail}`);
        }
      } else {
        categorySyncStatus = "ok";
      }
    }

    if (runId) {
      await fetch(`${baseUrl}/rest/v1/draw_update_runs?id=eq.${encodeURIComponent(runId)}`, {
        method: "PATCH",
        headers: {
          ...getSupabaseHeaders(),
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          status: "success",
          message: `Draw snapshot synced to Supabase (category configs: ${categorySyncStatus})`,
          snapshot_id: snapshotId,
          finished_at: new Date().toISOString(),
          rows_parsed: rowsParsed,
        }),
      });
    }

    console.log("Synced latest draws to Supabase draw_snapshots.");
    return { status: "ok", snapshotId };
  } catch (err) {
    if (runId) {
      await fetch(`${baseUrl}/rest/v1/draw_update_runs?id=eq.${encodeURIComponent(runId)}`, {
        method: "PATCH",
        headers: {
          ...getSupabaseHeaders(),
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          status: "error",
          message: String(err.message || err),
          finished_at: new Date().toISOString(),
          rows_parsed: rowsParsed,
        }),
      });
    }
    throw err;
  }
}

// ── Fetch JSON ──
function fetchJSON(url) {
  if (IRCC_JSON_OVERRIDE_FILE) {
    return new Promise((resolve, reject) => {
      try {
        console.log(`Using local IRCC JSON override: ${IRCC_JSON_OVERRIDE_FILE}`);
        const body = fs.readFileSync(IRCC_JSON_OVERRIDE_FILE, "utf8");
        resolve(JSON.parse(body));
      } catch (err) {
        reject(new Error(`Failed reading IRCC_JSON_OVERRIDE_FILE: ${err.message}`));
      }
    });
  }
  return new Promise((resolve, reject) => {
    console.log("Fetching IRCC Express Entry rounds JSON...");
    const req = https.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; CRSCalcBot/1.0; +immigration-calculator)",
        "Accept": "application/json",
        "Accept-Language": "en-CA,en;q=0.9",
      },
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchJSON(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      let body = "";
      res.on("data", (chunk) => body += chunk);
      res.on("end", () => {
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(new Error("Invalid JSON response")); }
      });
      res.on("error", reject);
    });
    req.on("error", reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error("Timeout")); });
  });
}

// ── Parse Draws from JSON ──
function parseDraws(json) {
  if (!json || typeof json !== "object") {
    throw new Error("IRCC JSON schema changed: expected a JSON object at root");
  }
  if (!Array.isArray(json.rounds)) {
    throw new Error("IRCC JSON schema changed: expected root field 'rounds' as an array");
  }

  const rounds = json.rounds;
  const draws = [];
  let skippedInvalid = 0;
  const missingFieldCounts = {
    drawCRS: 0,
    drawSize: 0,
    drawDate: 0,
    drawName: 0,
  };

  for (const r of rounds) {
    if (!r || typeof r !== "object") {
      skippedInvalid++;
      continue;
    }
    if (r.drawCRS == null || r.drawCRS === "") missingFieldCounts.drawCRS++;
    if (r.drawSize == null || r.drawSize === "") missingFieldCounts.drawSize++;
    if (r.drawDate == null || r.drawDate === "") missingFieldCounts.drawDate++;
    if (r.drawName == null || r.drawName === "") missingFieldCounts.drawName++;
    const score = parseInt((r.drawCRS || "").replace(/,/g, ""), 10);
    const invitations = parseInt((r.drawSize || "").replace(/,/g, ""), 10);
    if (isNaN(score) || isNaN(invitations) || !r.drawDate) {
      skippedInvalid++;
      continue;
    }

    draws.push({
      round: parseInt(r.drawNumber, 10) || 0,
      date: r.drawDate,
      program: r.drawName || "",
      invitations: invitations,
      score: score,
    });
  }
  draws.sort((a, b) => {
    if (a.round && b.round) return b.round - a.round;
    return String(b.date).localeCompare(String(a.date));
  });

  if (draws.length === 0) {
    throw new Error(
      `No valid draws parsed from IRCC JSON. Possible schema change. Missing field counts: ${JSON.stringify(missingFieldCounts)}; skippedInvalid=${skippedInvalid}`
    );
  }

  if (draws.length < Math.min(5, Math.ceil(rounds.length * 0.25))) {
    throw new Error(
      `Too few valid draws parsed (${draws.length}/${rounds.length}). Possible schema change. Missing field counts: ${JSON.stringify(missingFieldCounts)}; skippedInvalid=${skippedInvalid}`
    );
  }

  console.log(`Parsed ${draws.length} total draws from IRCC JSON.`);
  return draws;
}

// ── Categorize Draws ──
function categorizeDraws(draws) {
  const cecPrograms = ["canadian experience class", "no program specified"];
  const pnpPrograms = ["provincial nominee program"];

  const generalProgram = [];
  const categoryBased = [];
  const pnpDraws = [];

  for (const draw of draws) {
    const lower = draw.program.toLowerCase();
    if (pnpPrograms.some(p => lower.includes(p))) {
      pnpDraws.push(formatDraw(draw));
    } else if (cecPrograms.some(p => lower.includes(p))) {
      generalProgram.push(formatDraw(draw));
    } else {
      categoryBased.push(formatDraw(draw));
    }
  }

  const recentCEC = generalProgram.slice(0, MAX_CEC_DRAWS);
  const avgCutoff = recentCEC.length > 0
    ? Math.round(recentCEC.reduce((sum, d) => sum + d.score, 0) / recentCEC.length)
    : 520;

  const recentPNP = pnpDraws.slice(0, MAX_PNP_DRAWS);
  const pnpScores = recentPNP.map(d => d.score);
  const pnpLow = pnpScores.length > 0 ? Math.min(...pnpScores) : 699;
  const pnpHigh = pnpScores.length > 0 ? Math.max(...pnpScores) : 778;

  return {
    lastUpdated: new Date().toISOString().slice(0, 10),
    generalProgram: generalProgram.slice(0, MAX_CEC_DRAWS),
    categoryBased: categoryBased.slice(0, MAX_CATEGORY_DRAWS),
    pnpDraws: recentPNP,
    pnpRanges: {
      low: pnpLow,
      high: pnpHigh,
      note: "PNP candidates receive +600 CRS. Typical base: 80\u2013250.",
    },
    averageCutoff: avgCutoff,
  };
}

function formatDraw(draw) {
  return {
    date: draw.date,
    score: draw.score,
    invitations: draw.invitations,
    program: cleanProgramName(draw.program),
  };
}

function cleanProgramName(name) {
  return name
    .replace(/\s*\(Version\s*\d+\)/gi, "")
    .replace(/\s*\d{4}-Version\s*\d+/gi, "")
    .trim();
}

// ── Update crsData.js ──
function updateDataFile(latestDraws) {
  if (!fs.existsSync(DATA_JS_PATH)) {
    console.error(`Cannot find ${DATA_JS_PATH}`);
    process.exit(1);
  }

  let content = fs.readFileSync(DATA_JS_PATH, "utf8");

  // Find "export const latestDraws = {" marker
  const startMarker = "export const latestDraws = {";
  const startIdx = content.indexOf(startMarker);
  if (startIdx === -1) {
    console.error("Could not find 'export const latestDraws = {' in crsData.js");
    process.exit(1);
  }

  // Find the matching closing brace + semicolon
  let braceCount = 0;
  let endIdx = -1;
  for (let i = startIdx + startMarker.length - 1; i < content.length; i++) {
    if (content[i] === "{") braceCount++;
    if (content[i] === "}") {
      braceCount--;
      if (braceCount === 0) {
        // Include the closing brace and optional semicolon
        endIdx = i + 1;
        if (content[endIdx] === ";") endIdx++;
        break;
      }
    }
  }

  if (endIdx === -1) {
    console.error("Could not find closing brace for latestDraws object");
    process.exit(1);
  }

  const replacement = buildLatestDrawsJS(latestDraws);
  content = content.slice(0, startIdx) + replacement + content.slice(endIdx);
  fs.writeFileSync(DATA_JS_PATH, content, "utf8");

  console.log(`Updated ${DATA_JS_PATH}`);
  console.log(`  - ${latestDraws.generalProgram.length} CEC/general draws`);
  console.log(`  - ${latestDraws.categoryBased.length} category-based draws`);
  console.log(`  - ${latestDraws.pnpDraws.length} PNP draws`);
  console.log(`  - Average CEC cutoff: ${latestDraws.averageCutoff}`);
  console.log(`  - Last updated: ${latestDraws.lastUpdated}`);
}

function buildLatestDrawsJS(data) {
  const esc = (value) => String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');
  const lines = [];
  lines.push("export const latestDraws = {");
  lines.push(`  lastUpdated: "${esc(data.lastUpdated)}",`);

  lines.push("  generalProgram: [");
  for (const d of data.generalProgram) {
    lines.push(`    { date: "${esc(d.date)}", score: ${d.score}, invitations: ${d.invitations}, program: "${esc(d.program)}" },`);
  }
  lines.push("  ],");

  lines.push("  categoryBased: [");
  for (const d of data.categoryBased) {
    lines.push(`    { date: "${esc(d.date)}", score: ${d.score}, invitations: ${d.invitations}, program: "${esc(d.program)}" },`);
  }
  lines.push("  ],");

  lines.push("  pnpDraws: [");
  for (const d of data.pnpDraws) {
    lines.push(`    { date: "${esc(d.date)}", score: ${d.score}, invitations: ${d.invitations}, program: "${esc(d.program)}" },`);
  }
  lines.push("  ],");

  lines.push(`  pnpRanges: { low: ${data.pnpRanges.low}, high: ${data.pnpRanges.high}, note: "${esc(data.pnpRanges.note)}" },`);
  lines.push(`  averageCutoff: ${data.averageCutoff},`);
  lines.push("};");

  return lines.join("\n");
}

// ── Main ──
async function main() {
  try {
    const json = await fetchJSON(IRCC_JSON_URL);
    const allDraws = parseDraws(json);

    const latestDraws = categorizeDraws(allDraws);
    const categoryConfigs = buildCategoryConfigs(allDraws);
    updateDataFile(latestDraws);
    await syncLatestDrawsToSupabase(latestDraws, allDraws.length, categoryConfigs);

    console.log("\nDone! Draw data updated successfully.");
  } catch (err) {
    console.error("Error:", err.message);
    process.exit(1);
  }
}

main();
