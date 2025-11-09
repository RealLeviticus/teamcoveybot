// deploy-commands.js — registers slash commands (ESM)
import fs from 'fs';
import { REST, Routes } from 'discord.js';

let cfg;
try {
  cfg = JSON.parse(fs.readFileSync('./config.json', 'utf8'));
} catch {
  console.error('❌ Missing config.json');
  process.exit(1);
}

const token    = cfg.token?.trim();
const clientId = cfg.clientId?.trim();   // add this to config.json (safe to store)
const guildId  = cfg.guildId?.trim();    // optional: for fast dev in one server

if (!token || !clientId) {
  console.error('❌ config.json must include "token" and "clientId"');
  process.exit(1);
}

// Gather slash commands from ./commands
const cmdFiles = (await fs.promises.readdir('./commands'))
  .filter(f => f.endsWith('.js'));

const commands = [];
for (const file of cmdFiles) {
  const mod = await import(`./commands/${file}`);
  if (mod.data && mod.execute) commands.push(mod.data.toJSON());
}

const rest = new REST({ version: '10' }).setToken(token);

try {
  if (guildId) {
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
    console.log(`✅ Registered ${commands.length} guild command(s) for ${guildId}`);
  } else {
    await rest.put(Routes.applicationCommands(clientId), { body: commands });
    console.log(`✅ Registered ${commands.length} global command(s)`);
  }
} catch (e) {
  console.error('❌ Failed to register commands:', e);
  process.exit(1);
}
