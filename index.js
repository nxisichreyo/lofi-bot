const { Client, GatewayIntentBits } = require("discord.js");
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, NoSubscriberBehavior, entersState, VoiceConnectionStatus } = require("@discordjs/voice");
const prism = require("prism-media");
const { spawn } = require("child_process");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// 🔥 Lofi stream (reliable radio stream)
const STREAM_URL = "https://stream.zeno.fm/f3wvbbqmdg8uv";

let connection;
let player;

client.on("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// 🔊 join command
client.on("messageCreate", async (msg) => {
  if (msg.content === "!join") {
    if (!msg.member.voice.channel) return msg.reply("Join a VC first");

    connection = joinVoiceChannel({
      channelId: msg.member.voice.channel.id,
      guildId: msg.guild.id,
      adapterCreator: msg.guild.voiceAdapterCreator
    });

    startStream();
    msg.reply("🎧 Playing lofi 24/7...");
  }

  if (msg.content === "!leave") {
    connection?.destroy();
    msg.reply("👋 Left VC");
  }
});

// 🎵 Start streaming
function startStream() {
  player = createAudioPlayer({
    behaviors: {
      noSubscriber: NoSubscriberBehavior.Play
    }
  });

  const ffmpeg = spawn("ffmpeg", [
    "-reconnect", "1",
    "-reconnect_streamed", "1",
    "-reconnect_delay_max", "5",
    "-i", STREAM_URL,
    "-analyzeduration", "0",
    "-loglevel", "0",
    "-f", "s16le",
    "-ar", "48000",
    "-ac", "2",
    "pipe:1"
  ]);

  const resource = createAudioResource(ffmpeg.stdout, {
    inputType: "arbitrary"
  });

  player.play(resource);
  connection.subscribe(player);

  // 🔁 auto restart if stops
  player.on(AudioPlayerStatus.Idle, () => {
    console.log("Restarting stream...");
    startStream();
  });
}

// 💀 auto reconnect
client.on("voiceStateUpdate", async () => {
  if (connection) {
    try {
      await entersState(connection, VoiceConnectionStatus.Ready, 5000);
    } catch {
      connection.destroy();
      connection = null;
    }
  }
});

client.login(process.env.TOKEN);