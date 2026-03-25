const { ChannelType, PermissionsBitField } = require('discord.js');
const { nightfallEmbed } = require('../utils/embeds');
const { getSetting } = require('../database/db');

// Importer les données partagées du module voicecreator
let voiceCreator = null;
function getVC() {
  if (!voiceCreator) {
    voiceCreator = require('../commands/games/voicecreator');
    // Charger le hub depuis la BDD au premier appel
    const saved = getSetting('hub_channel_id');
    if (saved) voiceCreator.setHubChannelId(saved);
  }
  return voiceCreator;
}

module.exports = {
  name: 'voiceStateUpdate',
  async execute(oldState, newState) {
    const vc = getVC();
    const hubId = vc.getHubChannelId();

    // ========== REJOINT LE HUB -> CRÉER UN SALON ==========
    if (newState.channelId === hubId && newState.channelId !== oldState.channelId) {
      const member = newState.member;
      const guild = newState.guild;

      // Déterminer la catégorie
      const categoryId = getSetting('hub_category_id');
      const hubChannel = guild.channels.cache.get(hubId);
      const parentId = categoryId || hubChannel?.parentId || null;

      try {
        // Créer le salon vocal temporaire
        const tempChannel = await guild.channels.create({
          name: `🔊 Salon de ${member.displayName}`,
          type: ChannelType.GuildVoice,
          parent: parentId,
          permissionOverwrites: [
            {
              id: member.id,
              allow: [
                PermissionsBitField.Flags.ManageChannels,
                PermissionsBitField.Flags.MoveMembers,
                PermissionsBitField.Flags.MuteMembers,
                PermissionsBitField.Flags.DeafenMembers,
              ],
            },
          ],
          reason: `NightFall — Salon temporaire pour ${member.user.tag}`,
        });

        // Tracker le salon
        vc.tempChannels.add(tempChannel.id);

        // Déplacer le membre
        await member.voice.setChannel(tempChannel, 'NightFall — Déplacé vers salon temporaire');

        // Envoyer le message dans le chat du salon vocal
        try {
          await tempChannel.send({
            content: `${member}`,
            embeds: [
              nightfallEmbed()
                .setTitle('🔊 Ton salon vocal a été créé !')
                .setDescription(
                  `Bienvenue ${member} ! Voici tes permissions :\n\n` +
                  `🔧 **Renommer** — clic droit sur le salon > Modifier le salon\n` +
                  `👥 **Déplacer** des membres\n` +
                  `🔇 **Mute** des membres\n` +
                  `🔒 Pour **fermer** ton salon, limite les utilisateurs dans les paramètres\n\n` +
                  `Le salon sera **supprimé automatiquement** quand tout le monde sera parti.`
                ),
            ],
          });
        } catch {
          // Pas les perms pour envoyer
        }
      } catch (err) {
        console.error('[NightFall] Erreur création salon temp:', err.message);
      }
    }

    // ========== NETTOYAGE — SALON TEMP VIDE -> SUPPRIMER ==========
    if (oldState.channelId && oldState.channelId !== newState.channelId) {
      if (vc.tempChannels.has(oldState.channelId)) {
        const oldChannel = oldState.guild.channels.cache.get(oldState.channelId);
        if (oldChannel && oldChannel.members.size === 0) {
          vc.tempChannels.delete(oldState.channelId);
          try {
            await oldChannel.delete('NightFall — Salon temporaire vide');
          } catch (err) {
            console.error('[NightFall] Erreur suppression salon temp:', err.message);
          }
        }
      }
    }
  },
};
