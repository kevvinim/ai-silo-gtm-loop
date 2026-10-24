const fs = require("fs"), path = require("path");
const { Resvg } = require("@resvg/resvg-js");
const out = path.join(__dirname, "public");
fs.mkdirSync(out, { recursive: true });
const site = (process.env.SITE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? "https://" + process.env.VERCEL_PROJECT_PRODUCTION_URL : "")).replace(/\/$/, "");
const follow = process.env.FOLLOW_URL || "__FOLLOW_URL__";
const fontDir = path.dirname(require.resolve("pretendard/package.json")) + "/dist/public/static/";
const render = (svg) => new Resvg(svg, { font: { fontFiles: [fontDir + "Pretendard-ExtraBold.otf", fontDir + "Pretendard-SemiBold.otf"], loadSystemFonts: false, defaultFontFamily: "Pretendard" } }).render().asPng();
let html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
html = html.split("__SITE_URL__").join(site).split("__FOLLOW_URL__").join(follow);
fs.writeFileSync(path.join(out, "index.html"), html);
fs.writeFileSync(path.join(out, "og.png"), render(fs.readFileSync(path.join(__dirname, "og.svg"), "utf8")));
// Challenge pages: /t/{type}/ share the same app but carry a type-specific link preview
const TYPES = { a: "단톡방 고고학자형", b: "AI 각개전투형", c: "한 사람 브레인형", z: "연결된 팀" };
const tpl = fs.readFileSync(path.join(__dirname, "og-type.svg"), "utf8");
for (const [k, name] of Object.entries(TYPES)) {
  fs.mkdirSync(path.join(out, "t", k), { recursive: true });
  fs.writeFileSync(path.join(out, "og-" + k + ".png"), render(tpl.replace("__TYPE__", name)));
  const t = html
    .split(site + "/og.png").join(site + "/og-" + k + ".png")
    .split('content="어제 정한 일, 카톡방에서 찾고 있나요?"').join('content="팀원의 결과: ' + name + ' · 같은 팀, 당신은 몇 점?"');
  fs.writeFileSync(path.join(out, "t", k, "index.html"), t);
}
console.log("built", site || "(no site url)");
