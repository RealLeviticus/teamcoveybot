import { SlashCommandBuilder } from 'discord.js';

const CLIENT_ID = process.env.DISCORD_OAUTH_CLIENT_ID || 'YOUR_DISCORD_APP_ID';
const REDIRECT  = process.env.DISCORD_OAUTH_REDIRECT  || 'http://yourhost:3001/discord/callback';

export const data = new SlashCommandBuilder()
  .setName('link')
  .setDescription('Link your Discord to your Twitch');

export async function execute(interaction) {
  const state = `${interaction.user.id}:${interaction.guildId}`; // basic state
  const p = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT,
    response_type: 'code',
    scope: 'identify connections',
    state
  });
  const url = `https://discord.com/api/oauth2/authorize?${p.toString()}`;
  await interaction.reply({ content: `Click to link: ${url}`, ephemeral: true });
}
