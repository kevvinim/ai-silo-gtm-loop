// External check: compare our X length rule with X's own open-source counter (twitter-text).
// Run: npm run test:x-length   (installs twitter-text in a temp folder, nothing added to the repo)
// Passes if ours is never LOWER than X's count (ours may over-count; that only makes the rule stricter).
"use strict";
const path = require("node:path");
const ttDir = process.env.TT_DIR;
const tt = require(path.join(ttDir, "node_modules", "twitter-text"));
const L = require("../loop/lib.js");
const U = "https://ai-silo-check.vercel.app/?utm_source=x&utm_medium=post&utm_campaign=d0&utm_content=B2";
const cases = {
  "d0 B2 draft": `팀원 5명이 ChatGPT를 각자 계정으로 쓰면, AI에게 한 회사 설명도 5군데에 따로 쌓입니다. 사람에게 한 번, AI에게 또 한 번.\n\n우리 팀은 어느 쪽인지 6문항으로 확인해 보세요.\n${U}`,
  "130 Hangul + URL": "가".repeat(130) + "\n" + U,
  "140 Hangul (limit)": "가".repeat(140),
  "141 Hangul (over)": "가".repeat(141),
  "simple emoji": "좋아요 👍",
  "ZWJ emoji": "팀 👨‍👩‍👧‍👦",
  "flag emoji": "한국 🇰🇷",
  "URL without scheme": "진단 ai-silo-check.vercel.app 해 보세요",
  "middle dot, curly quotes, ellipsis": "6문항 · 1분 ‘오늘 정한 것’ “인용” …",
  "em dash": "결론 — 맥락",
  "280 latin": "a".repeat(280),
};
let under = 0;
for (const [name, t] of Object.entries(cases)) {
  const off = tt.parseTweet(t).weightedLength, ours = L.xWeightedLength(t);
  const tag = ours === off ? "SAME " : ours > off ? "OVER " : "UNDER";
  if (ours < off) under++;
  console.log(`${tag} ${name}: X ${off}, ours ${ours}`);
}
console.log(under ? `\nFAIL: ours under-counts in ${under} case(s)` : "\nPASS: ours never under-counts");
process.exit(under ? 1 : 0);
