// Offline contract tests for the GTM loop. Run: npm test
// Every safeguard is tested twice: a clean case must pass AND a planted failure must be caught.
// Cases marked [review] came from the independent adversarial review (tests/external-checks.md).
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const cfg = require("../loop/config.json");
const L = require(process.env.LOOP_LIB || "../loop/lib.js"); // LOOP_LIB lets tests/mutation.js swap in a sabotaged copy

const SITE = cfg.site;
const link = (src, med, day, content) => `${SITE}/?utm_source=${src}&utm_medium=${med}&utm_campaign=d${day}&utm_content=${content}`;
const draft = (o) => ({ day: 0, type: "post", ...o, taggedLink: o.taggedLink || (o.text.match(/https:\/\/[\x21-\x7e]+/) || [])[0] });
const rules = (d) => L.gateMechanical(d, cfg).map((p) => p.rule);
const blocks = (d, rule) => assert.ok(rules(d).includes(rule), `expected ${rule}, got [${rules(d)}] for: ${d.text.slice(0, 40)}`);
const xpost = (body, content = "B9") => draft({ channel: "x", angle: content[0], text: `${body}\n${link("x", "post", 0, content)}` });

// ---- Clean day-0 drafts (same text as the Notion queue) ----
const A1 = draft({ channel: "threads", angle: "A", text: `어제 회의에서 정한 거, 지금 단톡방 몇 번 올려서 찾으셨어요?\n\n'카톡으로 보고 다 했어요'가 통하는 팀이라면 질문 6개만 해 보세요. 1분이면 끝납니다.\n\n${link("threads", "post", 0, "A1")}` });
const B1 = draft({ channel: "threads", angle: "B", text: `ChatGPT 잘 쓰는 사람이 팀에 한 명 있으면, 회사 노하우는 그 사람 개인 계정 안에 쌓입니다.\n\n그 사람이 휴가 가면, 나머지 팀원은 AI에게 회사 사정을 처음부터 다시 설명합니다.\n\n우리 팀은 어느 쪽인지 6문항으로 확인해 보세요.\n${link("threads", "post", 0, "B1")}` });
const B2 = draft({ channel: "x", angle: "B", text: `팀원 5명이 ChatGPT를 각자 계정으로 쓰면, AI에게 한 회사 설명도 5군데에 따로 쌓입니다. 사람에게 한 번, AI에게 또 한 번.\n\n우리 팀은 어느 쪽인지 6문항으로 확인해 보세요.\n${link("x", "post", 0, "B2")}` });
const C1_fixed = draft({ channel: "linkedin", angle: "C", text: `"일단 구독부터 결제합니다." 그리고 "한 달 뒤, 업무는 조금도 달라지지 않습니다." (EO플래닛 칼럼 중)\n\n작은 회사의 AI 도입 이야기에서 가장 자주 보이는 장면입니다.\n\n우리 팀이 어디서 막히는지 1분 만에 보는 진단을 만들었습니다. 몇 점 나왔는지 댓글로 남겨 주세요.\n${link("linkedin", "post", 0, "C1")}` });
const replyOk = draft({ channel: "threads", angle: "A", type: "reply", text: "회의 끝에 '오늘 정한 것' 세 줄만 정해진 문서에 남겨 보세요. 단톡방 스크롤이 줄어듭니다." });

test("gate: clean drafts pass (d0 posts, curly-quoted sourced quote, link-free reply)", () => {
  const curly = draft({ channel: "threads", angle: "A", text: `“카톡으로 보고 다 했어요.” 익숙한 말인가요?\n${link("threads", "post", 0, "A2")}` });
  for (const d of [A1, B1, B2, C1_fixed, curly, replyOk]) assert.deepEqual(L.gateMechanical(d, cfg), [], d.text.slice(0, 30));
});

// ---- Planted failures: each must be caught ----
test("gate: planted 'fake customers' draft is blocked for every rule-checkable violation", () => {
  const B3 = xpost("저희 고객사 300곳이 이 진단 하나로 회의 시간을 40% 줄였습니다!! 지금 안 하면 뒤처집니다 🔥🔥 @openai @AnthropicAI 확인해 보세요", "B3");
  for (const want of ["banned:double-exclaim", "banned:alarm-emoji", "banned:fomo", "banned:mention"]) blocks(B3, want);
  // Honest limit: "고객사 300곳 · 40%" (made-up numbers) is NOT caught by rules; the gate agent caught it (tests/gate-cases.md).
});

test("gate [review]: mention variants .@ ＠ and one-letter handles are blocked", () => {
  for (const t of [".@openai 보셨나요", "＠openai 보셨나요", "@a 님 보셨나요"]) blocks(xpost(t), "banned:mention");
});

test("gate [review]: look-alike hype is blocked (！！ ‼ zero-width ❗ spacing and wording variants)", () => {
  blocks(xpost("확인해 보세요！！"), "banned:double-exclaim");
  blocks(xpost("확인해 보세요‼"), "banned:double-exclaim");
  blocks(xpost("확인해 보세요!​!"), "banned:double-exclaim");
  blocks(xpost("확인해 보세요 ❗❗"), "banned:alarm-emoji");
  blocks(xpost("지금 안하면 늦어요"), "banned:fomo");
  blocks(xpost("이 기회 놓치지 마세요"), "banned:fomo");
  blocks(xpost("드디어 런칭했습니다"), "banned:launch-claim");
  blocks(xpost("다음 주에 출시합니다"), "banned:launch-claim");
});

test("gate [review]: every link-like token is checked — uppercase scheme, http, bare domains, our site without https", () => {
  for (const extra of ["HTTPS://evil.example.com", "http://evil.example.com", "evil.example.com", "ai-silo-check.vercel.app"]) {
    blocks(xpost(`자세히는 ${extra} 참고`), "link-origin");
    blocks(draft({ channel: "threads", angle: "A", type: "reply", text: `좋은 글이네요. ${extra}` }), "link-origin");
  }
});

test("gate [review]: Hangul glued to a link is blocked (X would cut or reject it)", () => {
  const d = draft({ channel: "x", angle: "B", text: `확인: ${link("x", "post", 0, "B9")}여기서` });
  blocks(d, "link-ascii");
});

test("gate [review]: duplicate utm params are blocked", () => {
  blocks(draft({ channel: "x", angle: "B", text: `확인 ${link("x", "post", 0, "B9")}&utm_source=threads` }), "utm-duplicate");
});

test("gate: tag mismatches are blocked — source, medium, day, angle, Tagged link, channel", () => {
  blocks(draft({ channel: "x", angle: "B", text: `확인\n${link("threads", "post", 0, "B9")}` }), "utm-source");
  blocks(draft({ channel: "x", angle: "B", text: `확인\n${link("x", "reply", 0, "B9")}` }), "utm-medium");
  blocks(draft({ channel: "x", angle: "A", day: 2, text: `확인\n${link("x", "post", 1, "B1")}` }), "utm-campaign");
  blocks(draft({ channel: "x", angle: "A", day: 2, text: `확인\n${link("x", "post", 1, "B1")}` }), "utm-content");
  blocks(draft({ channel: "x", angle: "B", text: `확인\n${link("x", "post", 0, "B9")}`, taggedLink: link("x", "post", 0, "B8") }), "link-mismatch");
  blocks(draft({ channel: "mastodon", angle: "B", text: `확인\n${link("mastodon", "post", 0, "B9")}` }), "channel");
});

test("gate: X length — Korean counts 2, URL 23; over 280 is blocked", () => {
  assert.equal(L.xWeightedLength("가나다"), 6);
  assert.equal(L.xWeightedLength("abc"), 3);
  assert.equal(L.xWeightedLength("https://example.com/a-very-long-path?x=1"), 23);
  blocks(xpost("가".repeat(130), "B5"), "x-length");
  assert.ok(L.xWeightedLength(B2.text) <= 280);
});

test("gate [review]: invented quotes are blocked in every quote style and at any length", () => {
  for (const q of ["「카톡이 편해요」", "『카톡이 편해요』", "＂카톡이 편해요＂", "«카톡이 편해요»", "\"카톡이 편해요\"", "“카톡이 편해요”"]) {
    blocks(xpost(`${q} 라는 말, 들어 보셨죠?`, "A7"), "quote-unsourced");
  }
  blocks(xpost("'카톡으로 다 보고 했다니까요' 들어 보셨죠?", "A7"), "quote-unsourced"); // long single-quoted = quote
});

test("gate: original d0 LinkedIn draft is flagged — it joined two separate sentences into one quote", () => {
  // Confirmed against the source page: two other sentences sit between these two (tests/external-checks.md).
  const C1_orig = draft({ channel: "linkedin", angle: "C", text: `"일단 구독부터 결제합니다. 한 달 뒤, 업무는 조금도 달라지지 않습니다." (EO플래닛 칼럼 중)\n\n진단을 만들었습니다.\n${link("linkedin", "post", 0, "C1")}` });
  blocks(C1_orig, "quote-unsourced");
});

// ---- Publish selection ----
const row = (id, o = {}) => {
  const channel = o.channel || "x", type = o.type || "post";
  const base = type === "reply" ? draft({ channel, angle: "A", type, text: "회의 끝에 세 줄만 남겨 보세요." }) : draft({ channel, angle: "B", text: `우리 팀은 어느 쪽인지 확인해 보세요.\n${link(channel, "post", 0, "B" + id.replace(/\D/g, ""))}` });
  return { id, status: "Drafted", approved: true, gateNotes: "PASS · ok", created: id, ...base, ...o };
};
const queue = [
  row("r1"), row("r2"), row("r3"),
  row("r4", { approved: false }),
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

test("publish [review]: Notion-style checkbox strings — only true / '__YES__' count as approved", () => {
  const rows = [row("r1", { approved: "__NO__" }), row("r2", { approved: "false" }), row("r3", { approved: "__YES__" })];
  assert.deepEqual(L.selectPublishable(rows, [], cfg).publish.map((r) => r.id), ["r3"]);
});

test("publish [review]: text edited after the gate passed is re-checked and refused", () => {
  const edited = row("r1", { text: `지금 안 하면 뒤처집니다!! 🔥 @openai\n${link("x", "post", 0, "B1")}` });
  const { publish, skipped } = L.selectPublishable([edited], [], cfg);
  assert.equal(publish.length, 0);
  assert.match(skipped[0].reason, /fails rules now/);
});

test("publish [review]: mixed verdict notes are not a pass", () => {
  assert.equal(L.selectPublishable([row("r1", { gateNotes: "PASS(기계) · BLOCK(판단)" })], [], cfg).publish.length, 0);
});

test("publish: a 4th X post on the same day is refused (cap 3); with 2 already, only 1 more", () => {
  const p = (n) => Array.from({ length: n }, () => ({ channel: "x", type: "post" }));
  assert.equal(L.selectPublishable(queue.slice(0, 3), p(3), cfg).publish.length, 0);
  assert.deepEqual(L.selectPublishable(queue.slice(0, 3), p(2), cfg).publish.map((r) => r.id), ["r1"]);
});

test("publish [review]: sloppy types/channels can't dodge the cap; missing posted list is refused", () => {
  const sloppyPosted = [{ channel: "x" }, { channel: "X", type: "Post" }, { channel: "x", type: "post" }];
  assert.equal(L.selectPublishable([row("r1")], sloppyPosted, cfg).publish.length, 0);
  const sloppyRows = [row("r1", { type: "Post" }), row("r2", { type: undefined })];
  const sel = L.selectPublishable(sloppyRows, [], cfg);
  assert.equal(sel.publish.length, 0);
  for (const s of sel.skipped) assert.match(s.reason, /^unknown type/);
  assert.throws(() => L.selectPublishable([row("r1")], undefined, cfg));
});

test("publish: reply cap — a 6th reply on the same day is refused", () => {
  const posted = Array.from({ length: 5 }, () => ({ channel: "threads", type: "reply" }));
  const r = row("r9", { channel: "threads", type: "reply" });
  assert.equal(L.selectPublishable([r], posted, cfg).publish.length, 0);
  assert.equal(L.selectPublishable([r], posted.slice(1), cfg).publish.length, 1);
});

test("replies: at most 1 in 3 carries a link (any link form counts)", () => {
  const r = (t) => ({ text: t });
  assert.equal(L.replyLinkRatioOk([r("팁"), r("팁"), r(`팁 ${SITE}`)], cfg), true);
  assert.equal(L.replyLinkRatioOk([r(`팁 ${SITE}`), r("팁"), r("팁 ai-silo-check.vercel.app")], cfg), false);
});

// ---- Learning rule ----
const W0 = cfg.startWeights;
const S = (a, b, c) => [{ angle: "A", posts: a[0], visitors: a[1] }, { angle: "B", posts: b[0], visitors: b[1] }, { angle: "C", posts: c[0], visitors: c[1] }];
const sum = (w) => Object.values(w).reduce((x, y) => x + y, 0);
const day = S([2, 30], [2, 12], [2, 8]); // 15, 6, 4 per post

test("learn: winner doubles, sum stays 100, one bad day does NOT drop the loser", () => {
  const r = L.updateWeights(W0, day, null, cfg);
  assert.deepEqual(r.weights, { A: 57, B: 25, C: 18 });
  assert.equal(r.loser, "C");
});

test("learn: loser two days in a row is dropped", () => {
  assert.deepEqual(L.updateWeights(W0, day, "C", cfg).weights, { A: 70, B: 30, C: 0 });
});

test("learn [review]: chained over 3 days, weights carry forward and a dropped angle stays dropped", () => {
  const d1 = L.updateWeights(W0, day, null, cfg);           // 57/25/18, loser C
  const d2 = L.updateWeights(d1.weights, day, d1.loser, cfg); // C dropped
  assert.equal(d2.weights.C, 0);
  const d3 = L.updateWeights(d2.weights, S([2, 30], [2, 12], [0, 0]), d2.loser, cfg);
  assert.equal(d3.weights.C, 0, "dropped angle came back");
  assert.equal(sum(d3.weights), 100);
});

test("learn [review]: thin, missing or invalid data changes nothing", () => {
  assert.deepEqual(L.updateWeights(W0, S([2, 4], [2, 3], [2, 1]), "C", cfg).weights, W0); // leader under 5/post
  assert.deepEqual(L.updateWeights(W0, S([1, 5], [10, 0], [10, 0]), "C", cfg).weights, W0); // A has only 1 post
  assert.deepEqual(L.updateWeights(W0, S([2, 30], [2, "미측정"], [2, 8]), "C", cfg).weights, W0);
  assert.deepEqual(L.updateWeights(W0, S([2, 30], [2, NaN], [2, 8]), "C", cfg).weights, W0);
  assert.deepEqual(L.updateWeights(W0, S([2, 30], [0, 0], [0, 0]), null, cfg).weights, W0); // only 1 angle posted
});

test("learn: an angle with 0 posts is left out of the ranking", () => {
  const r = L.updateWeights(W0, S([2, 30], [2, 12], [0, 0]), null, cfg);
  assert.equal(r.loser, "B");
  assert.ok(r.weights.A > W0.A);
});

test("learn [review]: ties — no doubling when the lead is tied, no drop when last place is tied", () => {
  const r = L.updateWeights(W0, S([2, 20], [2, 20], [2, 20]), "C", cfg);
  assert.deepEqual(r.weights, W0);
  assert.equal(r.loser, null);
  const r2 = L.updateWeights(W0, S([2, 30], [2, 10], [2, 10]), "C", cfg);
  assert.equal(r2.weights.C > 0, true, "dropped C although tied for last");
});

// ---- CLI the daily runs call ----
const cli = (...a) => spawnSync(process.execPath, [path.join(__dirname, "..", "loop", "check.js"), ...a], { encoding: "utf8" });
const tmp = (obj) => { const f = path.join(require("node:os").tmpdir(), `t-${Math.random().toString(36).slice(2)}.json`); fs.writeFileSync(f, JSON.stringify(obj)); return f; };

test("cli [review]: learn needs today's weights from the log (no hidden weights.json); select needs posted.json", () => {
  const stats = tmp(day);
  assert.equal(cli("learn", stats).status, 2);
  const out = JSON.parse(cli("learn", stats, "--weights", "A=57,B=25,C=18", "--loser", "C").stdout);
  assert.deepEqual(out.weights, { A: 82, B: 18, C: 0 }); // carried forward from yesterday, not from start weights
  assert.equal(cli("select", tmp([])).status, 2);
  assert.equal(cli("gate", tmp([xpost("확인해 보세요!!")])).status, 1);
});

// ---- Instructions ↔ settings ----
const read = (p) => fs.readFileSync(path.join(__dirname, "..", p), "utf8");

test("prompts: every ID and rule number the run instructions mention exists in config", () => {
  for (const f of fs.readdirSync(path.join(__dirname, "..", "loop", "runs"))) assert.deepEqual(L.checkPromptRefs(read(`loop/runs/${f}`), cfg), [], f);
});

test("prompts: a broken ID or a non-existent rule number is caught", () => {
  assert.equal(L.checkPromptRefs("Post Queue `collection://deadbeef-0000` 와 규칙 12를 따른다", cfg).length, 2);
});

test("playbook: rule count and sourced quotes match config word for word", () => {
  const pb = read("loop/playbook.md");
  const section = pb.split("## 규칙 = 게이트")[1].split("\n## ")[0];
  assert.equal((section.match(/^\d+\. /gm) || []).length, cfg.rulesCount);
  for (const a of Object.values(cfg.angles)) for (const q of a.quotes) assert.ok(pb.includes(q.text.replace(/\.$/, "")), `quote missing in playbook: ${q.text}`);
});
