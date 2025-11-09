// index.js — main entry point (ESM)
import fs from 'fs';
import { Client, GatewayIntentBits, Events, Collection } from 'discord.js';
import { setupTwitchNotifier } from './commands/twitchNotifier.js';
import { registerSlashCommands } from './registerCommands.js';
import { setupAutoPublisher } from './background/autopublish.js';

const CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const LAST_FILE = '.last-commit';

// ===== LOAD CONFIG =====
let config;
let token = null;
try {
  const raw = fs.readFileSync('./config.json', 'utf8');
  console.log('config.json length:', raw.length);
  console.log('config.json preview:', raw.slice(0, 200));
  config = JSON.parse(raw);
  token = config.token?.trim();
  if (!token) {
    console.error('❌ No "token" field found or it is empty in config.json');
    process.exit(1);
  }
} catch (err) {
  console.error('❌ Failed to read/parse config.json:', err.message);
  process.exit(1);
}

// ===== AUTO-REGISTER SLASH COMMANDS =====
await registerSlashCommands(); // respects cooldown in registerCommands.js

// ===== GITHUB AUTO-UPDATE CHECKER =====
async function fetchLatestCommitSha() {
  const { owner, repo, branch, token: ghToken } = config.github || {};
  if (!owner || !repo || !branch) {
    console.log('ℹ️ GitHub check disabled: missing owner/repo/branch in config.json.github');
    return null;
  }
  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits/${encodeURIComponent(branch)}`;
  const headers = { 'User-Agent': 'discord-bot-auto-updater' };
  if (ghToken) headers.Authorization = `Bearer ${ghToken}`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    console.warn(`⚠️ GitHub API ${res.status}: ${txt.slice(0, 200)}`);
    return null;
  }
  const data = await res.json();
  return data?.sha || null;
}
function readLastSha() { try { return fs.readFileSync(LAST_FILE, 'utf8').trim(); } catch { return null; } }
function writeLastSha(sha) { try { fs.writeFileSync(LAST_FILE, sha + '\n', 'utf8'); } catch (e) { console.warn('⚠️ Could not write last SHA file:', e.message); } }
async function checkForUpdate() {
  try {
    const latest = await fetchLatestCommitSha();
    if (!latest) return;
    const prev = readLastSha();
    if (!prev) {
      writeLastSha(latest);
      console.log(`ℹ️ Tracking ${config.github.owner}/${config.github.repo}@${config.github.branch} (${latest.slice(0,7)})`);
      return;
    }
    if (latest !== prev) {
      console.log(`🆕 New commit detected (${prev.slice(0,7)} → ${latest.slice(0,7)}). Restarting to pull update...`);
      writeLastSha(latest);
      process.exit(0);
    } else {
      console.log('✅ No updates found.');
    }
  } catch (err) {
    console.warn('⚠️ GitHub check failed:', err.message);
  }
}
setInterval(checkForUpdate, CHECK_INTERVAL_MS);
setTimeout(checkForUpdate, 15_000);

// ===== CREATE DISCORD CLIENT =====
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,   // required for role toggling
    GatewayIntentBits.MessageContent  // keep only if Twitch notifier needs it
  ]
});

// ===== LOAD SLASH COMMAND HANDLERS =====
client.commands = new Collection();
let cmdFiles = [];
try {
  cmdFiles = (await fs.promises.readdir('./commands')).filter(f => f.endsWith('.js'));
} catch {
  console.warn('ℹ️ No ./commands directory found yet – skipping dynamic loads.');
}
for (const file of cmdFiles) {
  try {
    const mod = await import(`./commands/${file}`);
    if (mod.data && mod.execute) client.commands.set(mod.data.name, mod);
  } catch (e) {
    console.warn(`⚠️ Failed to load command file ${file}:`, e.message);
  }
}

// ===== BOT LIFECYCLE =====
client.once(Events.ClientReady, async (c) => {
  console.log(`✅ Logged in as ${c.user.tag}`);
  await setupTwitchNotifier(client); // background notifier
  setupAutoPublisher(client);        // announcement auto-publisher
});

// ===== INTERACTION HANDLER =====
client.on(Events.InteractionCreate, async (interaction) => {
  // 1) Role panel buttons (non-slash)
  try {
    const rolePanel = await import('./commands/rolepanel.js');
    if (typeof rolePanel.handleButton === 'function') {
      const handled = await rolePanel.handleButton(interaction);
      if (handled) return;
    }
  } catch {}

  // 2) Slash commands
  if (!interaction.isChatInputCommand()) return;
  const command = client.commands.get(interaction.commandName);
  if (!command) return;
  try {
    await command.execute(interaction);
  } catch (err) {
    console.error(err);
    const content = '❌ There was an error while executing this command.';
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content, ephemeral: true });
    } else {
      await interaction.reply({ content, ephemeral: true });
    }
  }
});

// ===== GLOBAL ERROR HANDLERS =====
process.on('unhandledRejection', (r) => console.error('Unhandled rejection:', r));
process.on('uncaughtException', (e) => { console.error('Uncaught exception:', e); process.exit(1); });

// ===== LOGIN =====
client.login(token);
