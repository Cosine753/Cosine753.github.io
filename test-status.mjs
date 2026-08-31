import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const workerUrl = new URL(`./dist/server/index.js?v=${Date.now()}`, import.meta.url);
const { default: worker } = await import(workerUrl.href);

const fetchPath = (path, method = "GET") =>
  worker.fetch(new Request(`https://echosine.net${path}`, { method }));

for (const path of ["/status", "/status/", "/status.html"]) {
  const response = await fetchPath(path);
  assert.equal(response.status, 200, path);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html/i, path);
  assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow", path);
  assert.equal(response.headers.get("referrer-policy"), "no-referrer", path);
  assert.equal(response.headers.get("x-frame-options"), "DENY", path);
  assert.match(response.headers.get("content-security-policy") ?? "", /style-src 'self'/, path);
  const body = await response.text();
  assert.match(body, /<title>项目状态 · echosine\.net<\/title>/, path);
  assert.match(body, /匿名试运行/, path);
  assert.match(body, /最近更新/, path);
  assert.match(body, /href="\/assets\/status\.css\?v=2"/, path);
  assert.match(body, /href="\/demo\/"/, path);
  assert.doesNotMatch(body, /\{\{需你填写:/, path);
  assert.doesNotMatch(body, /mailto:/i, path);
}

const css = await fetchPath("/assets/status.css");
assert.equal(css.status, 200);
assert.match(css.headers.get("content-type") ?? "", /^text\/css/i);
const cssBody = await css.text();
assert.match(cssBody, /@media \(max-width: 640px\)/);
assert.match(cssBody, /@media print/);
assert.match(cssBody, /\.status-badge/);

const source = await readFile(new URL("./status.html", import.meta.url), "utf8");
assert.doesNotMatch(source, /<(script|iframe|img|video|audio|embed|object)\b/i);

const head = await fetchPath("/status.html", "HEAD");
assert.equal(head.status, 200);
assert.equal(await head.text(), "");

const post = await fetchPath("/status.html", "POST");
assert.equal(post.status, 405);
assert.equal(post.headers.get("allow"), "GET, HEAD");

console.log("Status page smoke checks passed.");
