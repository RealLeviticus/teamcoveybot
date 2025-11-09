// background/autopublish.js — interval scanner for Announcement channels
import fs from 'fs';
import { ChannelType, PermissionsBitField, MessageFlags } from 'discord.js';

const cfg = JSON.parse(fs.readFileSync('./config.json', 'utf-8'));
const AUTO = cfg.autoPublish || {};
const INTERVAL_SEC = Number(AUTO.intervalSec ?? 60);
const FETCH_LIMIT  = Number(AUTO.fetchLimit ?? 20);
const INCLUDE_IDS  = Array.isArray(AUTO.includeChannelIds) ? new Set(AUTO.includeChannelIds) : null;
const EXCLUDE_IDS  = Array.isArray(AUTO.excludeChannelIds) ? new Set(AUTO.excludeChannelIds) : null;

const publishedCache = new Set();

async function scan(client) {
  const guildId = cfg.guildId;
  const guild = await client.guilds.fetch(guildId).catch(() => null);
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
      const me = await guild.members.fetchMe();
      const perms = channel.permissionsFor(me);
      if (!perms?.has(PermissionsBitField.Flags.ManageMessages)) continue;

      const messages = await channel.messages.fetch({ limit: FETCH_LIMIT });
      const toPublish = messages
        .filter(m =>
          !m.flags.has(MessageFlags.Crossposted) &&
          !m.flags.has(MessageFlags.IsCrosspost) &&
          !publishedCache.has(m.id)
        )
        .sort((a, b) => a.createdTimestamp - b.createdTimestamp);

      for (const [, msg] of toPublish) {
        try {
          await msg.crosspost();
          publishedCache.add(msg.id);
          if (publishedCache.size > 5000) publishedCache.clear();
          console.log(`✓ Crossposted ${msg.id} in #${channel.name}`);
        } catch (err) {
          publishedCache.add(msg.id);
          console.warn(`Crosspost failed in #${channel.name}:`, err?.message || err);
        }
      }
    } catch (inner) {
      console.warn(`Scan error in #${channel?.name || channel?.id}:`, inner?.message || inner);
    }
  }
}

export function setupAutoPublisher(client) {
  console.log(`✓ Auto-publisher running — scanning every ${INTERVAL_SEC}s`);
  setTimeout(() => scan(client), 5000);
  setInterval(() => scan(client), INTERVAL_SEC * 1000);
}
