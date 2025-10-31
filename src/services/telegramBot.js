const TelegramBot = require('node-telegram-bot-api');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Category = require('../models/Category');
const nlpParser = require('../utils/nlpParser');
const logger = require('../config/logger');
const crypto = require('crypto');
const Tesseract = require('tesseract.js');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const telegramService = require('./telegramService');
const cron = require('node-cron');
const voiceService = require('./voiceService');
const clarifaiService = require('./clarifaiService');

class TelegramBotService {
  constructor() {
    this.bot = null;
    this.isInitialized = false;
    // Store pending transactions for user confirmation
    this.pendingTransactions = new Map();
  }

  /**
   * Initialize the Telegram bot
   */
  async initialize() {
    const token = process.env.TELEGRAM_BOT_TOKEN;

    if (!token || token === 'YOUR_TELEGRAM_BOT_TOKEN_HERE') {
      logger.warn('Telegram bot token not configured. Bot will not start.');
      return;
    }

    try {
      this.bot = new TelegramBot(token, { polling: true });
      this.setupCommandHandlers();
      this.setupMessageHandlers();
      this.isInitialized = true;
      this.setupScheduledNotifications();
      logger.info('✅ Telegram bot initialized successfully');
      console.log('🤖 Telegram bot is running!');
    } catch (error) {
      logger.error('Failed to initialize Telegram bot:', error);
      console.error('❌ Telegram bot failed to start:', error.message);
    }
  }

  /**
   * Setup command handlers
   */
  setupCommandHandlers() {
    // Start command
    this.bot.onText(/\/start/, (msg) => this.handleStart(msg));

    // Link account command
    this.bot.onText(/\/link (.+)/, (msg, match) => this.handleLink(msg, match));

    // Add expense/income
    this.bot.onText(/\/add (.+)/, (msg, match) => this.handleAddExpense(msg, match[1]));
    this.bot.onText(/\/income (.+)/, (msg, match) => this.handleAddIncome(msg, match[1]));

    // Balance and reports
    this.bot.onText(/\/balance/, (msg) => this.handleBalance(msg));
    this.bot.onText(/\/recent/, (msg) => this.handleRecent(msg));
    this.bot.onText(/\/report/, (msg) => this.handleReport(msg));
    this.bot.onText(/\/categories/, (msg) => this.handleCategories(msg));

    // Settings
    this.bot.onText(/\/settings/, (msg) => this.handleSettings(msg));
    this.bot.onText(/\/notifications (.+)/, (msg, match) => this.handleNotifications(msg, match[1]));

    // Help
    this.bot.onText(/\/help/, (msg) => this.handleHelp(msg));

    // Unlink account
    this.bot.onText(/\/unlink/, (msg) => this.handleUnlink(msg));
  }

  /**
   * Setup message handlers
   */
  setupMessageHandlers() {
    // Handle text messages (quick expense logging)
    this.bot.on('message', async (msg) => {
      // Skip if it's a command
      if (msg.text && msg.text.startsWith('/')) return;

      // Skip if it's a photo with caption (handled separately)
      if (msg.photo) return;

      // Handle regular text messages as quick expenses
      if (msg.text) {
        await this.handleQuickExpense(msg);
      }
    });

    // Handle photos (receipts)
    this.bot.on('photo', (msg) => this.handlePhoto(msg));

    // Handle voice messages
    this.bot.on('voice', (msg) => this.handleVoice(msg));

    // Handle callback queries (confirmation buttons)
    this.bot.on('callback_query', (query) => this.handleCallbackQuery(query));
  }

  /**
   * Handle /start command
   */
  async handleStart(msg) {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id.toString();

    // Check if user is already linked
    const user = await User.findOne({ telegramId });

    if (user) {
      this.bot.sendMessage(chatId,
        `👋 Welcome back, ${user.name}!\n\n` +
        `Your account is already linked.\n\n` +
        `💡 Quick tips:\n` +
        `• Just type: "coffee 5" to add expense\n` +
        `• Use /balance to check your balance\n` +
        `• Use /help to see all commands`
      );
    } else {
      this.bot.sendMessage(chatId,
        `🤖 Welcome to Expense Tracker Bot!\n\n` +
        `To start tracking expenses, you need to link your account.\n\n` +
        `📱 Steps to link:\n` +
        `1. Go to your dashboard settings\n` +
        `2. Find the "Link Telegram" section\n` +
        `3. Click "Generate Link Code"\n` +
        `4. Come back and type: /link YOUR_CODE\n\n` +
        `❓ Need help? Type /help`
      );
    }
  }

  /**
   * Handle /link command
   */
  async handleLink(msg, match) {
    const chatId = msg.chat.id;
    const linkCode = match[1].trim().toUpperCase();

    try {
      const telegramData = {
        id: msg.from.id,
        username: msg.from.username,
        first_name: msg.from.first_name
      };

      const result = await telegramService.verifyLinkCode(linkCode, telegramData);

      if (!result.success) {
        this.bot.sendMessage(chatId,
          `❌ ${result.message}\n\n` +
          `Please generate a new code from your dashboard settings.`
        );
        return;
      }

      this.bot.sendMessage(chatId,
        `✅ Account linked successfully!\n\n` +
        `Welcome, ${result.user.name}! 🎉\n\n` +
        `You can now:\n` +
        `• Add expenses: Just type "coffee 5"\n` +
        `• Check balance: /balance\n` +
        `• View recent: /recent\n` +
        `• Get reports: /report\n\n` +
        `Type /help for all commands.`
      );

      logger.info(`Telegram account linked: ${result.user.email} -> ${telegramData.id}`);
    } catch (error) {
      logger.error('Error linking Telegram account:', error);
      this.bot.sendMessage(chatId, '❌ Error linking account. Please try again.');
    }
  }

  /**
   * Handle /add command
   */
  async handleAddExpense(msg, text) {
    const chatId = msg.chat.id;
    const user = await this.getLinkedUser(msg.from.id);

    if (!user) {
      this.sendNotLinkedMessage(chatId);
      return;
    }

    try {
      const parsed = nlpParser.parse(text);

      if (!nlpParser.isValid(parsed)) {
        this.bot.sendMessage(chatId,
          `❌ Couldn't understand the expense.\n\n` +
          `Examples:\n` +
          `• /add 50 groceries\n` +
          `• /add spent 45.50 on lunch\n` +
          `• /add coffee 5`
        );
        return;
      }

      const transaction = await this.createTransaction(user, {
        ...parsed,
        type: 'expense'
      });

      const balance = await this.calculateBalance(user._id);

      this.bot.sendMessage(chatId,
        `✅ Expense added!\n\n` +
        `💰 Amount: $${parsed.amount.toFixed(2)}\n` +
        `📁 Category: ${parsed.category}\n` +
        `📝 Note: ${parsed.description}\n\n` +
        `💵 Current Balance: $${balance.toFixed(2)}`
      );
    } catch (error) {
      logger.error('Error adding expense:', error);
      this.bot.sendMessage(chatId, '❌ Error adding expense. Please try again.');
    }
  }

  /**
   * Handle /income command
   */
  async handleAddIncome(msg, text) {
    const chatId = msg.chat.id;
    const user = await this.getLinkedUser(msg.from.id);

    if (!user) {
      this.sendNotLinkedMessage(chatId);
      return;
    }

    try {
      const parsed = nlpParser.parse(text);
      parsed.type = 'income'; // Override to income

      if (!nlpParser.isValid(parsed)) {
        this.bot.sendMessage(chatId,
          `❌ Couldn't understand the income.\n\n` +
          `Examples:\n` +
          `• /income 2000 salary\n` +
          `• /income received 500 bonus`
        );
        return;
      }

      const transaction = await this.createTransaction(user, parsed);
      const balance = await this.calculateBalance(user._id);

      this.bot.sendMessage(chatId,
        `✅ Income added!\n\n` +
        `💰 Amount: $${parsed.amount.toFixed(2)}\n` +
        `📁 Category: ${parsed.category}\n` +
        `📝 Note: ${parsed.description}\n\n` +
        `💵 Current Balance: $${balance.toFixed(2)}`
      );
    } catch (error) {
      logger.error('Error adding income:', error);
      this.bot.sendMessage(chatId, '❌ Error adding income. Please try again.');
    }
  }

  /**
   * Handle quick expense (plain text)
   */
  async handleQuickExpense(msg) {
    const chatId = msg.chat.id;
    const user = await this.getLinkedUser(msg.from.id);

    if (!user) return; // Silently ignore if not linked

    try {
      // Send "processing" message
      const processingMsg = await this.bot.sendMessage(chatId, '🤖 Understanding your message...');

      // Get user's categories for better AI suggestions
      const categories = await Category.find({ user: user._id });

      // Parse message with Clarifai AI
      const result = await clarifaiService.parseTransaction(msg.text, categories);

      // Delete processing message
      await this.bot.deleteMessage(chatId, processingMsg.message_id);

      if (!result.success) {
        // Try fallback to old parser for simple cases
        let parsed = nlpParser.parseQuickFormat(msg.text);
        if (!parsed || !nlpParser.isValid(parsed)) {
          parsed = nlpParser.parse(msg.text);
        }

        if (!nlpParser.isValid(parsed)) return; // Silently ignore invalid messages

        // Use old parser result
        const transaction = await this.createTransaction(user, parsed);
        const balance = await this.calculateBalance(user._id);

        this.bot.sendMessage(chatId,
          `✅ Expense logged!\n\n` +
          `💰 ৳${Math.abs(parsed.amount).toFixed(2)} - ${parsed.category}\n` +
          `💵 Balance: ৳${balance.toFixed(2)}`
        );
        return;
      }

      const { data } = result;

      // Check if valid transaction
      if (!data.valid) {
        return; // Silently ignore non-transaction messages
      }

      const { transactions } = data;

      if (transactions.length === 0) {
        return; // Silently ignore if no transactions found
      }

      // If single transaction with high confidence, auto-save
      if (transactions.length === 1) {
        const t = transactions[0];

        const transaction = await this.createTransaction(user, {
          amount: Math.abs(t.amount),
          type: t.type,
          category: t.category,
          description: t.description,
          date: t.date === 'today' ? new Date() : new Date(t.date)
        });

        const balance = await this.calculateBalance(user._id);

        const emoji = t.type === 'expense' ? '💸' : '💰';
        const symbol = t.currency === 'BDT' ? '৳' : t.currency === 'USD' ? '$' : '₹';

        this.bot.sendMessage(chatId,
          `✅ Transaction saved!\n\n` +
          `${emoji} ${symbol}${Math.abs(t.amount)} - ${t.description}\n` +
          `📁 ${t.category}\n` +
          `💵 Balance: ৳${balance.toFixed(2)}\n\n` +
          `🤖 Powered by AI`
        );

        return;
      }

      // Multiple transactions - show confirmation
      await this.showTransactionConfirmation(chatId, user._id, transactions);

    } catch (error) {
      logger.error('Error handling quick expense:', error);
      // Silently fail for user experience
    }
  }

  /**
   * Handle /balance command
   */
  async handleBalance(msg) {
    const chatId = msg.chat.id;
    const user = await this.getLinkedUser(msg.from.id);

    if (!user) {
      this.sendNotLinkedMessage(chatId);
      return;
    }

    try {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

      const transactions = await Transaction.find({
        user: user._id,
        date: { $gte: startOfMonth, $lte: endOfMonth }
      });

      const income = transactions
        .filter(t => t.type === 'income')
        .reduce((sum, t) => sum + t.amount, 0);

      const expenses = transactions
        .filter(t => t.type === 'expense')
        .reduce((sum, t) => sum + t.amount, 0);

      const balance = income - expenses;
      const monthName = now.toLocaleString('default', { month: 'long', year: 'numeric' });

      this.bot.sendMessage(chatId,
        `💰 *Your Financial Summary*\n\n` +
        `📅 ${monthName}\n\n` +
        `📈 Income: $${income.toFixed(2)}\n` +
        `📉 Expenses: $${expenses.toFixed(2)}\n` +
        `💵 Balance: ${balance >= 0 ? '+' : ''}$${balance.toFixed(2)}\n\n` +
        `📊 Transactions: ${transactions.length}`,
        { parse_mode: 'Markdown' }
      );
    } catch (error) {
      logger.error('Error getting balance:', error);
      this.bot.sendMessage(chatId, '❌ Error getting balance. Please try again.');
    }
  }

  /**
   * Handle /recent command
   */
  async handleRecent(msg) {
    const chatId = msg.chat.id;
    const user = await this.getLinkedUser(msg.from.id);

    if (!user) {
      this.sendNotLinkedMessage(chatId);
      return;
    }

    try {
      const transactions = await Transaction.find({ user: user._id })
        .sort({ date: -1 })
        .limit(5);

      if (transactions.length === 0) {
        this.bot.sendMessage(chatId, '📊 No transactions yet.\n\nStart adding expenses!');
        return;
      }

      let message = '📊 *Last 5 Transactions:*\n\n';

      transactions.forEach((t, index) => {
        const icon = t.type === 'income' ? '📈' : '📉';
        const sign = t.type === 'income' ? '+' : '-';
        const date = new Date(t.date).toLocaleDateString();

        message += `${index + 1}. ${icon} *$${t.amount.toFixed(2)}* ${sign} ${t.category}\n`;
        message += `   ${t.description}\n`;
        message += `   _${date}_\n\n`;
      });

      this.bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    } catch (error) {
      logger.error('Error getting recent transactions:', error);
      this.bot.sendMessage(chatId, '❌ Error getting transactions. Please try again.');
    }
  }

  /**
   * Handle /report command
   */
  async handleReport(msg) {
    const chatId = msg.chat.id;
    const user = await this.getLinkedUser(msg.from.id);

    if (!user) {
      this.sendNotLinkedMessage(chatId);
      return;
    }

    this.bot.sendMessage(chatId,
      `📊 *Monthly Report*\n\n` +
      `Generating your detailed report...\n\n` +
      `View full report on web:\n` +
      `${process.env.APP_URL}/dashboard`,
      { parse_mode: 'Markdown' }
    );
  }

  /**
   * Handle /categories command
   */
  async handleCategories(msg) {
    const chatId = msg.chat.id;
    const user = await this.getLinkedUser(msg.from.id);

    if (!user) {
      this.sendNotLinkedMessage(chatId);
      return;
    }

    try {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      const transactions = await Transaction.find({
        user: user._id,
        type: 'expense',
        date: { $gte: startOfMonth }
      });

      // Group by category
      const categoryTotals = {};
      let total = 0;

      transactions.forEach(t => {
        categoryTotals[t.category] = (categoryTotals[t.category] || 0) + t.amount;
        total += t.amount;
      });

      // Sort by amount
      const sorted = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]);

      let message = '📊 *Spending by Category*\n\n';
      message += `📅 ${now.toLocaleString('default', { month: 'long' })}\n\n`;

      sorted.forEach(([category, amount]) => {
        const percentage = ((amount / total) * 100).toFixed(1);
        message += `📁 ${category}: $${amount.toFixed(2)} (${percentage}%)\n`;
      });

      message += `\n💰 Total: $${total.toFixed(2)}`;

      this.bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    } catch (error) {
      logger.error('Error getting categories:', error);
      this.bot.sendMessage(chatId, '❌ Error getting categories. Please try again.');
    }
  }

  /**
   * Handle /settings command
   */
  async handleSettings(msg) {
    const chatId = msg.chat.id;
    const user = await this.getLinkedUser(msg.from.id);

    if (!user) {
      this.sendNotLinkedMessage(chatId);
      return;
    }

    const settings = user.telegramNotifications || {};

    this.bot.sendMessage(chatId,
      `⚙️ *Your Settings*\n\n` +
      `🔔 Notifications: ${settings.enabled ? '✅ On' : '❌ Off'}\n` +
      `📅 Daily Summary: ${settings.dailySummary ? '✅ On' : '❌ Off'} (${settings.dailySummaryTime || '20:00'})\n` +
      `📊 Weekly Report: ${settings.weeklyReport ? '✅ On' : '❌ Off'}\n` +
      `⚠️ Budget Alerts: ${settings.budgetAlerts ? '✅ On' : '❌ Off'}\n\n` +
      `Change settings on web:\n` +
      `${process.env.APP_URL}/dashboard/settings`,
      { parse_mode: 'Markdown' }
    );
  }

  /**
   * Handle /help command
   */
  async handleHelp(msg) {
    const chatId = msg.chat.id;

    const help = `
🤖 *Expense Tracker Bot Help*

*💰 Adding Transactions:*
/add <amount> <category> - Add expense
/income <amount> <category> - Add income
Just type: "coffee 5" - Quick expense

*📊 Reports & Analytics:*
/balance - Current balance
/recent - Last 5 transactions
/report - Monthly report
/categories - Category breakdown

*⚙️ Settings:*
/settings - View settings
/unlink - Unlink account

*💡 Examples:*
• /add 50 groceries
• /add spent 45.50 on lunch
• /income 2000 salary
• coffee 5
• groceries 45

*📸 Other Features:*
• Send receipt photo - Auto extract
• Send voice message - Auto transcribe

Need more help? Visit:
${process.env.APP_URL}
    `;

    this.bot.sendMessage(chatId, help.trim(), { parse_mode: 'Markdown' });
  }

  /**
   * Handle /unlink command
   */
  async handleUnlink(msg) {
    const chatId = msg.chat.id;
    const user = await this.getLinkedUser(msg.from.id);

    if (!user) {
      this.sendNotLinkedMessage(chatId);
      return;
    }

    // Unlink account
    user.telegramId = undefined;
    user.telegramUsername = undefined;
    user.telegramFirstName = undefined;
    user.telegramLinkedAt = undefined;
    await user.save();

    this.bot.sendMessage(chatId,
      `✅ Account unlinked successfully.\n\n` +
      `You can link again anytime using /link command.`
    );

    logger.info(`Telegram account unlinked: ${user.email}`);
  }

  /**
   * Handle photo messages (receipts)
   */
  async handlePhoto(msg) {
    const chatId = msg.chat.id;
    const user = await this.getLinkedUser(msg.from.id);

    if (!user) return;

    try {
      // Send processing message
      const processingMsg = await this.bot.sendMessage(chatId, `📸 Processing receipt...\nExtracting text with OCR...`);

      // Get the highest quality photo
      const photo = msg.photo[msg.photo.length - 1];
      const fileId = photo.file_id;

      // Download the photo
      const file = await this.bot.getFile(fileId);
      const filePath = file.file_path;
      const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${filePath}`;

      // Download image to buffer
      const response = await axios.get(fileUrl, { responseType: 'arraybuffer' });
      const imageBuffer = Buffer.from(response.data);

      // Create temp directory if it doesn't exist
      const tempDir = path.join(__dirname, '../../temp');
      try {
        await fs.mkdir(tempDir, { recursive: true });
      } catch (error) {
        // Directory might already exist
      }

      // Save temporarily
      const tempFilePath = path.join(tempDir, `receipt_${Date.now()}.jpg`);
      await fs.writeFile(tempFilePath, imageBuffer);

      // Perform OCR
      const { data: { text } } = await Tesseract.recognize(
        tempFilePath,
        'eng',
        {
          logger: (m) => {
            if (m.status === 'recognizing text') {
              const progress = Math.round(m.progress * 100);
              if (progress % 20 === 0) {
                this.bot.editMessageText(
                  `📸 Processing receipt...\nOCR Progress: ${progress}%`,
                  { chat_id: chatId, message_id: processingMsg.message_id }
                ).catch(() => {});
              }
            }
          }
        }
      );

      // Clean up temp file
      await fs.unlink(tempFilePath).catch(() => {});

      // Extract amounts and text from OCR result
      const amounts = this.extractAmountsFromReceipt(text);

      if (amounts.length === 0) {
        await this.bot.editMessageText(
          `❌ Could not find any amounts in the receipt.\n\n` +
          `Extracted text:\n${text.substring(0, 200)}...\n\n` +
          `Please try:\n` +
          `• Taking a clearer photo\n` +
          `• Using better lighting\n` +
          `• Or enter manually with: /add 50 groceries`,
          { chat_id: chatId, message_id: processingMsg.message_id }
        );
        return;
      }

      // If we have a caption, use it as description
      const description = msg.caption || this.extractDescriptionFromReceipt(text);

      // Get the largest/total amount (usually the last or largest)
      const totalAmount = Math.max(...amounts);

      // Try to detect category from text
      const category = nlpParser.detectCategory(text.toLowerCase(), 'expense');

      // Create transaction
      const transaction = await this.createTransaction(user, {
        type: 'expense',
        amount: totalAmount,
        category: category,
        description: description || 'Receipt'
      });

      // Send success message
      await this.bot.editMessageText(
        `✅ Receipt processed!\n\n` +
        `💰 Amount: $${totalAmount.toFixed(2)}\n` +
        `📁 Category: ${category}\n` +
        `📝 Description: ${description || 'Receipt'}\n\n` +
        `${amounts.length > 1 ? `Found ${amounts.length} amounts: $${amounts.join(', $')}\n` : ''}` +
        `Transaction saved successfully!`,
        { chat_id: chatId, message_id: processingMsg.message_id }
      );

    } catch (error) {
      logger.error('Error processing receipt:', error);
      this.bot.sendMessage(chatId,
        `❌ Error processing receipt.\n\n` +
        `Please try:\n` +
        `• Taking a clearer photo\n` +
        `• Using better lighting\n` +
        `• Or enter manually with: /add 50 groceries`
      );
    }
  }

  /**
   * Extract amounts from receipt text
   */
  extractAmountsFromReceipt(text) {
    const amounts = [];

    // Match various price formats: $10.99, 10.99, $10, 10,99, etc.
    const patterns = [
      /\$?\s*(\d+[.,]\d{2})/g,  // Match $10.99, 10.99, 10,99
      /\$?\s*(\d+)\s*$/gm,      // Match whole dollar amounts at end of line
      /total[:\s]*\$?\s*(\d+[.,]?\d*)/gi,  // Match "Total: $10.99"
      /amount[:\s]*\$?\s*(\d+[.,]?\d*)/gi  // Match "Amount: $10.99"
    ];

    for (const pattern of patterns) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        const amount = parseFloat(match[1].replace(',', '.'));
        if (amount > 0 && amount < 100000) {  // Reasonable amount range
          amounts.push(amount);
        }
      }
    }

    // Remove duplicates and sort
    return [...new Set(amounts)].sort((a, b) => b - a);
  }

  /**
   * Extract description from receipt text
   */
  extractDescriptionFromReceipt(text) {
    // Try to find merchant/store name (usually first few lines)
    const lines = text.split('\n').filter(line => line.trim().length > 0);

    // Look for lines that might be merchant names (usually uppercase, short)
    for (const line of lines.slice(0, 5)) {
      const trimmed = line.trim();
      if (trimmed.length > 3 && trimmed.length < 50 && !trimmed.match(/\d{2,}/)) {
        return trimmed;
      }
    }

    return 'Receipt';
  }

  /**
   * Handle voice messages
   */
  async handleVoice(msg) {
    const chatId = msg.chat.id;
    const user = await this.getLinkedUser(msg.from.id);

    if (!user) return;

    try {
      // Send processing message
      const processingMsg = await this.bot.sendMessage(chatId, `🎤 Processing voice message...\n⏳ Transcribing audio...`);

      // Get voice file info
      const fileId = msg.voice.file_id;
      const file = await this.bot.getFile(fileId);
      const filePath = file.file_path;
      const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${filePath}`;

      // Download audio file
      const response = await axios.get(fileUrl, { responseType: 'arraybuffer' });
      const audioBuffer = Buffer.from(response.data);

      // Create temp directory if it doesn't exist
      const tempDir = path.join(__dirname, '../../uploads/temp');
      try {
        await fs.mkdir(tempDir, { recursive: true });
      } catch (error) {
        // Directory might already exist
      }

      // Save audio file temporarily
      const tempFilePath = path.join(tempDir, `voice_${Date.now()}.ogg`);
      await fs.writeFile(tempFilePath, audioBuffer);

      // Transcribe using Speechmatics (with Bangla support)
      const transcriptionResult = await voiceService.transcribeAudio(tempFilePath);
      

      // Clean up temp file
      await fs.unlink(tempFilePath).catch(() => {});

      if (!transcriptionResult.success) {
        await this.bot.editMessageText(
          `❌ Failed to transcribe voice message.\n\n` +
          `${transcriptionResult.error || 'Please try again or use text commands.'}\n\n` +
          `💡 Tip: Speak clearly and ensure good audio quality.`,
          { chat_id: chatId, message_id: processingMsg.message_id }
        );
        return;
      }

      const transcribedText = transcriptionResult.text;

      // Update processing message with transcription
      await this.bot.editMessageText(
        `🎤 Voice transcribed!\n\n` +
        `📝 _"${transcribedText}"_\n\n` +
        `🤖 AI is analyzing...`,
        { chat_id: chatId, message_id: processingMsg.message_id, parse_mode: 'Markdown' }
      );

      // Get user's categories for better AI suggestions
      const categories = await Category.find({ user: user._id });

      // Parse with Clarifai AI
      const aiResult = await clarifaiService.parseTransaction(transcribedText, categories);
      console.log(aiResult);

      // Delete processing message
      await this.bot.deleteMessage(chatId, processingMsg.message_id);

      if (!aiResult.success) {
        // Fallback to old parser
        let parsed = nlpParser.parseQuickFormat(transcribedText);

        // If not valid, try full NLP parse
        if (!parsed || !nlpParser.isValid(parsed)) {
          parsed = nlpParser.parse(transcribedText);
        }

        // If still not valid, send error
        if (!nlpParser.isValid(parsed)) {
          this.bot.sendMessage(chatId,
            `🎤 Voice transcribed!\n\n` +
            `📝 _"${transcribedText}"_\n\n` +
            `❌ Couldn't understand the expense format.\n\n` +
            `💡 Try saying something like:\n` +
            `• "Coffee 5"\n` +
            `• "Spent 50 on groceries"\n` +
            `• "Lunch 25 dollars"`,
            { parse_mode: 'Markdown' }
          );
          return;
        }

        // Create transaction using old parser result
        const transaction = await this.createTransaction(user, parsed);
        const balance = await this.calculateBalance(user._id);

        // Send success message
        this.bot.sendMessage(chatId,
          `✅ Voice expense added!\n\n` +
          `🎤 Transcribed: _"${transcribedText}"_\n\n` +
          `💰 Amount: $${parsed.amount.toFixed(2)}\n` +
          `📁 Category: ${parsed.category}\n` +
          `📝 Note: ${parsed.description}\n\n` +
          `💵 Current Balance: $${balance.toFixed(2)}`,
          { parse_mode: 'Markdown' }
        );

        logger.info(`Voice expense added via Telegram (fallback): ${user.email} - $${parsed.amount} (${transcriptionResult.audioSeconds}s audio)`);
        return;
      }

      // AI parsing succeeded
      const { data } = aiResult;

      // Check if valid transaction
      if (!data.valid) {
        return; // Silently ignore non-transaction voice messages
      }

      const { transactions } = data;

      if (transactions.length === 0) {
        return; // Silently ignore if no transactions found
      }

      // If single transaction, auto-save
      if (transactions.length === 1) {
        const t = transactions[0];

        const transaction = await this.createTransaction(user, {
          amount: Math.abs(t.amount),
          type: t.type,
          category: t.category,
          description: t.description,
          date: t.date === 'today' ? new Date() : new Date(t.date)
        });

        const balance = await this.calculateBalance(user._id);

        const emoji = t.type === 'expense' ? '💸' : '💰';
        const symbol = t.currency === 'BDT' ? '৳' : t.currency === 'USD' ? '$' : '₹';

        this.bot.sendMessage(chatId,
          `✅ Voice transaction saved!\n\n` +
          `🎤 _"${transcribedText}"_\n\n` +
          `${emoji} ${symbol}${Math.abs(t.amount)} - ${t.description}\n` +
          `📁 ${t.category}\n` +
          `💵 Balance: ৳${balance.toFixed(2)}\n\n` +
          
          { parse_mode: 'Markdown' }
        );

        logger.info(`Voice expense added via Telegram (AI): ${user.email} - ${symbol}${Math.abs(t.amount)} (${transcriptionResult.audioSeconds}s audio)`);
        return;
      }

      // Multiple transactions - show confirmation
      await this.showTransactionConfirmation(chatId, user._id, transactions);

    } catch (error) {
      logger.error('Error processing voice message:', error);

      if (error.message.includes('No available AssemblyAI accounts')) {
        this.bot.sendMessage(chatId,
          `❌ Voice transcription temporarily unavailable.\n\n` +
          `Please use text commands for now:\n` +
          `Example: /add 50 groceries`
        );
      } else {
        this.bot.sendMessage(chatId,
          `❌ Error processing voice message.\n\n` +
          `Please try again or use text commands:\n` +
          `Example: /add 50 groceries`
        );
      }
    }
  }

  // Helper methods

  /**
   * Get linked user
   */
  async getLinkedUser(telegramId) {
    return await User.findOne({ telegramId: telegramId.toString() });
  }

  /**
   * Send not linked message
   */
  sendNotLinkedMessage(chatId) {
    this.bot.sendMessage(chatId,
      `❌ Account not linked.\n\n` +
      `Please link your account first:\n` +
      `1. Go to dashboard settings\n` +
      `2. Generate link code\n` +
      `3. Type: /link YOUR_CODE`
    );
  }

  /**
   * Create transaction
   */
  async createTransaction(user, parsed) {
    const transaction = await Transaction.create({
      user: user._id,
      type: parsed.type,
      amount: parsed.amount,
      category: parsed.category,
      description: parsed.description,
      date: new Date()
    });

    return transaction;
  }

  /**
   * Calculate current balance
   */
  async calculateBalance(userId) {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const transactions = await Transaction.find({
      user: userId,
      date: { $gte: startOfMonth }
    });

    const income = transactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0);

    const expenses = transactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0);

    return income - expenses;
  }

  /**
   * Send notification to user
   */
  async sendNotification(userId, message) {
    try {
      const user = await User.findById(userId);

      if (!user || !user.telegramId) return;

      if (!user.telegramNotifications?.enabled) return;

      await this.bot.sendMessage(user.telegramId, message, { parse_mode: 'Markdown' });
    } catch (error) {
      logger.error('Error sending Telegram notification:', error);
    }
  }

  /**
   * Setup scheduled notifications (cron jobs)
   */
  setupScheduledNotifications() {
    if (!this.isInitialized) {
      logger.warn('Cannot setup scheduled notifications: Bot not initialized');
      return;
    }

    // Daily summary - runs every hour to check if any user needs their daily summary
    cron.schedule('0 * * * *', async () => {
      await this.sendDailySummaries();
    });

    // Weekly report - runs every Monday at 9 AM
    cron.schedule('0 9 * * 1', async () => {
      await this.sendWeeklyReports();
    });

    // Budget alerts - check every day at noon
    cron.schedule('0 12 * * *', async () => {
      await this.checkBudgetAlerts();
    });

    logger.info('✅ Telegram scheduled notifications set up successfully');
    console.log('📅 Telegram notifications scheduled: Daily summaries, Weekly reports & Budget alerts');
  }

  /**
   * Send daily summaries to all users who have it enabled
   */
  async sendDailySummaries() {
    try {
      const currentHour = new Date().getHours();
      const currentTime = `${currentHour.toString().padStart(2, '0')}:00`;

      // Find users who have daily summary enabled and it's their scheduled time
      const users = await User.find({
        telegramId: { $exists: true, $ne: null },
        'telegramNotifications.enabled': true,
        'telegramNotifications.dailySummary': true,
        'telegramNotifications.dailySummaryTime': currentTime
      });

      for (const user of users) {
        const summary = await this.generateDailySummary(user._id);
        await this.bot.sendMessage(user.telegramId, summary, { parse_mode: 'Markdown' });
      }

      if (users.length > 0) {
        logger.info(`Sent daily summaries to ${users.length} users`);
      }
    } catch (error) {
      logger.error('Error sending daily summaries:', error);
    }
  }

  /**
   * Send weekly reports to all users who have it enabled
   */
  async sendWeeklyReports() {
    try {
      // Find users who have weekly report enabled
      const users = await User.find({
        telegramId: { $exists: true, $ne: null },
        'telegramNotifications.enabled': true,
        'telegramNotifications.weeklyReport': true
      });

      for (const user of users) {
        const report = await this.generateWeeklyReport(user._id);
        await this.bot.sendMessage(user.telegramId, report, { parse_mode: 'Markdown' });
      }

      if (users.length > 0) {
        logger.info(`Sent weekly reports to ${users.length} users`);
      }
    } catch (error) {
      logger.error('Error sending weekly reports:', error);
    }
  }

  /**
   * Generate daily summary for a user
   */
  async generateDailySummary(userId) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const transactions = await Transaction.find({
      user: userId,
      date: { $gte: today }
    }).sort({ date: -1 });

    const income = transactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0);

    const expenses = transactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0);

    const balance = income - expenses;

    let summary = `📊 *Daily Summary - ${today.toLocaleDateString()}*\n\n`;

    if (transactions.length === 0) {
      summary += `No transactions today! 💤\n\n`;
      summary += `Track your expenses by typing something like "coffee 5" or use /add command.`;
    } else {
      summary += `💰 Income: $${income.toFixed(2)}\n`;
      summary += `💸 Expenses: $${expenses.toFixed(2)}\n`;
      summary += `${balance >= 0 ? '✅' : '⚠️'} Balance: $${balance.toFixed(2)}\n\n`;

      if (expenses > 0) {
        // Group by category
        const categoryTotals = {};
        transactions
          .filter(t => t.type === 'expense')
          .forEach(t => {
            categoryTotals[t.category] = (categoryTotals[t.category] || 0) + t.amount;
          });

        summary += `📁 *Top Categories:*\n`;
        Object.entries(categoryTotals)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .forEach(([category, amount]) => {
            summary += `  • ${category}: $${amount.toFixed(2)}\n`;
          });
      }

      summary += `\n📝 Total: ${transactions.length} transaction${transactions.length > 1 ? 's' : ''}`;
    }

    return summary;
  }

  /**
   * Generate weekly report for a user
   */
  async generateWeeklyReport(userId) {
    const today = new Date();
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

    const transactions = await Transaction.find({
      user: userId,
      date: { $gte: weekAgo }
    }).sort({ date: -1 });

    const income = transactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0);

    const expenses = transactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0);

    const balance = income - expenses;

    let report = `📈 *Weekly Report*\n`;
    report += `${weekAgo.toLocaleDateString()} - ${today.toLocaleDateString()}\n\n`;

    if (transactions.length === 0) {
      report += `No transactions this week! 💤\n\n`;
      report += `Start tracking your expenses with the bot to see your weekly insights.`;
    } else {
      report += `💰 Total Income: $${income.toFixed(2)}\n`;
      report += `💸 Total Expenses: $${expenses.toFixed(2)}\n`;
      report += `${balance >= 0 ? '✅' : '⚠️'} Net Balance: $${balance.toFixed(2)}\n\n`;

      // Daily average
      const avgDaily = expenses / 7;
      report += `📊 Average daily spending: $${avgDaily.toFixed(2)}\n\n`;

      // Category breakdown
      if (expenses > 0) {
        const categoryTotals = {};
        transactions
          .filter(t => t.type === 'expense')
          .forEach(t => {
            categoryTotals[t.category] = (categoryTotals[t.category] || 0) + t.amount;
          });

        report += `📁 *Expenses by Category:*\n`;
        Object.entries(categoryTotals)
          .sort((a, b) => b[1] - a[1])
          .forEach(([category, amount]) => {
            const percentage = (amount / expenses * 100).toFixed(1);
            report += `  • ${category}: $${amount.toFixed(2)} (${percentage}%)\n`;
          });
      }

      report += `\n📝 Total: ${transactions.length} transaction${transactions.length > 1 ? 's' : ''}`;
    }

    report += `\n\n💡 Keep up the good work tracking your finances! 💪`;

    return report;
  }

  /**
   * Check budget alerts for all users
   */
  async checkBudgetAlerts() {
    try {
      // Find users who have budget alerts enabled
      const users = await User.find({
        telegramId: { $exists: true, $ne: null },
        'telegramNotifications.enabled': true,
        'telegramNotifications.budgetAlerts': true
      });

      for (const user of users) {
        const alert = await this.checkUserBudget(user._id);
        if (alert) {
          await this.bot.sendMessage(user.telegramId, alert, { parse_mode: 'Markdown' });
        }
      }

      if (users.length > 0) {
        logger.info(`Checked budget alerts for ${users.length} users`);
      }
    } catch (error) {
      logger.error('Error checking budget alerts:', error);
    }
  }

  /**
   * Check budget status for a specific user
   */
  async checkUserBudget(userId) {
    try {
      const today = new Date();
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
      const daysPassed = today.getDate();
      const daysRemaining = daysInMonth - daysPassed;

      // Get all transactions for current month
      const transactions = await Transaction.find({
        user: userId,
        date: { $gte: startOfMonth }
      });

      const expenses = transactions
        .filter(t => t.type === 'expense')
        .reduce((sum, t) => sum + t.amount, 0);

      const income = transactions
        .filter(t => t.type === 'income')
        .reduce((sum, t) => sum + t.amount, 0);

      // Calculate daily average and projected spending
      const dailyAverage = expenses / daysPassed;
      const projectedMonthlyExpenses = dailyAverage * daysInMonth;

      // Alert if spending is unusually high (more than 80% of income with days remaining)
      if (income > 0) {
        const spendingPercentage = (expenses / income) * 100;

        if (spendingPercentage > 80 && daysRemaining > 5) {
          let alert = `⚠️ *Budget Alert*\n\n`;
          alert += `You've spent *${spendingPercentage.toFixed(1)}%* of your monthly income with *${daysRemaining} days* remaining!\n\n`;
          alert += `💸 Current expenses: $${expenses.toFixed(2)}\n`;
          alert += `💰 Monthly income: $${income.toFixed(2)}\n`;
          alert += `📊 Daily average: $${dailyAverage.toFixed(2)}\n`;
          alert += `📈 Projected: $${projectedMonthlyExpenses.toFixed(2)}\n\n`;
          alert += `💡 *Tip:* Try to reduce daily spending to $${((income - expenses) / daysRemaining).toFixed(2)} to stay within budget.`;
          return alert;
        }

        // Alert if projected spending exceeds income
        if (projectedMonthlyExpenses > income && spendingPercentage < 80) {
          let alert = `⚠️ *Spending Projection Alert*\n\n`;
          alert += `Based on your current spending rate, you're projected to spend *$${projectedMonthlyExpenses.toFixed(2)}* this month.\n\n`;
          alert += `💰 Your monthly income: $${income.toFixed(2)}\n`;
          alert += `📊 Daily average: $${dailyAverage.toFixed(2)}\n`;
          alert += `💸 Current expenses: $${expenses.toFixed(2)}\n\n`;
          alert += `💡 *Suggestion:* Reduce daily spending to $${(income / daysInMonth).toFixed(2)} to stay on track.`;
          return alert;
        }
      }

      // Alert if daily spending is significantly higher than recent average (spike detection)
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);

      const yesterdayExpenses = transactions
        .filter(t => t.type === 'expense' && t.date >= yesterday && t.date < today)
        .reduce((sum, t) => sum + t.amount, 0);

      if (yesterdayExpenses > dailyAverage * 2 && yesterdayExpenses > 50) {
        let alert = `📊 *Spending Spike Detected*\n\n`;
        alert += `Yesterday's spending (*$${yesterdayExpenses.toFixed(2)}*) was *${((yesterdayExpenses / dailyAverage) * 100).toFixed(0)}%* higher than your daily average!\n\n`;
        alert += `📊 Your daily average: $${dailyAverage.toFixed(2)}\n`;
        alert += `💸 Yesterday: $${yesterdayExpenses.toFixed(2)}\n\n`;
        alert += `💡 Keep track of these occasional high-spending days to better manage your budget.`;
        return alert;
      }

      return null; // No alert needed
    } catch (error) {
      logger.error('Error checking user budget:', error);
      return null;
    }
  }

  /**
   * Show transaction confirmation with buttons
   */
  async showTransactionConfirmation(chatId, userId, transactions) {
    try {
      // Create confirmation message
      let confirmMsg = `✅ I found ${transactions.length} transaction(s):\n\n`;

      transactions.forEach((t, index) => {
        const emoji = t.type === 'expense' ? '💸' : '💰';
        const symbol = t.currency === 'BDT' ? '৳' : t.currency === 'USD' ? '$' : '₹';

        confirmMsg += `${index + 1}. ${emoji} ${symbol}${Math.abs(t.amount)} - ${t.description}\n`;
        confirmMsg += `   📁 ${t.category}\n`;
        confirmMsg += `   📅 ${t.date}\n\n`;
      });

      confirmMsg += `Do you want to save these transactions?`;

      // Store for confirmation
      const confirmId = `${chatId}_${Date.now()}`;
      this.pendingTransactions.set(confirmId, {
        userId,
        transactions,
        expiresAt: Date.now() + 5 * 60 * 1000 // 5 minutes
      });

      // Send confirmation buttons
      await this.bot.sendMessage(chatId, confirmMsg, {
        reply_markup: {
          inline_keyboard: [[
            { text: '✅ Save All', callback_data: `save_all_${confirmId}` },
            { text: '❌ Cancel', callback_data: `cancel_${confirmId}` }
          ]]
        }
      });
    } catch (error) {
      logger.error('Error showing transaction confirmation:', error);
    }
  }

  /**
   * Handle callback queries (button clicks)
   */
  async handleCallbackQuery(query) {
    const chatId = query.message.chat.id;
    const data = query.data;

    try {
      if (data.startsWith('save_all_')) {
        const confirmId = data.replace('save_all_', '');
        const pending = this.pendingTransactions.get(confirmId);

        if (!pending) {
          await this.bot.answerCallbackQuery(query.id, { text: '❌ Transaction expired or not found' });
          return;
        }

        if (pending.expiresAt < Date.now()) {
          this.pendingTransactions.delete(confirmId);
          await this.bot.answerCallbackQuery(query.id, { text: '❌ Transaction expired' });
          return;
        }

        // Get user
        const user = await User.findById(pending.userId);

        // Save all transactions
        const savedTransactions = [];
        for (const t of pending.transactions) {
          const transaction = await this.createTransaction(user, {
            amount: Math.abs(t.amount),
            type: t.type,
            category: t.category,
            description: t.description,
            date: t.date === 'today' ? new Date() : new Date(t.date)
          });
          savedTransactions.push(transaction);
        }

        this.pendingTransactions.delete(confirmId);

        const balance = await this.calculateBalance(user._id);

        await this.bot.answerCallbackQuery(query.id, { text: '✅ Transactions saved!' });
        await this.bot.editMessageText(
          `✅ Successfully saved ${savedTransactions.length} transaction(s)!\n\n` +
          `💵 Current Balance: ৳${balance.toFixed(2)}\n\n` +
          `🤖 Powered by AI`,
          {
            chat_id: chatId,
            message_id: query.message.message_id
          }
        );

      } else if (data.startsWith('cancel_')) {
        const confirmId = data.replace('cancel_', '');
        this.pendingTransactions.delete(confirmId);

        await this.bot.answerCallbackQuery(query.id, { text: 'Cancelled' });
        await this.bot.editMessageText('❌ Cancelled. No transactions were saved.', {
          chat_id: chatId,
          message_id: query.message.message_id
        });
      }
    } catch (error) {
      logger.error('Error handling callback query:', error);
      await this.bot.answerCallbackQuery(query.id, { text: '❌ An error occurred' });
    }
  }
}

module.exports = new TelegramBotService();
