// Auto-publish Announcement posts (Discord.js v14)
// Node 18+ (uses global fetch)
// Reads token/clientId/guildId + autoPublish settings from ./config.json

import fs from 'fs';
import {
  Client,
  GatewayIntentBits,
  ChannelType,
  PermissionsBitField,
  MessageFlags,
} from 'discord.js';

// ---- Load config ----
const cfg = JSON.parse(fs.readFileSync('./config.json', 'utf-8'));
const TOKEN   = cfg.token;
const GUILD_ID = cfg.guildId;

// Optional settings
const AUTO = cfg.autoPublish || {};
const INTERVAL_SEC   = Number(AUTO.intervalSec ?? 60); // how often to scan
const FETCH_LIMIT    = Number(AUTO.fetchLimit ?? 20);  // messages per channel to examine
const INCLUDE_IDS    = Array.isArray(AUTO.includeChannelIds) ? new Set(AUTO.includeChannelIds) : null; // only these
const EXCLUDE_IDS    = Array.isArray(AUTO.excludeChannelIds) ? new Set(AUTO.excludeChannelIds) : null; // skip these

if (!TOKEN || !GUILD_ID) {
  console.error('Missing token or guildId in config.json');
  process.exit(1);
}

// ---- Client ----
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages, // required to fetch messages
  ],
});

// Remember what we’ve already attempted so we don’t retry endlessly
const publishedCache = new Set();

// ---- Core scan ----
async function scanAndPublishAnnouncements() {
  try {
    const guild = await client.guilds.fetch(GUILD_ID).catch(() => null);
    if (!guild) return;

    const channels = (await guild.channels.fetch())
      .filter(ch => ch && ch.type === ChannelType.GuildAnnouncement)
      .filter(ch => {
        if (INCLUDE_IDS && !INCLUDE_IDS.has(ch.id)) return false;
        if (EXCLUDE_IDS && EXCLUDE_IDS.has(ch.id)) return false;
        return true;
      });

    for (const [, channel] of channels) {
      try {
        // Check perms
        const me = await guild.members.fetchMe();
        const perms = channel.permissionsFor(me);
        if (!perms?.has(PermissionsBitField.Flags.ManageMessages)) continue;

        // Fetch recent messages
        const messages = await channel.messages.fetch({ limit: FETCH_LIMIT });

        // Eligible = not already crossposted, not a crosspost, not processed
        const toPublish = messages
          .filter(m =>
            !m.flags.has(MessageFlags.Crossposted) &&
            !m.flags.has(MessageFlags.IsCrosspost) &&
            !publishedCache.has(m.id)
          )
          .sort((a, b) => a.createdTimestamp - b.createdTimestamp); // oldest first

        for (const [, msg] of toPublish) {
          try {
            await msg.crosspost();
            publishedCache.add(msg.id);
            console.log(`✓ Crossposted ${msg.id} in #${channel.name}`);
          } catch (err) {
            publishedCache.add(msg.id); // avoid retry loop on errors
            console.warn(`Crosspost failed in #${channel.name}:`, err?.message || err);
          }
        }

        // Prevent unbounded growth
        if (publishedCache.size > 5000) publishedCache.clear();
      } catch (inner) {
        console.warn(`Scan error in #${channel?.name || channel?.id}:`, inner?.message || inner);
      }
    }
  } catch (err) {
    console.warn('Announcement scan failed:', err?.message || err);
  }
}

function startAutoPublisher() {
  console.log(`✓ Auto-publisher running — scanning every ${INTERVAL_SEC}s`);
  // First pass after short delay, then interval
  setTimeout(scanAndPublishAnnouncements, 5000);
  setInterval(scanAndPublishAnnouncements, INTERVAL_SEC * 1000);
}

// ---- Events ----
client.once('ready', () => {
  console.log(`✓ Logged in as ${client.user.tag}`);
  startAutoPublisher();
});

// ---- Start ----
(async () => {
  try {
    await client.login(TOKEN);
  } catch (e) {
    console.error('Startup error:', e);
    process.exit(1);
  }
})();
