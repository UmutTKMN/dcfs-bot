const {
  PermissionsBitField, ChannelType,
} = require('discord.js');

const fetchMessages = async (channel, lastKey) => {
  try {
    return await channel.messages.fetch({
      limit: 100,
      ...(lastKey && { before: lastKey }),
    });
  } catch (error) {
    console.error(`❌ Error fetching messages: ${error.message}`);
    return new Map(); // Return empty collection on error
  }
};

const getPurgeTime = () => (parseInt(
  process.env.FS25_BOT_PURGE_DISCORD_CHANNEL_AFTER_DAYS,
  10,
) || -1) * 24 * 60 * 60 * 1000;

const getPurgeLines = () => parseInt(
  process.env.FS25_BOT_PURGE_DISCORD_CHANNEL_AFTER_LINES,
  10,
) || -1;

const purge = {
  getNextPurge: () => {
    const now = new Date().getTime();
    const timeToday = now % (24 * 60 * 60 * 1000);
    const upcomingMidnight = now - timeToday + (24 * 60 * 60 * 1000);
    const purgeHour = Math.max(parseInt(process.env
      .FS25_BOT_PURGE_DISCORD_CHANNEL_HOUR, 10), 0) || 2;
    return upcomingMidnight + (purgeHour * 60 * 60 * 1000);
  },

  willPurge: () => (process.env
    .FS25_BOT_PURGE_DISCORD_CHANNEL_SERVER_NAME // if we have a server to purge
      // and we have a channel to purge
      && process.env.FS25_BOT_PURGE_DISCORD_CHANNEL_NAME
      // and we don't have a posting server name, or we do and it matches the purge server name
      && (!process.env.FS25_BOT_DISCORD_SERVER_NAME
          || process.env.FS25_BOT_PURGE_DISCORD_CHANNEL_SERVER_NAME
          === process.env.FS25_BOT_DISCORD_SERVER_NAME)
      // and we don't have a posting channel name, or we do and it matches the purge channel name
      && (!process.env.FS25_BOT_DISCORD_CHANNEL_NAME
        || process.env.FS25_BOT_PURGE_DISCORD_CHANNEL_NAME
        === process.env.FS25_BOT_DISCORD_CHANNEL_NAME))
      // and we have a time or lines to purge
      && (getPurgeTime() >= 0 || getPurgeLines() >= 0),

  purgeOldMessages: async (client) => {
    if (!client) {
      return;
    }

    try {
      const channels = client.channels.cache.filter((channel) => (
      // if the server name matches
        channel.guild?.name === process.env.FS25_BOT_PURGE_DISCORD_CHANNEL_SERVER_NAME
          // and the channel name matches
          && channel.name === process.env.FS25_BOT_PURGE_DISCORD_CHANNEL_NAME)
          // channel is a text channel
          && channel.type === ChannelType.GuildText
          // we have permission to view
          && channel.guild.members.me?.permissionsIn(channel)
            .has(PermissionsBitField.Flags.ViewChannel));

      if (channels.size === 1) {
        const now = new Date().getTime();
        const purgeTime = getPurgeTime();
        const purgeLines = getPurgeLines();

        // there will only be one
        channels.forEach(async (channel) => {
          try {
            const botUserId = channel.guild.members.me.user.id;

            let messages = [];
            let lastKey;
            let fetchAttempts = 0;
            const MAX_FETCH_ATTEMPTS = 5;

            while (fetchAttempts < MAX_FETCH_ATTEMPTS) {
              // eslint-disable-next-line no-await-in-loop
              const fetchedMessages = await fetchMessages(channel, lastKey);
              if (fetchedMessages.size === 0) {
                break;
              }
              messages = messages.concat(Array.from(fetchedMessages.values()));
              lastKey = fetchedMessages.lastKey();
              fetchAttempts += 1;
            }

            // bot messages, ensure sorted by newest first
            const botMessages = messages.filter((message) => message.author?.bot
                && message.author.id === botUserId)
              .sort((a, b) => b.createdTimestamp - a.createdTimestamp);

            const botMessagesToPurge = botMessages
              .filter((message, index) => {
                // if purging by line and index is equal or greater
                if (purgeLines >= 0 && index >= purgeLines) {
                  return true;
                }

                // if purging by created time and message is older
                if (purgeTime >= 0 && message.createdTimestamp < (now - purgeTime)) {
                  return true;
                }

                return false;
              });

            if (botMessagesToPurge.length > 0) {
              console.log(`Purging ${botMessagesToPurge.length} of ${botMessages.length} messages...`);

              // Use Promise.allSettled to handle message deletion without crashing if some fail
              const deletionPromises = botMessagesToPurge.map(message => 
                message.delete().catch(err => {
                  console.error(`Failed to delete message ID ${message.id}: ${err.message}`);
                  return null; // Return null for failed deletions
                })
              );
              
              await Promise.allSettled(deletionPromises);
              console.log('Purge completed');
            }
          } catch (err) {
            console.error(`Error during channel purge process: ${err.message}`);
          }
        });
      } else if (channels.size > 1) {
        console.warn('Not purging. Ambiguous server/channel.', channels.size);
      }
    } catch (err) {
      console.error(`❌ Critical purge error: ${err.message}`);
    }
  },
};

module.exports = purge;
