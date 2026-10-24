#!/usr/bin/env node
// CLI the daily runs call so the deterministic rules are code, not memory.
//   node loop/check.js gate   drafts.json              -> PASS/BLOCK per draft (mechanical rules only)
//   node loop/check.js select queue.json posted.json   -> which rows the publish run may act on
//   node loop/check.js learn  stats.json [loserYesterday] -> tomorrow's angle weights
"use strict";
const fs = require("node:fs");
const cfg = require("./config.json");
const L = require("./lib.js");
const [cmd, a, b] = process.argv.slice(2);
const read = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
if (cmd === "gate") {
  for (const d of read(a)) {
    const p = L.gateMechanical(d, cfg);
    console.log(`${p.length ? "BLOCK" : "PASS "} ${d.id || ""} ${p.map((x) => `${x.rule}: ${x.detail}`).join(" | ")}`);
  }
} else if (cmd === "select") {
  console.log(JSON.stringify(L.selectPublishable(read(a), b ? read(b) : [], cfg), null, 2));
} else if (cmd === "learn") {
  const w = fs.existsSync("weights.json") ? read("weights.json") : cfg.startWeights;
  console.log(JSON.stringify(L.updateWeights(w, read(a), b || null, cfg), null, 2));
} else {
  console.error("usage: node loop/check.js gate|select|learn <file> [file|angle]");
  process.exit(2);
}
