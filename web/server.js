const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { getUserStats, getLeaderboard, getGameLeaderboard, getSetting, setSetting } = require('../database/db');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 },
}));

// ID du owner autorisé (défini dans .env)
const OWNER_ID = process.env.OWNER_ID || '';
const PORT = process.env.DASHBOARD_PORT || 3000;
const BASE_URL = process.env.DASHBOARD_URL || `http://localhost:${PORT}`;

// ==================== AUTH MIDDLEWARE ====================
function requireAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  res.status(401).json({ error: 'Non autorisé' });
}

// ==================== OAUTH2 ROUTES ====================
app.get('/auth/discord', (req, res) => {
  const params = new URLSearchParams({
    client_id: process.env.CLIENT_ID,
    redirect_uri: `${BASE_URL}/auth/callback`,
    response_type: 'code',
    scope: 'identify',
  });
  res.redirect(`https://discord.com/api/oauth2/authorize?${params}`);
});

app.get('/auth/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.redirect('/?error=no_code');

  try {
    // Échanger le code contre un token
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: `${BASE_URL}/auth/callback`,
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) return res.redirect('/?error=token_fail');

    // Récupérer les infos de l'utilisateur
    const userRes = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const user = await userRes.json();

    // Vérifier que c'est le owner
    if (OWNER_ID && user.id !== OWNER_ID) {
      return res.redirect('/?error=unauthorized');
    }

    req.session.user = {
      id: user.id,
      username: user.username,
      avatar: user.avatar
        ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`
        : `https://cdn.discordapp.com/embed/avatars/${parseInt(user.discriminator || '0') % 5}.png`,
    };

    res.redirect('/');
  } catch (err) {
    console.error('[Dashboard] OAuth2 error:', err);
    res.redirect('/?error=oauth_fail');
  }
});

app.get('/auth/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

app.get('/auth/me', (req, res) => {
  if (req.session.user) return res.json(req.session.user);
  res.json(null);
});

// ==================== API: STATS ====================
app.get('/api/leaderboard', requireAuth, (req, res) => {
  const game = req.query.game;
  if (game) {
    res.json(getGameLeaderboard(game));
  } else {
    res.json(getLeaderboard());
  }
});

app.get('/api/stats/:userId', requireAuth, (req, res) => {
  res.json(getUserStats(req.params.userId));
});

// ==================== API: WORDLE WORDS ====================
const wordsPath = path.join(__dirname, '..', 'data', 'words.js');

function loadWords() {
  delete require.cache[require.resolve('../data/words')];
  return require('../data/words');
}

app.get('/api/words', requireAuth, (req, res) => {
  res.json(loadWords());
});

app.post('/api/words', requireAuth, (req, res) => {
  const { words } = req.body;
  if (!Array.isArray(words)) return res.status(400).json({ error: 'Format invalide' });

  const clean = words.map(w => w.trim().toLowerCase()).filter(w => w.length === 5);
  const content = `module.exports = ${JSON.stringify(clean, null, 2)};\n`;
  fs.writeFileSync(wordsPath, content);

  // Recharger le cache
  delete require.cache[require.resolve('../data/words')];

  res.json({ success: true, count: clean.length });
});

app.post('/api/words/add', requireAuth, (req, res) => {
  const { word } = req.body;
  if (!word || word.trim().length !== 5) return res.status(400).json({ error: 'Mot invalide (5 lettres)' });

  const words = loadWords();
  const clean = word.trim().toLowerCase();
  if (words.includes(clean)) return res.status(400).json({ error: 'Mot déjà dans la liste' });

  words.push(clean);
  const content = `module.exports = ${JSON.stringify(words, null, 2)};\n`;
  fs.writeFileSync(wordsPath, content);
  delete require.cache[require.resolve('../data/words')];

  res.json({ success: true, count: words.length });
});

app.post('/api/words/remove', requireAuth, (req, res) => {
  const { word } = req.body;
  const words = loadWords();
  const idx = words.indexOf(word.trim().toLowerCase());
  if (idx === -1) return res.status(404).json({ error: 'Mot introuvable' });

  words.splice(idx, 1);
  const content = `module.exports = ${JSON.stringify(words, null, 2)};\n`;
  fs.writeFileSync(wordsPath, content);
  delete require.cache[require.resolve('../data/words')];

  res.json({ success: true, count: words.length });
});

// ==================== API: BLIND TEST ====================
const blindtestPath = path.join(__dirname, '..', 'data', 'blindtest.js');

function loadBlindtest() {
  delete require.cache[require.resolve('../data/blindtest')];
  return require('../data/blindtest');
}

app.get('/api/blindtest', requireAuth, (req, res) => {
  res.json(loadBlindtest());
});

app.post('/api/blindtest/add', requireAuth, (req, res) => {
  const { category, emojis, answers } = req.body;
  if (!category || !emojis || !answers || !Array.isArray(answers)) {
    return res.status(400).json({ error: 'Champs manquants' });
  }

  const data = loadBlindtest();
  if (!data[category]) return res.status(400).json({ error: 'Catégorie invalide' });

  data[category].push({ emojis, answer: answers.map(a => a.toLowerCase().trim()) });
  saveBlindtest(data);

  res.json({ success: true, total: data[category].length });
});

app.post('/api/blindtest/remove', requireAuth, (req, res) => {
  const { category, index } = req.body;
  const data = loadBlindtest();
  if (!data[category] || index < 0 || index >= data[category].length) {
    return res.status(400).json({ error: 'Index invalide' });
  }

  data[category].splice(index, 1);
  saveBlindtest(data);

  res.json({ success: true });
});

function saveBlindtest(data) {
  const content = `module.exports = ${JSON.stringify(data, null, 2)};\n`;
  fs.writeFileSync(blindtestPath, content);
  delete require.cache[require.resolve('../data/blindtest')];
}

// ==================== API: VOICE CREATOR ====================
app.get('/api/voicecreator', requireAuth, (req, res) => {
  res.json({
    hubChannelId: getSetting('hub_channel_id') || null,
    categoryId: getSetting('hub_category_id') || null,
  });
});

app.post('/api/voicecreator', requireAuth, (req, res) => {
  const { hubChannelId, categoryId } = req.body;
  if (hubChannelId !== undefined) setSetting('hub_channel_id', hubChannelId || '');
  if (categoryId !== undefined) setSetting('hub_category_id', categoryId || '');

  // Mettre à jour le module en mémoire
  try {
    const vc = require('../commands/games/voicecreator');
    vc.setHubChannelId(hubChannelId || null);
  } catch {}

  res.json({ success: true });
});

// ==================== SERVE FRONTEND ====================
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ==================== START ====================
function startDashboard() {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[NightFall] Dashboard: ${BASE_URL}`);
  });
}

module.exports = { startDashboard };
