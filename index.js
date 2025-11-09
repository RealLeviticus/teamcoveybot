// index.js (ESM version) — with 5-minute GitHub update checks
import fs from 'fs';
import { Client, GatewayIntentBits, Events } from 'discord.js';

// ====== CONFIGURE YOUR REPO HERE ======
const GITHUB_OWNER  = 'RealLeviticus';     // <-- change if different
const GITHUB_REPO   = 'teamcoveybot';      // <-- change if different
const GITHUB_BRANCH = 'main';              // <-- change if different
const CHECK_INTERVAL_MS = 5 * 60 * 1000;   // 5 minutes
const LAST_FILE = '.last-commit';          // where we save the last seen SHA

// ====== LOAD TOKEN (unchanged original logic) ======
let token = null;
let githubToken = null; // optional for private repos
try {
  const config = JSON.parse(fs.readFileSync('./config.json', 'utf8'));
  token = config.token?.trim();
  // optional: add {"githubToken": "ghp_xxx"} to config.json for private repos / higher rate limits
  githubToken = config.githubToken?.trim() || null;
} catch {
  console.error('❌ Missing config.json with bot token.');
  process.exit(1);
}
if (!token) {
  console.error('❌ No token found in config.json');
  process.exit(1);
}

// ====== DISCORD CLIENT (unchanged) ======
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.once(Events.ClientReady, c => {
  console.log(`✅ Logged in as ${c.user.tag}`);
});

client.on(Events.MessageCreate, msg => {
  if (msg.author.bot) return;
  if (msg.content === '!hello') msg.channel.send('Hi there! 👋');
});

// ====== GITHUB POLLER ======
async function fetchLatestCommitSha() {
  const url = `https://api.github.com/repos/${encodeURIComponent(GITHUB_OWNER)}/${encodeURIComponent(GITHUB_REPO)}/commits/${encodeURIComponent(GITHUB_BRANCH)}`;
  const headers = { 'User-Agent': 'discord-bot-updater' };
  if (githubToken) headers.Authorization = `Bearer ${githubToken}`;

  const res = await fetch(url, { headers });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`GitHub API ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  // For this endpoint, top-level "sha" is the commit SHA
  return data?.sha || (data?.commit?.tree?.sha ?? null);
}

function readLastSha() {
  try {
    return fs.readFileSync(LAST_FILE, 'utf8').trim();
  } catch {
    return null;
  }
}

function writeLastSha(sha) {
  try {
    fs.writeFileSync(LAST_FILE, sha + '\n', 'utf8');
  } catch (e) {
    console.warn('⚠️ Could not write last SHA file:', e.message);
  }
}

async function checkForUpdate() {
  try {
    const latest = await fetchLatestCommitSha();
    if (!latest) return;

    const prev = readLastSha();
    if (!prev) {
      // first run: record and carry on
      writeLastSha(latest);
      console.log(`ℹ️ Tracking ${GITHUB_OWNER}/${GITHUB_REPO}@${GITHUB_BRANCH} (commit ${latest.slice(0, 7)})`);
      return;
    }

    if (latest !== prev) {
      console.log(`🆕 New commit detected (${prev.slice(0,7)} → ${latest.slice(0,7)}). Restarting to pull update...`);
      writeLastSha(latest);
      // Exiting triggers your host to restart and pull latest from Git
      process.exit(0);
    } else {
      console.log('✅ No updates found.');
    }
  } catch (err) {
    console.warn('⚠️ Update check failed:', err.message);
  }
}

// Kick off periodic checks
setInterval(checkForUpdate, CHECK_INTERVAL_MS);
// Also run one check shortly after start (not immediate to avoid flapping on boot)
setTimeout(checkForUpdate, 15_000);

// ====== START BOT ======
client.login(token);
