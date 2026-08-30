import assert from "node:assert/strict";
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
assert.match(html, /href="\/myopia-risk-calculator\/"/);
assert.match(html, /<nav class="site-nav"/);
for (const section of ["about", "work", "research", "agenda", "methods", "background", "contact"]) {
  assert.match(html, new RegExp(`href="#${section}"`), section);
  assert.match(html, new RegExp(`id="${section}"`), section);
}
assert.match(html, /href="\/assets\/site\.css\?v=6"/);
assert.match(html, /src="\/assets\/motion\.js\?v=5"/);
assert.match(html, /kicker-rule/);
assert.doesNotMatch(html, /https:\/\/echosine\.net\/myopia-risk-calculator\//);
assert.doesNotMatch(html, /\{\{需你填写:/);
assert.doesNotMatch(html, /mailto:/i);
assert.doesNotMatch(html, /rel="me"/i);
assert.doesNotMatch(html, /application\/ld\+json/i);
assert.equal((html.match(/GitHub 联系/g) ?? []).length, 0);

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
assert.doesNotMatch(deployedCalculator, /content="index,\s*follow"/i);

const robots = await fetchPath("/robots.txt");
assert.equal(robots.status, 200);
assert.match(await robots.text(), /User-agent: \*/);

for (const path of [
  "/myopia-risk-calculator",
  "/myopia-risk-calculator/",
  "/myopia-risk-calculator/index.html",
]) {
  const page = await fetchPath(path);
  assert.equal(page.status, 200, path);
  assert.equal(page.headers.get("x-robots-tag"), "noindex, nofollow", path);
  assert.match(page.headers.get("content-security-policy") ?? "", /unsafe-inline/);
  const body = await page.text();
  assert.match(body, /Vision Triage/, path);
  assert.match(body, /noindex, nofollow/, path);
  assert.doesNotMatch(body, /content="index,\s*follow"/i, path);
}

const missing = await fetchPath("/not-found");
assert.equal(missing.status, 404);
assert.equal(missing.headers.get("x-robots-tag"), "noindex, nofollow");

const head = await fetchPath("/", "HEAD");
assert.equal(head.status, 200);
assert.equal(await head.text(), "");

console.log("Anonymous site smoke checks passed.");
