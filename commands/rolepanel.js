// commands/rolepanel.js — /rolepanel with buttons and allowedRoleIds/Admin gating
import fs from 'fs';
import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  SlashCommandBuilder, EmbedBuilder, PermissionsBitField
} from 'discord.js';

const cfg = JSON.parse(fs.readFileSync('./config.json', 'utf-8'));
const ALLOWED = Array.isArray(cfg.allowedRoleIds) ? cfg.allowedRoleIds : [];

// TODO: put your real role IDs here
const ROLES = [
  { id: '1065935123561857044', label: 'Announcements' },
];

const PANEL = {
  title: 'Choose Your Roles',
  description: 'Click the buttons below to toggle roles on or off.',
  colour: 0x2b88ff,
};

export const data = new SlashCommandBuilder()
  .setName('rolepanel')
  .setDescription('Post the role button panel in this channel.')
  .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild);

const isAuth = (m) =>
  m.permissions.has(PermissionsBitField.Flags.Administrator) ||
  (ALLOWED.length && ALLOWED.some(id => m.roles.cache.has(id)));

const buildButtons = () => {
  const rows = [];
  let row = new ActionRowBuilder();
  ROLES.forEach((r, i) => {
    row.addComponents(new ButtonBuilder().setCustomId(`role:${r.id}`).setLabel(r.label).setStyle(ButtonStyle.Secondary));
    if ((i + 1) % 5 === 0) { rows.push(row); row = new ActionRowBuilder(); }
  });
  if (row.components.length) rows.push(row);
  return rows;
};

export async function execute(interaction) {
  if (!interaction.inGuild()) return interaction.reply({ content: 'This works only in a server.', ephemeral: true });
  const member = await interaction.guild.members.fetch(interaction.user.id);
  if (!isAuth(member)) {
    const need = ALLOWED.length ? ALLOWED.map(r => `<@&${r}>`).join(', ') : 'the required role';
    return interaction.reply({ content: `You don’t have permission. You need ${need}.`, ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });
  const embed = new EmbedBuilder().setTitle(PANEL.title).setDescription(PANEL.description).setColor(PANEL.colour);
  const rows = buildButtons();
  await interaction.channel.send({ embeds: [embed], components: rows });
  return interaction.editReply('Role panel posted ✅');
}

// Button handler — wire this once in index.js’s InteractionCreate
export async function handleButton(interaction) {
  if (!interaction.isButton() || !interaction.customId.startsWith('role:')) return false;
  if (!interaction.inGuild()) return interaction.reply({ content: 'This only works inside a server.', ephemeral: true });
  await interaction.deferReply({ ephemeral: true });

  const roleId = interaction.customId.split(':')[1];
  const role = await interaction.guild.roles.fetch(roleId).catch(() => null);
  if (!role) return interaction.editReply('That role no longer exists.');

  const me = await interaction.guild.members.fetchMe();
  if (!me.permissions.has(PermissionsBitField.Flags.ManageRoles))
    return interaction.editReply('I need **Manage Roles** to do that.');
  if (role.position >= me.roles.highest.position)
    return interaction.editReply('Move my highest role above the target role.');

  const member = await interaction.guild.members.fetch(interaction.user.id);
  const hasRole = member.roles.cache.has(roleId);
  if (hasRole) {
    await member.roles.remove(roleId, 'Role button toggle');
    return interaction.editReply(`Removed **${role.name}** ✅`);
  } else {
    await member.roles.add(roleId, 'Role button toggle');
    return interaction.editReply(`Added **${role.name}** ✅`);
  }
}
