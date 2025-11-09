// commands/metar.js — public /metar (VATSIM)
import fs from 'fs';
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

const cfg = JSON.parse(fs.readFileSync('./config.json', 'utf-8'));
const norm = s => (s || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

export const data = new SlashCommandBuilder()
  .setName('metar')
  .setDescription('Fetch METAR from VATSIM for an airport (ICAO).')
  .addStringOption(o =>
    o.setName('icao').setDescription('e.g., YSSY, YMML, KLAX')
     .setMinLength(3).setMaxLength(4).setRequired(true)
  );

export async function execute(interaction) {
  const icao = norm(interaction.options.getString('icao'));
  if (!icao || icao.length < 3 || icao.length > 4) {
    return interaction.reply({ content: 'Provide a valid ICAO (3–4 chars), e.g. **YSSY**.', ephemeral: true });
  }

  await interaction.deferReply(); // public
  const url = `https://metar.vatsim.net/${encodeURIComponent(icao)}?format=text`;

  const ac = new AbortController();
  const to = setTimeout(() => ac.abort(), 8000);
  try {
    const res = await fetch(url, { signal: ac.signal, headers: { 'User-Agent': 'DiscordBot-Weather/1.0' } });
    clearTimeout(to);
    if (!res.ok) throw new Error(`VATSIM ${res.status}`);
    const body = (await res.text()).trim();
    if (!body || /no metar/i.test(body)) return interaction.editReply(`No METAR found for **${icao}**.`);

    const embed = new EmbedBuilder()
      .setTitle(`METAR — ${icao}`)
      .setDescription('```' + body + '```')
      .setColor(0x2b88ff)
      .setFooter({ text: 'Source: VATSIM METAR API' });

    return interaction.editReply({ embeds: [embed] });
  } catch (e) {
    clearTimeout(to);
    return interaction.editReply(`⚠️ Couldn’t fetch METAR for **${icao}**. ${e?.message ?? ''}`.trim());
  }
}
