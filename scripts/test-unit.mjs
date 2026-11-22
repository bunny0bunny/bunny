// Runs every unit test file outside tests/team-access in its own Bun process.
// Each file installs its own module mocks, so sharing one process lets mocks leak
// between files. Database-backed suites run through `bun run test:db` instead.
import { spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const skip = new Set(["team-access", "reader"]);
function collect(dir) {
  return readdirSync(dir).sort().flatMap(name => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return skip.has(name) && dir.endsWith("tests") ? [] : collect(full);
    return /\.test\.tsx?$/.test(name) ? [path.relative(root, full)] : [];
  });
}
const only = process.argv.slice(2);
const files = only.length ? only : collect(path.join(root, "tests"));
const env = {
  ...process.env, NODE_ENV: "test", MEDIA_UPLOADS_ENABLED: "1", MEDIA_STORAGE_PREFIX: "test",
  R2_ACCOUNT_ID: "", R2_ACCESS_KEY_ID: "", R2_SECRET_ACCESS_KEY: "", R2_BUCKET_NAME: "",
};
const failed = [];
for (const file of files) {
  const result = spawnSync("bun", ["test", "--timeout", "30000", file], { cwd: root, env, encoding: "utf8" });
  const output = `${result.stdout}${result.stderr}`;
  const pass = output.match(/^\s*(\d+) pass/m)?.[1] ?? "0";
  const fail = output.match(/^\s*(\d+) fail/m)?.[1] ?? "?";
  const ok = result.status === 0;
  console.log(`${ok ? "PASS" : "FAIL"} ${file} (${pass} pass, ${fail} fail)`);
  if (!ok) { failed.push(file); console.log(output.slice(-6000)); }
}
console.log(`\n${files.length - failed.length}/${files.length} test files passed.`);
if (failed.length) { console.log(`Failed:\n${failed.map(f => `  ${f}`).join("\n")}`); process.exit(1); }
