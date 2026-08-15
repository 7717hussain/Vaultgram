import fs from "fs";
import path from "path";

/**
 * Vaultgram AI Context Snapshot Generator
 * Generates a clean, compact, secret-free metadata snapshot of the repository.
 * NEVER exports secrets, .env files, auth tokens, or session strings.
 */

const ROOT_DIR = process.cwd();
const OUTPUT_DIR = path.join(ROOT_DIR, ".ai-context");

function safeReadFile(relPath) {
  try {
    const fullPath = path.join(ROOT_DIR, relPath);
    if (fs.existsSync(fullPath)) {
      return fs.readFileSync(fullPath, "utf-8");
    }
  } catch {}
  return "";
}

function getDirectoryTree(dir, depth = 0, maxDepth = 3) {
  if (depth > maxDepth) return [];
  const lines = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (
      entry.name === "node_modules" ||
      entry.name === ".git" ||
      entry.name === "dist" ||
      entry.name === ".ai-context"
    ) {
      continue;
    }

    const indent = "  ".repeat(depth);
    if (entry.isDirectory()) {
      lines.push(`${indent}📁 ${entry.name}/`);
      lines.push(...getDirectoryTree(path.join(dir, entry.name), depth + 1, maxDepth));
    } else {
      lines.push(`${indent}📄 ${entry.name}`);
    }
  }
  return lines;
}

function generateSnapshot() {
  console.log("Generating compact Vaultgram AI Context Snapshot...");

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // 1. Read key project files
  const pkgJsonRaw = safeReadFile("package.json");
  const pkg = pkgJsonRaw ? JSON.parse(pkgJsonRaw) : {};

  const agentsMd = safeReadFile("AGENTS.md");
  const currentStateMd = safeReadFile("CURRENT_STATE.md");
  const architectureMd = safeReadFile("ARCHITECTURE.md");
  const decisionsMd = safeReadFile("DECISIONS.md");
  const todoMd = safeReadFile("TODO.md");

  // 2. Build summary
  const tree = getDirectoryTree(ROOT_DIR).join("\n");

  const snapshotContent = [
    "# VAULTGRAM REPOSITORY CONTEXT SNAPSHOT",
    `Generated at: ${new Date().toISOString()}`,
    `Package: ${pkg.name || "vaultgram"} v${pkg.version || "1.0.0"}`,
    "",
    "---",
    "",
    "## 1. REPOSITORY TREE",
    "```text",
    tree,
    "```",
    "",
    "## 2. DEPENDENCIES",
    "```json",
    JSON.stringify({ dependencies: pkg.dependencies, devDependencies: pkg.devDependencies }, null, 2),
    "```",
    "",
    "## 3. AGENT DIRECTIVES (AGENTS.md)",
    agentsMd,
    "",
    "## 4. CURRENT STATE (CURRENT_STATE.md)",
    currentStateMd,
    "",
    "## 5. SYSTEM ARCHITECTURE (ARCHITECTURE.md)",
    architectureMd,
    "",
    "## 6. DECISIONS (DECISIONS.md)",
    decisionsMd,
    "",
    "## 7. ROADMAP (TODO.md)",
    todoMd,
  ].join("\n");

  const outPath = path.join(OUTPUT_DIR, "context-summary.md");
  fs.writeFileSync(outPath, snapshotContent, "utf-8");

  console.log(`✓ AI Context snapshot generated successfully: ${outPath}`);
  console.log(`✓ Size: ${(fs.statSync(outPath).size / 1024).toFixed(1)} KB`);
}

generateSnapshot();
