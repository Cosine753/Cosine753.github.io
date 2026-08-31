import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";

const root = new URL("./", import.meta.url);
const dist = new URL("./dist/", root);
const staticRoot = new URL("./dist/static/", root);

const LOCKED_CALCULATOR_SHA256 =
  "cac745fccb61882c5ffce8d29cd343949a3981b6d63d5ae6e51426dbc949115a";

const readText = async (path) => readFile(new URL(path, root), "utf8");
const normalizeLineEndings = (value) => value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
const sha256Text = (value) => createHash("sha256").update(normalizeLineEndings(value)).digest("hex");

const writeStatic = async (relativePath, body) => {
  const target = new URL(relativePath, staticRoot);
  await mkdir(new URL("./", target), { recursive: true });
  await writeFile(target, body, "utf8");
};

let html = await readText("index.html");
const css = await readText("assets/site.css");
const motion = await readText("assets/motion.js");
const statusPage = await readText("status.html");
const statusCss = await readText("assets/status.css");
const projectPage = await readText("work/myopia-risk-calculator/index.html");
const verificationManifest = await readText("work/myopia-risk-calculator/verification.json");
const privacyPage = await readText("privacy.html");
const robots = await readText("robots.txt");
const cname = await readText("CNAME");
const nojekyll = await readText(".nojekyll");
const sitemap = await readText("sitemap.xml");
let notFound = await readText("404.html");
const calculatorRaw = await readText("third_party/myopia-risk-calculator/index.html");
const ogBytes = await readFile(new URL("og.png", root));
const ogBase64 = ogBytes.toString("base64");

const calculatorSha = sha256Text(calculatorRaw);
if (calculatorSha !== LOCKED_CALCULATOR_SHA256) {
  throw new Error(
    `Calculator snapshot hash mismatch: expected ${LOCKED_CALCULATOR_SHA256}, got ${calculatorSha}`,
  );
}

let verificationManifestData;
try {
  verificationManifestData = JSON.parse(verificationManifest);
} catch (error) {
  throw new Error(`Verification manifest is not valid JSON: ${error.message}`);
}
if (verificationManifestData?.snapshot?.sha256 !== LOCKED_CALCULATOR_SHA256) {
  throw new Error("Verification manifest hash does not match the locked calculator snapshot.");
}
if (verificationManifestData?.project?.version !== "1.0.0") {
  throw new Error("Verification manifest project version is not the locked version.");
}
if (verificationManifestData?.links?.demo !== "/demo/") {
  throw new Error("Verification manifest must point to the controlled /demo/ entry point.");
}
if (verificationManifestData?.published_demo?.artifact !== "demo/index.html") {
  throw new Error("Verification manifest must identify the published demo artifact.");
}
// Keep the demo on a root-site-controlled path. The old project-slug path can
// be claimed by a same-name GitHub Pages project, so public CTAs use /demo/.
html = html.replaceAll(
  "https://cosine753.github.io/myopia-risk-calculator/",
  "/demo/",
);

// The public trial intentionally contains no real identity or contact details.
html = html
  .replace(/<!--[^]*?-->/g, "")
  .replace(/\n<script type="application\/ld\+json">[^]*?<\/script>\n/i, "\n")
  .replaceAll("https://cosine753.github.io/", "https://echosine.net/")
  .replace(
    /\n\s*<li><a class="button button-secondary" href="mailto:\{\{需你填写:邮箱\}\}">邮件联系 <span aria-hidden="true">↗<\/span><\/a><\/li>/,
    "",
  )
  .replace(
    /<a class="contact-mail" href="mailto:\{\{需你填写:邮箱\}\}">\s*<span>\{\{需你填写:邮箱\}\}<\/span>\s*<i aria-hidden="true">↗<\/i>\s*<\/a>/,
    '<a class="contact-mail" href="https://github.com/Cosine753" rel="noopener noreferrer" referrerpolicy="no-referrer"><span>github.com/Cosine753</span><i aria-hidden="true">↗</i></a>',
  );

const replacements = new Map([
  ["姓名", "NA"],
  ["姓名英文拼写", "Anonymous preview"],
  ["现单位与院系", "身份信息暂不公开"],
  ["当前身份", "匿名试运行"],
  ["学位一学校院系与专业学位", "个人经历暂不公开"],
  ["学位一起止年份与补充说明", "本页仅用于测试域名与页面展示。"],
  ["学位二学校院系与专业学位", "研究资料将在正式版补充"],
  ["学位二起止年份与补充说明", "公开前将由本人复核。"],
  ["如有临床或工作经历请在此说明否则删除本段", "本页为匿名试运行版本，个人经历暂不公开。"],
]);

for (const [key, value] of replacements) {
  html = html.replaceAll(`{{需你填写:${key}}}`, value);
}

html = html
  .replace("NA的个人学术主页", "匿名个人学术主页")
  .replace('datetime="2026-07">2026-07', 'datetime="2026-08">2026-08');

notFound = notFound
  .replaceAll("https://cosine753.github.io/", "https://echosine.net/")
  .replace(/<!--[^]*?-->/g, "");

const REFERRER_META = '<meta name="referrer" content="no-referrer" />';
const CALCULATOR_CSP = "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src 'self' data:; base-uri 'none'; form-action 'none'; object-src 'none'; frame-ancestors 'none'";
const CALCULATOR_CSP_META = `<meta http-equiv="Content-Security-Policy" content="${CALCULATOR_CSP}" />`;
const QUESTIONNAIRE_FORM = '<form id="questionnaire" novalidate autocomplete="off">';
const MODEL_VERSION = verificationManifestData.project.version;
const MODEL_SNAPSHOT_DATE = "2026-07-22";

const replaceCalculator = (source, pattern, replacement, label) => {
  const next = source.replace(pattern, replacement);
  if (next === source) {
    throw new Error(`Calculator enhancement target missing: ${label}`);
  }
  return next;
};

// Keep the third-party snapshot immutable while applying the small amount of
// presentation and accessibility chrome owned by this anonymous site.
const enhanceCalculatorPage = (source) => {
  let page = source;

  page = replaceCalculator(
    page,
    /(<meta name="referrer" content="no-referrer"\s*\/?>(?:\r?\n)?)/i,
    `$1<meta name="theme-color" content="#103943" />
<link rel="canonical" href="https://echosine.net/demo/" />
<meta property="og:type" content="website" />
<meta property="og:locale" content="zh_CN" />
<meta property="og:url" content="https://echosine.net/demo/" />
<meta property="og:title" content="Vision Triage · 匿名研究演示" />
<meta property="og:description" content="浏览器本地运行的两阶段风险分层研究演示；不上传、不保存问卷输入。" />
<meta property="og:image" content="https://echosine.net/og.png" />
<meta property="og:image:type" content="image/png" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:image:alt" content="Vision Triage 匿名研究演示预览图" />
`,
    "head metadata",
  );

  page = replaceCalculator(
    page,
    /(\[hidden\]\s*\{\s*display:\s*none\s*!important;\s*\})/,
    `$1

.skip-link {
  position: absolute; left: 14px; top: 10px; z-index: 20;
  transform: translateY(-160%); padding: 9px 13px;
  border-radius: 6px; background: var(--yellow); color: #273b3d;
  font-weight: 750; box-shadow: 0 5px 16px rgba(19,42,54,.16);
}
.skip-link:focus { transform: none; }
.sr-only {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
}
`,
    "accessibility utility styles",
  );
  page = replaceCalculator(
    page,
    /a \{ color: inherit; text-decoration: none; \}/,
    `a { color: inherit; text-decoration: none; }
a:focus-visible, button:focus-visible, select:focus-visible, summary:focus-visible {
  outline: 3px solid #f0c95b; outline-offset: 3px;
}`,
    "focus styles",
  );
  page = replaceCalculator(
    page,
    /(\.header-badges span\s*\{[^}]+\})/,
    `$1
.calculator-nav { display: flex; align-items: center; gap: 14px; margin-left: auto; margin-right: 18px; }
.calculator-nav a { color: #53636b; font-size: 11px; font-weight: 700; text-underline-offset: 3px; }
.calculator-nav a:hover { color: var(--teal); text-decoration: underline; }
`,
    "calculator navigation styles",
  );
  page = replaceCalculator(
    page,
    /(\.completion-track i\s*\{[^}]+\})/,
    `$1
.completion-track[role="progressbar"] { min-width: 80px; }
`,
    "completion semantics style",
  );
  page = replaceCalculator(
    page,
    /\.field-label small\s*\{[^}]+\}/,
    `.field-label small { margin-top: 4px; color: #65747d; font-size: 11px; }`,
    "field label contrast",
  );
  page = replaceCalculator(
    page,
    /\.field-order\s*\{[^}]+\}/,
    `.field-order { position: absolute; top: 7px; right: 9px; color: #65747d; font-size: 9px; }`,
    "field order contrast",
  );
  page = replaceCalculator(
    page,
    /(select\s*\{[^}]*?)font-size:\s*12px;/,
    `$1font-size: 13px;`,
    "select text size",
  );
  page = replaceCalculator(
    page,
    /(\.form-message\s*\{[^}]+\})/,
    `$1
.privacy-note { margin: 24px 0 0; padding: 13px 15px; border: 1px solid #cfe3de; border-left: 4px solid var(--teal); border-radius: 7px; background: #f1faf7; color: #315b59; font-size: 12px; line-height: 1.65; }
.privacy-note strong { color: #174d49; }
.privacy-note a { color: var(--teal-dark); font-weight: 750; text-decoration: underline; text-underline-offset: 3px; }
.init-message { margin-top: 18px; }
`,
    "privacy notice styles",
  );
  page = replaceCalculator(
    page,
    /\.form-actions p\s*\{[^}]+\}/,
    `.form-actions p { margin: 0 0 0 auto; color: #65747d; font-size: 11px; }`,
    "form note contrast",
  );
  page = replaceCalculator(
    page,
    /(\.result-panel\.myopia\s*\{[^}]+\})/,
    `$1
.result-panel:focus { outline: 3px solid var(--yellow); outline-offset: 5px; }
.result-announcement { min-height: 1px; }
`,
    "result focus styles",
  );
  page = replaceCalculator(
    page,
    /(@media \(max-width: 600px\) \{)/,
    `$1
  .site-header { height: auto; min-height: 72px; padding: 10px 0 8px; flex-wrap: wrap; row-gap: 0; align-content: center; }
  .header-badges { display: none; }
  .calculator-nav { order: 3; flex: 1 1 100%; width: 100%; margin: 5px 0 0; gap: 16px; justify-content: flex-start; overflow-x: auto; scrollbar-width: none; padding-bottom: 2px; }
  .calculator-nav::-webkit-scrollbar { display: none; }
  .calculator-nav a { display: inline-flex; min-height: 32px; flex: 0 0 auto; align-items: center; white-space: nowrap; }
`,
    "mobile header layout",
  );
  page = page.replace("  .site-header { height: 72px; }", "  /* mobile header sizing is defined above */");
  page = page.replace(/  \.header-badges span:not\(:last-child\) \{ display: none; \}\r?\n/, "");
  page = page.replace(/  \.calculator-nav a:nth-child\(2\) \{ display: none; \}\r?\n/, "");

  page = replaceCalculator(
    page,
    /<body>/,
    `<body>
<a class="skip-link" href="#calculator">跳到问卷表单</a>`,
    "skip link markup",
  );
  page = replaceCalculator(
    page,
    /\s*<div class="header-badges"/,
    `
    <nav class="calculator-nav" aria-label="相关页面">
      <a href="/work/myopia-risk-calculator/">项目详情</a>
      <a href="/status.html">项目状态</a>
      <a href="/privacy.html">隐私边界</a>
    </nav>
    <div class="header-badges"`,
    "calculator navigation markup",
  );
  page = replaceCalculator(page, /<span>Model v2026\.07<\/span>/, `<span>Locked model · v${MODEL_VERSION}</span>`, "model badge");
  page = replaceCalculator(page, /<section class="hero" id="top">/, `<section class="hero" id="top" aria-labelledby="hero-title">`, "hero landmark");
  page = replaceCalculator(page, /<h1>儿童近视与干眼共病<br \/>问卷风险分层计算器<\/h1>/, `<h1 id="hero-title">儿童近视与干眼共病<br />问卷风险分层计算器</h1>`, "hero heading id");
  page = replaceCalculator(page, /<section class="notice" aria-label="重要提示">/, `<section class="notice" aria-labelledby="notice-title">`, "notice landmark");
  page = replaceCalculator(page, /<strong>研究演示工具：<\/strong>/, `<strong id="notice-title">研究演示工具：</strong>`, "notice heading id");
  page = replaceCalculator(page, /<section class="calculator-shell" id="calculator">/, `<section class="calculator-shell" id="calculator" aria-labelledby="calculator-title">`, "calculator landmark");
  page = replaceCalculator(page, /<h2>填写问卷信息<\/h2>/, `<h2 id="calculator-title">填写问卷信息</h2>`, "calculator heading id");
  page = replaceCalculator(
    page,
    /<div class="completion" aria-live="polite">\s*<span id="completionCount">0\/15<\/span>\s*<div class="completion-track"><i id="completionBar" style="width: 0%"><\/i><\/div>\s*<\/div>/,
    `<div class="completion" aria-label="问卷完成度">
        <span id="completionCount">0/15</span>
        <div class="completion-track" role="progressbar" aria-labelledby="completionCount" aria-valuemin="0" aria-valuemax="15" aria-valuenow="0" aria-valuetext="0/15 已完成"><i id="completionBar" style="width: 0%"></i></div>
      </div>`,
    "completion progressbar",
  );
  page = replaceCalculator(
    page,
    /<form id="questionnaire" novalidate(?: autocomplete="off")?>/,
    `<form id="questionnaire" novalidate autocomplete="off" aria-describedby="privacy-note">
      <p class="privacy-note" id="privacy-note"><strong>请使用虚构或示例回答。</strong> 不要输入真实患者姓名、联系方式、病历号或其他可识别信息。<a href="/privacy.html">查看隐私与数据流向</a></p>
      <noscript><p class="form-message init-message">此演示需要启用 JavaScript；问卷答案不会发送到服务器。</p></noscript>
      <p class="form-message init-message" id="initMessage" role="alert" hidden>演示初始化失败，请刷新页面后重试；请不要提交真实患者信息。</p>`,
    "privacy notice markup",
  );
  page = replaceCalculator(page, /<div id="resultMount"><\/div>/, `<div id="resultAnnouncement" class="sr-only" role="status" aria-live="polite" aria-atomic="true"></div>
  <div id="resultMount"></div>`, "result announcement");
  page = replaceCalculator(page, /<section class="method" id="method">/, `<section class="method" id="method" aria-labelledby="method-title">`, "method landmark");
  page = replaceCalculator(page, /<h2>透明、锁定、可复核的计算路径<\/h2>/, `<h2 id="method-title">透明、锁定、可复核的计算路径</h2>`, "method heading id");
  page = replaceCalculator(page, /模型版本：2026-07-22；Stage 1阈值：0\.575；Stage 2阈值：0\.150。/, `锁定模型版本：v${MODEL_VERSION}（快照日期 ${MODEL_SNAPSHOT_DATE}）；Stage 1阈值：0.575；Stage 2阈值：0.150。`, "model version copy");
  page = replaceCalculator(
    page,
    /(<p>本工具不收集个人信息[^<]*眼科检查。)(<\/p>\s*<\/footer>)/,
    `$1<br /><a href="/work/myopia-risk-calculator/">项目详情</a> · <a href="/privacy.html">隐私边界</a>$2`,
    "footer links",
  );

  page = replaceCalculator(page, /  var values = \{\};/, `  var values = {};
  var MODEL_VERSION = ${JSON.stringify(MODEL_VERSION)};
  var MODEL_SNAPSHOT_DATE = ${JSON.stringify(MODEL_SNAPSHOT_DATE)};

  function scrollBehavior() {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "auto"
      : "smooth";
  }`, "model runtime constants");
  page = replaceCalculator(
    page,
    /(  function percent\(value\) \{\s*return \(value \* 100\)\.toFixed\(1\) \+ "%";\s*\})/,
    `$1

  function probabilityDisplay(result) {
    var raw = [
      result.probabilities.healthy,
      result.probabilities.myopia,
      result.probabilities.comorbidity
    ];
    var total = raw.reduce(function (sum, value) { return sum + Math.max(0, value); }, 0);
    if (total === 0) { return [0, 0, 1]; }

    var exactUnits = raw.map(function (value) { return Math.max(0, value) / total * 1000; });
    var units = exactUnits.map(function (value) { return Math.floor(value); });
    var remaining = 1000 - units.reduce(function (sum, value) { return sum + value; }, 0);
    var order = exactUnits.map(function (value, index) {
      return { index: index, remainder: value - units[index] };
    }).sort(function (left, right) {
      return right.remainder - left.remainder || left.index - right.index;
    });
    for (var index = 0; index < remaining; index += 1) {
      units[order[index % order.length].index] += 1;
    }
    return units.map(function (value) { return value / 1000; });
  }`,
    "probability rounding",
  );
  page = replaceCalculator(page, /      var fieldset = el\("fieldset", "question-group"\);/, `      var fieldset = el("fieldset", "question-group");
      var legendId = "group-" + (groupIndex + 1) + "-title";
      fieldset.setAttribute("aria-labelledby", legendId);`, "fieldset label");
  page = replaceCalculator(page, /      var legendText = document\.createElement\("span"\);/, `      var legendText = document.createElement("span");
      legendText.id = legendId;`, "legend label");
  page = replaceCalculator(page, /        select\.setAttribute\("aria-required", "true"\);\s*select\.appendChild\(new Option\("请选择", ""\)\);/, `        select.setAttribute("aria-required", "true");
        select.required = true;
        var placeholder = new Option("请选择", "");
        placeholder.disabled = true;
        select.appendChild(placeholder);`, "required select");
  page = replaceCalculator(
    page,
    /  function updateCompletion\(\) \{[^]*?\n  \}/,
    `  function updateCompletion() {
    var completed = ALL_VARIABLES.filter(function (variable) {
      return values[variable];
    }).length;
    var total = ALL_VARIABLES.length;
    var label = completed + "/" + total;
    var completionCount = document.getElementById("completionCount");
    var completionBar = document.getElementById("completionBar");
    var completionTrack = completionBar.parentElement;
    completionCount.textContent = label;
    completionCount.setAttribute("aria-label", label + " 已完成");
    completionBar.style.width = (completed / total) * 100 + "%";
    completionTrack.setAttribute("aria-valuenow", String(completed));
    completionTrack.setAttribute("aria-valuemax", String(total));
    completionTrack.setAttribute("aria-valuetext", label + " 已完成");
  }`,
    "completion updater",
  );
  page = replaceCalculator(page, /    document\.getElementById\("resultMount"\)\.innerHTML = "";/, `    document.getElementById("resultMount").innerHTML = "";
    document.getElementById("resultAnnouncement").textContent = "";`, "result clearing");
  page = replaceCalculator(page, /    section\.setAttribute\("aria-live", "polite"\);/, `    section.setAttribute("tabindex", "-1");
    section.setAttribute("role", "region");
    section.setAttribute("aria-labelledby", "result-title");`, "result landmark");
  page = replaceCalculator(page, /    titleText\.appendChild\(el\("h2", null, copy\.title\)\);/, `    var resultTitle = el("h2", null, copy.title);
    resultTitle.id = "result-title";
    titleText.appendChild(resultTitle);`, "result heading id");
  page = replaceCalculator(page, /    summary\.appendChild\(el\("p", "result-note", copy\.note\)\);/, `    summary.appendChild(el("p", "result-note", copy.note + " 这不是诊断或治疗建议。"));`, "result boundary copy");
  page = replaceCalculator(page, /    \[\s*\["健康", result\.probabilities\.healthy, "bar-healthy"\],\s*\["单纯近视", result\.probabilities\.myopia, "bar-myopia"\],\s*\["近视–干眼共病", result\.probabilities\.comorbidity, "bar-comorbidity"\]\s*\]\.forEach\(function \(row\) \{/,
    `    var displayedProbabilities = probabilityDisplay(result);
    [
      ["健康", displayedProbabilities[0], "bar-healthy"],
      ["单纯近视", displayedProbabilities[1], "bar-myopia"],
      ["近视–干眼共病", displayedProbabilities[2], "bar-comorbidity"]
    ].forEach(function (row, rowIndex) {`,
    "probability display rows",
  );
  page = replaceCalculator(page, /      head\.appendChild\(el\("span", null, row\[0\]\)\);/, `      var rowLabel = el("span", null, row[0]);
      rowLabel.id = "probability-label-" + rowIndex;
      head.appendChild(rowLabel);`, "probability labels");
  page = replaceCalculator(page, /      var track = el\("div", "probability-track"\);/, `      var track = el("div", "probability-track");
      track.setAttribute("role", "progressbar");
      track.setAttribute("aria-labelledby", rowLabel.id);
      track.setAttribute("aria-valuemin", "0");
      track.setAttribute("aria-valuemax", "100");
      track.setAttribute("aria-valuenow", String(Math.round(row[1] * 1000) / 10));
      track.setAttribute("aria-valuetext", percent(row[1]));`, "probability semantics");
  page = replaceCalculator(page, /    mount\.appendChild\(section\);/, `    mount.appendChild(section);
    document.getElementById("resultAnnouncement").textContent = "已生成" + copy.title + "（" + MODEL_VERSION + "，快照 " + MODEL_SNAPSHOT_DATE + "）；结果仅供研究演示，不是诊断或治疗建议。";`, "result announcement update");
  page = replaceCalculator(page, /if \(panel\) \{ panel\.scrollIntoView\(\{ behavior: "smooth" \}\); \}/, `if (panel) {
        panel.focus({ preventScroll: true });
        panel.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
      }`, "result focus behavior");
  page = replaceCalculator(page, /window\.scrollTo\(\{ top: 0, behavior: "smooth" \}\);/, `window.scrollTo({ top: 0, behavior: scrollBehavior() });`, "reset motion behavior");
  page = replaceCalculator(page, /  buildForm\(\);\s*\n  updateCompletion\(\);/, `  try {
    buildForm();
    updateCompletion();
  } catch (error) {
    var initMessage = document.getElementById("initMessage");
    if (initMessage) { initMessage.hidden = false; }
  }`, "initialization guard");

  return page;
};

let calculator = calculatorRaw
  .replace(
    /<meta name="robots" content="index, follow"\s*\/?>/i,
    '<meta name="robots" content="noindex, nofollow" />',
  )
  .replace(/<meta name="referrer" content="[^"]*"\s*\/?>/i, REFERRER_META)
  .replace(/<meta http-equiv="Content-Security-Policy" content="[^"]*"\s*\/?>/i, CALCULATOR_CSP_META)
  .replace(/<form id="questionnaire"[^>]*>/i, QUESTIONNAIRE_FORM);
if (!/<meta name="referrer" content="no-referrer"\s*\/?>/i.test(calculator)) {
  calculator = calculator.replace(
    /(<meta name="robots" content="[^"]*"\s*\/?>)/i,
    (match) => `${match}\n${REFERRER_META}`,
  );
}
if (!/<meta http-equiv="Content-Security-Policy"\s+content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';/i.test(calculator)) {
  calculator = calculator.replace(
    /(<meta name="referrer" content="no-referrer"\s*\/?>)/i,
    (match) => `${match}\n${CALCULATOR_CSP_META}`,
  );
}
calculator = enhanceCalculatorPage(calculator);

if (verificationManifestData?.published_demo?.sha256 !== sha256Text(calculator)) {
  throw new Error(
    `Verification manifest demo hash mismatch: expected ${verificationManifestData.published_demo.sha256}, got ${sha256Text(calculator)}.`,
  );
}
const verificationManifestBody = `${JSON.stringify(verificationManifestData, null, 2)}\n`;

const anonymousPages = [
  ["index.html", html],
  ["status.html", statusPage],
  ["work/myopia-risk-calculator/index.html", projectPage],
  ["demo/index.html", calculator],
  ["myopia-risk-calculator/index.html", calculator],
  ["privacy.html", privacyPage],
];
for (const [name, page] of anonymousPages) {
  if (/\{\{需你填写:/u.test(page)) {
    throw new Error(`${name} still contains an unresolved visible placeholder.`);
  }
  if (/mailto:/iu.test(page)) {
    throw new Error(`${name} must not publish an email address.`);
  }
  if (/https:\/\/cosine753\.github\.io/iu.test(page)) {
    throw new Error(`${name} still points at the old github.io domain.`);
  }
}

if (html.includes("{{需你填写:")) {
  throw new Error("Anonymous build still contains an unresolved visible placeholder.");
}
if (/mailto:/i.test(html)) {
  throw new Error("Anonymous build must not publish an email address.");
}
if (!html.includes('href="/demo/"')) {
  throw new Error("Anonymous build must keep the calculator demo on this host.");
}
if (!html.includes('href="/privacy.html"')) {
  throw new Error("Anonymous build must link to the privacy boundary page.");
}
if (!html.includes('property="og:image"')) {
  throw new Error("Anonymous build must keep the social preview image metadata.");
}
if ((html.match(/github\.com\/Cosine753/g) ?? []).length < 1) {
  throw new Error("Anonymous build dropped the GitHub contact path.");
}
if (/content="index,\s*follow"/i.test(calculator)) {
  throw new Error("Calculator copy must remain noindex on the anonymous host.");
}
if (!/<meta name="referrer" content="no-referrer"\s*\/?>/i.test(calculator)) {
  throw new Error("Calculator copy must keep a no-referrer policy.");
}
if (!calculator.includes(CALCULATOR_CSP_META)) {
  throw new Error("Calculator copy must keep the local-only content security policy.");
}
if (!/<form id="questionnaire" novalidate autocomplete="off"(?:\s+aria-describedby="[^"]+")?>/i.test(calculator)) {
  throw new Error("Calculator copy must disable browser form autocomplete.");
}
if (/mailto:/i.test(verificationManifestBody) || /https:\/\/cosine753\.github\.io/i.test(verificationManifestBody)) {
  throw new Error("Verification manifest contains a disallowed contact or legacy host.");
}
if (!calculator.includes('id="privacy-note"') || !calculator.includes('id="resultAnnouncement"')) {
  throw new Error("Generated calculator is missing the anonymous privacy or result announcement boundary.");
}

if (
  !/^User-agent:\s*\*/im.test(robots) ||
  !/Disallow:\s*\/myopia-risk-calculator/im.test(robots) ||
  !/Disallow:\s*\/work\/myopia-risk-calculator\/verification\.json/im.test(robots)
) {
  throw new Error("robots.txt must keep the legacy calculator and anonymous manifest disallow rules.");
}

const worker = `const home = ${JSON.stringify(html)};
const css = ${JSON.stringify(css)};
const motion = ${JSON.stringify(motion)};
const statusPage = ${JSON.stringify(statusPage)};
const statusCss = ${JSON.stringify(statusCss)};
const projectPage = ${JSON.stringify(projectPage)};
const verificationManifest = ${JSON.stringify(verificationManifestBody)};
const privacyPage = ${JSON.stringify(privacyPage)};
const robots = ${JSON.stringify(robots)};
const calculator = ${JSON.stringify(calculator)};
const notFound = ${JSON.stringify(notFound)};
const og = Uint8Array.from(atob(${JSON.stringify(ogBase64)}), (char) => char.charCodeAt(0));

const files = {
  "/": { body: home, type: "text/html; charset=utf-8" },
  "/index.html": { body: home, type: "text/html; charset=utf-8" },
  "/assets/site.css": { body: css, type: "text/css; charset=utf-8", cache: true },
  "/assets/motion.js": { body: motion, type: "application/javascript; charset=utf-8", cache: true },
  "/assets/status.css": { body: statusCss, type: "text/css; charset=utf-8", cache: true },
  "/og.png": { body: og, type: "image/png", cache: true },
  "/robots.txt": { body: robots, type: "text/plain; charset=utf-8" },
  "/status": { body: statusPage, type: "text/html; charset=utf-8" },
  "/status/": { body: statusPage, type: "text/html; charset=utf-8" },
  "/status.html": { body: statusPage, type: "text/html; charset=utf-8" },
  "/work/myopia-risk-calculator": { body: projectPage, type: "text/html; charset=utf-8" },
  "/work/myopia-risk-calculator/": { body: projectPage, type: "text/html; charset=utf-8" },
  "/work/myopia-risk-calculator/index.html": { body: projectPage, type: "text/html; charset=utf-8" },
  "/work/myopia-risk-calculator/verification.json": { body: verificationManifest, type: "application/json; charset=utf-8", cache: true },
  "/privacy": { body: privacyPage, type: "text/html; charset=utf-8" },
  "/privacy/": { body: privacyPage, type: "text/html; charset=utf-8" },
  "/privacy.html": { body: privacyPage, type: "text/html; charset=utf-8" },
  "/demo": { body: calculator, type: "text/html; charset=utf-8" },
  "/demo/": { body: calculator, type: "text/html; charset=utf-8" },
  "/demo/index.html": { body: calculator, type: "text/html; charset=utf-8" },
  "/myopia-risk-calculator": { body: calculator, type: "text/html; charset=utf-8" },
  "/myopia-risk-calculator/": { body: calculator, type: "text/html; charset=utf-8" },
  "/myopia-risk-calculator/index.html": { body: calculator, type: "text/html; charset=utf-8" },
};

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();
    if (method !== "GET" && method !== "HEAD") {
      return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
    }

    const route = files[url.pathname];
    const selected = route ?? { body: notFound, type: "text/html; charset=utf-8" };
    const calculatorRoute = [
      "/demo",
      "/demo/",
      "/demo/index.html",
      "/myopia-risk-calculator",
      "/myopia-risk-calculator/",
      "/myopia-risk-calculator/index.html",
    ].includes(url.pathname);
    const headers = new Headers({
      "Content-Type": selected.type,
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
      "X-Robots-Tag": "noindex, nofollow",
      "Cache-Control": selected.cache ? "public, max-age=3600" : "no-store",
      "Content-Security-Policy": calculatorRoute
        ? "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src 'self' data:; base-uri 'none'; form-action 'none'; object-src 'none'; frame-ancestors 'none'"
        : "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; font-src 'self'; base-uri 'self'; form-action 'self'; object-src 'none'; frame-ancestors 'none'",
      "X-Frame-Options": "DENY",
    });
    if (url.protocol === "https:") headers.set("Strict-Transport-Security", "max-age=31536000");
    return new Response(method === "HEAD" ? null : selected.body, {
      status: route ? 200 : 404,
      headers,
    });
  },
};
`;

await rm(dist, { recursive: true, force: true });
await mkdir(new URL("./server/", dist), { recursive: true });
await writeFile(new URL("./server/index.js", dist), worker, "utf8");

await writeStatic("index.html", html);
await writeStatic("404.html", notFound);
await writeStatic("robots.txt", robots);
await writeStatic("CNAME", cname);
await writeStatic(".nojekyll", nojekyll);
await writeStatic("sitemap.xml", sitemap);
await writeStatic("assets/site.css", css);
await writeStatic("assets/motion.js", motion);
await writeStatic("assets/status.css", statusCss);
await writeFile(new URL("./og.png", staticRoot), ogBytes);
await writeStatic("status.html", statusPage);
await writeStatic("work/myopia-risk-calculator/index.html", projectPage);
await writeStatic("work/myopia-risk-calculator/verification.json", verificationManifestBody);
await writeStatic("privacy.html", privacyPage);
await writeStatic("privacy/index.html", privacyPage);
await writeStatic("demo/index.html", calculator);
await writeStatic("myopia-risk-calculator/index.html", calculator);

// Keep the root Pages aliases in sync with the generated worker/static tree.
await mkdir(new URL("./privacy/", root), { recursive: true });
await writeFile(new URL("./privacy/index.html", root), privacyPage, "utf8");
await mkdir(new URL("./demo/", root), { recursive: true });
await writeFile(new URL("./demo/index.html", root), calculator, "utf8");
await mkdir(new URL("./myopia-risk-calculator/", root), { recursive: true });
await writeFile(new URL("./myopia-risk-calculator/index.html", root), calculator, "utf8");

console.log("Built anonymous echosine.net trial site.");
