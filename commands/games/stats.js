const { SlashCommandBuilder } = require('discord.js');
const { nightfallEmbed } = require('../../utils/embeds');
const { getUserStats, getLeaderboard, getGameLeaderboard } = require('../../database/db');

const GAME_LABELS = {
  wordle: { name: 'Wordle', emoji: '🟩' },
  deviner: { name: 'Nombre', emoji: '🔢' },
  morpion: { name: 'Morpion', emoji: '⭕' },
  puissance4: { name: 'Puiss.4', emoji: '🔴' },
  duel: { name: 'Duel', emoji: '⚔️' },
  loupgarou: { name: 'LoupG.', emoji: '🐺' },
  blindtest: { name: 'BlindT.', emoji: '🎭' },
};

function getRank(totalWins) {
  if (totalWins >= 100) return { badge: '👑', title: 'Legende' };
  if (totalWins >= 50) return { badge: '💎', title: 'Diamant' };
  if (totalWins >= 30) return { badge: '🏆', title: 'Or' };
  if (totalWins >= 15) return { badge: '🥈', title: 'Argent' };
  if (totalWins >= 5) return { badge: '🥉', title: 'Bronze' };
  return { badge: '🆕', title: 'Debutant' };
}

// Barre ASCII safe monospace: [====----] 75%
function bar(value, max, len = 8) {
  if (max === 0) return '[' + '-'.repeat(len) + ']  0%';
  const pct = Math.round((value / max) * 100);
  const filled = Math.round((value / max) * len);
  const pctStr = String(pct).padStart(3) + '%';
  return '[' + '='.repeat(filled) + '-'.repeat(len - filled) + '] ' + pctStr;
}

// Pad strict ASCII
function p(str, len, align = 'l') {
  str = String(str);
  if (str.length > len) return str.slice(0, len);
  const diff = len - str.length;
  if (align === 'r') return ' '.repeat(diff) + str;
  if (align === 'c') {
    const left = Math.floor(diff / 2);
    return ' '.repeat(left) + str + ' '.repeat(diff - left);
  }
  return str + ' '.repeat(diff);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription('Statistiques et classements')
    .addSubcommand(sub =>
      sub.setName('me')
        .setDescription('Voir tes statistiques'))
    .addSubcommand(sub =>
      sub.setName('player')
        .setDescription('Voir les stats d\'un joueur')
        .addUserOption(opt =>
          opt.setName('joueur')
            .setDescription('Le joueur')
            .setRequired(true)))
    .addSubcommand(sub =>
      sub.setName('leaderboard')
        .setDescription('Classement general ou par jeu')
        .addStringOption(opt =>
          opt.setName('jeu')
            .setDescription('Filtrer par jeu (optionnel)')
            .addChoices(
              { name: 'Wordle', value: 'wordle' },
              { name: 'Devine le nombre', value: 'deviner' },
              { name: 'Morpion', value: 'morpion' },
              { name: 'Puissance 4', value: 'puissance4' },
              { name: 'Duel PvP', value: 'duel' },
              { name: 'Loup-Garou', value: 'loupgarou' },
              { name: 'Blind Test', value: 'blindtest' },
            ))),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    // ==================== STATS ME / PLAYER ====================
    if (sub === 'me' || sub === 'player') {
      const user = sub === 'me' ? interaction.user : interaction.options.getUser('joueur');
      const stats = getUserStats(user.id);

      if (stats.length === 0) {
        return interaction.reply({
          embeds: [nightfallEmbed().setDescription(`**${user.username}** n'a encore joue a aucun jeu.`)],
          flags: 64,
        });
      }

      let totalW = 0, totalL = 0, totalD = 0;
      stats.forEach(s => { totalW += s.wins; totalL += s.losses; totalD += s.draws; });

      const rank = getRank(totalW);
      const winrate = totalW + totalL > 0 ? Math.round((totalW / (totalW + totalL)) * 100) : 0;

      // Tableau
      let t = '';
      t += '+' + '-'.repeat(9) + '+' + '-'.repeat(5) + '+' + '-'.repeat(5) + '+' + '-'.repeat(5) + '+' + '-'.repeat(16) + '+\n';
      t += '| ' + p('Jeu', 7) + ' | ' + p('W', 3, 'c') + ' | ' + p('L', 3, 'c') + ' | ' + p('D', 3, 'c') + ' | ' + p('Winrate', 14) + ' |\n';
      t += '+' + '-'.repeat(9) + '+' + '-'.repeat(5) + '+' + '-'.repeat(5) + '+' + '-'.repeat(5) + '+' + '-'.repeat(16) + '+\n';

      for (const s of stats) {
        const g = GAME_LABELS[s.game] || { name: s.game };
        const b = bar(s.wins, s.wins + s.losses, 6);
        t += '| ' + p(g.name, 7) + ' | ' + p(s.wins, 3, 'r') + ' | ' + p(s.losses, 3, 'r') + ' | ' + p(s.draws, 3, 'r') + ' | ' + p(b, 14) + ' |\n';
      }

      t += '+' + '-'.repeat(9) + '+' + '-'.repeat(5) + '+' + '-'.repeat(5) + '+' + '-'.repeat(5) + '+' + '-'.repeat(16) + '+\n';
      const totalBar = bar(totalW, totalW + totalL, 6);
      t += '| ' + p('TOTAL', 7) + ' | ' + p(totalW, 3, 'r') + ' | ' + p(totalL, 3, 'r') + ' | ' + p(totalD, 3, 'r') + ' | ' + p(totalBar, 14) + ' |\n';
      t += '+' + '-'.repeat(9) + '+' + '-'.repeat(5) + '+' + '-'.repeat(5) + '+' + '-'.repeat(5) + '+' + '-'.repeat(16) + '+\n';

      const bestGame = stats.reduce((best, s) => s.wins > (best?.wins || 0) ? s : best, null);
      const bestLabel = bestGame ? `${GAME_LABELS[bestGame.game]?.emoji || ''} ${GAME_LABELS[bestGame.game]?.name || bestGame.game}` : '-';

      const embed = nightfallEmbed()
        .setTitle(`${rank.badge} Profil de ${user.username}`)
        .setThumbnail(user.displayAvatarURL({ size: 128 }))
        .setDescription(`**Rang:** ${rank.badge} ${rank.title} | **Winrate:** ${winrate}%\n\`\`\`\n${t}\`\`\``)
        .addFields(
          { name: '🎮 Parties', value: `${totalW + totalL + totalD}`, inline: true },
          { name: '🏅 Meilleur jeu', value: bestLabel, inline: true },
          { name: '🔥 Victoires', value: `${totalW}`, inline: true },
        );

      return interaction.reply({ embeds: [embed] });
    }

    // ==================== LEADERBOARD ====================
    if (sub === 'leaderboard') {
      const game = interaction.options.getString('jeu');
      await interaction.deferReply();

      if (game) {
        const rows = getGameLeaderboard(game);
        const g = GAME_LABELS[game];

        if (rows.length === 0) {
          return interaction.editReply({
            embeds: [nightfallEmbed().setDescription(`Personne n'a encore joue a ${g.emoji} ${g.name}.`)],
          });
        }

        const medals = ['🥇', '🥈', '🥉'];

        let t = '';
        t += '+' + '-'.repeat(4) + '+' + '-'.repeat(14) + '+' + '-'.repeat(5) + '+' + '-'.repeat(5) + '+' + '-'.repeat(5) + '+' + '-'.repeat(16) + '+\n';
        t += '| ' + p('#', 2, 'c') + ' | ' + p('Joueur', 12) + ' | ' + p('W', 3, 'c') + ' | ' + p('L', 3, 'c') + ' | ' + p('D', 3, 'c') + ' | ' + p('Winrate', 14) + ' |\n';
        t += '+' + '-'.repeat(4) + '+' + '-'.repeat(14) + '+' + '-'.repeat(5) + '+' + '-'.repeat(5) + '+' + '-'.repeat(5) + '+' + '-'.repeat(16) + '+\n';

        let podium = '';
        for (let i = 0; i < rows.length; i++) {
          const r = rows[i];
          let username;
          try { const u = await interaction.client.users.fetch(r.user_id); username = u.username; }
          catch { username = 'Inconnu'; }

          const b = bar(r.wins, r.wins + r.losses, 6);
          t += '| ' + p(i + 1, 2, 'c') + ' | ' + p(username, 12) + ' | ' + p(r.wins, 3, 'r') + ' | ' + p(r.losses, 3, 'r') + ' | ' + p(r.draws, 3, 'r') + ' | ' + p(b, 14) + ' |\n';

          if (i < 3) {
            const wr = r.wins + r.losses > 0 ? Math.round((r.wins / (r.wins + r.losses)) * 100) : 0;
            podium += `${medals[i]} **${username}** — ${r.wins}W / ${r.losses}L (${wr}%)\n`;
          }
        }

        t += '+' + '-'.repeat(4) + '+' + '-'.repeat(14) + '+' + '-'.repeat(5) + '+' + '-'.repeat(5) + '+' + '-'.repeat(5) + '+' + '-'.repeat(16) + '+\n';

        const embed = nightfallEmbed()
          .setTitle(`${g.emoji} Classement ${g.name}`)
          .setDescription(`${podium}\n\`\`\`\n${t}\`\`\``);

        return interaction.editReply({ embeds: [embed] });
      }

      // Classement general
      const rows = getLeaderboard();

      if (rows.length === 0) {
        return interaction.editReply({
          embeds: [nightfallEmbed().setDescription('Aucune statistique. Jouez !')],
        });
      }

      const medals = ['🥇', '🥈', '🥉'];

      let t = '';
      t += '+' + '-'.repeat(4) + '+' + '-'.repeat(14) + '+' + '-'.repeat(5) + '+' + '-'.repeat(5) + '+' + '-'.repeat(16) + '+\n';
      t += '| ' + p('#', 2, 'c') + ' | ' + p('Joueur', 12) + ' | ' + p('W', 3, 'c') + ' | ' + p('L', 3, 'c') + ' | ' + p('Winrate', 14) + ' |\n';
      t += '+' + '-'.repeat(4) + '+' + '-'.repeat(14) + '+' + '-'.repeat(5) + '+' + '-'.repeat(5) + '+' + '-'.repeat(16) + '+\n';

      let podium = '';
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        let username;
        try { const u = await interaction.client.users.fetch(r.user_id); username = u.username; }
        catch { username = 'Inconnu'; }

        const wr = r.total_wins + r.total_losses > 0
          ? Math.round((r.total_wins / (r.total_wins + r.total_losses)) * 100) : 0;
        const rank = getRank(r.total_wins);
        const b = bar(r.total_wins, r.total_wins + r.total_losses, 6);

        t += '| ' + p(i + 1, 2, 'c') + ' | ' + p(username, 12) + ' | ' + p(r.total_wins, 3, 'r') + ' | ' + p(r.total_losses, 3, 'r') + ' | ' + p(b, 14) + ' |\n';

        if (i < 3) {
          podium += `${medals[i]} **${username}** ${rank.badge} — ${r.total_wins}W / ${r.total_losses}L (${wr}%)\n`;
        }
      }

      t += '+' + '-'.repeat(4) + '+' + '-'.repeat(14) + '+' + '-'.repeat(5) + '+' + '-'.repeat(5) + '+' + '-'.repeat(16) + '+\n';

      const embed = nightfallEmbed()
        .setTitle('🏆 Classement general NightFall')
        .setDescription(`${podium}\n\`\`\`\n${t}\`\`\``);

      return interaction.editReply({ embeds: [embed] });
    }
  },
};
