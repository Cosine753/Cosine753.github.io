import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";

const root = new URL("./", import.meta.url);
const dist = new URL("./dist/", root);
const staticRoot = new URL("./dist/static/", root);

const LOCKED_CALCULATOR_SHA256 =
  "cac745fccb61882c5ffce8d29cd343949a3981b6d63d5ae6e51426dbc949115a";

const readText = async (path) => readFile(new URL(path, root), "utf8");

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
let notFound = await readText("404.html");
const calculatorRaw = await readText("third_party/myopia-risk-calculator/index.html");
const ogBytes = await readFile(new URL("og.png", root));
const ogBase64 = ogBytes.toString("base64");

const calculatorSha = createHash("sha256")
  .update(calculatorRaw.replace(/\r\n/g, "\n").replace(/\r/g, "\n"))
  .digest("hex");
if (calculatorSha !== LOCKED_CALCULATOR_SHA256) {
  throw new Error(
    `Calculator snapshot hash mismatch: expected ${LOCKED_CALCULATOR_SHA256}, got ${calculatorSha}`,
  );
}

// Keep the demo on this same host. Rewriting github.io -> echosine.net made the
// CTA depend on custom-domain DNS, and the worker did not serve that path.
html = html.replaceAll(
  "https://cosine753.github.io/myopia-risk-calculator/",
  "/myopia-risk-calculator/",
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

let calculator = calculatorRaw.replace(
  /<meta name="robots" content="index, follow"\s*\/?>/,
  '<meta name="robots" content="noindex, nofollow">',
);

const anonymousPages = [
  ["index.html", html],
  ["status.html", statusPage],
  ["work/myopia-risk-calculator/index.html", projectPage],
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
if (!html.includes('href="/myopia-risk-calculator/"')) {
  throw new Error("Anonymous build must keep the calculator demo on this host.");
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

const robots = `User-agent: *\nAllow: /\n\n# Anonymous trial: discovery remains disabled by the page's noindex directive.\n`;

const worker = `const home = ${JSON.stringify(html)};
const css = ${JSON.stringify(css)};
const motion = ${JSON.stringify(motion)};
const statusPage = ${JSON.stringify(statusPage)};
const statusCss = ${JSON.stringify(statusCss)};
const projectPage = ${JSON.stringify(projectPage)};
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
    const calculatorRoute = url.pathname.startsWith("/myopia-risk-calculator");
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
await writeStatic("assets/site.css", css);
await writeStatic("assets/motion.js", motion);
await writeStatic("assets/status.css", statusCss);
await writeFile(new URL("./og.png", staticRoot), ogBytes);
await writeStatic("status.html", statusPage);
await writeStatic("work/myopia-risk-calculator/index.html", projectPage);
await writeStatic("myopia-risk-calculator/index.html", calculator);

console.log("Built anonymous echosine.net trial site.");
