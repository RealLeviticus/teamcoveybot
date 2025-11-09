// index.js (ESM version)
import fs from 'fs';
import { Client, GatewayIntentBits, Events } from 'discord.js';

// Read token from config.json
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

client.login(token);
