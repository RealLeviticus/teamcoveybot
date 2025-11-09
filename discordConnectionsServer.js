import express from 'express';
import fs from 'fs';

const app = express();
const PORT = process.env.PORT || 3001;

const CLIENT_ID = process.env.DISCORD_OAUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.DISCORD_OAUTH_CLIENT_SECRET;
const REDIRECT = process.env.DISCORD_OAUTH_REDIRECT; // must match app settings

const LINKS_FILE = './links.json';

function saveLink(discordId, twitchLogin, twitchId) {
  let arr = [];
  try { arr = JSON.parse(fs.readFileSync(LINKS_FILE,'utf8')); } catch {}
  const idx = arr.findIndex(x => String(x.discord) === String(discordId));
  const rec = { discord: String(discordId), twitchLogin, twitch: String(twitchId || '') };
  if (idx >= 0) arr[idx] = rec; else arr.push(rec);
  fs.writeFileSync(LINKS_FILE, JSON.stringify(arr, null, 2));
}

app.get('/discord/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send('Missing code');

  // exchange code
  const tokRes = await fetch('https://discord.com/api/oauth2/token', {
    method:'POST',
    headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body: new URLSearchParams({
      client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
      grant_type: 'authorization_code', code, redirect_uri: REDIRECT
    })
  });
  if (!tokRes.ok) return res.status(500).send('Token exchange failed');
  const tok = await tokRes.json();

  // who is this?
  const me = await fetch('https://discord.com/api/users/@me', {
    headers: { Authorization: `${tok.token_type} ${tok.access_token}` }
  }).then(r=>r.json());

  // connections
  const conns = await fetch('https://discord.com/api/users/@me/connections', {
    headers: { Authorization: `${tok.token_type} ${tok.access_token}` }
  }).then(r=>r.json());

  const twitchConn = Array.isArray(conns) ? conns.find(c => c.type === 'twitch') : null;
  if (!twitchConn) return res.send('No Twitch linked to your Discord account. Please link Twitch in Discord settings first.');

  // Store mapping; twitchConn.name is login, id may be platform id (can be blank on some accounts)
  saveLink(me.id, twitchConn.name, twitchConn.id || '');
  res.send('✅ Linked! You can close this window.');
});

app.listen(PORT, () => {
  console.log(`Discord connections server on http://localhost:${PORT}/discord/callback`);
});
