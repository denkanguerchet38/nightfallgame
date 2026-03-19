const { SlashCommandBuilder } = require('discord.js');
const { nightfallEmbed, successEmbed, errorEmbed } = require('../../utils/embeds');
const { addWin } = require('../../database/db');
const blindtestData = require('../../data/blindtest');

const activeGames = new Map();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('blindtest')
    .setDescription('Blind Test Emoji — devine le film, la série ou le jeu !')
    .addSubcommand(sub =>
      sub.setName('start')
        .setDescription('Lancer un blind test')
        .addStringOption(opt =>
          opt.setName('categorie')
            .setDescription('Catégorie')
            .setRequired(true)
            .addChoices(
              { name: '🎬 Films', value: 'films' },
              { name: '📺 Séries', value: 'series' },
              { name: '🎮 Jeux vidéo', value: 'jeux' },
              { name: '🎲 Tout mélangé', value: 'all' },
            ))
        .addIntegerOption(opt =>
          opt.setName('manches')
            .setDescription('Nombre de manches (défaut: 5)')
            .setMinValue(3)
            .setMaxValue(15)))
    .addSubcommand(sub =>
      sub.setName('stop')
        .setDescription('Arrêter le blind test')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'stop') {
      const game = activeGames.get(interaction.channelId);
      if (!game) return interaction.reply({ embeds: [errorEmbed('Aucun blind test en cours.')], flags: 64 });
      game.active = false;
      activeGames.delete(interaction.channelId);
      return interaction.reply({ embeds: [successEmbed('Blind test arrêté !')] });
    }

    if (activeGames.has(interaction.channelId)) {
      return interaction.reply({ embeds: [errorEmbed('Un blind test est déjà en cours !')], flags: 64 });
    }

    const category = interaction.options.getString('categorie');
    const rounds = interaction.options.getInteger('manches') || 5;

    let pool;
    if (category === 'all') {
      pool = [...blindtestData.films, ...blindtestData.series, ...blindtestData.jeux];
    } else {
      pool = [...blindtestData[category]];
    }

    shuffle(pool);
    const questions = pool.slice(0, Math.min(rounds, pool.length));

    const state = {
      questions,
      current: 0,
      scores: new Map(),
      active: true,
      channel: interaction.channel,
    };

    activeGames.set(interaction.channelId, state);

    const catLabels = { films: '🎬 Films', series: '📺 Séries', jeux: '🎮 Jeux vidéo', all: '🎲 Tout mélangé' };

    await interaction.reply({
      embeds: [
        nightfallEmbed()
          .setTitle('🎭 Blind Test Emoji — C\'est parti !')
          .setDescription(`**${questions.length} manches** — ${catLabels[category]}\n\nDevinez à partir des emojis !\nTapez votre réponse dans le chat.\n**20 secondes** par manche.`),
      ],
    });

    await sleep(3000);
    await playRound(state, interaction.channelId);
  },
};

async function playRound(state, channelId) {
  if (!state.active || state.current >= state.questions.length) {
    return endGame(state, channelId);
  }

  const q = state.questions[state.current];
  state.current++;

  await state.channel.send({
    embeds: [
      nightfallEmbed()
        .setTitle(`🎭 Manche ${state.current}/${state.questions.length}`)
        .setDescription(`# ${q.emojis}\n\nDevinez le film, la série ou le jeu !\nTapez votre réponse dans le chat.`)
        .setColor('#DC143C'),
    ],
  });

  const filter = (msg) => !msg.author.bot;
  const collector = state.channel.createMessageCollector({ filter, time: 20_000 });
  let found = false;

  collector.on('collect', (msg) => {
    if (!state.active) { collector.stop(); return; }

    const guess = normalize(msg.content);
    const match = q.answer.some(a => {
      const norm = normalize(a);
      // Match exact ou si la réponse contient au moins 70% des mots
      if (guess === norm) return true;
      const words = norm.split(/\s+/).filter(w => w.length > 2);
      const matched = words.filter(w => guess.includes(w));
      return words.length > 0 && matched.length / words.length >= 0.7;
    });

    if (match) {
      found = true;
      const score = (state.scores.get(msg.author.id) || 0) + 1;
      state.scores.set(msg.author.id, score);

      state.channel.send({
        embeds: [
          successEmbed(`🎉 **${msg.author.username}** a trouvé ! C'était **${q.answer[0]}**\n+1 point ! (Total: ${score})`)
            .setColor('#2ECC71'),
        ],
      });

      addWin(msg.author.id, 'blindtest');
      collector.stop('found');
    }
  });

  collector.on('end', async () => {
    if (!found && state.active) {
      await state.channel.send({
        embeds: [
          nightfallEmbed()
            .setTitle('⏰ Temps écoulé !')
            .setDescription(`La réponse était: **${q.answer[0]}**`)
            .setColor('#E74C3C'),
        ],
      });
    }

    if (state.active) {
      await sleep(3000);
      await playRound(state, channelId);
    }
  });
}

async function endGame(state, channelId) {
  state.active = false;
  activeGames.delete(channelId);

  const sorted = [...state.scores.entries()].sort((a, b) => b[1] - a[1]);
  const medals = ['🥇', '🥈', '🥉'];

  let leaderboard;
  if (sorted.length === 0) {
    leaderboard = '*Personne n\'a trouvé de réponse !*';
  } else {
    leaderboard = sorted.map(([userId, score], i) => {
      const medal = medals[i] || `**${i + 1}.**`;
      return `${medal} <@${userId}> — **${score}** point(s)`;
    }).join('\n');
  }

  await state.channel.send({
    embeds: [
      nightfallEmbed()
        .setTitle('🏆 Blind Test Emoji — Résultats')
        .setDescription(leaderboard)
        .addFields({ name: 'Manches jouées', value: `${state.current}`, inline: true }),
    ],
  });
}

function normalize(str) {
  return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, '').trim();
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
