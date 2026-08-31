import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const workerUrl = new URL(`./dist/server/index.js?v=${Date.now()}`, import.meta.url);
const { default: worker } = await import(workerUrl.href);

const fetchPath = (path, method = "GET") =>
  worker.fetch(new Request(`https://echosine.net${path}`, { method }));

const home = await fetchPath("/");
assert.equal(home.status, 200);
assert.match(home.headers.get("content-type") ?? "", /^text\/html/i);
assert.equal(home.headers.get("x-robots-tag"), "noindex, nofollow");
assert.match(home.headers.get("permissions-policy") ?? "", /camera=\(\)/);
assert.equal(home.headers.get("referrer-policy"), "no-referrer");
assert.equal(home.headers.get("x-frame-options"), "DENY");
assert.equal(home.headers.get("strict-transport-security"), "max-age=31536000");
assert.match(home.headers.get("content-security-policy") ?? "", /script-src 'self'/);

const html = await home.text();
assert.match(html, /<title>NA — 眼科临床研究/);
assert.match(html, /Anonymous preview/);
assert.match(html, /https:\/\/echosine\.net\//);
assert.match(html, /property="og:image"/);
assert.match(html, /viewport-fit=cover/);
assert.match(html, /<main id="main" tabindex="-1">/);
assert.match(html, /class="to-top"/);
assert.match(html, /href="\/demo\/"/);
assert.match(html, /<nav class="site-nav"/);
for (const section of ["about", "work", "research", "agenda", "methods", "background", "contact"]) {
  assert.match(html, new RegExp(`href="#${section}"`), section);
  assert.match(html, new RegExp(`id="${section}"`), section);
}
assert.match(html, /href="\/assets\/site\.css\?v=8"/);
assert.match(html, /src="\/assets\/motion\.js\?v=5"/);
assert.match(html, /kicker-rule/);
assert.doesNotMatch(html, /https:\/\/echosine\.net\/myopia-risk-calculator\//);
assert.doesNotMatch(html, /\{\{需你填写:/);
assert.doesNotMatch(html, /mailto:/i);
assert.doesNotMatch(html, /rel="me"/i);
assert.doesNotMatch(html, /application\/ld\+json/i);
assert.equal((html.match(/GitHub 联系/g) ?? []).length, 0);
assert.match(html, /href="\/work\/myopia-risk-calculator\/"/);
assert.match(html, /href="\/status\.html"/);
assert.match(html, /href="\/privacy\.html"/);

const css = await fetchPath("/assets/site.css");
assert.equal(css.status, 200);
assert.match(css.headers.get("content-type") ?? "", /^text\/css/i);
const cssBody = await css.text();
assert.match(cssBody, /@media \(min-width: 901px\)/);
assert.match(cssBody, /\.kicker-rule/);

const motion = await fetchPath("/assets/motion.js");
assert.equal(motion.status, 200);
assert.match(motion.headers.get("content-type") ?? "", /^application\/javascript/i);
const motionBody = await motion.text();
assert.match(motionBody, /IntersectionObserver/);
assert.match(motionBody, /revealAll/);

const og = await fetchPath("/og.png");
assert.equal(og.status, 200);
assert.match(og.headers.get("content-type") ?? "", /^image\/png/i);
assert.ok((await og.arrayBuffer()).byteLength > 1000);

const deployedCalculator = await readFile(
  new URL("./myopia-risk-calculator/index.html", import.meta.url),
  "utf8",
);
assert.match(deployedCalculator, /<meta name="robots" content="noindex, nofollow" \/>/);
assert.match(deployedCalculator, /<meta name="referrer" content="no-referrer" \/>/);
assert.match(deployedCalculator, /<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';/);
assert.match(deployedCalculator, /<form id="questionnaire" novalidate autocomplete="off">/);
assert.doesNotMatch(deployedCalculator, /content="index,\s*follow"/i);

const deployedDemo = await readFile(new URL("./demo/index.html", import.meta.url), "utf8");
assert.match(deployedDemo, /<meta name="robots" content="noindex, nofollow" \/>/);
assert.match(deployedDemo, /<meta name="referrer" content="no-referrer" \/>/);
assert.match(deployedDemo, /<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';/);
assert.match(deployedDemo, /<form id="questionnaire" novalidate autocomplete="off">/);
assert.doesNotMatch(deployedDemo, /content="index,\s*follow"/i);
const normalizeHtml = (value) => value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
assert.equal(normalizeHtml(deployedDemo), normalizeHtml(deployedCalculator));

const calculatorSource = await readFile(
  new URL("./third_party/myopia-risk-calculator/index.html", import.meta.url),
  "utf8",
);
assert.match(calculatorSource, /<meta name="robots" content="noindex, nofollow" \/>/);
assert.doesNotMatch(calculatorSource, /content="index,\s*follow"/i);
const demoRoute = await fetchPath("/demo/");
assert.equal(demoRoute.status, 200);
assert.equal(demoRoute.headers.get("referrer-policy"), "no-referrer");
assert.match(demoRoute.headers.get("content-security-policy") ?? "", /default-src 'none'/);
assert.match(demoRoute.headers.get("content-security-policy") ?? "", /form-action 'none'/);
assert.equal(normalizeHtml(await demoRoute.text()), normalizeHtml(deployedDemo));

const manifestSource = await readFile(
  new URL("./work/myopia-risk-calculator/verification.json", import.meta.url),
  "utf8",
);
const manifest = await fetchPath("/work/myopia-risk-calculator/verification.json");
assert.equal(manifest.status, 200);
assert.match(manifest.headers.get("content-type") ?? "", /^application\/json/i);
assert.equal(manifest.headers.get("x-robots-tag"), "noindex, nofollow");
assert.equal(manifest.headers.get("referrer-policy"), "no-referrer");
assert.equal(manifest.headers.get("x-content-type-options"), "nosniff");
const manifestBody = JSON.parse(await manifest.text());
assert.deepEqual(manifestBody, JSON.parse(manifestSource));
assert.equal(manifestBody.project.id, "vision-triage");
assert.equal(manifestBody.project.version, "1.0.0");
assert.equal(manifestBody.snapshot.sha256, "cac745fccb61882c5ffce8d29cd343949a3981b6d63d5ae6e51426dbc949115a");
assert.equal(manifestBody.published_demo.artifact, "demo/index.html");
assert.equal(
  manifestBody.published_demo.sha256,
  createHash("sha256").update(normalizeHtml(deployedDemo)).digest("hex"),
);
assert.equal(manifestBody.validation.sample_count, 201);
assert.equal(manifestBody.validation.stratification_mismatches, 0);
assert.equal(manifestBody.evidence_status.classification, "maintainer-reported");
assert.equal(manifestBody.evidence_status.raw_records_published, false);
assert.equal(manifestBody.evidence_status.expected_outputs_published, false);
assert.equal(manifestBody.privacy.published_identity, "anonymous (NA)");
assert.doesNotMatch(JSON.stringify(manifestBody), /mailto:/i);
assert.doesNotMatch(JSON.stringify(manifestBody), /cosine753\.github\.io/i);

const privacySource = await readFile(new URL("./privacy.html", import.meta.url), "utf8");
assert.match(privacySource, /<title>隐私与公开边界 · echosine\.net<\/title>/);
assert.match(privacySource, /不上传/);
assert.match(privacySource, /基础访问日志/);
assert.match(privacySource, /href="\/privacy\.html"/);
assert.doesNotMatch(privacySource, /mailto:/i);
assert.doesNotMatch(privacySource, /\{\{需你填写:/);

for (const path of ["/privacy", "/privacy/", "/privacy.html"]) {
  const page = await fetchPath(path);
  assert.equal(page.status, 200, path);
  assert.equal(page.headers.get("x-robots-tag"), "noindex, nofollow", path);
  assert.equal(page.headers.get("referrer-policy"), "no-referrer", path);
  assert.equal(page.headers.get("x-frame-options"), "DENY", path);
  assert.match(page.headers.get("content-security-policy") ?? "", /script-src 'self'/, path);
  assert.equal(normalizeHtml(await page.text()), normalizeHtml(privacySource), path);
}

const robots = await fetchPath("/robots.txt");
assert.equal(robots.status, 200);
const robotsBody = await robots.text();
const robotsSource = await readFile(new URL("./robots.txt", import.meta.url), "utf8");
assert.equal(normalizeHtml(robotsBody), normalizeHtml(robotsSource));
assert.match(robotsBody, /User-agent: \*/);
assert.match(robotsBody, /Disallow:\s*\/myopia-risk-calculator/);
assert.match(robotsBody, /Disallow:\s*\/work\/myopia-risk-calculator\/verification\.json/);

for (const path of [
  "/demo",
  "/demo/",
  "/demo/index.html",
  "/myopia-risk-calculator",
  "/myopia-risk-calculator/",
  "/myopia-risk-calculator/index.html",
]) {
  const page = await fetchPath(path);
  assert.equal(page.status, 200, path);
  assert.equal(page.headers.get("x-robots-tag"), "noindex, nofollow", path);
  assert.equal(page.headers.get("referrer-policy"), "no-referrer", path);
  assert.match(page.headers.get("content-security-policy") ?? "", /unsafe-inline/);
  const body = await page.text();
  assert.match(body, /Vision Triage/, path);
  assert.match(body, /noindex, nofollow/, path);
  assert.doesNotMatch(body, /content="index,\s*follow"/i, path);
}

for (const path of ["/demo/not-found", "/myopia-risk-calculator/not-found"]) {
  const page = await fetchPath(path);
  assert.equal(page.status, 404, path);
  assert.match(page.headers.get("content-security-policy") ?? "", /script-src 'self'/, path);
  assert.doesNotMatch(page.headers.get("content-security-policy") ?? "", /unsafe-inline/, path);
}

for (const path of [
  "/work/myopia-risk-calculator",
  "/work/myopia-risk-calculator/",
  "/work/myopia-risk-calculator/index.html",
]) {
  const page = await fetchPath(path);
  assert.equal(page.status, 200, path);
  assert.equal(page.headers.get("x-robots-tag"), "noindex, nofollow", path);
  assert.equal(page.headers.get("referrer-policy"), "no-referrer", path);
  assert.equal(page.headers.get("x-frame-options"), "DENY", path);
  assert.match(page.headers.get("content-security-policy") ?? "", /style-src 'self'/, path);
  const body = await page.text();
  assert.match(body, /Vision Triage|风险分层/, path);
  assert.match(body, /v1\.0\.0/, path);
  assert.match(body, /201 例机构留出/, path);
  assert.match(body, /cac745fccb61882c5ffce8d29cd343949a3981b6d63d5ae6e51426dbc949115a/, path);
  assert.match(body, /证据边界/, path);
  assert.match(body, /原始机构记录(?:与期望输出)?未随仓库公开/, path);
  assert.doesNotMatch(body, /\{\{需你填写:/, path);
  assert.doesNotMatch(body, /mailto:/i, path);
  assert.doesNotMatch(body, /cosine753\.github\.io/i, path);
}

const missing = await fetchPath("/not-found");
assert.equal(missing.status, 404);
assert.equal(missing.headers.get("x-robots-tag"), "noindex, nofollow");

const head = await fetchPath("/", "HEAD");
assert.equal(head.status, 200);
assert.equal(await head.text(), "");

const manifestHead = await fetchPath("/work/myopia-risk-calculator/verification.json", "HEAD");
assert.equal(manifestHead.status, 200);
assert.equal(await manifestHead.text(), "");

const post = await fetchPath("/work/myopia-risk-calculator/", "POST");
assert.equal(post.status, 405);
assert.equal(post.headers.get("allow"), "GET, HEAD");

console.log("Anonymous site smoke checks passed.");
