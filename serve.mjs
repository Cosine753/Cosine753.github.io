import http from "node:http";

const port = Number(process.env.PORT || 8765);
const workerUrl = new URL(`./dist/server/index.js?v=${Date.now()}`, import.meta.url);
const { default: worker } = await import(workerUrl.href);

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
    const incoming = new Request(url, { method: req.method ?? "GET" });
    const response = await worker.fetch(incoming);
    const headers = Object.fromEntries(response.headers);
    const body = Buffer.from(await response.arrayBuffer());
    res.writeHead(response.status, headers);
    res.end(body);
  } catch (error) {
    res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    res.end(String(error?.stack ?? error));
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Anonymous preview http://127.0.0.1:${port}/`);
});
