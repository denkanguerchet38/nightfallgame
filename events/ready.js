const { ActivityType } = require('discord.js');

module.exports = {
  name: 'ready',
  once: true,
  execute(client) {
    console.log(`[NightFall] Connecté en tant que ${client.user.tag}`);
    console.log(`[NightFall] ${client.commands.size} commandes chargées`);
    client.user.setActivity('des jeux 🎮', { type: ActivityType.Playing });
  },
};
