import assert from "node:assert/strict";

const workerUrl = new URL(`./dist/server/index.js?v=${Date.now()}`, import.meta.url);
const { default: worker } = await import(workerUrl.href);

const fetchPath = (path, method = "GET") =>
  worker.fetch(new Request(`https://echosine.net${path}`, { method }));

const home = await fetchPath("/");
assert.equal(home.status, 200);
assert.match(home.headers.get("content-type") ?? "", /^text\/html/i);
assert.equal(home.headers.get("x-robots-tag"), "noindex, nofollow");
assert.match(home.headers.get("permissions-policy") ?? "", /camera=\(\)/);

const html = await home.text();
assert.match(html, /<title>NA — 眼科临床研究/);
assert.match(html, /Anonymous preview/);
assert.match(html, /https:\/\/echosine\.net\//);
assert.match(html, /href="\/myopia-risk-calculator\/"/);
assert.match(html, /<nav class="site-nav"/);
for (const section of ["about", "work", "research", "agenda", "methods", "background", "contact"]) {
  assert.match(html, new RegExp(`href="#${section}"`), section);
  assert.match(html, new RegExp(`id="${section}"`), section);
}
assert.match(html, /href="\/assets\/site\.css"/);
assert.match(html, /src="\/assets\/motion\.js"/);
assert.doesNotMatch(html, /https:\/\/echosine\.net\/myopia-risk-calculator\//);
assert.doesNotMatch(html, /\{\{需你填写:/);
assert.doesNotMatch(html, /mailto:/i);
assert.doesNotMatch(html, /application\/ld\+json/i);
assert.equal((html.match(/GitHub 联系/g) ?? []).length, 0);

const css = await fetchPath("/assets/site.css");
assert.equal(css.status, 200);
assert.match(css.headers.get("content-type") ?? "", /^text\/css/i);

const motion = await fetchPath("/assets/motion.js");
assert.equal(motion.status, 200);
assert.match(motion.headers.get("content-type") ?? "", /^application\/javascript/i);
assert.match(await motion.text(), /IntersectionObserver/);

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
