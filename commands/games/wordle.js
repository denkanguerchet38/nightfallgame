const { SlashCommandBuilder } = require('discord.js');
const { nightfallEmbed, errorEmbed } = require('../../utils/embeds');
const { addWin, addLoss } = require('../../database/db');
const words = require('../../data/words');

// Parties actives: channelId -> { word, attempts, grid, userId }
const activeGames = new Map();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('wordle')
    .setDescription('Jouer au Wordle FR — devine le mot en 6 essais !'),

  // Exposer activeGames pour l'event messageCreate
  activeGames,

  async execute(interaction) {
    if (activeGames.has(interaction.channelId)) {
      return interaction.reply({ embeds: [errorEmbed('Une partie est déjà en cours ici ! Tape un mot de 5 lettres pour jouer.')], flags: 64 });
    }

    const validWords = words.filter(w => w.trim().length === 5);
    const word = validWords[Math.floor(Math.random() * validWords.length)].trim().toLowerCase();

    activeGames.set(interaction.channelId, {
      word,
      attempts: 0,
      maxAttempts: 6,
      grid: [],
      userId: interaction.user.id,
    });

    const embed = nightfallEmbed()
      .setTitle('🟩 Wordle NightFall')
      .setDescription(`Un mot de **5 lettres** a été choisi !\n\n**Tape directement un mot de 5 lettres dans le chat** pour jouer.\n\n🟩 = bonne lettre, bonne place\n🟨 = bonne lettre, mauvaise place\n⬛ = lettre absente\n\nTu as **6 tentatives**. Bonne chance !`)
      .addFields({ name: 'Joueur', value: `${interaction.user}`, inline: true });

    await interaction.reply({ embeds: [embed] });
  },

  /**
   * Appelé par messageCreate quand un message est envoyé dans un channel avec une partie active.
   */
  async handleMessage(message) {
    const game = activeGames.get(message.channelId);
    if (!game) return;

    if (message.author.bot) return;

    const guess = message.content.toLowerCase().trim();

    // Ignorer les messages qui ne sont pas des mots de 5 lettres
    if (!/^[a-zàâäéèêëïîôùûüÿçœæ]{5}$/i.test(guess)) return;

    game.attempts++;
    const result = evaluateGuess(guess, game.word);
    game.grid.push(result.display);

    const gridText = game.grid.join('\n');
    const lettersText = result.letters.join(' ');

    // Victoire
    if (guess === game.word) {
      activeGames.delete(message.channelId);
      addWin(message.author.id, 'wordle');

      const embed = nightfallEmbed()
        .setTitle('🎉 Wordle — Victoire !')
        .setDescription(`${gridText}\n\n${lettersText}\n\nBravo **${message.author.username}** ! Trouvé en **${game.attempts}/${game.maxAttempts}** essais !`)
        .setColor('#2ECC71');

      return message.reply({ embeds: [embed] });
    }

    // Défaite
    if (game.attempts >= game.maxAttempts) {
      activeGames.delete(message.channelId);
      addLoss(message.author.id, 'wordle');

      const embed = nightfallEmbed()
        .setTitle('💀 Wordle — Perdu !')
        .setDescription(`${gridText}\n\n${lettersText}\n\nLe mot était : **${game.word.toUpperCase()}**`)
        .setColor('#E74C3C');

      return message.reply({ embeds: [embed] });
    }

    // En cours
    const embed = nightfallEmbed()
      .setTitle('🟩 Wordle NightFall')
      .setDescription(`${gridText}\n\n${lettersText}`)
      .addFields(
        { name: 'Essais', value: `${game.attempts}/${game.maxAttempts}`, inline: true },
        { name: 'Joueur', value: `${message.author}`, inline: true },
      );

    await message.reply({ embeds: [embed] });
  },
};

function evaluateGuess(guess, word) {
  const result = [];
  const letters = [];
  const wordArr = word.split('');
  const guessArr = guess.split('');
  const used = new Array(5).fill(false);

  for (let i = 0; i < 5; i++) {
    if (guessArr[i] === wordArr[i]) {
      result[i] = '🟩';
      letters[i] = `**${guessArr[i].toUpperCase()}**`;
      used[i] = true;
    }
  }

  for (let i = 0; i < 5; i++) {
    if (result[i]) continue;
    const idx = wordArr.findIndex((c, j) => c === guessArr[i] && !used[j]);
    if (idx !== -1) {
      result[i] = '🟨';
      letters[i] = `*${guessArr[i].toUpperCase()}*`;
      used[idx] = true;
    } else {
      result[i] = '⬛';
      letters[i] = `~~${guessArr[i].toUpperCase()}~~`;
    }
  }

  return { display: result.join(''), letters };
}
