const { SlashCommandBuilder } = require('discord.js');
const { nightfallEmbed, errorEmbed } = require('../../utils/embeds');
const { addWin, addLoss } = require('../../database/db');

const activeGames = new Map();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('deviner')
    .setDescription('Devine le nombre mystère !')
    .addSubcommand(sub =>
      sub.setName('play')
        .setDescription('Lancer une partie')
        .addStringOption(opt =>
          opt.setName('difficulte')
            .setDescription('Niveau de difficulté')
            .setRequired(true)
            .addChoices(
              { name: '🟢 Facile (1-100, 10 essais)', value: 'easy' },
              { name: '🟡 Moyen (1-500, 12 essais)', value: 'medium' },
              { name: '🔴 Difficile (1-1000, 15 essais)', value: 'hard' },
            )))
    .addSubcommand(sub =>
      sub.setName('guess')
        .setDescription('Proposer un nombre')
        .addIntegerOption(opt =>
          opt.setName('nombre')
            .setDescription('Ton nombre')
            .setRequired(true))),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'play') {
      if (activeGames.has(interaction.channelId)) {
        return interaction.reply({ embeds: [errorEmbed('Une partie est déjà en cours ici !')], flags: 64 });
      }

      const diff = interaction.options.getString('difficulte');
      const settings = {
        easy: { max: 100, attempts: 10, label: 'Facile' },
        medium: { max: 500, attempts: 12, label: 'Moyen' },
        hard: { max: 1000, attempts: 15, label: 'Difficile' },
      };

      const s = settings[diff];
      const number = Math.floor(Math.random() * s.max) + 1;

      activeGames.set(interaction.channelId, {
        number,
        max: s.max,
        maxAttempts: s.attempts,
        attempts: 0,
        history: [],
        userId: interaction.user.id,
      });

      const embed = nightfallEmbed()
        .setTitle('🔢 Devine le nombre !')
        .setDescription(`J'ai choisi un nombre entre **1** et **${s.max}**.\n\nUtilise \`/deviner guess nombre:___\`\n\n🧊 Glacial → ❄️ Froid → 🌡️ Tiède → 🔥 Chaud → 💥 Brûlant`)
        .addFields(
          { name: 'Difficulté', value: s.label, inline: true },
          { name: 'Essais', value: `${s.attempts}`, inline: true },
        );

      await interaction.reply({ embeds: [embed] });
    }

    if (sub === 'guess') {
      const game = activeGames.get(interaction.channelId);
      if (!game) {
        return interaction.reply({ embeds: [errorEmbed('Aucune partie en cours. Lance `/deviner play`.')], flags: 64 });
      }

      const guess = interaction.options.getInteger('nombre');

      if (guess < 1 || guess > game.max) {
        return interaction.reply({ embeds: [errorEmbed(`Le nombre doit être entre 1 et ${game.max}.`)], flags: 64 });
      }

      game.attempts++;
      const diff = Math.abs(guess - game.number);
      const pct = (diff / game.max) * 100;

      let hint, emoji, color;
      if (diff === 0) {
        // Trouvé !
        activeGames.delete(interaction.channelId);
        addWin(interaction.user.id, 'deviner');

        const embed = nightfallEmbed()
          .setTitle('🎉 Trouvé !')
          .setDescription(`Le nombre était **${game.number}** !\n\n${game.history.join('\n')}\n✅ **${guess}** — TROUVÉ !`)
          .setColor('#2ECC71')
          .addFields({ name: 'Essais', value: `${game.attempts}/${game.maxAttempts}`, inline: true });

        return interaction.reply({ embeds: [embed] });
      }

      const direction = guess < game.number ? '📈 Plus haut' : '📉 Plus bas';

      if (pct <= 2) { emoji = '💥'; hint = 'BRÛLANT'; color = '#FF0000'; }
      else if (pct <= 5) { emoji = '🔥'; hint = 'Très chaud'; color = '#FF4500'; }
      else if (pct <= 10) { emoji = '🌡️'; hint = 'Chaud'; color = '#FFA500'; }
      else if (pct <= 20) { emoji = '🌡️'; hint = 'Tiède'; color = '#FFD700'; }
      else if (pct <= 35) { emoji = '❄️'; hint = 'Froid'; color = '#87CEEB'; }
      else { emoji = '🧊'; hint = 'Glacial'; color = '#4169E1'; }

      game.history.push(`${emoji} **${guess}** — ${hint} (${direction})`);

      // Perdu
      if (game.attempts >= game.maxAttempts) {
        activeGames.delete(interaction.channelId);
        addLoss(interaction.user.id, 'deviner');

        const embed = nightfallEmbed()
          .setTitle('💀 Perdu !')
          .setDescription(`${game.history.join('\n')}\n\nLe nombre était **${game.number}** !`)
          .setColor('#E74C3C');

        return interaction.reply({ embeds: [embed] });
      }

      const embed = nightfallEmbed()
        .setTitle('🔢 Devine le nombre')
        .setDescription(`${game.history.join('\n')}`)
        .setColor(color)
        .addFields(
          { name: 'Essais restants', value: `${game.maxAttempts - game.attempts}`, inline: true },
          { name: 'Intervalle', value: `1 — ${game.max}`, inline: true },
        );

      await interaction.reply({ embeds: [embed] });
    }
  },
};
