// commands/roleSync.js (ESM)
// Sync selected Discord roles to Twitch VIP/MOD using a refreshable broadcaster token.

import fs from 'fs';
import { getBroadcasterToken } from '../twitchAuth.js'; // <-- uses the auto-refresh flow

const LINKS_FILE = './links.json'; // [{ "discord": "123", "twitch": "456" }]

function loadCfg() {
  const cfg = JSON.parse(fs.readFileSync('./config.json', 'utf8'));
  const t  = cfg.twitch;
  const rs = cfg.roleSync;
  if (!t?.clientId || !rs?.broadcasterTwitchId || !Array.isArray(rs?.mappings)) {
    throw new Error(
      'roleSync config missing: require twitch.clientId, roleSync.broadcasterTwitchId, and roleSync.mappings[]'
    );
  }
  return { twitchClientId: t.clientId, ...rs };
}

// Look up linked Twitch user_id for a Discord user_id
async function getTwitchIdForDiscordUser(discordUserId) {
  try {
    const arr = JSON.parse(fs.readFileSync(LINKS_FILE, 'utf8'));
    const hit = arr.find(x => String(x.discord) === String(discordUserId));
    return hit?.twitch || null;
  } catch {
    return null;
  }
}

// --- Twitch Helix helpers (VIP/MOD) ---
async function twitchHelix(method, url, clientId) {
  const broadcasterToken = await getBroadcasterToken(); // always valid (auto-refresh)
  const res = await fetch(url, {
    method,
    headers: {
      'Client-ID': clientId,
      'Authorization': `Bearer ${broadcasterToken}`
    }
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`${method} ${url} -> ${res.status}: ${txt.slice(0, 200)}`);
  }
  return res.status === 204 ? null : res.json();
}

async function addVip({ broadcasterId, userId, clientId }) {
  const url = `https://api.twitch.tv/helix/channels/vips?broadcaster_id=${broadcasterId}&user_id=${userId}`;
  await twitchHelix('POST', url, clientId);
}
async function removeVip({ broadcasterId, userId, clientId }) {
  const url = `https://api.twitch.tv/helix/channels/vips?broadcaster_id=${broadcasterId}&user_id=${userId}`;
  await twitchHelix('DELETE', url, clientId);
}

async function addMod({ broadcasterId, userId, clientId }) {
  const url = `https://api.twitch.tv/helix/moderation/moderators?broadcaster_id=${broadcasterId}&user_id=${userId}`;
  await twitchHelix('POST', url, clientId);
}
async function removeMod({ broadcasterId, userId, clientId }) {
  const url = `https://api.twitch.tv/helix/moderation/moderators?broadcaster_id=${broadcasterId}&user_id=${userId}`;
  await twitchHelix('DELETE', url, clientId);
}

// Map a Discord role change to a Twitch action
async function applyTwitchRole(action, twitchRole, discordUserId, cfg) {
  const twitchUserId = await getTwitchIdForDiscordUser(discordUserId);
  if (!twitchUserId) throw new Error(`No linked Twitch ID for Discord user ${discordUserId}`);

  const args = {
    broadcasterId: cfg.broadcasterTwitchId,
    userId: twitchUserId,
    clientId: cfg.twitchClientId
  };

  if (twitchRole === 'vip') {
    return action === 'add' ? addVip(args) : removeVip(args);
  }
  if (twitchRole === 'mod') {
    return action === 'add' ? addMod(args) : removeMod(args);
  }
  throw new Error(`Unsupported twitchRole: ${twitchRole}`);
}

export function setupRoleSync(client) {
  let cfg;
  try {
    cfg = loadCfg();
  } catch (e) {
    console.warn('ℹ️ Role sync disabled:', e.message);
    return;
  }

  client.on('guildMemberUpdate', async (oldMember, newMember) => {
    try {
      // Some hosts deliver partials; ensure we have role caches
      if (!oldMember.roles?.cache || !newMember.roles?.cache) return;

      const oldSet = new Set(oldMember.roles.cache.keys());
      const newSet = new Set(newMember.roles.cache.keys());

      // Roles added
      for (const roleId of newSet) {
        if (!oldSet.has(roleId)) {
          const map = cfg.mappings.find(m => m.discordRoleId === roleId);
          if (map) {
            await applyTwitchRole('add', map.twitchRole, newMember.id, cfg);
            console.log(`✅ Applied Twitch ${map.twitchRole} to Discord user ${newMember.id}`);
          }
        }
      }
      // Roles removed
      for (const roleId of oldSet) {
        if (!newSet.has(roleId)) {
          const map = cfg.mappings.find(m => m.discordRoleId === roleId);
          if (map) {
            await applyTwitchRole('remove', map.twitchRole, newMember.id, cfg);
            console.log(`✅ Removed Twitch ${map.twitchRole} from Discord user ${newMember.id}`);
          }
        }
      }
    } catch (e) {
      console.warn('⚠️ Role sync error:', e.message);
    }
  });
}
