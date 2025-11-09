// commands/twitchTest.js (ESM)
import fs from 'fs';

async function getAppToken(clientId, clientSecret) {
  const res = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials'
    })
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Token request failed (${res.status}): ${txt.slice(0,200)}`);
  }
  const json = await res.json();
  return json.access_token;
}

async function fetchUserByLogin(clientId, appToken, login) {
  const res = await fetch(`https://api.twitch.tv/helix/users?login=${encodeURIComponent(login)}`, {
    headers: {
      'Client-ID': clientId,
      'Authorization': `Bearer ${appToken}`
    }
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Users request failed (${res.status}): ${txt.slice(0,200)}`);
  }
  const json = await res.json();
  return Array.isArray(json.data) && json.data.length ? json.data[0] : null;
}

export function setupTwitchTestCommand(client) {
  // Read Twitch config once
  let twitchCfg = null;
  try {
    const raw = JSON.parse(fs.readFileSync('./config.json', 'utf8'));
    twitchCfg = raw.twitch ?? null;
  } catch {
    console.log('ℹ️ twitchTest: no config.json found yet (command will show a helpful error).');
  }

  client.on('messageCreate', async (msg) => {
    if (msg.author.bot) return;

    // Usage:
    //   !twitchtest           -> tests first configured channel
    //   !twitchtest <login>   -> tests that specific Twitch login
    if (!msg.content.toLowerCase().startsWith('!twitchtest')) return;

    if (
      !twitchCfg ||
      !twitchCfg.clientId ||
      !twitchCfg.clientSecret ||
      !Array.isArray(twitchCfg.channels) ||
      twitchCfg.channels.length === 0
    ) {
      await msg.channel.send(
        '⚠️ Twitch test not configured. Please add to `config.json`:\n' +
        '```\n"twitch": {\n  "clientId": "YOUR_TWITCH_CLIENT_ID",\n  "clientSecret": "YOUR_TWITCH_CLIENT_SECRET",\n  "channels": ["yourtwitchusername"]\n}\n```'
      );
      return;
    }

    const parts = msg.content.trim().split(/\s+/);
    const login = (parts[1] || twitchCfg.channels[0]).toLowerCase();

    await msg.channel.send(`🔑 Testing Twitch credentials… (login: \`${login}\`)`);

    try {
      const token = await getAppToken(twitchCfg.clientId, twitchCfg.clientSecret);
      const user  = await fetchUserByLogin(twitchCfg.clientId, token, login);

      if (!user) {
        await msg.channel.send(`❌ Credentials ok, but Twitch user \`${login}\` was not found.`);
        return;
      }

      const summary =
        `✅ **Credentials OK**\n` +
        `• Login: **${user.login}**\n` +
        `• Display: ${user.display_name}\n` +
        `• ID: ${user.id}\n` +
        (user.view_count != null ? `• Views: ${user.view_count}\n` : '') +
        (user.description ? `• Desc: ${user.description.slice(0,100)}${user.description.length>100?'…':''}\n` : '') +
        `• Profile: https://twitch.tv/${user.login}`;

      await msg.channel.send(summary);
    } catch (e) {
      await msg.channel.send(`❌ Twitch test failed: ${e.message}`);
    }
  });
}
