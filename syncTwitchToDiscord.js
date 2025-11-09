import fs from 'fs';

const POLL_MS = 5 * 60 * 1000; // 5 min
const LINKS_FILE = './links.json';

function loadCfg() {
  const cfg = JSON.parse(fs.readFileSync('./config.json','utf8'));
  const t = cfg.twitch, rs = cfg.roleSync;
  if (!t?.clientId || !rs?.broadcasterTwitchId || !rs?.discordRoleMap)
    throw new Error('Need twitch.clientId, roleSync.broadcasterTwitchId, roleSync.discordRoleMap');
  return { clientId: t.clientId, broadcasterId: rs.broadcasterTwitchId, map: rs.discordRoleMap };
}

function loadLinks() {
  try { return JSON.parse(fs.readFileSync(LINKS_FILE,'utf8')); } catch { return []; }
}
function findDiscordIdByTwitchLogin(login, links) {
  const hit = links.find(x => String(x.twitchLogin).toLowerCase() === String(login).toLowerCase());
  return hit?.discord || null;
}

async function helixGet(url, clientId, bearer) {
  const res = await fetch(url, { headers: { 'Client-ID': clientId, 'Authorization': `Bearer ${bearer}` }});
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json();
}

// Get a broadcaster token (refreshable) — reuse twitchAuth.js from earlier
import { getBroadcasterToken } from '../twitchAuth.js';

async function fetchAllLogins(endpoint, clientId, broadcasterId) {
  const token = await getBroadcasterToken();
  const out = [];
  let cursor = '';
  do {
    const url = new URL(`https://api.twitch.tv/helix/${endpoint}`);
    url.searchParams.set('broadcaster_id', broadcasterId);
    if (cursor) url.searchParams.set('after', cursor);
    const json = await helixGet(url.toString(), clientId, token);
    const items = json.data || [];
    // Normalize to login names when possible
    items.forEach(x => out.push(x.user_login || x.user_name || x.login || x.broadcaster_login));
    cursor = json.pagination?.cursor || '';
  } while (cursor);
  return out;
}

export function setupTwitchToDiscordSync(client) {
  let cfg;
  try { cfg = loadCfg(); } catch (e) { console.warn('Sync disabled:', e.message); return; }

  async function runOnce() {
    try {
      const links = loadLinks();

      // 1) fetch current Twitch roles
      const [vipLogins, modLogins] = await Promise.all([
        fetchAllLogins('channels/vips', cfg.clientId, cfg.broadcasterId),
        fetchAllLogins('moderation/moderators', cfg.clientId, cfg.broadcasterId)
      ]);

      // (Optional) subscribers: requires channel:read:subscriptions
      // const subLogins = await fetchAllLogins('subscriptions', cfg.clientId, cfg.broadcasterId);

      // 2) Build desired Discord sets
      const wantVIP = new Set(vipLogins.map(x => String(x).toLowerCase()));
      const wantMOD = new Set(modLogins.map(x => String(x).toLowerCase()));
      // const wantSUB = new Set(subLogins.map(x => String(x).toLowerCase()));

      // 3) Apply to guild
      const guild = client.guilds.cache.get(client.guilds.cache.first()?.id); // or cfg.guildId if you have one
      if (!guild) return;

      await guild.members.fetch(); // ensure cache
      for (const member of guild.members.cache.values()) {
        const link = loadLinks().find(x => String(x.discord) === member.id);
        if (!link?.twitchLogin) continue;

        // Determine desired roles
        const shouldVIP = wantVIP.has(link.twitchLogin.toLowerCase());
        const shouldMOD = wantMOD.has(link.twitchLogin.toLowerCase());
        // const shouldSUB = wantSUB.has(link.twitchLogin.toLowerCase());

        // Map to Discord role IDs from config
        const vipRole = cfg.map.vipRoleId;
        const modRole = cfg.map.modRoleId;
        // const subRole = cfg.map.subRoleId;

        if (vipRole) {
          const has = member.roles.cache.has(vipRole);
          if (shouldVIP && !has) await member.roles.add(vipRole, 'Twitch VIP sync');
          if (!shouldVIP && has) await member.roles.remove(vipRole, 'Twitch VIP sync');
        }
        if (modRole) {
          const has = member.roles.cache.has(modRole);
          if (shouldMOD && !has) await member.roles.add(modRole, 'Twitch Mod sync');
          if (!shouldMOD && has) await member.roles.remove(modRole, 'Twitch Mod sync');
        }
        // if (subRole) { ...same pattern... }
      }
      console.log('✅ Twitch→Discord sync cycle complete');
    } catch (e) {
      console.warn('⚠️ Sync error:', e.message);
    }
  }

  client.once('ready', () => {
    runOnce();
    setInterval(runOnce, POLL_MS);
  });
}
