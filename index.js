const { Client, GatewayIntentBits } = require("discord.js");
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  NoSubscriberBehavior,
  StreamType
} = require("@discordjs/voice");

const ffmpegPath = require("ffmpeg-static");
const { spawn } = require("child_process");
const express = require("express");

// ================= CONFIG =================
const TOKEN = process.env.TOKEN;

const STATIONS = {
  lofi: "https://stream.zeno.fm/f3wvbbqmdg8uv",
  chill: "https://stream.zeno.fm/8wv4q2kmdg8uv",
  jazz: "https://stream.zeno.fm/0r0xa792kwzuv"
};

let currentStation = "lofi";
let volume = 0.5;

let connection = null;
let player = null;

// ================= DISCORD =================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.on("clientReady", () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// ================= COMMANDS =================
client.on("messageCreate", async (msg) => {
  if (msg.content === "!join") {
    if (!msg.member.voice.channel)
      return msg.reply("Join a VC first");

    connection = joinVoiceChannel({
      channelId: msg.member.voice.channel.id,
      guildId: msg.guild.id,
      adapterCreator: msg.guild.voiceAdapterCreator
    });

    connection.on("stateChange", (oldState, newState) => {
      console.log(`VC state: ${oldState.status} -> ${newState.status}`);
    });

    startStream();
    msg.reply("🎧 Streaming started");
  }

  if (msg.content === "!leave") {
    connection?.destroy();
    connection = null;
    msg.reply("👋 Left VC");
  }

  if (msg.content.startsWith("!volume")) {
    const v = parseFloat(msg.content.split(" ")[1]);
    if (isNaN(v)) return msg.reply("Use 0–1");

    volume = Math.max(0, Math.min(1, v));
    msg.reply(`🔊 Volume set to ${volume}`);
  }

  if (msg.content.startsWith("!station")) {
    const s = msg.content.split(" ")[1];
    if (!STATIONS[s]) return msg.reply("Stations: lofi, chill, jazz");

    currentStation = s;
    restartStream();
    msg.reply(`📻 Switched to ${s}`);
  }
});

// ================= STREAM =================
function startStream() {
  if (!connection) return;

  if (player) {
    try { player.stop(); } catch {}
  }

  player = createAudioPlayer({
    behaviors: {
      noSubscriber: NoSubscriberBehavior.Play
    }
  });

  const url = STATIONS[currentStation];
  console.log("Starting stream:", url);

  const ffmpeg = spawn(ffmpegPath, [
    "-reconnect", "1",
    "-reconnect_streamed", "1",
    "-reconnect_delay_max", "5",
    "-loglevel", "error",
    "-i", url,
    "-vn",
    "-f", "opus",
    "-ar", "48000",
    "-ac", "2",
    "pipe:1"
  ]);

  ffmpeg.stderr.on("data", (data) => {
    console.log("FFmpeg:", data.toString());
  });

  ffmpeg.on("error", (err) => {
    console.error("FFmpeg error:", err);
  });

  const resource = createAudioResource(ffmpeg.stdout, {
    inputType: StreamType.Opus
  });

  player.play(resource);
  connection.subscribe(player);

  let restarting = false;

  player.on(AudioPlayerStatus.Idle, () => {
    if (restarting) return;
    restarting = true;

    console.log("Stream ended. Restarting in 5s...");

    setTimeout(() => {
      restarting = false;
      startStream();
    }, 5000);
  });

  player.on("error", (err) => {
    console.error("Player error:", err);
  });
}

// ================= RESTART =================
function restartStream() {
  try {
    startStream();
  } catch (e) {
    console.error(e);
  }
}

// ================= WEB DASHBOARD =================
const app = express();
app.use(express.urlencoded({ extended: true }));

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

app.post("/station", (req, res) => {
  if (STATIONS[req.body.station]) {
    currentStation = req.body.station;
    restartStream();
  }
  res.redirect("/");
});

app.post("/volume", (req, res) => {
  const v = parseFloat(req.body.volume);
  if (!isNaN(v)) {
    volume = Math.max(0, Math.min(1, v));
  }
  res.redirect("/");
});

app.listen(process.env.PORT || 3000, () => {
  console.log("Web dashboard running");
});

// ================= LOGIN =================
client.login(TOKEN);
