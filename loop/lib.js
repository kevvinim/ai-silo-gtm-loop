// Deterministic parts of the loop, so they can be tested offline.
// Judgment calls (is this claim fabricated? is this post on-topic?) stay with the gate agent.
"use strict";

// X counts most CJK/Hangul/emoji as 2 and every URL as 23 (twitter-text weighting, simplified).
// Checked against X's own library: never lower than X's count (tests/x-length.check.js).
function xWeightedLength(text) {
  const URL_RE = /https?:\/\/[\x21-\x7e]+/gi;
  let len = 0;
  const urls = text.match(URL_RE) || [];
  len += urls.length * 23;
  for (const ch of text.replace(URL_RE, "")) {
    const cp = ch.codePointAt(0);
    const light =
      (cp >= 0x0000 && cp <= 0x10ff) ||
      (cp >= 0x2000 && cp <= 0x200d) ||
      (cp >= 0x2010 && cp <= 0x201f) ||
      (cp >= 0x2032 && cp <= 0x2037);
    len += light ? 1 : 2;
  }
  return len;
}

// Normalise look-alikes before pattern checks: full-width → ASCII (NFKC turns ！ into !, ＠ into @, ‼ into !!),
// and strip zero-width characters that could split a banned phrase.
const normalise = (s) => s.normalize("NFKC").replace(/[​-‍⁠﻿]/g, "");

// Anything that looks like a link: with or without scheme, any case.
const LINKISH_RE = /(?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?:[\/?#]\S*)?/gi;

function parseTaggedLink(url) {
  try {
    const u = new URL(url);
    const p = u.searchParams;
    const dup = ["utm_source", "utm_medium", "utm_campaign", "utm_content"].filter((k) => p.getAll(k).length > 1);
    return { origin: u.origin, path: u.pathname, source: p.get("utm_source"), medium: p.get("utm_medium"), campaign: p.get("utm_campaign"), content: p.get("utm_content"), dup };
  } catch {
    return null;
  }
}

const normQuote = (s) => normalise(s).replace(/\s+/g, " ").replace(/[.。!?…]+$/u, "").trim();

// Mechanical gate: returns [] when the draft passes, otherwise a list of {rule, detail}.
function gateMechanical(draft, cfg) {
  const problems = [];
  const add = (rule, detail) => problems.push({ rule, detail });
  const text = String(draft.text || "");
  const plain = normalise(text);
  const ch = cfg.channels[draft.channel];
  if (!ch) add("channel", `unknown channel ${draft.channel}`);
  if (draft.type !== "post" && draft.type !== "reply") add("type", `unknown type ${draft.type}`);

  // Link contract: every link-like token must be our site over https, ASCII only, correctly tagged.
  const links = plain.match(LINKISH_RE) || [];
  if (draft.type === "post" && links.length !== 1) add("link-count", `posts need exactly 1 link, found ${links.length}`);
  for (const l of links) {
    if (/[^\x21-\x7e]/.test(l)) { add("link-ascii", `non-ASCII characters inside link: ${l}`); continue; }
    const t = parseTaggedLink(l);
    if (!t || t.origin !== cfg.site) { add("link-origin", l); continue; }
    if (t.path !== `/go/d${draft.day}-${t.content}`) add("link-path", `path ${t.path} should be /go/d${draft.day}-${t.content} (per-link counting works on every Vercel plan via the path)`);
    if (t.dup.length) add("utm-duplicate", `repeated ${t.dup.join(", ")}`);
    if (draft.taggedLink && l !== draft.taggedLink) add("link-mismatch", "link in text differs from Tagged link");
    if (t.source !== draft.channel) add("utm-source", `utm_source=${t.source} but channel=${draft.channel}`);
    if (t.medium !== draft.type) add("utm-medium", `utm_medium=${t.medium} but type=${draft.type}`);
    if (t.campaign !== `d${draft.day}`) add("utm-campaign", `utm_campaign=${t.campaign} but day=${draft.day}`);
    if (!t.content || !/^[ABC]\d+$/.test(t.content) || t.content[0] !== draft.angle) add("utm-content", `utm_content=${t.content} for angle ${draft.angle}`);
  }

  // Length
  if (ch && ch.maxWeightedLength) {
    const n = xWeightedLength(text);
    if (n > ch.maxWeightedLength) add("x-length", `${n} > ${ch.maxWeightedLength}`);
  }

  // Banned patterns (checked on normalised text so ！！, ‼, ＠, zero-width tricks don't slip through)
  for (const b of cfg.bannedPatterns) {
    const m = plain.match(new RegExp(b.regex, "iu"));
    if (m) add(`banned:${b.id}`, `"${m[0].trim()}" (${b.why})`);
  }

  // Quotes: anything in double-quote-family marks must be word for word from a sourced quote (any length).
  // Single quotes ‘ ’ ' ' under quoteMinLength are treated as emphasis (e.g. '오늘 정한 것').
  const sourced = Object.values(cfg.angles).flatMap((a) => a.quotes.map((q) => normQuote(q.text)));
  const DOUBLE_RE = /"([^"]+)"|“([^”]+)”|「([^」]+)」|『([^』]+)』|«([^»]+)»/gu;
  const SINGLE_RE = /'([^']+)'|‘([^’]+)’/gu;
  const check = (q, minLen) => {
    const n = normQuote(q);
    if (n.length < minLen) return;
    if (!sourced.some((s) => s.includes(n))) add("quote-unsourced", `"${n}" is not word-for-word in config quotes`);
  };
  for (const m of plain.matchAll(DOUBLE_RE)) check(m.slice(1).find(Boolean), 1);
  for (const m of plain.matchAll(SINGLE_RE)) check(m.slice(1).find(Boolean), cfg.quoteMinLength);
  return problems;
}

const isTrue = (v) => v === true || v === "__YES__";
const lc = (v) => String(v || "").trim().toLowerCase();

// Which queue rows the publish run may act on, given what was already posted today (KST).
// Re-runs the mechanical gate on the row's CURRENT text, so edits after approval can't slip through.
function selectPublishable(rows, postedToday, cfg) {
  if (!Array.isArray(postedToday)) throw new Error("postedToday is required (pass [] only if nothing was posted today)");
  const publish = [], prepare = [], skipped = [];
  const used = {};
  for (const r of postedToday) {
    const type = lc(r.type) === "reply" ? "reply" : "post"; // unknown type counts against the stricter post cap
    const k = `${lc(r.channel)}:${type}`;
    used[k] = (used[k] || 0) + 1;
  }
  const perRun = {};
  const ordered = [...rows].sort((a, b) => String(a.created).localeCompare(String(b.created)));
  for (const r of ordered) {
    const skip = (reason) => skipped.push({ id: r.id, reason });
    if (!isTrue(r.approved)) { skip("not approved"); continue; }
    if (r.status !== "Drafted") { skip(`status ${r.status}`); continue; }
    const notes = String(r.gateNotes || "");
    if (!/^PASS\b/.test(notes) || /BLOCK/.test(notes)) { skip("gate did not pass"); continue; }
    const ch = cfg.channels[r.channel];
    if (!ch) { skip(`unknown channel ${r.channel}`); continue; }
    if (r.type !== "post" && r.type !== "reply") { skip(`unknown type ${r.type}`); continue; }
    const recheck = gateMechanical(r, cfg);
    if (recheck.length) { skip(`fails rules now (edited after approval?): ${recheck.map((p) => p.rule).join(", ")}`); continue; }
    const cap = r.type === "reply" ? ch.maxRepliesPerDay : ch.maxPostsPerDay;
    const k = `${r.channel}:${r.type}`;
    if ((used[k] || 0) >= cap) { skip(`daily cap ${cap} reached for ${k}`); continue; }
    if (!ch.auto) { prepare.push(r); used[k] = (used[k] || 0) + 1; continue; }
    if ((perRun[r.channel] || 0) >= cfg.perRunMaxPerChannel) { skip(`per-run max ${cfg.perRunMaxPerChannel} for ${r.channel}`); continue; }
    publish.push(r);
    used[k] = (used[k] || 0) + 1;
    perRun[r.channel] = (perRun[r.channel] || 0) + 1;
  }
  return { publish, prepare, skipped };
}

// Reply link ratio: at most 1 in 3 replies may carry the link.
function replyLinkRatioOk(replies, cfg) {
  if (!replies.length) return true;
  const withLink = replies.filter((r) => (normalise(String(r.text || "")).match(LINKISH_RE) || []).length > 0).length;
  return withLink / replies.length <= cfg.maxLinkedRepliesRatio;
}

// Tomorrow's angle weights from today's results.
// stats: [{angle, posts, visitors}]; lastLoserYesterday: angle that was strictly last yesterday (or null).
// Hold (no change) when: any number is missing/invalid, fewer than 2 angles were posted,
// an angle has fewer than minPostsPerAngle posts, or the leader is under minVisitorsPerPost.
// Ties: no doubling if the lead is tied; no drop if last place is tied.
function updateWeights(weights, stats, lastLoserYesterday, cfg) {
  const L = cfg.learning;
  const hold = (why) => ({ weights: { ...weights }, decision: `hold: ${why}`, loser: null });
  const valid = (n) => typeof n === "number" && Number.isFinite(n) && n >= 0;
  if (!stats.every((s) => valid(s.posts) && valid(s.visitors))) return hold("missing or invalid numbers (미측정)");
  const active = stats.filter((s) => s.posts > 0).map((s) => ({ ...s, vpp: s.visitors / s.posts }));
  if (active.length < 2) return hold("fewer than 2 angles posted");
  if (active.some((s) => s.posts < L.minPostsPerAngle)) return hold(`an angle has fewer than ${L.minPostsPerAngle} posts`);
  const sorted = [...active].sort((a, b) => b.vpp - a.vpp);
  if (sorted[0].vpp < L.minVisitorsPerPost) return hold(`leader under ${L.minVisitorsPerPost} visitors per post`);
  const next = { ...weights };
  const leadTied = sorted[1].vpp === sorted[0].vpp;
  const last = sorted[sorted.length - 1];
  const lastTied = sorted[sorted.length - 2].vpp === last.vpp;
  const loser = lastTied ? null : last.angle;
  const notes = [];
  if (!leadTied) { next[sorted[0].angle] *= L.winnerMultiplier; notes.push(`double ${sorted[0].angle}`); } else notes.push("lead tied: no doubling");
  if (loser && lastLoserYesterday === loser) { next[loser] = 0; notes.push(`drop ${loser}`); }
  // renormalise to integers that sum to exactly 100
  const total = Object.values(next).reduce((a, b) => a + b, 0);
  const keys = Object.keys(next);
  const raw = keys.map((k) => (next[k] / total) * 100);
  const floored = raw.map(Math.floor);
  let rest = 100 - floored.reduce((a, b) => a + b, 0);
  const order = raw.map((v, i) => [v - floored[i], i]).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) { if (rest <= 0) break; floored[i] += 1; rest -= 1; }
  const out = {};
  keys.forEach((k, i) => (out[k] = floored[i]));
  return { weights: out, decision: notes.join(", "), loser };
}

// Every ID and rule number the run instructions mention must exist in config.
function checkPromptRefs(markdown, cfg) {
  const problems = [];
  const known = new Set(Object.values(cfg.ids));
  for (const m of markdown.matchAll(/collection:\/\/[0-9a-f-]+|prj_[A-Za-z0-9]+|team_[A-Za-z0-9]+/g)) {
    if (!known.has(m[0])) problems.push(`unknown id ${m[0]}`);
  }
  for (const m of markdown.matchAll(/규칙 (\d+)/g)) {
    if (+m[1] < 1 || +m[1] > cfg.rulesCount) problems.push(`rule ${m[1]} does not exist`);
  }
  return problems;
}

module.exports = { xWeightedLength, parseTaggedLink, gateMechanical, selectPublishable, replyLinkRatioOk, updateWeights, checkPromptRefs, normalise };
