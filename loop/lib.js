// Deterministic parts of the loop, so they can be tested offline.
// Judgment calls (is this claim fabricated? is this post on-topic?) stay with the gate agent.
"use strict";

// X counts most CJK/Hangul/emoji as 2 and every URL as 23 (twitter-text weighting, simplified).
function xWeightedLength(text) {
  const URL_RE = /https?:\/\/\S+/g;
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

function parseTaggedLink(url) {
  try {
    const u = new URL(url);
    const p = u.searchParams;
    return {
      origin: u.origin,
      source: p.get("utm_source"),
      medium: p.get("utm_medium"),
      campaign: p.get("utm_campaign"),
      content: p.get("utm_content"),
    };
  } catch {
    return null;
  }
}

const norm = (s) => s.replace(/\s+/g, " ").replace(/[.。!?…]+$/u, "").trim();

// Mechanical gate: returns [] when the draft passes, otherwise a list of {rule, detail}.
function gateMechanical(draft, cfg) {
  const problems = [];
  const add = (rule, detail) => problems.push({ rule, detail });
  const ch = cfg.channels[draft.channel];
  if (!ch) add("channel", `unknown channel ${draft.channel}`);

  // Link contract
  const links = draft.text.match(/https?:\/\/\S+/g) || [];
  if (draft.type === "post" && links.length !== 1) add("link-count", `posts need exactly 1 link, found ${links.length}`);
  for (const l of links) {
    const t = parseTaggedLink(l);
    if (!t || t.origin !== cfg.site) { add("link-origin", l); continue; }
    if (draft.taggedLink && l !== draft.taggedLink) add("link-mismatch", "link in text differs from Tagged link");
    if (t.source !== draft.channel) add("utm-source", `utm_source=${t.source} but channel=${draft.channel}`);
    if (t.medium !== draft.type) add("utm-medium", `utm_medium=${t.medium} but type=${draft.type}`);
    if (t.campaign !== `d${draft.day}`) add("utm-campaign", `utm_campaign=${t.campaign} but day=${draft.day}`);
    if (!t.content || !t.content.startsWith(draft.angle) || !/^[ABC]\d+$/.test(t.content)) add("utm-content", `utm_content=${t.content} for angle ${draft.angle}`);
  }

  // Length
  if (ch && ch.maxWeightedLength) {
    const n = xWeightedLength(draft.text);
    if (n > ch.maxWeightedLength) add("x-length", `${n} > ${ch.maxWeightedLength}`);
  }

  // Banned patterns
  for (const b of cfg.bannedPatterns) {
    const m = draft.text.match(new RegExp(b.regex, "u"));
    if (m) add(`banned:${b.id}`, `"${m[0].trim()}" (${b.why})`);
  }

  // Quotes must match a sourced quote word for word (substring of one sourced sentence)
  const sourced = Object.values(cfg.angles).flatMap((a) => a.quotes.map((q) => norm(q.text)));
  const QUOTE_RE = /["“]([^"”]+)["”]|['‘]([^'’]+)['’]/gu;
  for (const m of draft.text.matchAll(QUOTE_RE)) {
    const q = norm(m[1] || m[2]);
    if (q.length < cfg.quoteMinLength) continue; // short emphasis like '오늘 정한 것'
    if (!sourced.some((s) => s.includes(q))) add("quote-unsourced", `"${q}" is not word-for-word in config quotes`);
  }
  return problems;
}

// Which queue rows the publish run may act on, given what was already posted today.
function selectPublishable(rows, postedToday, cfg) {
  const publish = [], prepare = [], skipped = [];
  const used = {};
  for (const r of postedToday) {
    const k = `${r.channel}:${r.type}`;
    used[k] = (used[k] || 0) + 1;
  }
  const perRun = {};
  const ordered = [...rows].sort((a, b) => String(a.created).localeCompare(String(b.created)));
  for (const r of ordered) {
    const skip = (reason) => skipped.push({ id: r.id, reason });
    if (!r.approved) { skip("not approved"); continue; }
    if (r.status !== "Drafted") { skip(`status ${r.status}`); continue; }
    if (!String(r.gateNotes || "").startsWith("PASS")) { skip("gate did not pass"); continue; }
    const ch = cfg.channels[r.channel];
    if (!ch) { skip("unknown channel"); continue; }
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
  const withLink = replies.filter((r) => /https?:\/\//.test(r.text)).length;
  return withLink / replies.length <= cfg.maxLinkedRepliesRatio;
}

// Tomorrow's angle weights from today's results.
// stats: [{angle, posts, visitors}], lastLoserHistory: angle that was last yesterday (or null)
function updateWeights(weights, stats, lastLoserYesterday, cfg) {
  const L = cfg.learning;
  const active = stats.filter((s) => s.posts > 0).map((s) => ({ ...s, vpp: s.visitors / s.posts }));
  if (active.length < 2 || active.every((s) => s.vpp < L.minVisitorsPerPost)) {
    return { weights: { ...weights }, decision: "hold", loser: null };
  }
  const sorted = [...active].sort((a, b) => b.vpp - a.vpp);
  const winner = sorted[0].angle;
  const loser = sorted[sorted.length - 1].angle;
  const next = { ...weights };
  next[winner] = next[winner] * L.winnerMultiplier;
  let dropped = null;
  if (loser !== winner && lastLoserYesterday === loser && L.dropAfterConsecutiveLastDays === 2) {
    next[loser] = 0;
    dropped = loser;
  }
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
  return { weights: out, decision: dropped ? `double ${winner}, drop ${dropped}` : `double ${winner}`, loser };
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

module.exports = { xWeightedLength, parseTaggedLink, gateMechanical, selectPublishable, replyLinkRatioOk, updateWeights, checkPromptRefs };
