import assert from "node:assert/strict";

const workerUrl = new URL(`./dist/server/index.js?v=${Date.now()}`, import.meta.url);
const { default: worker } = await import(workerUrl.href);

const home = await worker.fetch(new Request("https://echosine.net/"));
assert.equal(home.status, 200);
assert.match(home.headers.get("content-type") ?? "", /^text\/html/i);
assert.equal(home.headers.get("x-robots-tag"), "noindex, nofollow");

const html = await home.text();
assert.match(html, /<title>NA — 眼科临床研究/);
assert.match(html, /Anonymous preview/);
assert.match(html, /https:\/\/echosine\.net\//);
assert.doesNotMatch(html, /\{\{需你填写:/);
assert.doesNotMatch(html, /mailto:/i);
assert.doesNotMatch(html, /application\/ld\+json/i);

const css = await worker.fetch(new Request("https://echosine.net/assets/site.css"));
assert.equal(css.status, 200);
assert.match(css.headers.get("content-type") ?? "", /^text\/css/i);

const missing = await worker.fetch(new Request("https://echosine.net/not-found"));
assert.equal(missing.status, 404);

console.log("Anonymous site smoke checks passed.");
