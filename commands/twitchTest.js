// commands/twitchtest.js
import fs from 'fs';
import { SlashCommandBuilder } from 'discord.js';

async function getAppToken(clientId, clientSecret) {
  const res = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials'
    })
  });
  if (!res.ok) throw new Error(`Token request failed (${res.status})`);
  const json = await res.json();
  return json.access_token;
}

async function fetchUserByLogin(clientId, appToken, login) {
  const res = await fetch(`https://api.twitch.tv/helix/users?login=${encodeURIComponent(login)}`, {
    headers: { 'Client-ID': clientId, 'Authorization': `Bearer ${appToken}` }
  });
  if (!res.ok) throw new Error(`Users request failed (${res.status})`);
  const json = await res.json();
  return Array.isArray(json.data) && json.data.length ? json.data[0] : null;
}

export const data = new SlashCommandBuilder()
  .setName('twitchtest')
  .setDescription('Test Twitch credentials and fetch a user')
  .addStringOption(opt =>
    opt.setName('login')
      .setDescription('Twitch login to test (default: first in config)')
      .setRequired(false)
  );

export async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });

  let cfg;
  try {
    cfg = JSON.parse(fs.readFileSync('./config.json', 'utf8'));
  } catch {
    return interaction.editReply('⚠️ No config.json found.');
  }

  const t = cfg.twitch;
  if (!t?.clientId || !t?.clientSecret || !Array.isArray(t?.channels) || t.channels.length === 0) {
    return interaction.editReply(
      '⚠️ Twitch not configured. Add this to config.json:\n' +
      '```\n"twitch": { "clientId": "...", "clientSecret": "...", "channels": ["yourlogin"] }\n```'
    );
  }

  const login = (interaction.options.getString('login') || t.channels[0]).toLowerCase();

  try {
    const appToken = await getAppToken(t.clientId, t.clientSecret);
    const user = await fetchUserByLogin(t.clientId, appToken, login);
    if (!user) return interaction.editReply(`❌ Credentials OK, but Twitch user \`${login}\` not found.`);

    const summary =
      `✅ **Credentials OK**\n` +
      `• Login: **${user.login}**\n` +
      `• Display: ${user.display_name}\n` +
      `• ID: ${user.id}\n` +
      (user.description ? `• Desc: ${user.description.slice(0,100)}${user.description.length>100?'…':''}\n` : '') +
      `• Profile: https://twitch.tv/${user.login}`;

    await interaction.editReply(summary);
  } catch (e) {
    await interaction.editReply(`❌ Twitch test failed: ${e.message}`);
  }
}
