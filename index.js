require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Events
} = require("discord.js");

// ===== 設定 =====
const TOKEN = process.env.TOKEN;

const TARGET_CHANNEL_ID = "1486824226043330653";
const CHECK_CHANNEL_ID = "1486830026623156497";

const SKILL_CHANNEL_ID = "1486824346843611236";
const ABUSE_CHANNEL_ID = "1486824403462258708";
const BUILD_CHANNEL_ID = "1486824419333509301";
const OCR_CHANNEL_ID = "1486947934342873219";

// ===== Bot =====
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.once(Events.ClientReady, () => {
  console.log(`ログインしました: ${client.user.tag}`);
});

// ===== 理由待ち =====
const waitingReason = new Map();

// ===== 無限検索 =====
const searchAllMessages = async (channel, keyword, label) => {
  let lastId = null;
  let results = [];

  while (true) {
    const options = { limit: 100 };
    if (lastId) options.before = lastId;

    const messages = await channel.messages.fetch(options);
    if (messages.size === 0) break;

    for (const msg of messages.values()) {
      if (msg.content.includes(keyword)) {
        const reasonMatch = msg.content.match(/理由:\s*(.*)/);
        const reason = reasonMatch ? reasonMatch[1] : "不明";

        results.push({
          content: keyword,
          label,
          reason
        });
      }
    }

    lastId = messages.last().id;
  }

  return results;
};

// ===== メッセージ監視 =====
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;

  // ===== 理由入力処理（1分制限） =====
  if (waitingReason.has(message.author.id)) {

    const data = waitingReason.get(message.author.id);

    const LIMIT = 1 * 60 * 1000;

    if (Date.now() - data.time > LIMIT) {
      waitingReason.delete(message.author.id);

      const reply = await message.reply("⏰ 時間切れです（1分）");

      setTimeout(() => {
        message.delete().catch(() => {});
        reply.delete().catch(() => {});
      }, 60000);

      return;
    }

    waitingReason.delete(message.author.id);

    const targetChannel = await client.channels.fetch(data.channelId);

    // ★重複チェック削除（そのまま登録）
    await targetChannel.send(
      `📌メモ\n送信者: ${data.userTag}\n内容: ${data.content}\n理由: ${message.content}`
    );

    // ★成功メッセージ変更
    const reply = await message.reply("登録を完了しました");

    setTimeout(() => {
      message.delete().catch(() => {});
      reply.delete().catch(() => {});
    }, 60000);

    return;
  }

  // ===== 罪状チャンネル =====
  if (message.channel.id === TARGET_CHANNEL_ID) {

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`skill_${message.id}`)
        .setLabel("スキル")
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId(`abuse_${message.id}`)
        .setLabel("暴言")
        .setStyle(ButtonStyle.Danger),

      new ButtonBuilder()
        .setCustomId(`build_${message.id}`)
        .setLabel("ビルド")
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId(`cancel_${message.id}`)
        .setLabel("キャンセル")
        .setStyle(ButtonStyle.Secondary)
    );

    await message.reply({
      content: "どのメモに分類しますか？",
      components: [row]
    });

    setTimeout(() => {
      message.delete().catch(() => {});
    }, 60000);
  }

  // ===== 確認チャンネル =====
  if (message.channel.id === CHECK_CHANNEL_ID) {

    const keyword = message.content;

    const skillChannel = await client.channels.fetch(SKILL_CHANNEL_ID);
    const abuseChannel = await client.channels.fetch(ABUSE_CHANNEL_ID);
    const buildChannel = await client.channels.fetch(BUILD_CHANNEL_ID);

    const results = [
      ...(await searchAllMessages(skillChannel, keyword, "スキル")),
      ...(await searchAllMessages(abuseChannel, keyword, "暴言")),
      ...(await searchAllMessages(buildChannel, keyword, "ビルド"))
    ];

    if (results.length === 0) {
      await message.reply(`メモ無：${keyword}`);
      return;
    }

    let text = "メモ有：\n";

    results.forEach((r, i) => {
      text += `${i + 1}. ${r.content}（${r.label}）\n理由: ${r.reason}\n\n`;
    });

    await message.reply(text);
  }
});

// ===== ボタン処理 =====
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isButton()) return;

  const [type, messageId] = interaction.customId.split("_");

  if (type === "cancel") {
    await interaction.reply({
      content: "キャンセルしました",
      ephemeral: true
    });
    return;
  }

  const originalMessage = await interaction.channel.messages.fetch(messageId);

  let channelId;

  if (type === "skill") channelId = SKILL_CHANNEL_ID;
  if (type === "abuse") channelId = ABUSE_CHANNEL_ID;
  if (type === "build") channelId = BUILD_CHANNEL_ID;

  waitingReason.set(interaction.user.id, {
    content: originalMessage.content,
    channelId: channelId,
    userTag: originalMessage.author.tag,
    time: Date.now()
  });

  await interaction.reply({
    content: "理由を入力してください（1分以内）",
    ephemeral: true
  });
});

  // ===== OCR専用チャンネル =====
  if (message.channel.id === OCR_CHANNEL_ID) {

    if (message.attachments.size === 0) return;

    const attachment = message.attachments.first();

    try {
      const text = await extractTextFromImage(attachment.url);

      await message.reply(`📄 OCR結果:\n${text}`);

    } catch (err) {
      console.error(err);
      await message.reply("❌ OCRエラーが発生しました");
    }

    return; // ★他の処理に影響させない
  }

// ===== ログイン =====
client.login(TOKEN);
