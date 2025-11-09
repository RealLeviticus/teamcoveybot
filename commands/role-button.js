import fs from 'fs';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  EmbedBuilder,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionsBitField,
} from 'discord.js';

// ====== Load Config ======
const config = JSON.parse(fs.readFileSync('./config.json', 'utf-8'));
const TOKEN = config.token;
const CLIENT_ID = config.clientId;
const GUILD_ID = config.guildId;
const ALLOWED_ROLE_IDS = Array.isArray(config.allowedRoleIds) ? config.allowedRoleIds : [];

// ====== Roles users can self-assign ======
const ROLES = [
{ id: '1065935123561857044', label: 'Announcements' },
  // { id: '234567890123456789', label: 'Events' },
];

// ====== Panel look ======
const PANEL = {
  title: 'Choose Your Roles',
  description: 'Click the buttons below to toggle roles on or off.',
  colour: 0x2b88ff,
};

// ====== Client Setup ======
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  partials: [Partials.GuildMember],
});

// ====== Slash Command ======
const rolePanelCmd = new SlashCommandBuilder()
  .setName('rolepanel')
  .setDescription('Post the role button panel in this channel.')
  // Optional: also restrict via Discord permissions UI (helps, but we still hard-check roles at runtime).
  .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild);

const rest = new REST({ version: '10' }).setToken(TOKEN);

async function registerCommands() {
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), {
    body: [rolePanelCmd.toJSON()],
  });
  console.log('✓ Registered /rolepanel');
}

// ====== Helpers ======
function buildButtons() {
  const rows = [];
  let current = new ActionRowBuilder();
  ROLES.forEach((r, i) => {
    const btn = new ButtonBuilder()
      .setCustomId(`role:${r.id}`)
      .setLabel(r.label)
      .setStyle(ButtonStyle.Secondary);
    current.addComponents(btn);
    if ((i + 1) % 5 === 0) {
      rows.push(current);
      current = new ActionRowBuilder();
    }
  });
  if (current.components.length) rows.push(current);
  return rows;
}

function buildEmbed() {
  return new EmbedBuilder()
    .setTitle(PANEL.title)
    .setDescription(PANEL.description)
    .setColor(PANEL.colour);
}

async function ensureBotCanManage(interaction, roleId) {
  const guild = interaction.guild;
  const me = await guild.members.fetchMe();

  if (!me.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
    throw new Error('Bot is missing the Manage Roles permission.');
  }

  const role = guild.roles.cache.get(roleId) || (await guild.roles.fetch(roleId).catch(() => null));
  if (!role) throw new Error('That role no longer exists.');

  if (role.position >= guild.members.me.roles.highest.position) {
    throw new Error('My highest role is not above the target role. Move my role up.');
  }

  return role;
}

function memberHasAllowedRole(member) {
  if (!ALLOWED_ROLE_IDS.length) return false;
  return ALLOWED_ROLE_IDS.some((id) => member.roles.cache.has(id));
}

// ====== Events ======
client.once('ready', () => {
  console.log(`✓ Logged in as ${client.user.tag}`);
});

client.on('interactionCreate', async (interaction) => {
  try {
    // /rolepanel command
    if (interaction.isChatInputCommand() && interaction.commandName === 'rolepanel') {
      if (!interaction.inGuild()) {
        return interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
      }

      // —— Role gate: must have one of ALLOWED_ROLE_IDS OR be an Administrator (optional)
      const member = await interaction.guild.members.fetch(interaction.user.id);
      const isAdmin = member.permissions.has(PermissionsBitField.Flags.Administrator);
      const allowed = isAdmin || memberHasAllowedRole(member);

      if (!allowed) {
        const extra = ALLOWED_ROLE_IDS.length
          ? `one of these roles: ${ALLOWED_ROLE_IDS.map((r) => `<@&${r}>`).join(', ')}`
          : 'the required role';
        return interaction.reply({
          content: `You don’t have permission to use this command. You need ${extra}.`,
          ephemeral: true,
        });
      }

      await interaction.deferReply({ ephemeral: true });
      const embed = buildEmbed();
      const rows = buildButtons();
      await interaction.channel.send({ embeds: [embed], components: rows });
      return interaction.editReply('Role panel posted ✅');
    }

    // Button clicks -> toggle role
    if (interaction.isButton() && interaction.customId.startsWith('role:')) {
      await interaction.deferReply({ ephemeral: true });
      if (!interaction.inGuild()) {
        return interaction.editReply('This only works inside a server.');
      }

      const roleId = interaction.customId.split(':')[1];
      const role = await ensureBotCanManage(interaction, roleId);
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
  } catch (err) {
    console.error(err);
    const msg = err?.message || 'Something went wrong.';
    if (interaction.deferred || interaction.replied)
      return interaction.editReply(`⚠️ ${msg}`);
    else
      return interaction.reply({ content: `⚠️ ${msg}`, ephemeral: true }).catch(() => {});
  }
});

// ====== Startup ======
(async () => {
  try {
    await registerCommands();
    await client.login(TOKEN);
  } catch (e) {
    console.error('Startup error:', e);
  }
})();
