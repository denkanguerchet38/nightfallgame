const path = require('path');

module.exports = {
  name: 'messageCreate',
  async execute(message) {
    if (message.author.bot || !message.guild) return;

    // Charger le module Wordle et appeler handleMessage si une partie est active
    const wordle = require(path.join(__dirname, '..', 'commands', 'games', 'wordle.js'));
    if (wordle.activeGames.has(message.channelId)) {
      try {
        await wordle.handleMessage(message);
      } catch (err) {
        console.error('[NightFall] Erreur Wordle handleMessage:', err.message);
      }
    }
  },
};
