import { mkdir, readFile, rm, writeFile } from "node:fs/promises";

const root = new URL("./", import.meta.url);
const dist = new URL("./dist/", root);

const readText = async (path) => readFile(new URL(path, root), "utf8");

let html = await readText("index.html");
const css = await readText("assets/site.css");
let notFound = await readText("404.html");

// The public trial intentionally contains no real identity or contact details.
html = html
  .replace(/<!--[^]*?-->/g, "")
  .replace(/\n<script type="application\/ld\+json">[^]*?<\/script>\n/i, "\n")
  .replace(/<meta property="og:image"[^>]*>\s*/g, "")
  .replace(/<meta property="og:image:(?:width|height|alt)"[^>]*>\s*/g, "")
  .replaceAll("https://cosine753.github.io/", "https://echosine.net/")
  .replace(
    /<li><a class="button button-secondary" href="mailto:\{\{需你填写:邮箱\}\}">邮件联系 <span aria-hidden="true">↗<\/span><\/a><\/li>/,
    '<li><a class="button button-secondary" href="https://github.com/Cosine753" rel="me">GitHub 联系 <span aria-hidden="true">↗</span></a></li>',
  )
  .replace(
    /<a class="contact-mail" href="mailto:\{\{需你填写:邮箱\}\}">\s*<span>\{\{需你填写:邮箱\}\}<\/span>\s*<i aria-hidden="true">↗<\/i>\s*<\/a>/,
    '<a class="contact-mail" href="https://github.com/Cosine753" rel="me"><span>github.com/Cosine753</span><i aria-hidden="true">↗</i></a>',
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
  .replace("© 2026 NA", "© 2026 NA")
  .replace('datetime="2026-07">2026-07', 'datetime="2026-08">2026-08');

notFound = notFound
  .replaceAll("https://cosine753.github.io/", "https://echosine.net/")
  .replace(/<!--[^]*?-->/g, "");

if (html.includes("{{需你填写:")) {
  throw new Error("Anonymous build still contains an unresolved visible placeholder.");
}
if (/mailto:/i.test(html)) {
  throw new Error("Anonymous build must not publish an email address.");
}

const robots = `User-agent: *\nAllow: /\n\n# Anonymous trial: discovery remains disabled by the page's noindex directive.\n`;

const routes = {
  "/": { body: html, type: "text/html; charset=utf-8" },
  "/index.html": { body: html, type: "text/html; charset=utf-8" },
  "/assets/site.css": { body: css, type: "text/css; charset=utf-8", cache: true },
  "/robots.txt": { body: robots, type: "text/plain; charset=utf-8" },
};

const worker = `const routes = ${JSON.stringify(routes)};\nconst notFound = ${JSON.stringify(notFound)};\n\nexport default {\n  async fetch(request) {\n    const url = new URL(request.url);\n    const method = request.method.toUpperCase();\n    if (method !== "GET" && method !== "HEAD") {\n      return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET, HEAD" } });\n    }\n\n    const route = routes[url.pathname];\n    const selected = route ?? { body: notFound, type: "text/html; charset=utf-8" };\n    const headers = new Headers({\n      "Content-Type": selected.type,\n      "X-Content-Type-Options": "nosniff",\n      "Referrer-Policy": "strict-origin-when-cross-origin",\n      "X-Robots-Tag": "noindex, nofollow",\n      "Cache-Control": selected.cache ? "public, max-age=3600" : "no-store",\n    });\n    return new Response(method === "HEAD" ? null : selected.body, {\n      status: route ? 200 : 404,\n      headers,\n    });\n  },\n};\n`;

await rm(dist, { recursive: true, force: true });
await mkdir(new URL("./server/", dist), { recursive: true });
await writeFile(new URL("./server/index.js", dist), worker, "utf8");

console.log("Built anonymous echosine.net trial site.");
