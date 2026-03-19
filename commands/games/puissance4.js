const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { nightfallEmbed, errorEmbed } = require('../../utils/embeds');
const { addWin, addLoss } = require('../../database/db');

const ROWS = 6;
const COLS = 7;
const EMPTY = '⚫';
const P1 = '🔴';
const P2 = '🟡';
const COL_EMOJIS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣'];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('puissance4')
    .setDescription('Jouer au Puissance 4 contre un autre joueur')
    .addUserOption(opt =>
      opt.setName('adversaire')
        .setDescription('Le joueur à défier')
        .setRequired(true)),

  async execute(interaction) {
    const opponent = interaction.options.getMember('adversaire');

    if (!opponent || opponent.user.bot) {
      return interaction.reply({ embeds: [errorEmbed('Choisis un vrai joueur !')], flags: 64 });
    }
    if (opponent.id === interaction.user.id) {
      return interaction.reply({ embeds: [errorEmbed('Tu ne peux pas jouer contre toi-même.')], flags: 64 });
    }

    // Grille 6x7 (row 0 = haut)
    const grid = Array.from({ length: ROWS }, () => Array(COLS).fill(EMPTY));
    const players = [interaction.user, opponent.user];
    const tokens = [P1, P2];
    let turn = 0;

    function renderGrid() {
      let str = COL_EMOJIS.join('') + '\n';
      for (let r = 0; r < ROWS; r++) {
        str += grid[r].join('') + '\n';
      }
      return str;
    }

    function buildButtons(disabled = false) {
      const row = new ActionRowBuilder();
      for (let c = 0; c < COLS; c++) {
        const full = grid[0][c] !== EMPTY;
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`p4_${c}`)
            .setLabel(`${c + 1}`)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled || full)
        );
      }
      return [row];
    }

    function buildEmbed(status) {
      return nightfallEmbed()
        .setTitle('🔴🟡 Puissance 4')
        .setDescription(`${renderGrid()}\n${status}`);
    }

    const msg = await interaction.reply({
      embeds: [buildEmbed(`${tokens[turn]} Tour de **${players[turn].username}**`)],
      components: buildButtons(),
      fetchReply: true,
    });

    const collector = msg.createMessageComponentCollector({ time: 180_000 });

    collector.on('collect', async (btn) => {
      if (btn.user.id !== players[turn].id) {
        return btn.reply({ content: 'Ce n\'est pas ton tour !', flags: 64 });
      }

      const col = parseInt(btn.customId.split('_')[1]);

      // Trouver la première ligne vide en partant du bas
      let row = -1;
      for (let r = ROWS - 1; r >= 0; r--) {
        if (grid[r][col] === EMPTY) { row = r; break; }
      }
      if (row === -1) return btn.reply({ content: 'Colonne pleine !', flags: 64 });

      grid[row][col] = tokens[turn];

      // Check victoire
      if (checkWin(grid, row, col, tokens[turn])) {
        addWin(players[turn].id, 'puissance4');
        addLoss(players[1 - turn].id, 'puissance4');
        collector.stop();
        return btn.update({
          embeds: [buildEmbed(`🎉 **${players[turn].username}** gagne avec ${tokens[turn]} !`).setColor('#2ECC71')],
          components: buildButtons(true),
        });
      }

      // Check grille pleine
      const full = grid[0].every(c => c !== EMPTY);
      if (full) {
        collector.stop();
        return btn.update({
          embeds: [buildEmbed('🤝 Égalité ! La grille est pleine.').setColor('#FFA500')],
          components: buildButtons(true),
        });
      }

      turn = 1 - turn;
      await btn.update({
        embeds: [buildEmbed(`${tokens[turn]} Tour de **${players[turn].username}**`)],
        components: buildButtons(),
      });
    });

    collector.on('end', (_, reason) => {
      if (reason === 'time') {
        msg.edit({
          embeds: [buildEmbed('⏰ Temps écoulé — partie annulée.').setColor('#E74C3C')],
          components: buildButtons(true),
        }).catch(() => {});
      }
    });
  },
};

function checkWin(grid, row, col, token) {
  const directions = [[0,1],[1,0],[1,1],[1,-1]];
  for (const [dr, dc] of directions) {
    let count = 1;
    for (let d = 1; d <= 3; d++) {
      const r = row + dr * d, c = col + dc * d;
      if (r >= 0 && r < ROWS && c >= 0 && c < COLS && grid[r][c] === token) count++;
      else break;
    }
    for (let d = 1; d <= 3; d++) {
      const r = row - dr * d, c = col - dc * d;
      if (r >= 0 && r < ROWS && c >= 0 && c < COLS && grid[r][c] === token) count++;
      else break;
    }
    if (count >= 4) return true;
  }
  return false;
}
