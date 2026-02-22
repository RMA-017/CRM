import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { extname, join, relative } from "node:path";
import process from "node:process";

const SCAN_DIRS = ["src", "scripts", "tests"];
const PARSE_EXTS = new Set([".js", ".mjs", ".cjs"]);

function collectFiles(rootDir, output) {
  const entries = readdirSync(rootDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(rootDir, entry.name);
    if (entry.isDirectory()) {
      collectFiles(fullPath, output);
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    const ext = extname(entry.name).toLowerCase();
    if (PARSE_EXTS.has(ext)) {
      output.push(fullPath);
    }
  }
}

function hasMergeConflictMarkers(content) {
  return content
    .split(/\r?\n/)
    .some((line) => /^(<{7}|={7}|>{7})(?:\s|$)/.test(line));
}

const files = [];
for (const dirName of SCAN_DIRS) {
  const fullPath = join(process.cwd(), dirName);
  if (!existsSync(fullPath) || !statSync(fullPath).isDirectory()) {
    continue;
  }
  collectFiles(fullPath, files);
}

let failures = 0;
for (const filePath of files) {
  const relativePath = relative(process.cwd(), filePath);
  const content = readFileSync(filePath, "utf8");
  if (hasMergeConflictMarkers(content)) {
    failures += 1;
    process.stderr.write(`[lint] merge conflict markers found: ${relativePath}\n`);
    continue;
  }

  const checkResult = spawnSync(process.execPath, ["--check", filePath], {
    encoding: "utf8"
  });
  if (checkResult.status !== 0) {
    failures += 1;
    process.stderr.write(`[lint] syntax error: ${relativePath}\n`);
    if (checkResult.stderr) {
      process.stderr.write(`${checkResult.stderr}\n`);
    }
  }
}

if (failures > 0) {
  process.stderr.write(`[lint] failed (${failures} issue${failures === 1 ? "" : "s"}).\n`);
  process.exit(1);
}

process.stdout.write(`[lint] ok (${files.length} files checked).\n`);
