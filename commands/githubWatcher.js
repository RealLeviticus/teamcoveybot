// githubWatcher.js — polls GitHub for new commits and exits on update
import fs from 'fs';

const CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const STAMP_FILE = '.last-commit';

function readConfig() {
  try { return JSON.parse(fs.readFileSync('./config.json', 'utf8')); }
  catch { return null; }
}

function readLastSha() {
  try { return fs.readFileSync(STAMP_FILE, 'utf8').trim(); }
  catch { return null; }
}

function writeLastSha(sha) {
  try { fs.writeFileSync(STAMP_FILE, sha + '\n', 'utf8'); }
  catch { /* ignore */ }
}

async function fetchLatestCommitSha({ owner, repo, branch, token }) {
  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits/${encodeURIComponent(branch)}`;
  const headers = { 'User-Agent': 'discord-bot-github-watcher' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`GitHub API ${res.status}: ${txt.slice(0, 200)}`);
  }
  const data = await res.json();
  return data?.sha || null;
}

export function startGithubWatcher() {
  const cfg = readConfig();
  const gh = cfg?.github;
  if (!gh?.owner || !gh?.repo || !gh?.branch) {
    console.log('ℹ️ GitHub watcher disabled: missing github.owner/repo/branch in config.json');
    return;
  }

  async function checkOnce() {
    try {
      const latest = await fetchLatestCommitSha(gh);
      if (!latest) return;

      const prev = readLastSha();
      if (!prev) {
        writeLastSha(latest);
        console.log(`ℹ️ Tracking ${gh.owner}/${gh.repo}@${gh.branch} (${latest.slice(0,7)})`);
        return;
      }
      if (prev !== latest) {
        console.log(`🆕 New commit detected (${prev.slice(0,7)} → ${latest.slice(0,7)}). Restarting…`);
        writeLastSha(latest);
        // Exiting lets your host restart & pull latest
        process.exit(0);
      } else {
        console.log('✅ No GitHub updates.');
      }
    } catch (e) {
      console.warn('⚠️ GitHub check failed:', e.message);
    }
  }

  // first check after short delay (avoid flapping during boot), then interval
  setTimeout(checkOnce, 15_000);
  setInterval(checkOnce, CHECK_INTERVAL_MS);
  console.log(`⏱️ GitHub watcher started (every ${CHECK_INTERVAL_MS/60000} min).`);
}
