#!/usr/bin/env node
// Publishes a Ganitra Books installer as a GitHub release of this repository.
//
//   node publish.mjs "<path to Ganitra Books_X.Y.Z_x64-setup.exe>" [options]
//
// Options:
//   --notes <file>      Release notes (Markdown). Default: a one-line note.
//   --site <folder>     The website folder; its src/config/books.ts `release` is updated.
//   --allow-unsigned    Publish an installer without an Authenticode signature.
//   --yes               Don't ask for confirmation.
//
// What it guarantees: a published version is never replaced (an existing tag stops it);
// the file people download is byte-for-byte the one you built (it is uploaded to a draft,
// downloaded back and compared before the release goes public); and every release carries
// its SHA-256 next to it. See PUBLISHING.md.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";

const REPO = "Ganitra-HQ/ganitra-books-releases";
// Tauri's NSIS output name, e.g. "Ganitra Books_0.9.0_x64-setup.exe".
const BUILT_NAME = /^Ganitra Books_(\d+\.\d+\.\d+)_x64-setup\.exe$/;

function fail(message) {
  console.error(`\n✗ ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const opts = { file: null, notes: null, site: null, allowUnsigned: false, yes: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--notes") opts.notes = argv[++i];
    else if (a === "--site") opts.site = argv[++i];
    else if (a === "--allow-unsigned") opts.allowUnsigned = true;
    else if (a === "--yes") opts.yes = true;
    else if (a.startsWith("--")) fail(`Unknown option ${a}`);
    else if (!opts.file) opts.file = a;
    else fail(`Unexpected argument ${a}`);
  }
  if (!opts.file) fail('Usage: node publish.mjs "<path to Ganitra Books_X.Y.Z_x64-setup.exe>" [--notes file] [--site folder]');
  return opts;
}

/** Runs a command without a shell, so paths with spaces need no quoting. */
function run(cmd, args, { allowFail = false } = {}) {
  const r = spawnSync(cmd, args, { encoding: "utf8" });
  if (r.error) fail(`Could not run ${cmd}: ${r.error.message}`);
  if (r.status !== 0 && !allowFail) fail(`${cmd} ${args.join(" ")} failed:\n${r.stderr || r.stdout}`);
  return r;
}

const sha256 = (path) => createHash("sha256").update(readFileSync(path)).digest("hex").toUpperCase();

/** "Valid", "NotSigned", … from Windows; "Unknown" where PowerShell isn't available. */
function signatureStatus(path) {
  if (process.platform !== "win32") return "Unknown";
  const r = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", "(Get-AuthenticodeSignature -LiteralPath $args[0]).Status", path],
    { encoding: "utf8" },
  );
  return r.status === 0 ? r.stdout.trim() : "Unknown";
}

function updateSiteConfig(site, release) {
  const path = join(site, "src", "config", "books.ts");
  if (!existsSync(path)) fail(`${path} not found; is --site the website folder?`);
  let text = readFileSync(path, "utf8");
  for (const [key, value] of Object.entries(release)) {
    const pattern = new RegExp(`(\\n\\s*${key}: )[^,\\r\\n]*,`);
    if (!pattern.test(text)) fail(`Couldn't find release.${key} in ${path}`);
    text = text.replace(pattern, `$1${JSON.stringify(value)},`);
  }
  writeFileSync(path, text);
  return path;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const source = resolve(opts.file);
  if (!existsSync(source)) fail(`${source} not found`);

  const match = basename(source).match(BUILT_NAME);
  if (!match) fail(`Expected the installer Tauri builds ("Ganitra Books_X.Y.Z_x64-setup.exe"), got "${basename(source)}"`);
  const version = match[1];
  const tag = `v${version}`;
  const asset = `GanitraBooks-${version}-x64-setup.exe`;
  const url = `https://github.com/${REPO}/releases/download/${tag}/${asset}`;

  run("gh", ["--version"]);
  if (run("gh", ["auth", "status"], { allowFail: true }).status !== 0) fail("gh is not signed in. Run: gh auth login");
  if (run("gh", ["release", "view", tag, "--repo", REPO], { allowFail: true }).status === 0) {
    fail(`${tag} already exists in ${REPO}. A published version is never replaced: bump the version and build again.`);
  }

  const signature = signatureStatus(source);
  if (signature !== "Valid" && !opts.allowUnsigned) {
    fail(`The installer's signature is "${signature}". Sign it, or pass --allow-unsigned to publish it as it is.`);
  }

  const bytes = statSync(source).size;
  const hash = sha256(source);
  const notes = opts.notes ? readFileSync(resolve(opts.notes), "utf8") : `Ganitra Books ${version} for Windows 10 and 11 (x64).`;

  console.log(`
  Repository  ${REPO}
  Release     ${tag}
  File        ${asset}  (${(bytes / 1048576).toFixed(1)} MB)
  SHA-256     ${hash}
  Signature   ${signature}
  Link        ${url}
`);
  if (!opts.yes) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question("Publish this release? Type yes: ");
    rl.close();
    if (answer.trim().toLowerCase() !== "yes") fail("Not published.");
  }

  const work = mkdtempSync(join(tmpdir(), "ganitra-release-"));
  try {
    const staged = join(work, asset);
    copyFileSync(source, staged);
    if (sha256(staged) !== hash) fail("The copy to upload differs from the installer; nothing was published.");
    const sumFile = join(work, `${asset}.sha256`);
    writeFileSync(sumFile, `${hash.toLowerCase()}  ${asset}\n`);
    const notesFile = join(work, "notes.md");
    writeFileSync(notesFile, `${notes.trim()}\n\nSHA-256 of \`${asset}\`:\n\n\`\`\`\n${hash}\n\`\`\`\n`);

    console.log("Uploading to a draft release…");
    run("gh", ["release", "create", tag, staged, sumFile, "--repo", REPO, "--draft", "--title", `Ganitra Books ${version}`, "--notes-file", notesFile]);

    console.log("Downloading it back to check…");
    const back = join(work, "check");
    run("gh", ["release", "download", tag, "--repo", REPO, "--pattern", asset, "--dir", back]);
    if (sha256(join(back, asset)) !== hash) {
      fail(`The uploaded file doesn't match the installer. The draft ${tag} is left unpublished; delete it on GitHub and run this again.`);
    }

    run("gh", ["release", "edit", tag, "--repo", REPO, "--draft=false", "--latest"]);
    console.log(`✓ Published ${tag}`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }

  const head = await fetch(url, { method: "HEAD", redirect: "follow" }).catch(() => null);
  if (head?.ok) console.log(`✓ ${url} downloads`);
  else console.log(`! ${url} answered ${head ? head.status : "no response"}; check it in a browser.`);

  const release = {
    downloadUrl: url,
    version,
    date: new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }),
    size: `${Math.round(bytes / 1048576)} MB`,
    fileName: asset,
    sha256: hash,
    signed: signature === "Valid",
  };
  if (opts.site) {
    console.log(`✓ Updated ${updateSiteConfig(resolve(opts.site), release)}. Build and deploy the site to show it.`);
  } else {
    console.log(`\nFor the website's src/config/books.ts, release:\n${JSON.stringify(release, null, 2)}`);
  }
}

await main();
