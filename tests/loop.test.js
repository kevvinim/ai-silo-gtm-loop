// Offline contract tests for the GTM loop. Run: node --test tests/
// Every safeguard is tested twice: a clean case must pass AND a planted failure must be caught.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const cfg = require("../loop/config.json");
const L = require(process.env.LOOP_LIB || "../loop/lib.js"); // LOOP_LIB lets tests/mutation.js swap in a sabotaged copy

const SITE = cfg.site;
const link = (src, med, day, content) => `${SITE}/?utm_source=${src}&utm_medium=${med}&utm_campaign=d${day}&utm_content=${content}`;
const draft = (o) => ({ day: 0, type: "post", ...o, taggedLink: o.taggedLink || (o.text.match(/https?:\/\/\S+/) || [])[0] });
const rules = (problems) => problems.map((p) => p.rule);

// ---- Clean day-0 drafts (same text as the Notion queue) ----
const A1 = draft({ channel: "threads", angle: "A", text: `어제 회의에서 정한 거, 지금 단톡방 몇 번 올려서 찾으셨어요?\n\n'카톡으로 보고 다 했어요'가 통하는 팀이라면 질문 6개만 해 보세요. 1분이면 끝납니다.\n\n${link("threads", "post", 0, "A1")}` });
const B1 = draft({ channel: "threads", angle: "B", text: `ChatGPT 잘 쓰는 사람이 팀에 한 명 있으면, 회사 노하우는 그 사람 개인 계정 안에 쌓입니다.\n\n그 사람이 휴가 가면, 나머지 팀원은 AI에게 회사 사정을 처음부터 다시 설명합니다.\n\n우리 팀은 어느 쪽인지 6문항으로 확인해 보세요.\n${link("threads", "post", 0, "B1")}` });
const B2 = draft({ channel: "x", angle: "B", text: `팀원 5명이 ChatGPT를 각자 계정으로 쓰면, AI에게 한 회사 설명도 5군데에 따로 쌓입니다. 사람에게 한 번, AI에게 또 한 번.\n\n우리 팀은 어느 쪽인지 6문항으로 확인해 보세요.\n${link("x", "post", 0, "B2")}` });
const C1_fixed = draft({ channel: "linkedin", angle: "C", text: `"일단 구독부터 결제합니다." 그리고 "한 달 뒤, 업무는 조금도 달라지지 않습니다." (EO플래닛 칼럼 중)\n\n작은 회사의 AI 도입 이야기에서 가장 자주 보이는 장면입니다.\n\n우리 팀이 어디서 막히는지 1분 만에 보는 진단을 만들었습니다. 몇 점 나왔는지 댓글로 남겨 주세요.\n${link("linkedin", "post", 0, "C1")}` });

test("gate: clean day-0 drafts pass", () => {
  for (const d of [A1, B1, B2, C1_fixed]) assert.deepEqual(L.gateMechanical(d, cfg), [], d.text.slice(0, 30));
});

// ---- Planted failures: each must be caught ----
test("gate: planted 'fake customers' draft is blocked for every violation", () => {
  const B3 = draft({ channel: "x", angle: "B", text: `저희 고객사 300곳이 이 진단 하나로 회의 시간을 40% 줄였습니다!! 지금 안 하면 뒤처집니다 🔥🔥 @openai @AnthropicAI 확인해 보세요\n${link("x", "post", 0, "B3")}` });
  const r = rules(L.gateMechanical(B3, cfg));
  for (const want of ["banned:double-exclaim", "banned:fire-emoji", "banned:fomo", "banned:mention"]) assert.ok(r.includes(want), `missing ${want}: ${r}`);
  // Honest limit: "고객사 300곳 · 40%" (made-up numbers) is NOT caught by rules; the gate agent caught it (tests/gate-cases.md).
});

test("gate: X post whose link is tagged as Threads is blocked", () => {
  const d = draft({ channel: "x", angle: "B", text: `팀 맥락이 흩어지는 곳을 6문항으로 확인해 보세요.\n${link("threads", "post", 0, "B9")}` });
  assert.ok(rules(L.gateMechanical(d, cfg)).includes("utm-source"));
});

test("gate: wrong day and wrong angle tags are blocked", () => {
  const d = draft({ channel: "x", angle: "A", day: 2, text: `확인해 보세요.\n${link("x", "post", 1, "B1")}` });
  const r = rules(L.gateMechanical(d, cfg));
  assert.ok(r.includes("utm-campaign") && r.includes("utm-content"), r.join(","));
});

test("gate: X post over 280 weighted characters is blocked; Korean counts 2, URL 23", () => {
  assert.equal(L.xWeightedLength("가나다"), 6);
  assert.equal(L.xWeightedLength("abc"), 3);
  assert.equal(L.xWeightedLength("https://example.com/a-very-long-path?x=1"), 23);
  const long = draft({ channel: "x", angle: "B", text: "가".repeat(130) + `\n${link("x", "post", 0, "B5")}` });
  assert.ok(L.xWeightedLength(long.text) > 280);
  assert.ok(rules(L.gateMechanical(long, cfg)).includes("x-length"));
  assert.ok(L.xWeightedLength(B2.text) <= 280, `B2 is ${L.xWeightedLength(B2.text)}`);
});

test("gate: altered quote is blocked; sourced quote passes", () => {
  const bad = draft({ channel: "threads", angle: "A", text: `'카톡으로 다 보고 했다니까요' 들어 보셨죠?\n${link("threads", "post", 0, "A7")}` });
  assert.ok(rules(L.gateMechanical(bad, cfg)).includes("quote-unsourced"));
});

test("gate: original d0 LinkedIn draft is flagged — it joined two separate sentences into one quote", () => {
  // Real finding from this test: the source has these as two sentences; quoting them as one is an altered quote.
  const C1_orig = draft({ channel: "linkedin", angle: "C", text: `"일단 구독부터 결제합니다. 한 달 뒤, 업무는 조금도 달라지지 않습니다." (EO플래닛 칼럼 중)\n\n진단을 만들었습니다.\n${link("linkedin", "post", 0, "C1")}` });
  assert.ok(rules(L.gateMechanical(C1_orig, cfg)).includes("quote-unsourced"));
});

test("gate: launch claim, two links, and foreign link are blocked", () => {
  const launch = draft({ channel: "threads", angle: "A", text: `드디어 정식 오픈! 확인해 보세요.\n${link("threads", "post", 0, "A8")}` });
  assert.ok(rules(L.gateMechanical(launch, cfg)).includes("banned:launch-claim"));
  const two = draft({ channel: "threads", angle: "A", text: `${link("threads", "post", 0, "A8")} 그리고 ${link("threads", "post", 0, "A9")}` });
  assert.ok(rules(L.gateMechanical(two, cfg)).includes("link-count"));
  const foreign = draft({ channel: "threads", angle: "A", text: `https://evil.example.com/?utm_source=threads` });
  assert.ok(rules(L.gateMechanical(foreign, cfg)).includes("link-origin"));
});

// ---- Publish selection ----
const row = (id, o) => ({ id, type: "post", status: "Drafted", approved: true, gateNotes: "PASS · ok", created: id, ...o });
const queue = [
  row("r1", { channel: "x" }),
  row("r2", { channel: "x" }),
  row("r3", { channel: "x" }),
  row("r4", { channel: "x", approved: false }),
  row("r5", { channel: "threads", status: "Blocked", gateNotes: "BLOCK · fake numbers" }), // ticked by mistake
  row("r6", { channel: "threads", gateNotes: "BLOCK · mention" }),
  row("r7", { channel: "linkedin" }),
];

test("publish: only approved + passed rows; blocked-but-ticked and unapproved are skipped; LinkedIn is prepared, never posted", () => {
  const { publish, prepare, skipped } = L.selectPublishable(queue, [], cfg);
  assert.deepEqual(publish.map((r) => r.id), ["r1", "r2"]);
  assert.deepEqual(prepare.map((r) => r.id), ["r7"]);
  const why = Object.fromEntries(skipped.map((s) => [s.id, s.reason]));
  assert.match(why.r3, /per-run max/);
  assert.match(why.r4, /not approved/);
  assert.match(why.r5, /status Blocked/);
  assert.match(why.r6, /gate did not pass/);
});

test("publish: a 4th X post on the same day is refused (cap 3)", () => {
  const already = [{ channel: "x", type: "post" }, { channel: "x", type: "post" }, { channel: "x", type: "post" }];
  const { publish, skipped } = L.selectPublishable(queue.slice(0, 3), already, cfg);
  assert.equal(publish.length, 0);
  assert.ok(skipped.every((s) => /daily cap 3/.test(s.reason)));
});

test("publish: with 2 X posts already today, only 1 more goes out", () => {
  const already = [{ channel: "x", type: "post" }, { channel: "x", type: "post" }];
  const { publish } = L.selectPublishable(queue.slice(0, 3), already, cfg);
  assert.deepEqual(publish.map((r) => r.id), ["r1"]);
});

test("replies: at most 1 in 3 carries the link", () => {
  const r = (t) => ({ text: t });
  assert.equal(L.replyLinkRatioOk([r("팁"), r("팁"), r(`팁 ${SITE}`)], cfg), true);
  assert.equal(L.replyLinkRatioOk([r(`팁 ${SITE}`), r("팁"), r(`팁 ${SITE}`)], cfg), false);
});

// ---- Learning rule ----
const W0 = cfg.startWeights;
const stats = [
  { angle: "A", posts: 2, visitors: 30 }, // 15 per post
  { angle: "B", posts: 2, visitors: 12 }, // 6 per post
  { angle: "C", posts: 1, visitors: 5 },  // 5 per post (last)
];
const sum = (w) => Object.values(w).reduce((a, b) => a + b, 0);

test("learn: winner's weight doubles, weights still sum to 100, one bad day does NOT drop the loser", () => {
  const { weights, loser } = L.updateWeights(W0, stats, null, cfg);
  assert.equal(sum(weights), 100);
  assert.ok(weights.A > W0.A);
  assert.equal(loser, "C");
  assert.ok(weights.C > 0, "dropped after only one bad day");
  assert.deepEqual(weights, { A: 57, B: 25, C: 18 });
});

test("learn: loser two days in a row is dropped", () => {
  const { weights } = L.updateWeights(W0, stats, "C", cfg);
  assert.equal(weights.C, 0);
  assert.equal(sum(weights), 100);
  assert.deepEqual(weights, { A: 70, B: 30, C: 0 });
});

test("learn: fewer than 5 visitors per post changes nothing", () => {
  const thin = [{ angle: "A", posts: 2, visitors: 4 }, { angle: "B", posts: 2, visitors: 3 }, { angle: "C", posts: 1, visitors: 1 }];
  const { weights, decision } = L.updateWeights(W0, thin, "C", cfg);
  assert.equal(decision, "hold");
  assert.deepEqual(weights, W0);
});

// ---- Instructions ↔ settings ----
const read = (p) => fs.readFileSync(path.join(__dirname, "..", p), "utf8");

test("prompts: every ID and rule number the run instructions mention exists in config", () => {
  for (const f of fs.readdirSync(path.join(__dirname, "..", "loop", "runs"))) {
    assert.deepEqual(L.checkPromptRefs(read(`loop/runs/${f}`), cfg), [], f);
  }
});

test("prompts: a broken ID or a non-existent rule number is caught", () => {
  const p = L.checkPromptRefs("Post Queue `collection://deadbeef-0000` 와 규칙 12를 따른다", cfg);
  assert.equal(p.length, 2, p.join(" | "));
});

test("playbook: rule count and sourced quotes match config word for word", () => {
  const pb = read("loop/playbook.md");
  const section = pb.split("## 규칙 = 게이트")[1].split("\n## ")[0];
  const n = (section.match(/^\d+\. /gm) || []).length;
  assert.equal(n, cfg.rulesCount, `playbook has ${n} rules, config says ${cfg.rulesCount}`);
  for (const a of Object.values(cfg.angles)) for (const q of a.quotes) assert.ok(pb.includes(q.text.replace(/\.$/, "")), `quote missing in playbook: ${q.text}`);
});
