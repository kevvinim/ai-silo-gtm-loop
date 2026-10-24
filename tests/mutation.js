// Red-before-green: sabotage each safeguard in loop/lib.js one at a time and confirm the tests catch it.
// Run: node tests/mutation.js   (exits 1 if any sabotage goes unnoticed)
"use strict";
const fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const { spawnSync } = require("node:child_process");
const src = fs.readFileSync(path.join(__dirname, "..", "loop", "lib.js"), "utf8");
const M = [
  ["remove daily cap", "if ((used[k] || 0) >= cap)", "if (false)"],
  ["publish unapproved rows", "if (!r.approved)", "if (false)"],
  ["ignore gate verdict", 'if (!String(r.gateNotes || "").startsWith("PASS"))', "if (false)"],
  ["post Blocked rows", 'if (r.status !== "Drafted")', "if (false)"],
  ["auto-post LinkedIn", "if (!ch.auto)", "if (false)"],
  ["drop per-run limit", "if ((perRun[r.channel] || 0) >= cfg.perRunMaxPerChannel)", "if (false)"],
  ["skip banned patterns", "for (const b of cfg.bannedPatterns)", "for (const b of [])"],
  ["skip quote check", "if (!sourced.some((s) => s.includes(q)))", "if (false)"],
  ["skip utm_source check", "if (t.source !== draft.channel)", "if (false)"],
  ["skip utm_campaign check", "if (t.campaign !== `d${draft.day}`)", "if (false)"],
  ["count URL as its length", "len += urls.length * 23;", "len += urls.join('').length;"],
  ["count Hangul as 1", "len += light ? 1 : 2;", "len += 1;"],
  ["drop loser after one bad day", "lastLoserYesterday === loser", "true"],
  ["learn from thin data", "active.every((s) => s.vpp < L.minVisitorsPerPost)", "false"],
  ["skip renormalising", "let rest = 100 - floored.reduce((a, b) => a + b, 0);", "let rest = 0;"],
  ["ignore unknown IDs in prompts", "if (!known.has(m[0]))", "if (false)"],
  ["allow every reply to carry link", "return withLink / replies.length <= cfg.maxLinkedRepliesRatio;", "return true;"],
];
let survived = 0;
for (const [name, from, to] of M) {
  if (!src.includes(from)) { console.log(`?? ${name}: pattern not found (update mutation list)`); survived++; continue; }
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "mut-")), "lib.js");
  fs.writeFileSync(f, src.replace(from, to));
  const r = spawnSync(process.execPath, ["--test", path.join(__dirname, "loop.test.js")], { env: { ...process.env, LOOP_LIB: f }, encoding: "utf8" });
  const failed = (r.stdout.match(/^# fail (\d+)/m) || [])[1];
  const caught = r.status !== 0;
  if (!caught) survived++;
  console.log(`${caught ? "CAUGHT  " : "MISSED  "} ${name}${caught ? ` (${failed} test(s) went red)` : ""}`);
}
console.log(`\n${M.length - survived}/${M.length} sabotages caught`);
process.exit(survived ? 1 : 0);
