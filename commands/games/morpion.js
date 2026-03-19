const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { nightfallEmbed, errorEmbed } = require('../../utils/embeds');
const { addWin, addLoss, addDraw } = require('../../database/db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('morpion')
    .setDescription('Jouer au morpion contre un autre joueur')
    .addUserOption(opt =>
      opt.setName('adversaire')
        .setDescription('Le joueur que tu veux défier')
        .setRequired(true)),

  async execute(interaction) {
    const opponent = interaction.options.getMember('adversaire');

    if (!opponent || opponent.user.bot) {
      return interaction.reply({ embeds: [errorEmbed('Choisis un vrai joueur !')], flags: 64 });
    }
    if (opponent.id === interaction.user.id) {
      return interaction.reply({ embeds: [errorEmbed('Tu ne peux pas jouer contre toi-même.')], flags: 64 });
    }

    const board = Array(9).fill(null);
    const players = [interaction.user, opponent.user];
    const symbols = ['❌', '⭕'];
    let turn = 0;

    function buildBoard(disabled = false) {
      const rows = [];
      for (let r = 0; r < 3; r++) {
        const row = new ActionRowBuilder();
        for (let c = 0; c < 3; c++) {
          const idx = r * 3 + c;
          const val = board[idx];
          row.addComponents(
            new ButtonBuilder()
              .setCustomId(`morpion_${idx}`)
              .setLabel(val || '‎') // invisible char if empty
              .setStyle(val === '❌' ? ButtonStyle.Danger : val === '⭕' ? ButtonStyle.Primary : ButtonStyle.Secondary)
              .setDisabled(disabled || val !== null)
          );
        }
        rows.push(row);
      }
      return rows;
    }

    function buildEmbed(status) {
      return nightfallEmbed()
        .setTitle('⭕❌ Morpion')
        .setDescription(status);
    }

    const msg = await interaction.reply({
      embeds: [buildEmbed(`${symbols[turn]} C'est au tour de **${players[turn].username}**`)],
      components: buildBoard(),
      fetchReply: true,
    });

    const collector = msg.createMessageComponentCollector({ time: 120_000 });

    collector.on('collect', async (btn) => {
      if (btn.user.id !== players[turn].id) {
        return btn.reply({ content: `Ce n'est pas ton tour !`, flags: 64 });
      }

      const idx = parseInt(btn.customId.split('_')[1]);
      board[idx] = symbols[turn];

      const winner = checkWin(board);
      const full = board.every(c => c !== null);

      if (winner) {
        addWin(players[turn].id, 'morpion');
        addLoss(players[1 - turn].id, 'morpion');
        collector.stop();
        return btn.update({
          embeds: [buildEmbed(`🎉 **${players[turn].username}** remporte la partie avec ${symbols[turn]} !`).setColor('#2ECC71')],
          components: buildBoard(true),
        });
      }

      if (full) {
        addDraw(players[0].id, 'morpion');
        addDraw(players[1].id, 'morpion');
        collector.stop();
        return btn.update({
          embeds: [buildEmbed('🤝 Égalité ! Personne ne gagne.').setColor('#FFA500')],
          components: buildBoard(true),
        });
      }

      turn = 1 - turn;
      await btn.update({
        embeds: [buildEmbed(`${symbols[turn]} C'est au tour de **${players[turn].username}**`)],
        components: buildBoard(),
      });
    });

    collector.on('end', (_, reason) => {
      if (reason === 'time') {
        msg.edit({
          embeds: [buildEmbed('⏰ Temps écoulé — partie annulée.').setColor('#E74C3C')],
          components: buildBoard(true),
        }).catch(() => {});
      }
    });
  },
};

function checkWin(b) {
  const lines = [
    [0,1,2],[3,4,5],[6,7,8],
    [0,3,6],[1,4,7],[2,5,8],
    [0,4,8],[2,4,6],
  ];
  for (const [a, c, d] of lines) {
    if (b[a] && b[a] === b[c] && b[a] === b[d]) return b[a];
  }
  return null;
}
