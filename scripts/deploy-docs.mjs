/*
 * Builds the docs and publishes them to the `gh-pages` branch of `origin` (GitHub Pages:
 * "Deploy from a branch", branch `gh-pages`, folder `/ (root)`).
 *
 * The branch only ever holds the build output, so it is replaced with a single fresh commit on
 * every deploy (force push). Run it from a clean working tree, so the site matches a commit.
 */
import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";

const DIST = "docs/.vitepress/dist";
const git = (args, options = {}) => execFileSync("git", args, { encoding: "utf8", ...options }).trim();

if (git(["status", "--porcelain"])) {
  console.error("deploy-docs: the working tree has uncommitted changes. Commit or stash them first.");
  process.exit(1);
}

const sha = git(["rev-parse", "--short", "HEAD"]);
const origin = git(["remote", "get-url", "origin"]);

execFileSync("npm", ["run", "docs:build"], { stdio: "inherit" });

rmSync(`${DIST}/.git`, { recursive: true, force: true });
const inDist = (args) => execFileSync("git", args, { cwd: DIST, stdio: "inherit" });
inDist(["init", "--quiet", "--initial-branch", "gh-pages"]);
inDist(["add", "--all"]);
inDist(["commit", "--quiet", "--message", `Deploy docs from ${sha}`]);
inDist(["push", "--force", origin, "gh-pages"]);
rmSync(`${DIST}/.git`, { recursive: true, force: true });

const match = /github\.com[:/]([^/]+)\/([^/.]+)/.exec(origin);
console.log(`\nPublished ${sha} to gh-pages.` + (match ? ` Site: https://${match[1]}.github.io/${match[2]}/` : ""));
