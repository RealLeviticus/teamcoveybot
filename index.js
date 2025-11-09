// index.js — main entry point (ESM)
import fs from 'fs';
console.log('Config file exists?', fs.existsSync('./config.json'));
import { Client, GatewayIntentBits, Events, Collection } from 'discord.js';
import { setupTwitchNotifier } from './commands/twitchNotifier.js';

// ===== LOAD TOKEN (with diagnostics) =====
let token = null;
try {
  const raw = fs.readFileSync('./config.json', 'utf8');
  console.log('config.json length:', raw.length);
  // Show first 200 chars to catch weird characters
  console.log('config.json preview:', raw.slice(0, 200));

  const config = JSON.parse(raw);
  token = config.token?.trim();

  if (!token) {
    console.error('❌ No "token" field found or it is empty in config.json');
    process.exit(1);
  }
} catch (err) {
  console.error('❌ Failed to read/parse config.json:', err.message);
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
