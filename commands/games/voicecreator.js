const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, PermissionsBitField } = require('discord.js');
const { successEmbed, errorEmbed, nightfallEmbed } = require('../../utils/embeds');

// Set de channel IDs temporaires actifs
const tempChannels = new Set();

// Le channel "hub" (celui qu'on rejoint pour créer un vocal)
let hubChannelId = null;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('voicecreator')
    .setDescription('Configurer le système de salons vocaux temporaires')
    .addSubcommand(sub =>
      sub.setName('setup')
        .setDescription('Créer le salon "Rejoindre pour créer"')
        .addStringOption(opt =>
          opt.setName('nom')
            .setDescription('Nom du salon hub (défaut: ➕ Créer un salon)')
            .setRequired(false))
        .addChannelOption(opt =>
          opt.setName('categorie')
            .setDescription('Catégorie où créer les salons (optionnel)')
            .addChannelTypes(ChannelType.GuildCategory)
            .setRequired(false)))
    .addSubcommand(sub =>
      sub.setName('remove')
        .setDescription('Supprimer le système'))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  // Exposer pour les events
  tempChannels,
  getHubChannelId: () => hubChannelId,
  setHubChannelId: (id) => { hubChannelId = id; },

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'setup') {
      const name = interaction.options.getString('nom') || '➕ Créer un salon';
      const category = interaction.options.getChannel('categorie');

      // Créer le channel hub
      try {
        const hub = await interaction.guild.channels.create({
          name,
          type: ChannelType.GuildVoice,
          parent: category?.id || null,
          reason: 'NightFall — Voice Creator setup',
        });

        hubChannelId = hub.id;

        // Sauvegarder l'ID en BDD
        const { setSetting } = require('../../database/db');
        setSetting('hub_channel_id', hub.id);
        if (category) setSetting('hub_category_id', category.id);

        await interaction.reply({
          embeds: [
            successEmbed(`Salon hub créé : ${hub}\n\nQuand un membre rejoint **${name}**, un salon vocal privé sera créé automatiquement !`),
          ],
        });
      } catch (err) {
        await interaction.reply({ embeds: [errorEmbed(`Erreur: ${err.message}`)], flags: 64 });
      }
    }

    if (sub === 'remove') {
      if (!hubChannelId) {
        return interaction.reply({ embeds: [errorEmbed('Aucun système de vocal configuré.')], flags: 64 });
      }

      try {
        const hub = interaction.guild.channels.cache.get(hubChannelId);
        if (hub) await hub.delete('NightFall — Voice Creator removed');
      } catch {}

      const { setSetting } = require('../../database/db');
      setSetting('hub_channel_id', '');
      setSetting('hub_category_id', '');
      hubChannelId = null;

      await interaction.reply({ embeds: [successEmbed('Système de salons vocaux temporaires supprimé.')] });
    }
  },
};
