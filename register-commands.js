import 'dotenv/config';
import { REST, Routes, SlashCommandBuilder } from 'discord.js';

const commands = [
  new SlashCommandBuilder()
    .setName('hello')
    .setDescription('Say hi')
    .toJSON()
];

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

const clientId = process.env.CLIENT_ID;   // set this in your host too
const guildId = process.env.GUILD_ID;     // optional: for fast dev in one server

(async () => {
  try {
    if (guildId) {
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
      console.log('✅ Registered guild commands');
    } else {
      await rest.put(Routes.applicationCommands(clientId), { body: commands });
      console.log('✅ Registered global commands');
    }
  } catch (e) {
    console.error('❌ Failed to register commands', e);
  }
})();
