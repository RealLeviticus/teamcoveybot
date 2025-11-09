// /presence — set rich presence & status (locked behind allowedRoleIds or Admin)
// Discord.js v14, Node 18+ (ESM). Reads ./config.json

import fs from 'fs';
import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionsBitField,
  ActivityType,
} from 'discord.js';

// ---- Load config (same as role panel) ----
const cfg        = JSON.parse(fs.readFileSync('./config.json', 'utf-8'));
const TOKEN      = cfg.token;
const CLIENT_ID  = cfg.clientId;
const GUILD_ID   = cfg.guildId;
const ALLOWED    = Array.isArray(cfg.allowedRoleIds) ? cfg.allowedRoleIds : [];

if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error('Missing token/clientId/guildId in config.json');
  process.exit(1);
}

// ---- Command ----
const presenceCmd = new SlashCommandBuilder()
  .setName('presence')
  .setDescription('Update the bot’s rich presence (authorised users only).')
  .addStringOption(o =>
    o.setName('status')
     .setDescription('online | idle | dnd | invisible')
     .addChoices(
       { name: 'online', value: 'online' },
       { name: 'idle', value: 'idle' },
       { name: 'dnd', value: 'dnd' },
       { name: 'invisible', value: 'invisible' },
     )
  )
  .addStringOption(o =>
    o.setName('type')
     .setDescription('Activity type')
     .addChoices(
       { name: 'Playing',   value: 'PLAYING' },
       { name: 'Watching',  value: 'WATCHING' },
       { name: 'Listening', value: 'LISTENING' },
       { name: 'Competing', value: 'COMPETING' },
       { name: 'Streaming (needs URL)', value: 'STREAMING' },
     )
  )
  .addStringOption(o =>
    o.setName('text')
     .setDescription('What should it say?')
     .setMaxLength(128)
  )
  .addStringOption(o =>
    o.setName('url')
     .setDescription('Streaming URL (Twitch/YouTube) if type=STREAMING')
  )
  .addBooleanOption(o =>
    o.setName('clear')
     .setDescription('Clear all activities (keep current or chosen status)')
  )
  // UI-level hint; runtime check below still enforces your allowedRoleIds
  .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild);

const rest = new REST({ version: '10' }).setToken(TOKEN);
async function registerCommands() {
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), {
    body: [presenceCmd.toJSON()],
  });
  console.log('✓ Registered /presence');
}

// ---- Helpers (same gating as role panel) ----
function isAuthorised(member) {
  const isAdmin = member.permissions.has(PermissionsBitField.Flags.Administrator);
  const hasAllowedRole = ALLOWED.length ? ALLOWED.some(id => member.roles.cache.has(id)) : false;
  return isAdmin || hasAllowedRole;
}

function mapActivityType(s) {
  switch (s) {
    case 'PLAYING':   return ActivityType.Playing;
    case 'WATCHING':  return ActivityType.Watching;
    case 'LISTENING': return ActivityType.Listening;
    case 'COMPETING': return ActivityType.Competing;
    case 'STREAMING': return ActivityType.Streaming;
    default:          return null;
  }
}

// ---- Client ----
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', () => {
  console.log(`✓ Logged in as ${client.user.tag}`);
});

client.on('interactionCreate', async (interaction) => {
  try {
    if (!interaction.isChatInputCommand() || interaction.commandName !== 'presence') return;
    if (!interaction.inGuild()) {
      return interaction.reply({ content: 'Use this in a server.', ephemeral: true });
    }

    const member = await interaction.guild.members.fetch(interaction.user.id);
    if (!isAuthorised(member)) {
      const need = ALLOWED.length ? ALLOWED.map(id => `<@&${id}>`).join(', ') : 'an Administrator';
      return interaction.reply({
        content: `You aren’t authorised to use this command. You need ${need}.`,
        ephemeral: true,
      });
    }

    const clear  = interaction.options.getBoolean('clear') ?? false;
    const status = interaction.options.getString('status');          // online|idle|dnd|invisible
    const type   = interaction.options.getString('type');            // PLAYING|WATCHING|...
    const text   = (interaction.options.getString('text') || '').trim();
    const url    = interaction.options.getString('url') || undefined;

    const presence = {};

    if (status) {
      presence.status = /** @type {'online'|'idle'|'dnd'|'invisible'} */ (status);
    }

    if (clear) {
      presence.activities = [];
    } else if (type || text) {
      const mapped = mapActivityType(type);
      if (!text) {
        return interaction.reply({ content: 'Please include `text` when setting a type.', ephemeral: true });
      }
      if (mapped === ActivityType.Streaming && !url) {
        return interaction.reply({ content: 'Streaming requires a valid `url`.', ephemeral: true });
      }
      presence.activities = [{
        name: text,
        type: mapped ?? ActivityType.Playing,
        url: mapped === ActivityType.Streaming ? url : undefined,
      }];
    }

    await client.user.setPresence(presence);

    const parts = [];
    if (presence.activities?.length) {
      parts.push(`**${type || 'PLAYING'}** \`${text}\``);
      if (type === 'STREAMING' && url) parts.push(`(url: ${url})`);
    } else if (clear) {
      parts.push('cleared activities');
    }
    if (status) parts.push(`status: **${status}**`);

    return interaction.reply({ content: `Presence updated: ${parts.join(' · ') || 'no changes'}`, ephemeral: true });
  } catch (err) {
    console.error(err);
    if (interaction.deferred || interaction.replied)
      return interaction.editReply(`⚠️ ${err?.message || 'Something went wrong.'}`);
    return interaction.reply({ content: `⚠️ ${err?.message || 'Something went wrong.'}`, ephemeral: true }).catch(() => {});
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
