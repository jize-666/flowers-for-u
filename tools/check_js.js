import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

let failed = false;
for (const file of readdirSync("static/js").filter(file => file.endsWith(".js"))) {
  const result = spawnSync(process.execPath, ["--check", resolve("static/js", file)], { encoding: "utf8" });
  if (result.status !== 0) { failed = true; console.error(file, result.stderr); }
  else console.log(`OK ${file}`);
}
process.exitCode = failed ? 1 : 0;
