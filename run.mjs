import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const key = Buffer.from(process.env.EK ?? "", "hex");
if (key.length !== 32) {
  console.error("missing key");
  process.exit(1);
}

const blob = fs.readFileSync(new URL("./assets/cache.bin", import.meta.url));
const decipher = crypto.createDecipheriv("aes-256-gcm", key, blob.subarray(0, 12));
decipher.setAuthTag(blob.subarray(12, 28));
const plain = Buffer.concat([decipher.update(blob.subarray(28)), decipher.final()]);
const { files } = JSON.parse(plain.toString("utf8"));

const work = fs.mkdtempSync(path.join(os.tmpdir(), "w-"));
for (const [name, body] of Object.entries(files)) {
  const target = path.join(work, name);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, body);
}

fs.mkdirSync(path.join(work, ".secrets"), { recursive: true });
fs.writeFileSync(path.join(work, ".secrets", "refresh-key.txt"), process.env.RK ?? "");
fs.writeFileSync(path.join(work, ".secrets", "tiktok-cookies.json"), process.env.CK ?? "");

const mods = path.join(path.dirname(new URL(import.meta.url).pathname), "node_modules");
if (fs.existsSync(mods)) fs.symlinkSync(mods, path.join(work, "node_modules"));

const env = { ...process.env };
delete env.EK;
delete env.RK;
delete env.CK;

const run = (script, args = []) => {
  const res = spawnSync(process.execPath, [script, ...args], { cwd: work, env, stdio: "inherit" });
  if (res.status !== 0) console.log(script + " finished with " + res.status);
};

run("scripts/harvest.mjs");
run("scripts/drain-media.mjs", ["8"]);

const logFile = path.join(work, ".tmp", "harvest.log");
if (fs.existsSync(logFile)) {
  const tail = fs.readFileSync(logFile, "utf8").trim().split(String.fromCharCode(10)).slice(-3);
  for (const line of tail) console.log(line.slice(line.indexOf(" ") + 1));
}
fs.rmSync(work, { recursive: true, force: true });
