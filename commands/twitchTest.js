// commands/twitchtest.js
import { SlashCommandBuilder } from 'discord.js';
import { sendTwitchNotification, checkTwitchNow } from './twitchNotifier.js';

export const data = new SlashCommandBuilder()
  .setName('twitchtest')
  .setDescription('Twitch testing tools')
  .addSubcommand(sc =>
    sc.setName('notify')
      .setDescription('Send a test LIVE notification')
      .addStringOption(o => o.setName('login').setDescription('Twitch login').setRequired(false))
      .addStringOption(o => o.setName('title').setDescription('Custom title').setRequired(false))
  )
  .addSubcommand(sc =>
    sc.setName('poll')
      .setDescription('Run a Twitch poll cycle right now (no fake message)')
  );

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  if (sub === 'notify') {
    await interaction.deferReply({ ephemeral: true });
    const login = interaction.options.getString('login') || 'TestStreamer';
    const title = interaction.options.getString('title') || 'Test Stream — Just Chatting 💬';
    try {
      await sendTwitchNotification(interaction.client, { user_name: login, title });
      return interaction.editReply('✅ Test notification sent.');
    } catch (e) {
      return interaction.editReply(`❌ Failed: ${e.message}`);
    }
  }
  if (sub === 'poll') {
    await interaction.deferReply({ ephemeral: true });
    try {
      await checkTwitchNow(interaction.client);
      return interaction.editReply('🔁 Poll triggered.');
    } catch (e) {
      return interaction.editReply(`❌ Failed: ${e.message}`);
    }
  }
  return interaction.reply({ content: 'Unknown subcommand', ephemeral: true });
}
