// authServer.js (ESM)
// Run: node authServer.js
// Then visit: http://localhost:3000/auth/twitch/start

import fs from 'fs';
import express from 'express';

const PORT = process.env.PORT || 3000;

// === Configure these (or load from config.json) ===
const CLIENT_ID     = process.env.TWITCH_CLIENT_ID     || 'YOUR_TWITCH_CLIENT_ID';
const CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET || 'YOUR_TWITCH_CLIENT_SECRET';
const REDIRECT_URI  = process.env.TWITCH_REDIRECT_URI  || 'http://localhost:3000/auth/twitch/callback';

// Scopes needed for role sync (add/remove VIPs/Mods)
const SCOPES = [
  'channel:manage:vips',
  'channel:manage:moderators'
];

const TOKENS_FILE = '.twitch-broadcaster-tokens.json';

const app = express();

app.get('/', (_req, res) => res.send('Twitch OAuth ready. Go to /auth/twitch/start'));

app.get('/auth/twitch/start', (req, res) => {
  const params = new URLSearchParams({
    client_id:     CLIENT_ID,
    redirect_uri:  REDIRECT_URI,
    response_type: 'code',
    scope:         SCOPES.join(' ')
  });
  const url = `https://id.twitch.tv/oauth2/authorize?${params.toString()}`;
  return res.redirect(url);
});

app.get('/auth/twitch/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send('Missing ?code');

  try {
    // Exchange code for access + refresh tokens
    const tokenRes = await fetch('https://id.twitch.tv/oauth2/token', {
      method: 'POST',
      headers: {'Content-Type': 'application/x-www-form-urlencoded'},
      body: new URLSearchParams({
        client_id:     CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code,
        grant_type:    'authorization_code',
        redirect_uri:  REDIRECT_URI
      })
    });
    if (!tokenRes.ok) {
      const txt = await tokenRes.text().catch(()=> '');
      throw new Error(`Token exchange failed ${tokenRes.status}: ${txt}`);
    }
    const tokenJson = await tokenRes.json();

    // Compute absolute expiry time (now + expires_in)
    const expiresAt = Date.now() + (Math.max(1, tokenJson.expires_in) * 1000);

    // Save tokens
    const saved = {
      access_token:  tokenJson.access_token,
      refresh_token: tokenJson.refresh_token,
      expires_at:    expiresAt,
      scope:         tokenJson.scope || [],
      obtained_at:   Date.now()
    };
    fs.writeFileSync(TOKENS_FILE, JSON.stringify(saved, null, 2));
    res.send('✅ Tokens saved. You can close this and stop the auth server. File: ' + TOKENS_FILE);
    console.log('Saved tokens to', TOKENS_FILE);
  } catch (e) {
    console.error(e);
    res.status(500).send('Auth error: ' + e.message);
  }
});

app.listen(PORT, () => {
  console.log(`Twitch OAuth server on http://localhost:${PORT}`);
  console.log('Start here:', `http://localhost:${PORT}/auth/twitch/start`);
  console.log('Ensure your Twitch app redirect URI is set to:', REDIRECT_URI);
});
