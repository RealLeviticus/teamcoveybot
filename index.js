// index.js — main entry point (ESM)
import fs from 'fs';
import { Client, GatewayIntentBits, Events, Collection } from 'discord.js';
import { setupTwitchNotifier } from './commands/twitchNotifier.js';

// ===== LOAD TOKEN =====
let token = null;
try {
  const config = JSON.parse(fs.readFileSync('./config.json', 'utf8'));
  token = config.token?.trim();
} catch {
  console.error('❌ Missing config.json with bot token.');
  process.exit(1);
}
if (!token) {
  console.error('❌ No token found in config.json');
  process.exit(1);
}

// ===== CREATE DISCORD CLIENT =====
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// ===== LOAD SLASH COMMANDS FROM ./commands =====
client.commands = new Collection();

// Dynamically import any file that exports { data, execute } (slash commands)
const cmdFiles = (await fs.promises.readdir('./commands'))
  .filter(f => f.endsWith('.js'));

for (const file of cmdFiles) {
  const mod = await import(`./commands/${file}`);
  if (mod.data && mod.execute) {
    client.commands.set(mod.data.name, mod);
  }
}

client.once(Events.ClientReady, async (c) => {
  console.log(`✅ Logged in as ${c.user.tag}`);

  // Background feature (not a slash command)
  await setupTwitchNotifier(client);
});

// Slash command handler
client.on(Events.InteractionCreate, async (interaction) => {
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

client.login(token);
