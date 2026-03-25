require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Collection, Partials } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

// Commandes
client.commands = new Collection();

const commandFolders = fs.readdirSync(path.join(__dirname, 'commands'));
for (const folder of commandFolders) {
  const folderPath = path.join(__dirname, 'commands', folder);
  if (!fs.statSync(folderPath).isDirectory()) continue;
  const files = fs.readdirSync(folderPath).filter(f => f.endsWith('.js'));
  for (const file of files) {
    const command = require(path.join(folderPath, file));
    if (command.data && command.execute) {
      client.commands.set(command.data.name, command);
    }
  }
}

// Events
const eventFiles = fs.readdirSync(path.join(__dirname, 'events')).filter(f => f.endsWith('.js'));
for (const file of eventFiles) {
  const event = require(path.join(__dirname, 'events', file));
  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args));
  } else {
    client.on(event.name, (...args) => event.execute(...args));
  }
}

// Graceful shutdown
function shutdown(signal) {
  console.log(`[NightFall] ${signal} — arrêt propre...`);
  const { db } = require('./database/db');
  try { db.close(); } catch {}
  client.destroy();
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

client.login(process.env.BOT_TOKEN).catch(err => {
  console.error('[NightFall] Connexion impossible:', err.message);
  process.exit(1);
});
