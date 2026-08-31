import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const run = promisify(execFile);
const root = new URL("./", import.meta.url);

if (process.platform !== "win32") {
  console.log("Guard regression check skipped outside Windows.");
} else {
  const fixture = await mkdtemp(join(tmpdir(), "echosine-guard-"));
  const git = async (args, env = {}) => run("git", ["-C", fixture, ...args], {
    windowsHide: true,
    env: { ...process.env, ...env },
  });

  try {
    await git(["init", "-q"]);
    await git(["config", "user.name", "Fixture"]);
    const safeEmail = ["fixture", "@users.noreply.github.com"].join("");
    const privateEmail = ["private", "@example.test"].join("");
    await git(["config", "user.email", safeEmail]);
    await writeFile(
      join(fixture, "index.html"),
      '<!doctype html><meta name="robots" content="noindex, nofollow"><title>fixture</title>\n',
      "utf8",
    );
    await git(["add", "index.html"]);
    await git(["commit", "-q", "-m", "fixture"], {
      GIT_AUTHOR_NAME: "Fixture",
      GIT_AUTHOR_EMAIL: privateEmail,
      GIT_COMMITTER_NAME: "Fixture",
      GIT_COMMITTER_EMAIL: safeEmail,
    });

    const guardPath = fileURLToPath(new URL("./publish-guard.ps1", root));
    const callGuard = async (...args) => {
      try {
        return await run("powershell", [
          "-NoProfile",
          "-NonInteractive",
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          guardPath,
          "-Root",
          fixture,
          ...args,
        ], { windowsHide: true, maxBuffer: 1024 * 1024 });
      } catch (error) {
        return error;
      }
    };

    await writeFile(join(fixture, "privacy.html"), "<!doctype html><title>privacy</title>\n", "utf8");
    let result = await callGuard("-IncludeUntracked");
    let output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
    assert.equal(result.code, 1, output);
    assert.match(output, /ROBOTS_NOINDEX_MISSING\s+privacy\.html/);
    await writeFile(
      join(fixture, "privacy.html"),
      '<!doctype html><meta name="robots" content="noindex, nofollow"><title>privacy</title>\n',
      "utf8",
    );
    console.log("Guard privacy regression check passed.");

    result = await callGuard("-CheckHistory");
    output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
    assert.equal(result.code, 1, output);
    assert.match(output, /HISTORY_EMAIL/);
    assert.doesNotMatch(output, /private@example\.test/);
    assert.doesNotMatch(output, /Guard error:/);
    console.log("Guard history regression check passed.");
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
}
