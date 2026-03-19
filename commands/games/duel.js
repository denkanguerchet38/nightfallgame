const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { nightfallEmbed, errorEmbed } = require('../../utils/embeds');
const { addWin, addLoss, addDraw } = require('../../database/db');

// Pierre > Ciseaux, Ciseaux > Papier, Papier > Pierre
// Pierre > Lézard, Lézard > Spock, Spock > Ciseaux
// Ciseaux > Lézard, Lézard > Papier, Papier > Spock, Spock > Pierre
const CHOICES = [
  { id: 'pierre', emoji: '🪨', label: 'Pierre' },
  { id: 'papier', emoji: '📄', label: 'Papier' },
  { id: 'ciseaux', emoji: '✂️', label: 'Ciseaux' },
  { id: 'lezard', emoji: '🦎', label: 'Lézard' },
  { id: 'spock', emoji: '🖖', label: 'Spock' },
];

const WINS_OVER = {
  pierre: ['ciseaux', 'lezard'],
  papier: ['pierre', 'spock'],
  ciseaux: ['papier', 'lezard'],
  lezard: ['papier', 'spock'],
  spock: ['pierre', 'ciseaux'],
};

const VERBS = {
  'pierre-ciseaux': 'écrase', 'pierre-lezard': 'écrase',
  'papier-pierre': 'recouvre', 'papier-spock': 'réfute',
  'ciseaux-papier': 'coupe', 'ciseaux-lezard': 'décapite',
  'lezard-papier': 'mange', 'lezard-spock': 'empoisonne',
  'spock-pierre': 'vaporise', 'spock-ciseaux': 'casse',
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('duel')
    .setDescription('Défier un joueur au Pierre-Papier-Ciseaux-Lézard-Spock')
    .addUserOption(opt =>
      opt.setName('adversaire')
        .setDescription('Le joueur à défier')
        .setRequired(true))
    .addIntegerOption(opt =>
      opt.setName('manches')
        .setDescription('Nombre de manches (défaut: 3)')
        .setMinValue(1)
        .setMaxValue(7)),

  async execute(interaction) {
    const opponent = interaction.options.getMember('adversaire');
    const maxRounds = interaction.options.getInteger('manches') || 3;

    if (!opponent || opponent.user.bot) {
      return interaction.reply({ embeds: [errorEmbed('Choisis un vrai joueur !')], flags: 64 });
    }
    if (opponent.id === interaction.user.id) {
      return interaction.reply({ embeds: [errorEmbed('Tu ne peux pas te défier toi-même.')], flags: 64 });
    }

    const players = [interaction.user, opponent.user];
    const scores = [0, 0];
    let round = 0;

    async function playRound(channel, msg) {
      round++;
      const choices = {};

      const row1 = new ActionRowBuilder().addComponents(
        CHOICES.slice(0, 3).map(c =>
          new ButtonBuilder().setCustomId(`duel_${c.id}`).setLabel(`${c.emoji} ${c.label}`).setStyle(ButtonStyle.Primary)
        )
      );
      const row2 = new ActionRowBuilder().addComponents(
        CHOICES.slice(3).map(c =>
          new ButtonBuilder().setCustomId(`duel_${c.id}`).setLabel(`${c.emoji} ${c.label}`).setStyle(ButtonStyle.Primary)
        )
      );

      const embed = nightfallEmbed()
        .setTitle(`⚔️ Duel — Manche ${round}/${maxRounds}`)
        .setDescription(`**${players[0].username}** ${scores[0]} — ${scores[1]} **${players[1].username}**\n\nChoisissez votre arme !`)
        .addFields({ name: 'En attente', value: `${players[0]} et ${players[1]}`, inline: false });

      let currentMsg;
      if (msg) {
        await msg.edit({ embeds: [embed], components: [row1, row2] });
        currentMsg = msg;
      } else {
        currentMsg = await interaction.reply({ embeds: [embed], components: [row1, row2], fetchReply: true });
      }

      return new Promise((resolve) => {
        const collector = currentMsg.createMessageComponentCollector({ time: 30_000 });

        collector.on('collect', async (btn) => {
          const userId = btn.user.id;
          if (userId !== players[0].id && userId !== players[1].id) {
            return btn.reply({ content: 'Tu ne participes pas à ce duel !', flags: 64 });
          }
          if (choices[userId]) {
            return btn.reply({ content: 'Tu as déjà choisi !', flags: 64 });
          }

          const choice = btn.customId.replace('duel_', '');
          choices[userId] = choice;

          await btn.reply({ content: `Tu as choisi **${CHOICES.find(c => c.id === choice).emoji} ${CHOICES.find(c => c.id === choice).label}** !`, flags: 64 });

          if (choices[players[0].id] && choices[players[1].id]) {
            collector.stop('done');
          }
        });

        collector.on('end', async (_, reason) => {
          if (reason !== 'done') {
            // Timeout — celui qui n'a pas joué perd la manche
            if (!choices[players[0].id] && !choices[players[1].id]) {
              resolve({ msg: currentMsg, timeout: true });
              return;
            }
          }

          const c1 = choices[players[0].id];
          const c2 = choices[players[1].id];

          if (!c1 || !c2) {
            resolve({ msg: currentMsg, timeout: true });
            return;
          }

          const ch1 = CHOICES.find(c => c.id === c1);
          const ch2 = CHOICES.find(c => c.id === c2);

          let resultText;
          if (c1 === c2) {
            resultText = `🤝 Égalité ! ${ch1.emoji} vs ${ch2.emoji}`;
          } else if (WINS_OVER[c1].includes(c2)) {
            scores[0]++;
            const verb = VERBS[`${c1}-${c2}`] || 'bat';
            resultText = `${ch1.emoji} ${verb} ${ch2.emoji} — **${players[0].username}** gagne la manche !`;
          } else {
            scores[1]++;
            const verb = VERBS[`${c2}-${c1}`] || 'bat';
            resultText = `${ch2.emoji} ${verb} ${ch1.emoji} — **${players[1].username}** gagne la manche !`;
          }

          const embed = nightfallEmbed()
            .setTitle(`⚔️ Duel — Résultat manche ${round}`)
            .setDescription(`${resultText}\n\n**Score:** ${players[0].username} ${scores[0]} — ${scores[1]} ${players[1].username}`);

          await currentMsg.edit({ embeds: [embed], components: [] });
          resolve({ msg: currentMsg, timeout: false });
        });
      });
    }

    let msg = null;
    for (let i = 0; i < maxRounds; i++) {
      const result = await playRound(interaction.channel, msg);
      msg = result.msg;

      if (result.timeout) {
        await interaction.channel.send({ embeds: [errorEmbed('Temps écoulé — duel annulé.')] });
        return;
      }

      // Attendre 3s entre les manches
      if (i < maxRounds - 1) {
        await new Promise(r => setTimeout(r, 3000));
      }
    }

    // Résultat final
    let finalText, color;
    if (scores[0] > scores[1]) {
      finalText = `🏆 **${players[0].username}** remporte le duel ${scores[0]}-${scores[1]} !`;
      color = '#2ECC71';
      addWin(players[0].id, 'duel');
      addLoss(players[1].id, 'duel');
    } else if (scores[1] > scores[0]) {
      finalText = `🏆 **${players[1].username}** remporte le duel ${scores[1]}-${scores[0]} !`;
      color = '#2ECC71';
      addWin(players[1].id, 'duel');
      addLoss(players[0].id, 'duel');
    } else {
      finalText = `🤝 Égalité parfaite ${scores[0]}-${scores[1]} !`;
      color = '#FFA500';
      addDraw(players[0].id, 'duel');
      addDraw(players[1].id, 'duel');
    }

    await interaction.channel.send({
      embeds: [nightfallEmbed().setTitle('⚔️ Duel — Résultat final').setDescription(finalText).setColor(color)],
    });
  },
};
