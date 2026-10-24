#!/usr/bin/env node
// CLI the daily runs call so the deterministic rules are code, not memory.
//   node loop/check.js gate   drafts.json                         -> PASS/BLOCK per draft (mechanical rules only)
//   node loop/check.js select queue.json posted.json              -> rows the publish run may act on (posted.json is required; use [] if none today)
//   node loop/check.js learn  stats.json --weights A=40,B=35,C=25 [--loser C]
//        weights and yesterday's loser come from the top line of the learnings log (fresh sessions keep no files)
"use strict";
const fs = require("node:fs");
const cfg = require("./config.json");
const L = require("./lib.js");
const args = process.argv.slice(2);
const cmd = args[0];
const read = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const flag = (name) => { const i = args.indexOf(name); return i > -1 ? args[i + 1] : undefined; };
const die = (msg) => { console.error(msg); process.exit(2); };
if (cmd === "gate") {
  if (!args[1]) die("gate needs drafts.json");
  let blocked = 0;
  for (const d of read(args[1])) {
    const p = L.gateMechanical(d, cfg);
    if (p.length) blocked++;
    console.log(`${p.length ? "BLOCK" : "PASS "} ${d.id || ""} ${p.map((x) => `${x.rule}: ${x.detail}`).join(" | ")}`);
  }
  process.exitCode = blocked ? 1 : 0;
} else if (cmd === "select") {
  if (!args[1] || !args[2]) die("select needs queue.json AND posted.json (write [] if nothing was posted today, KST)");
  console.log(JSON.stringify(L.selectPublishable(read(args[1]), read(args[2]), cfg), null, 2));
} else if (cmd === "learn") {
  const w = flag("--weights");
  if (!args[1] || !w) die("learn needs stats.json and --weights A=..,B=..,C=.. from the top line of the learnings log");
  const weights = Object.fromEntries(w.split(",").map((kv) => { const [k, v] = kv.split("="); return [k.trim(), Number(v)]; }));
  if (Object.values(weights).some((v) => !Number.isFinite(v))) die(`bad --weights ${w}`);
  console.log(JSON.stringify(L.updateWeights(weights, read(args[1]), flag("--loser") || null, cfg), null, 2));
} else {
  die("usage: node loop/check.js gate|select|learn ...");
}
