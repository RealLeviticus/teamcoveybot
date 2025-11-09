// registerCommands.js — ESM
import fs from 'fs';
import { REST, Routes } from 'discord.js';

const COOLDOWN_MS = 5 * 60 * 1000; // avoid re-pushing too often
const STAMP_FILE = '.last-commands-push';

function shouldSkipPush() {
  try {
    const ts = Number(fs.readFileSync(STAMP_FILE, 'utf8'));
    return Number.isFinite(ts) && Date.now() - ts < COOLDOWN_MS;
  } catch {
    return false;
  }
}

function markPushed() {
  try { fs.writeFileSync(STAMP_FILE, String(Date.now()), 'utf8'); } catch {}
}

export async function registerSlashCommands() {
  // Read config
  let cfg;
  try {
    cfg = JSON.parse(fs.readFileSync('./config.json', 'utf8'));
  } catch {
    console.warn('⚠️ registerSlashCommands: missing config.json — skipping registration.');
    return;
  }

  const token    = cfg.token?.trim();
  const clientId = cfg.clientId?.trim();  // put this in config.json (safe to store)
  const guildId  = cfg.guildId?.trim();   // optional (fast dev)

  if (!token || !clientId) {
    console.warn('⚠️ registerSlashCommands: token/clientId missing — skipping.');
    return;
  }

  if (shouldSkipPush()) {
    console.log('⏭️ Commands recently registered — skipping this boot.');
    return;
  }

  // Load commands from ./commands that export { data, execute }
  let files = [];
  try {
    files = (await fs.promises.readdir('./commands')).filter(f => f.endsWith('.js'));
  } catch (e) {
    console.warn('⚠️ registerSlashCommands: no ./commands folder found.');
    return;
  }

  const commands = [];
  for (const file of files) {
    try {
      const mod = await import(`./commands/${file}`);
      if (mod.data && mod.execute) commands.push(mod.data.toJSON());
    } catch (e) {
      console.warn(`⚠️ Skipping ${file}:`, e.message);
    }
  }

  const rest = new REST({ version: '10' }).setToken(token);

  try {
    if (guildId) {
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
      console.log(`✅ Registered ${commands.length} guild command(s) to ${guildId}`);
    } else {
      await rest.put(Routes.applicationCommands(clientId), { body: commands });
      console.log(`✅ Registered ${commands.length} global command(s)`);
    }
    markPushed();
  } catch (e) {
    console.error('❌ Failed to register commands:', e);
  }
}
