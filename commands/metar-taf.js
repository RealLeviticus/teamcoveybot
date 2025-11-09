// Public /metar and /taf commands (Discord.js v14)
// Node 18+ (global fetch)
// Reads token/clientId/guildId from ./config.json

import fs from 'fs';
import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
} from 'discord.js';

// ---- Load config ----
const cfg = JSON.parse(fs.readFileSync('./config.json', 'utf-8'));
const TOKEN = cfg.token;
const CLIENT_ID = cfg.clientId;
const GUILD_ID = cfg.guildId;

if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error('Missing token/clientId/guildId in config.json');
  process.exit(1);
}

// ---- Commands ----
const metarCmd = new SlashCommandBuilder()
  .setName('metar')
  .setDescription('Fetch METAR from VATSIM for an airport (ICAO).')
  .addStringOption(opt =>
    opt.setName('icao')
      .setDescription('Airport ICAO (e.g., YSSY, YMML, KLAX)')
      .setMinLength(3).setMaxLength(4).setRequired(true)
  );

const tafCmd = new SlashCommandBuilder()
  .setName('taf')
  .setDescription('Fetch TAF (forecast) for an airport (ICAO).')
  .addStringOption(opt =>
    opt.setName('icao')
      .setDescription('Airport ICAO (e.g., YSSY, YMML, KLAX)')
      .setMinLength(3).setMaxLength(4).setRequired(true)
  );

const rest = new REST({ version: '10' }).setToken(TOKEN);
async function registerCommands() {
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), {
    body: [metarCmd.toJSON(), tafCmd.toJSON()],
  });
  console.log('✓ Registered /metar and /taf');
}

// ---- Helpers ----
const normIcao = s => (s || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
async function fetchText(url, timeoutMs = 8000) {
  const ac = new AbortController();
  const to = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ac.signal, headers: { 'User-Agent': 'DiscordBot-Weather/1.0' } });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return (await res.text()).trim();
  } finally {
    clearTimeout(to);
  }
}

// ---- Client ----
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', () => {
  console.log(`✓ Logged in as ${client.user.tag}`);
});

client.on('interactionCreate', async (interaction) => {
  try {
    if (!interaction.isChatInputCommand()) return;

    // /metar
    if (interaction.commandName === 'metar') {
      const icao = normIcao(interaction.options.getString('icao'));
      if (!icao || icao.length < 3 || icao.length > 4) {
        return interaction.reply({ content: 'Please provide a valid ICAO (3–4 chars), e.g. **YSSY**.', ephemeral: true });
      }

      await interaction.deferReply(); // public

      // VATSIM METAR API (text or JSON; we use text for simplicity)
      const url = `https://metar.vatsim.net/${encodeURIComponent(icao)}?format=text`;
      let body = '';
      try {
        body = await fetchText(url);
      } catch (e) {
        return interaction.editReply(`⚠️ Couldn’t fetch METAR for **${icao}**. ${e.message ?? ''}`.trim());
      }

      if (!body || /no metar/i.test(body)) {
        return interaction.editReply(`No METAR found for **${icao}**.`);
      }

      const embed = new EmbedBuilder()
        .setTitle(`METAR — ${icao}`)
        .setDescription('```' + body + '```')
        .setColor(0x2b88ff)
        .setFooter({ text: 'Source: VATSIM METAR API' });

      return interaction.editReply({ embeds: [embed] });
    }

    // /taf
    if (interaction.commandName === 'taf') {
      const icao = normIcao(interaction.options.getString('icao'));
      if (!icao || icao.length < 3 || icao.length > 4) {
        return interaction.reply({ content: 'Please provide a valid ICAO (3–4 chars), e.g. **YSSY**.', ephemeral: true });
      }

      await interaction.deferReply(); // public

      // Aviation Weather Center (NOAA) Data API — raw TAF text
      // Docs show worldwide TAF: /api/data/taf?ids=XXXX&format=raw
      const url = `https://aviationweather.gov/api/data/taf?ids=${encodeURIComponent(icao)}&format=raw`;
      let body = '';
      try {
        body = await fetchText(url);
      } catch (e) {
        return interaction.editReply(`⚠️ Couldn’t fetch TAF for **${icao}**. ${e.message ?? ''}`.trim());
      }

      // AWC returns 204 No Content for valid-but-empty; here we already got text.
      if (!body) {
        return interaction.editReply(`No TAF found for **${icao}**.`);
      }

      const embed = new EmbedBuilder()
        .setTitle(`TAF — ${icao}`)
        .setDescription('```' + body + '```')
        .setColor(0x2b88ff)
        .setFooter({ text: 'Source: AviationWeather.gov Data API' });

      return interaction.editReply({ embeds: [embed] });
    }
  } catch (err) {
    console.error(err);
    const msg = err?.message || 'Something went wrong.';
    if (interaction.deferred || interaction.replied) {
      return interaction.editReply(`⚠️ ${msg}`);
    } else {
      return interaction.reply({ content: `⚠️ ${msg}`, ephemeral: true }).catch(() => {});
    }
  }
});

// ---- Start ----
(async () => {
  try {
    await registerCommands();
    await client.login(TOKEN);
  } catch (e) {
    console.error('Startup error:', e);
    process.exit(1);
  }
})();
