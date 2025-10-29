require("dotenv").config();
const TelegramBot = require('node-telegram-bot-api');

async function getBotInfo() {
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token || token === 'YOUR_TELEGRAM_BOT_TOKEN_HERE') {
    console.log("❌ Telegram bot token not configured");
    process.exit(1);
  }

  try {
    const bot = new TelegramBot(token);
    const botInfo = await bot.getMe();

    console.log("\n" + "=".repeat(60));
    console.log("🤖 TELEGRAM BOT INFORMATION");
    console.log("=".repeat(60));
    console.log(`Bot Name: ${botInfo.first_name}`);
    console.log(`Username: @${botInfo.username}`);
    console.log(`Bot ID: ${botInfo.id}`);
    console.log(`Can Join Groups: ${botInfo.can_join_groups ? "✅ Yes" : "❌ No"}`);
    console.log(`Can Read Messages: ${botInfo.can_read_all_group_messages ? "✅ Yes" : "❌ No"}`);
    console.log(`Supports Inline: ${botInfo.supports_inline_queries ? "✅ Yes" : "❌ No"}`);
    console.log("=".repeat(60));
    console.log("\n📱 SHARE WITH USERS:");
    console.log(`Direct Link: https://t.me/${botInfo.username}`);
    console.log(`Search in Telegram: @${botInfo.username}`);
    console.log("\n💡 Add this to your .env file:");
    console.log(`TELEGRAM_BOT_USERNAME=${botInfo.username}`);
    console.log(`TELEGRAM_BOT_NAME=${botInfo.first_name}`);
    console.log("\n");

    process.exit(0);
  } catch (error) {
    console.error("❌ Error fetching bot info:", error.message);
    process.exit(1);
  }
}

getBotInfo();
