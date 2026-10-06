import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const serverPath = fileURLToPath(new URL("../dist/index.mjs", import.meta.url));

async function getUnusedPort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  assert.ok(address && typeof address !== "string");

  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  return address.port;
}

async function checkHealthEndpoint(baseUrl, path) {
  const response = await fetch(`${baseUrl}${path}`, {
    signal: AbortSignal.timeout(2_000),
  });
  assert.equal(response.status, 200, `GET ${path} should return HTTP 200`);
  assert.deepEqual(await response.json(), { status: "ok" });
}

const port = await getUnusedPort();
const baseUrl = `http://127.0.0.1:${port}`;
const child = spawn(
  process.execPath,
  ["--enable-source-maps", serverPath],
  {
    env: { ...process.env, NODE_ENV: "production", PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  },
);

let stdout = "";
let stderr = "";
let spawnError;
let exitResult;
child.stdout.setEncoding("utf8").on("data", (chunk) => (stdout += chunk));
child.stderr.setEncoding("utf8").on("data", (chunk) => (stderr += chunk));
child.on("error", (error) => (spawnError = error));
const exited = new Promise((resolve) => {
  child.once("exit", (code, signal) => {
    exitResult = { code, signal };
    resolve(exitResult);
  });
});

try {
  const deadline = Date.now() + 10_000;
  let ready = false;

  while (Date.now() < deadline) {
    if (spawnError) throw spawnError;
    if (exitResult) {
      throw new Error(
        `Production server exited before becoming ready: ${JSON.stringify(exitResult)}`,
      );
    }

    try {
      await fetch(`${baseUrl}/api`, {
        signal: AbortSignal.timeout(1_000),
      });
      ready = true;
      break;
    } catch {
      await delay(100);
    }
  }

  assert.ok(ready, "Production server did not become ready within 10 seconds");
  await checkHealthEndpoint(baseUrl, "/api");
  await checkHealthEndpoint(baseUrl, "/api/healthz");
  console.log("API health smoke test passed: /api and /api/healthz");
} catch (error) {
  console.error(error);
  if (stdout) console.error("Production server stdout:\n" + stdout);
  if (stderr) console.error("Production server stderr:\n" + stderr);
  process.exitCode = 1;
} finally {
  if (!exitResult) {
    child.kill("SIGTERM");
    const didExit = await Promise.race([
      exited.then(() => true),
      delay(1_000).then(() => false),
    ]);
    if (!didExit) {
      child.kill("SIGKILL");
      await exited;
    }
  }
}
