// live_priors/derived-priors/concern-priors/concern-field.test.mjs — the gate.
//
// The four falsify controls over the concern field, run against the real
// built artifacts:
//   1. DETERMINISM   buildOne is a pure function of (bytes, seeds): two
//                    builds of the same archon are byte-identical.
//   2. PROVENANCE    every admitted term's byte span contains the term at
//                    that address (the house law: nothing below is narrated
//                    that its own address cannot produce).
//   3. NULL-FLOOR    every admitted term's pValue is at the measured
//                    resolution (1/40) and below the standing alpha; the
//                    disclosed expected-spurious rate matches the recipe's
//                    own protocol. The two-seed intersection is the FDR
//                    control: a null term clears one 1/40 arm with
//                    probability 1/40, two independent arms ~1/1600.
//   4. DISTINCTIVE   same-source-independent archon pairs share fewer than
//                    half their salient terms (Jaccard < 0.5 — a structural
//                    bound: two fields sharing a majority cannot steer
//                    differently). Same-source pairs (two handles, one
//                    canon) are exempted and disclosed, never hidden.
//
//   node concern-field.test.mjs            run the gate, exit 0/1
//   node --test concern-field.test.mjs     same, node:test style
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadCast, buildOne, NULL_DRAWS, ALPHA } from "./concern-field.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, "concern-fields");

let failures = 0;
const fail = (name, msg) => { failures += 1; console.error(`  ✗ ${name}: ${msg}`); };
const pass = (name, msg) => console.log(`  ✓ ${name}${msg ? ` — ${msg}` : ""}`);

function readPrior(handle) {
  const slug = handle.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const f = path.join(OUT, `${slug}.json`);
  if (!fs.existsSync(f)) return null;
  return JSON.parse(fs.readFileSync(f, "utf8"));
}

const cast = loadCast();
const priors = [];
for (const [key, rec] of cast) {
  if (!rec.speakable) continue;
  const p = readPrior(key);
  if (p) priors.push(p);
}

console.log(`concern-field gate · ${priors.length} built priors · draws=${NULL_DRAWS} alpha=${ALPHA}\n`);

// ── 1. DETERMINISM ─────────────────────────────────────────────────────────
{
  const probes = ["nietzsche", "ramakrishna", "bukhari"].filter((k) => cast.has(k));
  let ok = true;
  for (const k of probes) {
    const rec = cast.get(k);
    const a = buildOne(rec);
    const b = buildOne(rec);
    if (a.gap || b.gap) { ok = false; fail("determinism", `${k} gap`); continue; }
    if (JSON.stringify(a.prior) !== JSON.stringify(b.prior)) {
      ok = false; fail("determinism", `${k} differs between identical builds`);
    }
  }
  if (ok) pass("determinism", `${probes.join(", ")} byte-identical across identical builds`);
}

// ── 2. PROVENANCE ──────────────────────────────────────────────────────────
{
  let checked = 0, bad = 0;
  for (const p of priors) {
    if (!p.source?.path) { bad += 1; fail("provenance", `${p.handle}: no source path`); continue; }
    let text;
    try { text = fs.readFileSync(path.join("/Users/mlacy/Documents/3.0", p.source.path), "utf8"); } catch (e) { bad += 1; fail("provenance", `${p.handle}: unreadable ${e.message}`); continue; }
    for (const t of p.terms) {
      for (const a of t.addresses) {
        checked += 1;
        const slice = text.slice(a.start, a.end).toLowerCase();
        if (slice !== t.term) { bad += 1; fail("provenance", `${p.handle}: ${t.term} @${a.start}-${a.end} → "${slice}"`); }
      }
    }
  }
  if (bad === 0) pass("provenance", `${checked} byte spans all contain their term`);
}

// ── 3. NULL-FLOOR ──────────────────────────────────────────────────────────
{
  let terms = 0, bad = 0, spurious = 0;
  for (const p of priors) {
    if (p.recipe?.nullDraws !== NULL_DRAWS) { bad += 1; fail("null-floor", `${p.handle}: nullDraws ${p.recipe?.nullDraws}`); }
    for (const t of p.terms) {
      terms += 1;
      if (t.pValue > 1 / (NULL_DRAWS + 1) || t.pValue >= ALPHA) { bad += 1; fail("null-floor", `${p.handle}: ${t.term} pValue ${t.pValue}`); }
    }
    if (p.instability?.secondSeedOnly?.length) spurious += p.instability.secondSeedOnly.length;
  }
  if (bad === 0) pass("null-floor", `${terms} admitted terms at resolution 1/${NULL_DRAWS + 1} < ${ALPHA}`);
  if (spurious === 0) pass("stability", "no term admitted by one seed arm was dropped by the other");
  else console.log(`  ~ ${spurious} second-seed-only drops recorded as disclosed dissent (the stability arm is the FDR control)`);
}

// ── 4. DISTINCTIVENESS ─────────────────────────────────────────────────────
{
  const jaccard = (a, b) => {
    const sa = new Set(a.terms.map((t) => t.term));
    const sb = new Set(b.terms.map((t) => t.term));
    let inter = 0;
    for (const t of sa) if (sb.has(t)) inter += 1;
    const union = sa.size + sb.size - inter;
    return union ? inter / union : 0;
  };
  const sameSource = new Map();
  for (const p of priors) {
    const k = p.source?.path ?? "?";
    if (!sameSource.has(k)) sameSource.set(k, []);
    sameSource.get(k).push(p);
  }
  const pairs = [];
  const sameSourcePairs = [];
  for (let i = 0; i < priors.length; i += 1) {
    for (let j = i + 1; j < priors.length; j += 1) {
      const a = priors[i], b = priors[j];
      const jac = jaccard(a, b);
      const pair = { a: a.handle, b: b.handle, jac };
      if (a.source?.path === b.source?.path) sameSourcePairs.push(pair);
      else pairs.push(pair);
    }
  }
  let bad = 0;
  const badPairs = [];
  for (const { a, b, jac } of pairs) {
    if (jac >= 0.5) { bad += 1; badPairs.push(`${a}/${b}=${jac.toFixed(3)}`); }
  }
  if (bad === 0) {
    pass("distinctiveness", `${pairs.length} different-source pairs, max Jaccard ${Math.max(...pairs.map((p) => p.jac)).toFixed(3)} < 0.5 (median ${pairs.sort((x, y) => x.jac - y.jac)[Math.floor(pairs.length / 2)].jac.toFixed(3)})`);
  } else {
    fail("distinctiveness", `${bad} pairs at Jaccard >= 0.5: ${badPairs.slice(0, 5).join(" · ")}`);
  }
  if (sameSourcePairs.length) {
    console.log(`  ~ ${sameSourcePairs.length} same-source pair(s) exempted and disclosed: ${sameSourcePairs.map((p) => `${p.a}/${p.b}`).join(", ")} — the same canon, near-identical by construction`);
  }
}

console.log(`\ngate: ${failures === 0 ? "PASS — all falsify controls hold" : `${failures} failure(s)`}`);
process.exit(failures === 0 ? 0 : 1);