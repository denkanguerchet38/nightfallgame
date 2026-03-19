const { EmbedBuilder } = require('discord.js');
const config = require('../config.json');

function nightfallEmbed() {
  return new EmbedBuilder()
    .setColor(config.embedColor)
    .setFooter({ text: config.footerText })
    .setTimestamp();
}

function successEmbed(description) {
  return new EmbedBuilder()
    .setColor('#2ECC71')
    .setDescription(`✅ ${description}`)
    .setFooter({ text: config.footerText })
    .setTimestamp();
}

function errorEmbed(description) {
  return new EmbedBuilder()
    .setColor('#E74C3C')
    .setDescription(`❌ ${description}`)
    .setFooter({ text: config.footerText })
    .setTimestamp();
}

module.exports = { nightfallEmbed, successEmbed, errorEmbed };
