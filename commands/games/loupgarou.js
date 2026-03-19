const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const { nightfallEmbed, errorEmbed, successEmbed } = require('../../utils/embeds');
const { addWin, addLoss } = require('../../database/db');

// Lobbies actifs: channelId -> game state
const lobbies = new Map();

const ROLES = {
  VILLAGEOIS: { name: 'Villageois', emoji: '🧑‍🌾', desc: 'Trouve et élimine les loups-garous !' },
  LOUP: { name: 'Loup-Garou', emoji: '🐺', desc: 'Dévore un villageois chaque nuit sans te faire repérer.' },
  VOYANTE: { name: 'Voyante', emoji: '🔮', desc: 'Chaque nuit, découvre le rôle d\'un joueur.' },
  CHASSEUR: { name: 'Chasseur', emoji: '🏹', desc: 'En mourant, tu emportes un joueur avec toi.' },
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('loupgarou')
    .setDescription('Jouer au Loup-Garou !')
    .addSubcommand(sub => sub.setName('create').setDescription('Créer une partie'))
    .addSubcommand(sub => sub.setName('join').setDescription('Rejoindre la partie'))
    .addSubcommand(sub => sub.setName('start').setDescription('Lancer la partie (hôte uniquement)'))
    .addSubcommand(sub => sub.setName('cancel').setDescription('Annuler la partie')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const chId = interaction.channelId;

    if (sub === 'create') {
      if (lobbies.has(chId)) {
        return interaction.reply({ embeds: [errorEmbed('Une partie existe déjà ici ! `/loupgarou cancel` pour annuler.')], flags: 64 });
      }

      lobbies.set(chId, {
        host: interaction.user.id,
        players: [{ id: interaction.user.id, user: interaction.user }],
        phase: 'lobby',
        roles: {},
        alive: [],
        night: 0,
      });

      await interaction.reply({
        embeds: [
          nightfallEmbed()
            .setTitle('🐺 Loup-Garou — Lobby créé !')
            .setDescription(`**${interaction.user.username}** a créé une partie !\n\nRejoignez avec \`/loupgarou join\`\nL'hôte lance avec \`/loupgarou start\`\n\n**Joueurs minimum:** 4\n**Joueurs maximum:** 12`)
            .addFields({ name: 'Joueurs (1)', value: interaction.user.username }),
        ],
      });
      return;
    }

    if (sub === 'join') {
      const lobby = lobbies.get(chId);
      if (!lobby || lobby.phase !== 'lobby') {
        return interaction.reply({ embeds: [errorEmbed('Aucun lobby ouvert ici.')], flags: 64 });
      }
      if (lobby.players.find(p => p.id === interaction.user.id)) {
        return interaction.reply({ embeds: [errorEmbed('Tu es déjà dans la partie.')], flags: 64 });
      }
      if (lobby.players.length >= 12) {
        return interaction.reply({ embeds: [errorEmbed('La partie est pleine (12 max).')], flags: 64 });
      }

      lobby.players.push({ id: interaction.user.id, user: interaction.user });

      await interaction.reply({
        embeds: [
          successEmbed(`**${interaction.user.username}** a rejoint ! (${lobby.players.length} joueurs)\n\n${lobby.players.map(p => p.user.username).join(', ')}`),
        ],
      });
      return;
    }

    if (sub === 'cancel') {
      const lobby = lobbies.get(chId);
      if (!lobby) return interaction.reply({ embeds: [errorEmbed('Aucune partie ici.')], flags: 64 });
      lobbies.delete(chId);
      return interaction.reply({ embeds: [successEmbed('Partie annulée.')] });
    }

    if (sub === 'start') {
      const lobby = lobbies.get(chId);
      if (!lobby || lobby.phase !== 'lobby') {
        return interaction.reply({ embeds: [errorEmbed('Aucun lobby ouvert.')], flags: 64 });
      }
      if (lobby.host !== interaction.user.id) {
        return interaction.reply({ embeds: [errorEmbed('Seul l\'hôte peut lancer la partie.')], flags: 64 });
      }
      if (lobby.players.length < 4) {
        return interaction.reply({ embeds: [errorEmbed(`Il faut au moins 4 joueurs (actuellement ${lobby.players.length}).`)], flags: 64 });
      }

      await interaction.reply({
        embeds: [nightfallEmbed().setTitle('🐺 La partie commence !').setDescription('Distribution des rôles par DM...')],
      });

      // Distribuer les rôles
      const n = lobby.players.length;
      const roleList = assignRoles(n);
      shuffle(lobby.players);

      for (let i = 0; i < n; i++) {
        const player = lobby.players[i];
        const role = roleList[i];
        lobby.roles[player.id] = role;

        const roleInfo = ROLES[role];
        try {
          await player.user.send({
            embeds: [
              nightfallEmbed()
                .setTitle(`${roleInfo.emoji} Tu es ${roleInfo.name} !`)
                .setDescription(roleInfo.desc),
            ],
          });
        } catch {
          await interaction.channel.send({ embeds: [errorEmbed(`Impossible d'envoyer un DM à **${player.user.username}**. Active tes DMs !`)] });
          lobbies.delete(chId);
          return;
        }
      }

      lobby.alive = lobby.players.map(p => p.id);
      lobby.phase = 'night';
      lobby.night = 0;

      // Annoncer les rôles en jeu (sans dire qui)
      const roleCounts = {};
      for (const r of roleList) {
        roleCounts[r] = (roleCounts[r] || 0) + 1;
      }
      const roleText = Object.entries(roleCounts)
        .map(([r, c]) => `${ROLES[r].emoji} ${ROLES[r].name} x${c}`)
        .join('\n');

      await interaction.channel.send({
        embeds: [
          nightfallEmbed()
            .setTitle('🎭 Rôles distribués !')
            .setDescription(`${roleText}\n\nVérifiez vos DMs. La nuit va tomber...`),
        ],
      });

      await sleep(3000);
      await runNight(interaction.channel, lobby, chId);
    }
  },
};

function assignRoles(n) {
  const roles = [];
  // 1 Voyante toujours
  roles.push('VOYANTE');
  // 1 Chasseur si 6+ joueurs
  if (n >= 6) roles.push('CHASSEUR');
  // Nombre de loups: 1 pour 4-5, 2 pour 6-8, 3 pour 9+
  const wolves = n <= 5 ? 1 : n <= 8 ? 2 : 3;
  for (let i = 0; i < wolves; i++) roles.push('LOUP');
  // Le reste = Villageois
  while (roles.length < n) roles.push('VILLAGEOIS');
  shuffle(roles);
  return roles;
}

async function runNight(channel, lobby, chId) {
  lobby.night++;
  lobby.phase = 'night';

  await channel.send({
    embeds: [
      nightfallEmbed()
        .setTitle(`🌙 Nuit ${lobby.night}`)
        .setDescription('Le village s\'endort... Les créatures de la nuit se réveillent.\n\nConsultez vos DMs !')
        .setColor('#1a1a2e'),
    ],
  });

  // Voyante
  const seer = lobby.players.find(p => lobby.roles[p.id] === 'VOYANTE' && lobby.alive.includes(p.id));
  let seerResult = null;
  if (seer) {
    const targets = lobby.alive.filter(id => id !== seer.id);
    const options = targets.map(id => {
      const p = lobby.players.find(pl => pl.id === id);
      return { label: p.user.username, value: id };
    });

    try {
      const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder().setCustomId('seer_pick').setPlaceholder('Qui veux-tu sonder ?').addOptions(options)
      );
      const dm = await seer.user.send({
        embeds: [nightfallEmbed().setTitle('🔮 Voyante — Choisis un joueur à sonder').setColor('#9B59B6')],
        components: [row],
      });

      const pick = await dm.awaitMessageComponent({ time: 30_000 }).catch(() => null);
      if (pick) {
        const targetId = pick.values[0];
        const targetRole = ROLES[lobby.roles[targetId]];
        const targetUser = lobby.players.find(p => p.id === targetId).user;
        await pick.update({
          embeds: [nightfallEmbed().setTitle('🔮 Résultat').setDescription(`**${targetUser.username}** est **${targetRole.emoji} ${targetRole.name}** !`).setColor('#9B59B6')],
          components: [],
        });
      }
    } catch {}
  }

  // Loups-Garous votent
  const wolves = lobby.players.filter(p => lobby.roles[p.id] === 'LOUP' && lobby.alive.includes(p.id));
  const targets = lobby.alive.filter(id => !wolves.find(w => w.id === id));
  let victim = null;

  if (wolves.length > 0 && targets.length > 0) {
    const options = targets.map(id => {
      const p = lobby.players.find(pl => pl.id === id);
      return { label: p.user.username, value: id };
    });

    const votes = {};
    for (const wolf of wolves) {
      try {
        const row = new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder().setCustomId('wolf_pick').setPlaceholder('Qui dévorer ?').addOptions(options)
        );
        const otherWolves = wolves.filter(w => w.id !== wolf.id).map(w => w.user.username).join(', ') || 'Aucun';
        const dm = await wolf.user.send({
          embeds: [nightfallEmbed().setTitle('🐺 Loup-Garou — Choisis ta victime').setDescription(`Autres loups: ${otherWolves}`).setColor('#8B0000')],
          components: [row],
        });

        const pick = await dm.awaitMessageComponent({ time: 30_000 }).catch(() => null);
        if (pick) {
          votes[wolf.id] = pick.values[0];
          await pick.update({ embeds: [nightfallEmbed().setDescription(`Vote enregistré !`).setColor('#8B0000')], components: [] });
        }
      } catch {}
    }

    // Majorité ou random parmi les votes
    const voteCounts = {};
    for (const v of Object.values(votes)) {
      voteCounts[v] = (voteCounts[v] || 0) + 1;
    }
    const maxVotes = Math.max(...Object.values(voteCounts), 0);
    const topVoted = Object.entries(voteCounts).filter(([, c]) => c === maxVotes).map(([id]) => id);
    victim = topVoted.length > 0 ? topVoted[Math.floor(Math.random() * topVoted.length)] : targets[Math.floor(Math.random() * targets.length)];
  }

  await sleep(5000);

  // Jour
  lobby.phase = 'day';
  let deathText = '';

  if (victim) {
    lobby.alive = lobby.alive.filter(id => id !== victim);
    const victimUser = lobby.players.find(p => p.id === victim).user;
    const victimRole = ROLES[lobby.roles[victim]];
    deathText = `💀 **${victimUser.username}** (${victimRole.emoji} ${victimRole.name}) a été dévoré cette nuit...`;

    // Chasseur: emporte quelqu'un
    if (lobby.roles[victim] === 'CHASSEUR' && lobby.alive.length > 0) {
      const hunterTarget = lobby.alive[Math.floor(Math.random() * lobby.alive.length)];
      lobby.alive = lobby.alive.filter(id => id !== hunterTarget);
      const htUser = lobby.players.find(p => p.id === hunterTarget).user;
      const htRole = ROLES[lobby.roles[hunterTarget]];
      deathText += `\n🏹 Le Chasseur emporte **${htUser.username}** (${htRole.emoji} ${htRole.name}) dans sa chute !`;
    }
  } else {
    deathText = '☀️ Personne n\'est mort cette nuit.';
  }

  // Vérifier fin de partie
  const result = checkGameEnd(lobby);
  if (result) {
    lobbies.delete(chId);
    return announceEnd(channel, lobby, result, deathText);
  }

  await channel.send({
    embeds: [
      nightfallEmbed()
        .setTitle(`☀️ Jour ${lobby.night}`)
        .setDescription(`${deathText}\n\n**Survivants (${lobby.alive.length}):** ${lobby.alive.map(id => lobby.players.find(p => p.id === id).user.username).join(', ')}\n\nDiscutez, débattez... puis votez pour éliminer un suspect !`)
        .setColor('#F39C12'),
    ],
  });

  // Phase de vote (30 secondes de discussion, puis vote)
  await sleep(15_000);

  await channel.send({
    embeds: [nightfallEmbed().setDescription('🗳️ **Le vote commence !** Choisissez qui éliminer.').setColor('#F39C12')],
  });

  const voteOptions = lobby.alive.map(id => {
    const p = lobby.players.find(pl => pl.id === id);
    return { label: p.user.username, value: id };
  });

  const voteRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId('day_vote').setPlaceholder('Qui éliminer ?').addOptions(voteOptions)
  );

  const voteMsg = await channel.send({ components: [voteRow] });

  const dayVotes = {};
  const voteCollector = voteMsg.createMessageComponentCollector({ time: 25_000 });

  voteCollector.on('collect', async (btn) => {
    if (!lobby.alive.includes(btn.user.id)) {
      return btn.reply({ content: 'Tu es mort, tu ne votes pas !', flags: 64 });
    }
    dayVotes[btn.user.id] = btn.values[0];
    await btn.reply({ content: `Vote enregistré !`, flags: 64 });
  });

  await new Promise(r => voteCollector.on('end', r));

  // Compter les votes
  const voteCounts = {};
  for (const v of Object.values(dayVotes)) {
    voteCounts[v] = (voteCounts[v] || 0) + 1;
  }

  await voteMsg.edit({ components: [] });

  const maxVotes = Math.max(...Object.values(voteCounts), 0);
  let eliminated = null;

  if (maxVotes > 0) {
    const topVoted = Object.entries(voteCounts).filter(([, c]) => c === maxVotes).map(([id]) => id);
    eliminated = topVoted[Math.floor(Math.random() * topVoted.length)];
    lobby.alive = lobby.alive.filter(id => id !== eliminated);

    const elimUser = lobby.players.find(p => p.id === eliminated).user;
    const elimRole = ROLES[lobby.roles[eliminated]];

    let elimText = `🪦 **${elimUser.username}** (${elimRole.emoji} ${elimRole.name}) a été éliminé par le village !`;

    // Chasseur
    if (lobby.roles[eliminated] === 'CHASSEUR' && lobby.alive.length > 0) {
      const hunterTarget = lobby.alive[Math.floor(Math.random() * lobby.alive.length)];
      lobby.alive = lobby.alive.filter(id => id !== hunterTarget);
      const htUser = lobby.players.find(p => p.id === hunterTarget).user;
      const htRole = ROLES[lobby.roles[hunterTarget]];
      elimText += `\n🏹 Le Chasseur emporte **${htUser.username}** (${htRole.emoji} ${htRole.name}) !`;
    }

    await channel.send({
      embeds: [nightfallEmbed().setDescription(elimText).setColor('#E74C3C')],
    });
  } else {
    await channel.send({
      embeds: [nightfallEmbed().setDescription('Aucun vote — personne n\'est éliminé.').setColor('#FFA500')],
    });
  }

  // Vérifier fin de partie
  const endResult = checkGameEnd(lobby);
  if (endResult) {
    lobbies.delete(chId);
    return announceEnd(channel, lobby, endResult, '');
  }

  // Nuit suivante
  await sleep(3000);
  await runNight(channel, lobby, chId);
}

function checkGameEnd(lobby) {
  const aliveWolves = lobby.alive.filter(id => lobby.roles[id] === 'LOUP').length;
  const aliveVillagers = lobby.alive.filter(id => lobby.roles[id] !== 'LOUP').length;

  if (aliveWolves === 0) return 'village';
  if (aliveWolves >= aliveVillagers) return 'loups';
  return null;
}

async function announceEnd(channel, lobby, winner, extraText) {
  const roleReveal = lobby.players.map(p => {
    const role = ROLES[lobby.roles[p.id]];
    const alive = lobby.alive.includes(p.id) ? '✅' : '💀';
    return `${alive} **${p.user.username}** — ${role.emoji} ${role.name}`;
  }).join('\n');

  const title = winner === 'village' ? '🎉 Le Village a gagné !' : '🐺 Les Loups-Garous ont gagné !';
  const color = winner === 'village' ? '#2ECC71' : '#8B0000';

  // Stats
  for (const p of lobby.players) {
    const isWolf = lobby.roles[p.id] === 'LOUP';
    if ((winner === 'loups' && isWolf) || (winner === 'village' && !isWolf)) {
      addWin(p.id, 'loupgarou');
    } else {
      addLoss(p.id, 'loupgarou');
    }
  }

  await channel.send({
    embeds: [
      nightfallEmbed()
        .setTitle(title)
        .setDescription(`${extraText ? extraText + '\n\n' : ''}**Révélation des rôles:**\n${roleReveal}`)
        .setColor(color),
    ],
  });
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
