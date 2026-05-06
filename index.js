const { Client, GatewayIntentBits } = require("discord.js");
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  NoSubscriberBehavior,
  StreamType
} = require("@discordjs/voice");

const prism = require("prism-media");
const ffmpegPath = require("ffmpeg-static");
const { spawn } = require("child_process");
const express = require("express");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const app = express();
app.use(express.json());

// 🌐 WEB DASHBOARD (basic)
let currentStation = "lofi";
let volume = 0.5;

app.get("/", (req, res) => {
  res.send(`
    <h1>Lofi Bot Dashboard</h1>
    <p>Station: ${currentStation}</p>
    <p>Volume: ${volume}</p>

    <form method="POST" action="/station">
      <input name="station" placeholder="lofi / chill / jazz"/>
      <button>Change Station</button>
    </form>

    <form method="POST" action="/volume">
      <input name="volume" placeholder="0.0 - 1.0"/>
      <button>Set Volume</button>
    </form>
  `);
});

app.post("/station", express.urlencoded({ extended: true }), (req, res) => {
  currentStation = req.body.station;
  restartStream();
  res.redirect("/");
});

app.post("/volume", express.urlencoded({ extended: true }), (req, res) => {
  volume = Math.max(0, Math.min(1, parseFloat(req.body.volume)));
  restartStream();
  res.redirect("/");
});

// Railway port
app.listen(process.env.PORT || 3000, () => {
  console.log("Web dashboard running");
});

// 🎧 Stations
const STATIONS = {
  lofi: "https://stream.zeno.fm/f3wvbbqmdg8uv",
  chill: "https://stream.zeno.fm/8wv4q2kmdg8uv",
  jazz: "https://stream.zeno.fm/0r0xa792kwzuv"
};

let connection;
let player;

client.on("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// 🎮 Commands
client.on("messageCreate", async (msg) => {
  if (msg.content === "!join") {
    if (!msg.member.voice.channel)
      return msg.reply("Join a VC first");

    connection = joinVoiceChannel({
      channelId: msg.member.voice.channel.id,
      guildId: msg.guild.id,
      adapterCreator: msg.guild.voiceAdapterCreator
    });

    startStream();
    msg.reply("🎧 Lofi started");
  }

  if (msg.content.startsWith("!volume")) {
    const v = parseFloat(msg.content.split(" ")[1]);
    if (isNaN(v)) return msg.reply("Give number 0–1");

    volume = Math.max(0, Math.min(1, v));
    restartStream();
    msg.reply(`🔊 Volume set to ${volume}`);
  }

  if (msg.content.startsWith("!station")) {
    const s = msg.content.split(" ")[1];
    if (!STATIONS[s]) return msg.reply("Stations: lofi, chill, jazz");

    currentStation = s;
    restartStream();
    msg.reply(`📻 Switched to ${s}`);
  }

  if (msg.content === "!leave") {
    connection?.destroy();
    msg.reply("👋 Left VC");
  }
});

// 🔁 Start stream (FIXED)
function startStream() {
  if (!connection) return;

  player = createAudioPlayer({
    behaviors: {
      noSubscriber: NoSubscriberBehavior.Play
    }
  });

  const stream = spawn(ffmpegPath, [
    "-reconnect", "1",
    "-reconnect_streamed", "1",
    "-reconnect_delay_max", "5",
    "-i", STATIONS[currentStation],
    "-f", "s16le",
    "-ar", "48000",
    "-ac", "2",
    "pipe:1"
  ]);

  const resource = createAudioResource(stream.stdout, {
    inputType: StreamType.Raw,
    inlineVolume: true
  });

  resource.volume.setVolume(volume);

  player.play(resource);
  connection.subscribe(player);

  player.on(AudioPlayerStatus.Idle, () => {
    console.log("Restarting...");
    startStream();
  });

  stream.stderr.on("data", () => {}); // silence ffmpeg spam
}

// 🔄 Restart helper
function restartStream() {
  try {
    player?.stop();
    startStream();
  } catch {}
}

client.login(process.env.TOKEN);
