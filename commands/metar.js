// /metar (Discord.js v14) — open to everyone
// Requires Node 18+ (for global fetch)

import fs from 'fs';
import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
} from 'discord.js';

// ——— Load config ———
const config = JSON.parse(fs.readFileSync('./config.json', 'utf-8'));
const TOKEN = config.token;
const CLIENT_ID = config.clientId;
const GUILD_ID = config.guildId;

if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error('Missing token/clientId/guildId in config.json');
  process.exit(1);
}

// ——— Build command ———
const metarCmd = new SlashCommandBuilder()
  .setName('metar')
  .setDescription('Fetch METAR from VATSIM for an airport (ICAO).')
  .addStringOption(opt =>
    opt
      .setName('icao')
      .setDescription('Airport ICAO (e.g., YSSY, YMML, KLAX)')
      .setMinLength(3)
      .setMaxLength(4)
      .setRequired(true)
  );

// ——— Register command ———
const rest = new REST({ version: '10' }).setToken(TOKEN);
async function registerCommands() {
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), {
    body: [metarCmd.toJSON()],
  });
  console.log('✓ Registered /metar');
}

// ——— Helpers ———
function normaliseIcao(text) {
  return (text || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// ——— Client ———
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', () => {
  console.log(`✓ Logged in as ${client.user.tag}`);
});

client.on('interactionCreate', async (interaction) => {
  try {
    if (!interaction.isChatInputCommand() || interaction.commandName !== 'metar') return;

    const raw = interaction.options.getString('icao');
    const icao = normaliseIcao(raw);

    if (!icao || icao.length < 3 || icao.length > 4) {
      return interaction.reply({
        content: 'Please provide a valid ICAO (3–4 characters), e.g. **YSSY**.',
        ephemeral: true,
      });
    }

    await interaction.deferReply(); // public reply (not ephemeral)

    const url = `https://metar.vatsim.net/?id=${encodeURIComponent(icao)}`;

    // Basic timeout using AbortController
    const ac = new AbortController();
    const timeout = setTimeout(() => ac.abort(), 8000);

    let body = '';
    try {
      const res = await fetch(url, { signal: ac.signal });
      clearTimeout(timeout);
      if (!res.ok) throw new Error(`VATSIM returned ${res.status}`);
      body = (await res.text()).trim();
    } catch (e) {
      clearTimeout(timeout);
      return interaction.editReply(`⚠️ Couldn’t fetch METAR for **${icao}**. ${e?.message ?? ''}`.trim());
    }

    if (!body || /no metar/i.test(body)) {
      return interaction.editReply(`No METAR found for **${icao}**.`);
    }

    const embed = new EmbedBuilder()
      .setTitle(`METAR — ${icao}`)
      .setDescription('```' + body + '```')
      .setColor(0x2b88ff)
      .setFooter({ text: 'Source: metar.vatsim.net' });

    return interaction.editReply({ embeds: [embed] });
  } catch (err) {
    console.error(err);
    const msg = err?.message || 'Something went wrong.';
    if (interaction.deferred || interaction.replied)
      return interaction.editReply(`⚠️ ${msg}`);
    else
      return interaction.reply({ content: `⚠️ ${msg}`, ephemeral: true }).catch(() => {});
  }
});

// ——— Start ———
(async () => {
  try {
    await registerCommands();
    await client.login(TOKEN);
  } catch (e) {
    console.error('Startup error:', e);
    process.exit(1);
  }
})();
