// Red-before-green: sabotage each safeguard in loop/lib.js one at a time and confirm the tests catch it.
// Run: npm run test:mutation   (exits 1 if any sabotage goes unnoticed)
"use strict";
const fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const { spawnSync } = require("node:child_process");
const src = fs.readFileSync(path.join(__dirname, "..", "loop", "lib.js"), "utf8");
const R = String.raw;
const M = [
  // publish selection
  ["remove daily cap", "if ((used[k] || 0) >= cap)", "if (false)"],
  ["reply cap uses post cap", 'const cap = r.type === "reply" ? ch.maxRepliesPerDay : ch.maxPostsPerDay;', "const cap = ch.maxPostsPerDay;"],
  ["any truthy value counts as approved", 'const isTrue = (v) => v === true || v === "__YES__";', "const isTrue = (v) => !!v;"],
  ["ignore gate verdict", R`if (!/^PASS\b/.test(notes) || /BLOCK/.test(notes))`, "if (false)"],
  ["accept mixed PASS/BLOCK notes", R` || /BLOCK/.test(notes)`, ""],
  ["post Blocked rows", 'if (r.status !== "Drafted")', "if (false)"],
  ["auto-post LinkedIn", "if (!ch.auto)", "if (false)"],
  ["drop per-run limit", "if ((perRun[r.channel] || 0) >= cfg.perRunMaxPerChannel)", "if (false)"],
  ["skip re-check of edited text", "if (recheck.length)", "if (false)"],
  ["accept unknown row types", 'if (r.type !== "post" && r.type !== "reply") { skip(', "if (false) { skip("],
  ["posted list optional", "if (!Array.isArray(postedToday)) throw", "if (!Array.isArray(postedToday)) postedToday = []; if (false) throw"],
  ["trust posted types as written", 'const type = lc(r.type) === "reply" ? "reply" : "post";', "const type = r.type;"],
  ["trust posted channel case", "const k = `${lc(r.channel)}:${type}`;", "const k = `${r.channel}:${type}`;"],
  // gate
  ["skip banned patterns", "for (const b of cfg.bannedPatterns)", "for (const b of [])"],
  ["no NFKC normalisation", '.normalize("NFKC")', ""],
  ["no zero-width stripping", R`.replace(/[​-‍⁠﻿]/g, "")`, ""],
  ["skip quote check", "if (!sourced.some((s) => s.includes(n)))", "if (false)"],
  ["ignore curly double quotes", "|“([^”]+)”", ""],
  ["skip our-site check", "if (!t || t.origin !== cfg.site)", "if (false)"],
  ["skip non-ASCII link check", R`if (/[^\x21-\x7e]/.test(l))`, "if (false)"],
  ["skip duplicate utm check", "if (t.dup.length)", "if (false)"],
  ["skip Tagged link match", "if (draft.taggedLink && l !== draft.taggedLink)", "if (false)"],
  ["skip utm_source check", "if (t.source !== draft.channel)", "if (false)"],
  ["skip utm_medium check", "if (t.medium !== draft.type)", "if (false)"],
  ["skip utm_campaign check", "if (t.campaign !== `d${draft.day}`)", "if (false)"],
  ["skip unknown channel check", 'if (!ch) add("channel"', 'if (false) add("channel"'],
  ["count URL as its length", "len += urls.length * 23;", "len += urls.join('').length;"],
  ["count Hangul as 1", "len += light ? 1 : 2;", "len += 1;"],
  ["allow every reply to carry link", "return withLink / replies.length <= cfg.maxLinkedRepliesRatio;", "return true;"],
  // learning
  ["drop loser after one bad day", "lastLoserYesterday === loser", "true"],
  ["learn from invalid numbers", "if (!stats.every((s) => valid(s.posts) && valid(s.visitors))) return hold", "if (false) return hold"],
  ["count 0-post angles", "stats.filter((s) => s.posts > 0)", "stats.filter((s) => true)"],
  ["learn with 1 angle", "if (active.length < 2) return hold", "if (false) return hold"],
  ["learn from 1-post angles", "if (active.some((s) => s.posts < L.minPostsPerAngle)) return hold", "if (false) return hold"],
  ["learn from thin data", "if (sorted[0].vpp < L.minVisitorsPerPost) return hold", "if (false) return hold"],
  ["double on a tied lead", "if (!leadTied)", "if (true)"],
  ["drop on a tied last place", "const loser = lastTied ? null : last.angle;", "const loser = last.angle;"],
  ["skip renormalising", "let rest = 100 - floored.reduce((a, b) => a + b, 0);", "let rest = 0;"],
  // instructions
  ["ignore unknown IDs in prompts", "if (!known.has(m[0]))", "if (false)"],
];
let missed = 0;
for (const [name, from, to] of M) {
  if (!src.includes(from)) { console.log(`??       ${name}: pattern not found (update mutation list)`); missed++; continue; }
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "mut-")), "lib.js");
  fs.writeFileSync(f, src.replace(from, to));
  const r = spawnSync(process.execPath, ["--test", path.join(__dirname, "loop.test.js")], { env: { ...process.env, LOOP_LIB: f }, encoding: "utf8" });
  const failed = (r.stdout.match(/^# fail (\d+)/m) || [])[1];
  const caught = r.status !== 0;
  if (!caught) missed++;
  console.log(`${caught ? "CAUGHT  " : "MISSED  "} ${name}${caught ? ` (${failed} test(s) went red)` : ""}`);
}
console.log(`\n${M.length - missed}/${M.length} sabotages caught`);
process.exit(missed ? 1 : 0);
