const fs = require('fs');
const path = require('path');
const { Client, Collection, GatewayIntentBits, Events } = require('discord.js');
require('dotenv-flow').config({ silent: true });

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.commands = new Collection();

// Komutları yükle
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));
  client.commands.set(command.data.name, command);
}

// Slash komutlarını Discord API'ye yükle
const { REST, Routes } = require('discord.js');
const rest = new REST({ version: '10' }).setToken(process.env.FS25_BOT_DISCORD_TOKEN);

(async () => {
  try {
    const commands = [...client.commands.values()].map(cmd => cmd.data.toJSON());
    await rest.put(
      Routes.applicationCommands(process.env.FS25_BOT_CLIENT_ID),
      { body: commands },
    );
    console.log('✅ Slash komutları başarıyla yüklendi.');
  } catch (error) {
    console.error('❌ Slash komutları yüklenirken hata:', error);
  }
})();

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const command = client.commands.get(interaction.commandName);
  if (!command) return;
  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(error);
    await interaction.reply({ content: 'Komut çalıştırılırken bir hata oluştu.', ephemeral: true });
  }
});

client.once(Events.ClientReady, () => {
  console.log(`Hazır: ${client.user.tag}`);
});

client.login(process.env.FS25_BOT_DISCORD_TOKEN);