#!/usr/bin/env node
// `npm run share`: let testers outside your Wi-Fi try the quiz, without deploying.
// Builds the app, starts it on this computer, and opens a free Cloudflare quick
// tunnel (no account needed) that prints a temporary https://….trycloudflare.com
// address. Refuses to run without SITE_PASSWORD, so the tunnel is never open to
// anyone who finds the address. Stop it with Ctrl+C; the address stops working.
import { spawn, spawnSync } from "node:child_process";

const PORT = process.env.PORT ?? "3000";
const CLOUDFLARED = "cloudflared@0.7.3";

if (!process.env.SITE_PASSWORD) {
  console.error('Set a password first, for example:  SITE_PASSWORD="pick-something" npm run share');
  process.exit(1);
}

const build = spawnSync("npx", ["next", "build"], { stdio: "inherit" });
if (build.status !== 0) process.exit(build.status ?? 1);

const children = [];
const run = (cmd, args) => {
  // Own process group, so stopping it also stops whatever npx started underneath.
  const child = spawn(cmd, args, { stdio: "inherit", env: process.env, detached: true });
  children.push(child);
  child.on("exit", (code) => stop(code ?? 0));
  return child;
};
let stopping = false;
function stop(code) {
  if (stopping) return;
  stopping = true;
  for (const c of children) {
    try {
      process.kill(-c.pid, "SIGTERM");
    } catch {
      // Already gone.
    }
  }
  process.exit(code);
}
process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));

run("npx", ["next", "start", "-p", PORT]);
console.log("\nOpening the tunnel. Look for the https://….trycloudflare.com address below.");
console.log("Testers sign in with any user name and the SITE_PASSWORD you set.\n");
run("npx", ["-y", CLOUDFLARED, "tunnel", "--url", `http://localhost:${PORT}`]);
