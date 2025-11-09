// commands/twitchNotifier.js
import fs from 'fs';

const TWITCH_STATE_FILE = '.twitch-state.json';
const TWITCH_CHECK_MS = 60_000 * 5; // 5 minutes

export async function setupTwitchNotifier(client) {
  let twitchCfg = null;
  try {
    const raw = JSON.parse(fs.readFileSync('./config.json', 'utf8'));
    twitchCfg = raw.twitch ?? null;
  } catch { /* handled below */ }

  if (
    !twitchCfg ||
    !twitchCfg.clientId ||
    !twitchCfg.clientSecret ||
    !twitchCfg.discordChannelId ||
    !Array.isArray(twitchCfg.channels)
  ) {
    console.log('ℹ️ Twitch notifier disabled: missing twitch settings in config.json');
    return;
  }

  // ---- local state + helpers ----
  function readState() {
    try { return JSON.parse(fs.readFileSync(TWITCH_STATE_FILE, 'utf8')); }
    catch { return {}; }
  }
  function writeState(state) {
    try { fs.writeFileSync(TWITCH_STATE_FILE, JSON.stringify(state, null, 2)); }
    catch (e) { console.warn('⚠️ Could not write twitch state file:', e.message); }
  }

  let state = readState();
  let appToken = null;
  let tokenExpiry = 0;

  async function getAppToken() {
    const now = Date.now();
    if (appToken && now < tokenExpiry) return appToken;

    const params = new URLSearchParams({
      client_id: twitchCfg.clientId,
      client_secret: twitchCfg.clientSecret,
      grant_type: 'client_credentials'
    });
    const res = await fetch('https://id.twitch.tv/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error(`Twitch token failed ${res.status}: ${t.slice(0,120)}`);
    }
    const data = await res.json();
    appToken = data.access_token;
    tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
    return appToken;
  }

  async function fetchStream(login) {
    const token = await getAppToken();
    const res = await fetch(`https://api.twitch.tv/helix/streams?user_login=${login}`, {
      headers: { 'Client-ID': twitchCfg.clientId, Authorization: `Bearer ${token}` }
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error(`Twitch streams error ${res.status}: ${t.slice(0,120)}`);
    }
    const json = await res.json();
    return Array.isArray(json.data) && json.data.length ? json.data[0] : null;
  }

  // ---- shared send function (exported below) ----
  async function _sendTwitchNotification(login, title, channel) {
    const url = `https://twitch.tv/${login}`;
    const mention = twitchCfg.roleId ? `<@&${twitchCfg.roleId}> ` : '';
    await channel.send(`${mention}🔴 **${login}** is LIVE: **${title || 'Live now!'}**\n${url}`);
  }

  async function notifyIfLive(channel) {
    for (const loginRaw of twitchCfg.channels) {
      const login = String(loginRaw).toLowerCase();
      try {
        const stream = await fetchStream(login);
        const current = state[login] || { live: false, lastId: null };

        if (stream && !current.live) {
          await _sendTwitchNotification(login, stream.title, channel);
          state[login] = { live: true, lastId: stream.id || null };
          writeState(state);
        } else if (!stream && current.live) {
          state[login] = { live: false, lastId: null };
          writeState(state);
        } else if (stream && current.live && current.lastId !== stream.id) {
          // stream restarted/new stream id
          await _sendTwitchNotification(login, stream.title, channel);
          state[login] = { live: true, lastId: stream.id || null };
          writeState(state);
        }
      } catch (e) {
        console.warn(`⚠️ Twitch check failed for ${login}:`, e.message);
      }
    }
  }

  // boot-time wiring
  client.once('ready', async () => {
    try {
      const chan = await client.channels.fetch(twitchCfg.discordChannelId);
      if (!chan || !chan.send) {
        console.warn('⚠️ Twitch notifier: channel not found or not text-capable.');
        return;
      }
      await notifyIfLive(chan);
      setInterval(() => notifyIfLive(chan), TWITCH_CHECK_MS);
      console.log(`✅ Twitch notifier watching: ${twitchCfg.channels.join(', ')}`);
    } catch (e) {
      console.warn('⚠️ Twitch notifier init failed:', e.message);
    }
  });

  // expose helpers via exports (bound to this config)
  _exported.sendTwitchNotification = async (client, { user_name, title }) => {
    const chan = await client.channels.fetch(twitchCfg.discordChannelId).catch(() => null);
    if (!chan || !chan.send) throw new Error('Notification channel not found or not text-capable.');
    await _sendTwitchNotification(String(user_name || 'TestStreamer'), title || 'Test Stream', chan);
  };

  _exported.checkTwitchNow = async (client) => {
    const chan = await client.channels.fetch(twitchCfg.discordChannelId).catch(() => null);
    if (!chan || !chan.send) throw new Error('Notification channel not found or not text-capable.');
    await notifyIfLive(chan);
  };
}

// ---- public exports (populated after setupTwitchNotifier runs) ----
const _exported = {
  /** Send a manual/test notification that uses the same formatting as the real notifier */
  sendTwitchNotification: async () => { throw new Error('setupTwitchNotifier has not run yet'); },
  /** Run one immediate poll cycle right now */
  checkTwitchNow: async () => { throw new Error('setupTwitchNotifier has not run yet'); }
};

export const sendTwitchNotification = (...args) => _exported.sendTwitchNotification(...args);
export const checkTwitchNow = (...args) => _exported.checkTwitchNow(...args);
