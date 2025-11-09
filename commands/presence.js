// commands/presence.js — /presence locked to allowedRoleIds OR Admin
import fs from 'fs';
import { SlashCommandBuilder, PermissionsBitField, ActivityType } from 'discord.js';

const cfg = JSON.parse(fs.readFileSync('./config.json', 'utf-8'));
const ALLOWED = Array.isArray(cfg.allowedRoleIds) ? cfg.allowedRoleIds : [];

export const data = new SlashCommandBuilder()
  .setName('presence')
  .setDescription('Update the bot’s rich presence (authorised users only).')
  .addStringOption(o => o.setName('status').setDescription('online | idle | dnd | invisible')
    .addChoices(
      { name: 'online', value: 'online' },
      { name: 'idle', value: 'idle' },
      { name: 'dnd', value: 'dnd' },
      { name: 'invisible', value: 'invisible' },
    ))
  .addStringOption(o => o.setName('type').setDescription('Activity type')
    .addChoices(
      { name: 'Playing',   value: 'PLAYING' },
      { name: 'Watching',  value: 'WATCHING' },
      { name: 'Listening', value: 'LISTENING' },
      { name: 'Competing', value: 'COMPETING' },
      { name: 'Streaming (needs URL)', value: 'STREAMING' },
    ))
  .addStringOption(o => o.setName('text').setDescription('What should it say?').setMaxLength(128))
  .addStringOption(o => o.setName('url').setDescription('Streaming URL (Twitch/YouTube) if type=STREAMING'))
  .addBooleanOption(o => o.setName('clear').setDescription('Clear activities (keep current/selected status)'))
  .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild);

const isAuth = (member) =>
  member.permissions.has(PermissionsBitField.Flags.Administrator) ||
  (ALLOWED.length && ALLOWED.some(id => member.roles.cache.has(id)));

const mapType = (s) => ({
  PLAYING: ActivityType.Playing,
  WATCHING: ActivityType.Watching,
  LISTENING: ActivityType.Listening,
  COMPETING: ActivityType.Competing,
  STREAMING: ActivityType.Streaming,
}[s] ?? null);

export async function execute(interaction) {
  if (!interaction.inGuild()) return interaction.reply({ content: 'Use this in a server.', ephemeral: true });
  const member = await interaction.guild.members.fetch(interaction.user.id);
  if (!isAuth(member)) {
    const need = ALLOWED.length ? ALLOWED.map(id => `<@&${id}>`).join(', ') : 'an Administrator';
    return interaction.reply({ content: `Not authorised. You need ${need}.`, ephemeral: true });
  }

  const clear  = interaction.options.getBoolean('clear') ?? false;
  const status = interaction.options.getString('status');
  const type   = interaction.options.getString('type');
  const text   = (interaction.options.getString('text') || '').trim();
  const url    = interaction.options.getString('url') || undefined;

  const presence = {};
  if (status) presence.status = status;
  if (clear) {
    presence.activities = [];
  } else if (type || text) {
    const mapped = mapType(type);
    if (!text) return interaction.reply({ content: 'Please include `text` when setting a type.', ephemeral: true });
    if (mapped === ActivityType.Streaming && !url)
      return interaction.reply({ content: 'Streaming requires a valid `url`.', ephemeral: true });
    presence.activities = [{ name: text, type: mapped ?? ActivityType.Playing, url: mapped === ActivityType.Streaming ? url : undefined }];
  }

  await interaction.client.user.setPresence(presence);

  const parts = [];
  if (presence.activities?.length) {
    parts.push(`**${type || 'PLAYING'}** \`${text}\``);
    if (type === 'STREAMING' && url) parts.push(`(url: ${url})`);
  } else if (clear) parts.push('cleared activities');
  if (status) parts.push(`status: **${status}**`);
  return interaction.reply({ content: `Presence updated: ${parts.join(' · ') || 'no changes'}`, ephemeral: true });
}
