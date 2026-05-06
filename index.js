const { Client, GatewayIntentBits } = require("discord.js");
const { Player } = require("discord-player");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const player = new Player(client);

// Lavalink-less fallback (YouTube works fine)
player.extractors.loadDefault();

client.on("messageCreate", async (msg) => {
  if (msg.content === "!play") {
    if (!msg.member.voice.channel)
      return msg.reply("Join a VC first");

    const queue = player.nodes.create(msg.guild, {
      metadata: msg.channel
    });

    if (!queue.connection)
      await queue.connect(msg.member.voice.channel);

    const track = await player.search(
      "lofi hip hop radio",
      { requestedBy: msg.author }
    ).then(x => x.tracks[0]);

    queue.addTrack(track);
    queue.node.play();

    msg.reply("🎧 Playing lofi (stable mode)");
  }

  if (msg.content === "!stop") {
    const queue = player.nodes.get(msg.guild.id);
    queue?.delete();
    msg.reply("Stopped");
  }
});

client.login(process.env.TOKEN);
