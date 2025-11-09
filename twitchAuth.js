// twitchAuth.js (ESM)
// Helper to provide a valid broadcaster access token (auto-refreshes as needed)

import fs from 'fs';

const TOKENS_FILE = '.twitch-broadcaster-tokens.json';

// Load from config.json or env
function loadAppCreds() {
  try {
    const cfg = JSON.parse(fs.readFileSync('./config.json', 'utf8'));
    const id  = cfg.twitch?.clientId;
    const sec = cfg.twitch?.clientSecret;
    if (!id || !sec) throw new Error('Missing twitch.clientId/ClientSecret in config.json');
    return { clientId: id, clientSecret: sec };
  } catch (e) {
    // fallback to envs
    const id  = process.env.TWITCH_CLIENT_ID;
    const sec = process.env.TWITCH_CLIENT_SECRET;
    if (!id || !sec) throw e;
    return { clientId: id, clientSecret: sec };
  }
}

function readTokens() {
  try { return JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8')); }
  catch { return null; }
}
function writeTokens(obj) {
  fs.writeFileSync(TOKENS_FILE, JSON.stringify(obj, null, 2));
}

async function refreshAccessToken(refreshToken, clientId, clientSecret) {
  const res = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: new URLSearchParams({
      client_id:     clientId,
      client_secret: clientSecret,
      grant_type:    'refresh_token',
      refresh_token: refreshToken
    })
  });
  if (!res.ok) {
    const txt = await res.text().catch(()=> '');
    throw new Error(`Refresh failed ${res.status}: ${txt}`);
  }
  const json = await res.json();
  return {
    access_token:  json.access_token,
    refresh_token: json.refresh_token ?? refreshToken, // Twitch may rotate; fall back if absent
    expires_at:    Date.now() + (Math.max(1, json.expires_in) * 1000),
    scope:         json.scope || [],
    obtained_at:   Date.now()
  };
}

/**
 * Returns a valid broadcaster access token (refreshing if near/over expiry).
 * Usage: const token = await getBroadcasterToken();
 */
export async function getBroadcasterToken() {
  const creds = loadAppCreds();
  let tokens = readTokens();
  if (!tokens?.access_token || !tokens?.refresh_token || !tokens?.expires_at) {
    throw new Error(`No broadcaster tokens found. Run the OAuth flow in authServer.js first.`);
  }

  const EARLY_REFRESH_MS = 120_000; // refresh 2m early
  if (Date.now() < (tokens.expires_at - EARLY_REFRESH_MS)) {
    return tokens.access_token;
  }

  // Refresh
  const updated = await refreshAccessToken(tokens.refresh_token, creds.clientId, creds.clientSecret);
  writeTokens(updated);
  return updated.access_token;
}
