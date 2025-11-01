const TelegramBot = require('node-telegram-bot-api');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Category = require('../models/Category');
const TelegramLog = require('../models/TelegramLog');
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
const conversationalAI = require('./conversationalAI');
const adminNotificationService = require('./adminNotificationService');

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
   * Check rate limit and restrictions for Telegram user
   * Returns: { allowed: boolean, warning: boolean, message: string }
   */
  async checkRateLimit(user) {
    const RATE_LIMIT_MAX = 20; // Max messages per hour
    const RATE_LIMIT_WARNING = 15; // Warning threshold
    const RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hour in milliseconds

    try {
      // Check if user is restricted by admin
      if (user.telegramRestricted) {
        return {
          allowed: false,
          warning: false,
          message: `❌ *Access Restricted*\n\n` +
            `Your Telegram access has been restricted by an administrator.\n\n` +
            `Reason: ${user.telegramRestrictedReason || 'Not specified'}\n\n` +
            `If you believe this is an error, please contact support.`
        };
      }

      // Count messages in the last hour
      const oneHourAgo = new Date(Date.now() - RATE_LIMIT_WINDOW);
      const messageCount = await TelegramLog.countDocuments({
        user: user._id,
        createdAt: { $gte: oneHourAgo }
      });

      // Check if rate limit exceeded
      if (messageCount >= RATE_LIMIT_MAX) {
        const oldestMessage = await TelegramLog.findOne({
          user: user._id,
          createdAt: { $gte: oneHourAgo }
        }).sort({ createdAt: 1 });

        const resetTime = oldestMessage
          ? new Date(oldestMessage.createdAt.getTime() + RATE_LIMIT_WINDOW)
          : new Date(Date.now() + RATE_LIMIT_WINDOW);

        const minutesUntilReset = Math.ceil((resetTime - Date.now()) / 60000);

        return {
          allowed: false,
          warning: false,
          message: `⏱️ *Rate Limit Reached*\n\n` +
            `You've reached the maximum of ${RATE_LIMIT_MAX} messages per hour.\n\n` +
            `⏳ Please wait ${minutesUntilReset} minute${minutesUntilReset > 1 ? 's' : ''} before sending more messages.\n\n` +
            `💡 This limit helps us maintain service quality for all users.`
        };
      }

      // Check if warning should be shown
      if (messageCount >= RATE_LIMIT_WARNING) {
        const remaining = RATE_LIMIT_MAX - messageCount;
        return {
          allowed: true,
          warning: true,
          message: `⚠️ *Rate Limit Warning*\n\n` +
            `You have ${remaining} message${remaining > 1 ? 's' : ''} remaining in this hour.\n\n` +
            `The limit resets every hour. Please use messages wisely.`
        };
      }

      return { allowed: true, warning: false, message: null };
    } catch (error) {
      logger.error('Error checking rate limit:', error);
      // On error, allow the message to avoid blocking legitimate users
      return { allowed: true, warning: false, message: null };
    }
  }

  /**
   * Log Telegram message and update user activity
   */
  async logTelegramMessage(user, messageType, userMessage, botResponse, intent = null, success = true, metadata = {}, errorMessage = null) {
    try {
      // Create log entry
      await TelegramLog.create({
        user: user._id,
        telegramUserId: user.telegramId,
        telegramUsername: user.telegramUsername,
        messageType: messageType,
        userMessage: userMessage,
        botResponse: botResponse,
        intent: intent,
        success: success,
        metadata: metadata
      });

      // Update user activity
      await User.findByIdAndUpdate(user._id, {
        lastTelegramActivity: new Date(),
        $inc: { telegramMessageCount: 1 }
      });

      logger.info(`Telegram message logged: ${user.email} - ${messageType} - ${intent || 'N/A'} - ${success ? 'SUCCESS' : 'FAILED'}`);

      // Notify admin if message failed
      if (!success) {
        await adminNotificationService.notifyTelegramMessageFailure(user, {
          userMessage,
          intent,
          messageType,
          error: errorMessage || botResponse,
          metadata
        });
      }
    } catch (error) {
      logger.error('Error logging Telegram message:', error);
      // Don't throw - logging should not break the main flow
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
      const responseMessage = `👋 Welcome back, ${user.name}!\n\n` +
        `🤖 *Conversational AI Assistant*\n` +
        `Just chat naturally - I understand your questions!\n\n` +
        `💬 *Try asking me:*\n` +
        `• "show my balance"\n` +
        `• "show last month expenses"\n` +
        `• "lunch 500 taka"\n` +
        `• "add a category called Travel"\n` +
        `• "আমার খরচ দেখাও" (Bengali)\n\n` +
        `📸 *Also works with:*\n` +
        `• 🎤 Voice messages\n` +
        `• 📷 Receipt photos\n\n` +
        `Type /help to see all I can do! 🚀`;

      this.bot.sendMessage(chatId, responseMessage, { parse_mode: 'Markdown' });

      // Log the interaction
      await this.logTelegramMessage(
        user,
        'command',
        '/start',
        responseMessage,
        'START',
        true
      );
    } else {
      this.bot.sendMessage(chatId,
        `🤖 *Welcome to AI Expense Tracker!*\n\n` +
        `🌟 *Conversational AI Features:*\n` +
        `✅ Natural conversations (English & Bengali)\n` +
        `✅ Smart queries - ask anything!\n` +
        `✅ Voice message support\n` +
        `✅ Receipt photo scanning\n` +
        `✅ Automatic transaction parsing\n\n` +
        `📱 *Get Started:*\n` +
        `1. Go to your dashboard settings\n` +
        `2. Find "Link Telegram" section\n` +
        `3. Generate link code\n` +
        `4. Type: /link YOUR_CODE\n\n` +
        `Once linked, just chat naturally!\n` +
        `Type /help to see examples 💡`,
        { parse_mode: 'Markdown' }
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
        `✅ *Account linked successfully!*\n\n` +
        `Welcome, ${result.user.name}! 🎉\n\n` +
        `🧠 *Try AI Features Now:*\n` +
        `Just type naturally (no /add needed!):\n\n` +
        `💬 English:\n` +
        `• "I spent 500 taka on lunch"\n` +
        `• "received salary 50000"\n\n` +
        `🇧🇩 Bengali:\n` +
        `• "আজকে ৫০০ টাকা বাজার করেছি"\n\n` +
        `📊 Quick Commands:\n` +
        `/balance | /recent | /report | /help\n\n` +
        `🤖 AI understands both English & Bengali!`,
        { parse_mode: 'Markdown' }
      );

      logger.info(`Telegram account linked: ${result.user.email} -> ${telegramData.id}`);

      // Notify admin about new Telegram connection
      await adminNotificationService.notifyNewTelegramUser(result.user, telegramData);
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
          `💡 *Pro Tip:* You don't need /add anymore!\n` +
          `Just type naturally:\n\n` +
          `✅ "I spent 500 taka on lunch"\n` +
          `✅ "আজকে ৫০০ টাকা বাজার করেছি"\n` +
          `✅ "lunch 250tk and coffee 80tk"\n\n` +
          `🤖 AI will understand and save it automatically!`,
          { parse_mode: 'Markdown' }
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
        `💵 Current Balance: $${balance.toFixed(2)}\n\n` +
        `💡 *Tip:* Next time, just type "lunch 500 taka" - no /add needed! 🚀`
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
   * Handle conversational messages (main AI handler)
   */
  async handleQuickExpense(msg) {
    const chatId = msg.chat.id;
    const user = await this.getLinkedUser(msg.from.id);

    if (!user) return; // Silently ignore if not linked

    const originalMessage = msg.text;
    const startTime = Date.now();

    try {
      // Check rate limit and restrictions
      const rateLimitCheck = await this.checkRateLimit(user);

      if (!rateLimitCheck.allowed) {
        // User is rate limited or restricted
        this.bot.sendMessage(chatId, rateLimitCheck.message, { parse_mode: 'Markdown' });

        // Log the rate limit block
        await this.logTelegramMessage(
          user,
          'text',
          originalMessage,
          rateLimitCheck.message,
          'RATE_LIMIT_BLOCK',
          false,
          { reason: user.telegramRestricted ? 'admin_restricted' : 'rate_limit_exceeded' }
        );
        return;
      }

      // Send "processing" message
      const processingMsg = await this.bot.sendMessage(chatId, '🤖 Understanding your message...');

      // Get user's categories for context
      const categories = await Category.find({ user: user._id });

      // Classify intent using conversational AI
      const intentResult = await conversationalAI.classifyIntent(msg.text, categories);

      // Delete processing message
      await this.bot.deleteMessage(chatId, processingMsg.message_id);

      if (!intentResult.success) {
        // Fallback to old transaction parsing
        await this.handleLegacyTransaction(msg, user, categories);
        return;
      }

      const { intent, parameters, confidence } = intentResult.data;
      const processingTime = Date.now() - startTime;

      // Route to appropriate handler based on intent
      switch (intent) {
        case 'ADD_TRANSACTION':
          await this.handleAddTransactionIntent(chatId, user, parameters, originalMessage);
          break;

        case 'ADD_MULTIPLE_TRANSACTIONS':
          await this.handleAddMultipleTransactionsIntent(chatId, user, parameters, originalMessage);
          break;

        case 'VIEW_TRANSACTIONS':
          await this.handleViewTransactionsIntent(chatId, user, parameters, originalMessage);
          break;

        case 'VIEW_BALANCE':
          await this.handleViewBalanceIntent(chatId, user, parameters, originalMessage);
          break;

        case 'VIEW_CATEGORIES':
          await this.handleViewCategoriesIntent(chatId, user, parameters, originalMessage);
          break;

        case 'ADD_CATEGORY':
          await this.handleAddCategoryIntent(chatId, user, parameters, originalMessage);
          break;

        case 'VIEW_REPORT':
          await this.handleViewReportIntent(chatId, user, parameters, originalMessage);
          break;

        case 'GENERAL_GREETING':
          await this.handleGreetingIntent(chatId, user, parameters, originalMessage);
          break;

        case 'HELP':
          await this.handleHelpIntent(chatId, user, parameters, originalMessage);
          break;

        default:
          // If uncertain, try old transaction parser as fallback
          if (confidence < 0.6) {
            await this.handleLegacyTransaction(msg, user, categories);
          } else {
            const uncertainResponse = `🤔 I'm not sure what you're asking for.\n\n` +
              `Try:\n` +
              `• "show my expenses"\n` +
              `• "lunch 500tk"\n` +
              `• "what's my balance?"\n` +
              `• Type /help for more examples`;

            this.bot.sendMessage(chatId, uncertainResponse);

            // Log uncertain intent
            await this.logTelegramMessage(
              user,
              'text',
              originalMessage,
              uncertainResponse,
              'OTHER',
              false,
              { confidence, aiConfidence: confidence, processingTime }
            );
          }
      }

      // Show rate limit warning if approaching limit (after processing message)
      if (rateLimitCheck.warning && rateLimitCheck.message) {
        setTimeout(() => {
          this.bot.sendMessage(chatId, rateLimitCheck.message, { parse_mode: 'Markdown' });
        }, 1000); // Delay warning slightly so it appears after the response
      }

    } catch (error) {
      logger.error('Error handling conversation:', error);
      // Silently fail for user experience
    }
  }

  /**
   * Legacy transaction parsing (fallback)
   */
  async handleLegacyTransaction(msg, user, categories) {
    const chatId = msg.chat.id;

    try {
      const result = await clarifaiService.parseTransaction(msg.text, categories);

      if (!result.success || !result.data.valid) {
        return; // Silently ignore
      }

      const { transactions } = result.data;
      if (transactions.length === 0) return;

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
          `💵 Balance: ৳${balance.toFixed(2)}`
        );
      } else {
        await this.showTransactionConfirmation(chatId, user._id, transactions);
      }
    } catch (error) {
      logger.error('Error in legacy transaction handler:', error);
    }
  }

  /**
   * Intent Handler: Add Transaction
   */
  async handleAddTransactionIntent(chatId, user, parameters, originalMessage = '') {
    try {
      const { type, amount, description, category, currency } = parameters;

      if (!amount || amount <= 0) {
        const errorResponse = '❌ Please specify a valid amount.';
        this.bot.sendMessage(chatId, errorResponse);

        // Log failed transaction attempt
        await this.logTelegramMessage(
          user,
          'text',
          originalMessage,
          errorResponse,
          'ADD_TRANSACTION',
          false,
          { error: 'Invalid amount' }
        );
        return;
      }

      const transaction = await this.createTransaction(user, {
        type: type || 'expense',
        amount: Math.abs(amount),
        category: category || 'Other',
        description: description || (type === 'income' ? 'Income' : 'Expense'),
        date: new Date()
      });

      const balance = await this.calculateBalance(user._id);
      const emoji = type === 'income' ? '💰' : '💸';
      const symbol = currency === 'BDT' ? '৳' : currency === 'USD' ? '$' : '৳';

      const successResponse = `✅ ${type === 'income' ? 'Income' : 'Expense'} added!\n\n` +
        `${emoji} ${symbol}${Math.abs(amount)} - ${description}\n` +
        `📁 ${category}\n` +
        `💵 Current Balance: ৳${balance.toFixed(2)}`;

      this.bot.sendMessage(chatId, successResponse);

      // Log successful transaction
      await this.logTelegramMessage(
        user,
        'text',
        originalMessage,
        successResponse,
        'ADD_TRANSACTION',
        true,
        { amount, type, category, description }
      );

      logger.info(`Transaction added via AI: ${user.email} - ${type} ${symbol}${amount}`);
    } catch (error) {
      logger.error('Error adding transaction:', error);
      const errorResponse = '❌ Error adding transaction. Please try again.';
      this.bot.sendMessage(chatId, errorResponse);

      // Log error
      await this.logTelegramMessage(
        user,
        'text',
        originalMessage,
        errorResponse,
        'ADD_TRANSACTION',
        false,
        { error: error.message },
        error.message
      );
    }
  }

  /**
   * Intent Handler: Add Multiple Transactions
   */
  async handleAddMultipleTransactionsIntent(chatId, user, parameters, originalMessage = '') {
    try {
      const { transactions } = parameters;

      if (!transactions || !Array.isArray(transactions) || transactions.length === 0) {
        const errorResponse = '❌ No valid transactions found. Please specify transactions with amounts.';
        this.bot.sendMessage(chatId, errorResponse);

        await this.logTelegramMessage(
          user,
          'text',
          originalMessage,
          errorResponse,
          'ADD_MULTIPLE_TRANSACTIONS',
          false,
          { error: 'No transactions array' },
          'No transactions array'
        );
        return;
      }

      // Track results
      const results = [];
      let successCount = 0;
      let failureCount = 0;

      // Process each transaction
      for (const txn of transactions) {
        try {
          const { type, amount, description, category, currency } = txn;

          if (!amount || amount <= 0) {
            failureCount++;
            results.push({
              success: false,
              description: description || 'Unknown',
              error: 'Invalid amount'
            });
            continue;
          }

          const transaction = await this.createTransaction(user, {
            type: type || 'expense',
            amount: Math.abs(amount),
            category: category || 'Other',
            description: description || (type === 'income' ? 'Income' : 'Expense'),
            date: new Date()
          });

          successCount++;
          const symbol = currency === 'BDT' ? '৳' : currency === 'USD' ? '$' : '৳';
          results.push({
            success: true,
            type: type || 'expense',
            amount: Math.abs(amount),
            description: description || 'Transaction',
            category: category || 'Other',
            symbol
          });

          logger.info(`Multiple transaction added: ${user.email} - ${type} ${symbol}${amount}`);
        } catch (error) {
          failureCount++;
          results.push({
            success: false,
            description: txn.description || 'Unknown',
            error: error.message
          });
          logger.error('Error adding individual transaction:', error);
        }
      }

      // Get updated balance
      const balance = await this.calculateBalance(user._id);

      // Build response message
      let responseMessage = `📝 *Multiple Transactions Added*\n\n`;
      responseMessage += `✅ Success: ${successCount}\n`;
      if (failureCount > 0) {
        responseMessage += `❌ Failed: ${failureCount}\n`;
      }
      responseMessage += `\n*Details:*\n`;

      results.forEach((result, index) => {
        if (result.success) {
          const emoji = result.type === 'income' ? '💰' : '💸';
          responseMessage += `${index + 1}. ${emoji} ${result.symbol}${result.amount} - ${result.description} (${result.category})\n`;
        } else {
          responseMessage += `${index + 1}. ❌ ${result.description} - ${result.error}\n`;
        }
      });

      responseMessage += `\n💵 *Current Balance:* ৳${balance.toFixed(2)}`;

      this.bot.sendMessage(chatId, responseMessage, { parse_mode: 'Markdown' });

      // Log the action
      await this.logTelegramMessage(
        user,
        'text',
        originalMessage,
        responseMessage,
        'ADD_MULTIPLE_TRANSACTIONS',
        successCount > 0,
        {
          totalTransactions: transactions.length,
          successCount,
          failureCount,
          results
        }
      );

      logger.info(`Multiple transactions processed: ${user.email} - ${successCount}/${transactions.length} successful`);
    } catch (error) {
      logger.error('Error adding multiple transactions:', error);
      const errorResponse = '❌ Error adding transactions. Please try again.';
      this.bot.sendMessage(chatId, errorResponse);

      await this.logTelegramMessage(
        user,
        'text',
        originalMessage,
        errorResponse,
        'ADD_MULTIPLE_TRANSACTIONS',
        false,
        { error: error.message },
        error.message
      );
    }
  }

  /**
   * Intent Handler: View Transactions
   */
  async handleViewTransactionsIntent(chatId, user, parameters, originalMessage = '') {
    try {
      const { period, type, category, limit } = parameters;

      // Build query
      const query = { user: user._id };

      // Add date filter
      const now = new Date();
      let periodLabel = '';
      if (period === 'last_month') {
        const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
        query.date = { $gte: lastMonth, $lte: endOfLastMonth };
        periodLabel = lastMonth.toLocaleString('default', { month: 'long', year: 'numeric' });
      } else if (period === 'this_month') {
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        query.date = { $gte: startOfMonth };
        periodLabel = now.toLocaleString('default', { month: 'long', year: 'numeric' });
      } else if (period === 'today') {
        const startOfDay = new Date(now.setHours(0, 0, 0, 0));
        query.date = { $gte: startOfDay };
        periodLabel = 'Today';
      } else if (period === 'this_week') {
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay());
        startOfWeek.setHours(0, 0, 0, 0);
        query.date = { $gte: startOfWeek };
        periodLabel = 'This Week';
      }

      // Add type filter
      if (type) {
        query.type = type;
      }

      // Add category filter
      if (category) {
        query.category = new RegExp(category, 'i');
      }

      // Fetch ALL transactions for accurate totals (not limited)
      const allTransactions = await Transaction.find(query);

      if (allTransactions.length === 0) {
        const periodText = this.getPeriodText(period);
        const noDataResponse = `📊 No ${type || 'transactions'} found ${periodText}.\n\n` +
          `Start adding expenses by typing naturally!`;

        this.bot.sendMessage(chatId, noDataResponse);

        // Log no data found
        await this.logTelegramMessage(
          user,
          'text',
          originalMessage,
          noDataResponse,
          'VIEW_TRANSACTIONS',
          true,
          { period, type, category, transactionCount: 0 }
        );
        return;
      }

      // Calculate totals from ALL transactions
      const totalIncome = allTransactions
        .filter(t => t.type === 'income')
        .reduce((sum, t) => sum + t.amount, 0);

      const totalExpense = allTransactions
        .filter(t => t.type === 'expense')
        .reduce((sum, t) => sum + t.amount, 0);

      // Format message - AMOUNT FIRST (Main Priority)
      let message = '';
      const categoryText = category ? ` (${category})` : '';

      if (!type || type === 'expense') {
        // Expense query - SHOW TOTAL PROMINENTLY
        message += `💸 *Total Expense${categoryText}*\n`;
        message += `📅 ${periodLabel}\n\n`;
        message += `🔴 *৳${totalExpense.toFixed(2)}*\n\n`;

        if (!type && totalIncome > 0) {
          message += `━━━━━━━━━━━━━━\n`;
          message += `📈 Income: ৳${totalIncome.toFixed(2)}\n`;
          message += `💰 Net: ${totalIncome - totalExpense >= 0 ? '+' : ''}৳${(totalIncome - totalExpense).toFixed(2)}\n\n`;
        }
      } else if (type === 'income') {
        // Income query - SHOW TOTAL PROMINENTLY
        message += `💰 *Total Income${categoryText}*\n`;
        message += `📅 ${periodLabel}\n\n`;
        message += `🟢 *৳${totalIncome.toFixed(2)}*\n\n`;
      }

      // Add transaction count
      message += `📊 ${allTransactions.length} transaction${allTransactions.length > 1 ? 's' : ''}\n\n`;

      // Show recent transactions (limited) as supporting details
      const recentTransactions = allTransactions
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 5);

      if (recentTransactions.length > 0) {
        message += `━━━━━━━━━━━━━━\n`;
        message += `*Recent Transactions:*\n\n`;

        recentTransactions.forEach((t, index) => {
          const icon = t.type === 'income' ? '📈' : '📉';
          const date = new Date(t.date).toLocaleDateString('en-GB');
          message += `${index + 1}. ${icon} ৳${t.amount.toFixed(2)}\n`;
          message += `   ${t.description} · ${t.category}\n`;
          message += `   _${date}_\n\n`;
        });

        if (allTransactions.length > 5) {
          message += `_+${allTransactions.length - 5} more transactions_\n`;
          message += `💡 View all on dashboard`;
        }
      }

      this.bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });

      // Log successful transaction view
      await this.logTelegramMessage(
        user,
        'text',
        originalMessage,
        message,
        'VIEW_TRANSACTIONS',
        true,
        { period, type, category, transactionCount: allTransactions.length, totalExpense, totalIncome }
      );
    } catch (error) {
      logger.error('Error viewing transactions:', error);
      const errorResponse = '❌ Error fetching transactions. Please try again.';
      this.bot.sendMessage(chatId, errorResponse);

      // Log error
      await this.logTelegramMessage(
        user,
        'text',
        originalMessage,
        errorResponse,
        'VIEW_TRANSACTIONS',
        false,
        { error: error.message }
      );
    }
  }

  /**
   * Intent Handler: View Balance
   */
  async handleViewBalanceIntent(chatId, user, parameters, originalMessage = '') {
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

      const responseMessage = `💰 *Your Financial Summary*\n\n` +
        `📅 ${monthName}\n\n` +
        `📈 Income: ৳${income.toFixed(2)}\n` +
        `📉 Expenses: ৳${expenses.toFixed(2)}\n` +
        `💵 Balance: ${balance >= 0 ? '+' : ''}৳${balance.toFixed(2)}\n\n` +
        `📊 Transactions: ${transactions.length}\n\n` +
        `${balance < 0 ? '⚠️ You are in deficit this month!' : '✅ Great! You have savings this month.'}`;

      this.bot.sendMessage(chatId, responseMessage, { parse_mode: 'Markdown' });

      // Log successful balance view
      await this.logTelegramMessage(
        user,
        'text',
        originalMessage,
        responseMessage,
        'VIEW_BALANCE',
        true,
        { income, expenses, balance, transactionCount: transactions.length }
      );
    } catch (error) {
      logger.error('Error viewing balance:', error);
      const errorResponse = '❌ Error getting balance. Please try again.';
      this.bot.sendMessage(chatId, errorResponse);

      // Log error
      await this.logTelegramMessage(
        user,
        'text',
        originalMessage,
        errorResponse,
        'VIEW_BALANCE',
        false,
        { error: error.message },
        error.message
      );
    }
  }

  /**
   * Intent Handler: View Categories
   */
  async handleViewCategoriesIntent(chatId, user, parameters, originalMessage = '') {
    try {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      // Get user's custom categories
      const userCategories = await Category.find({ user: user._id });

      // Get transactions for current month
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

      let message = `📊 *Your Categories & Spending*\n\n`;
      message += `📅 ${now.toLocaleString('default', { month: 'long' })}\n\n`;

      if (userCategories.length > 0) {
        message += `*Your Custom Categories:*\n`;
        userCategories.forEach(cat => {
          message += `• ${cat.name} (${cat.type})\n`;
        });
        message += `\n`;
      }

      if (sorted.length > 0) {
        message += `*Spending Breakdown:*\n`;
        sorted.forEach(([category, amount]) => {
          const percentage = ((amount / total) * 100).toFixed(1);
          const bar = '▓'.repeat(Math.ceil(percentage / 5));
          message += `\n📁 *${category}*\n`;
          message += `   ৳${amount.toFixed(2)} (${percentage}%)\n`;
          message += `   ${bar}\n`;
        });
        message += `\n💰 *Total Expenses:* ৳${total.toFixed(2)}`;
      } else {
        message += `No expenses this month yet.\n\n`;
        message += `💡 Start tracking by typing: "lunch 500tk"`;
      }

      this.bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });

      // Log successful category view
      await this.logTelegramMessage(
        user,
        'text',
        originalMessage,
        message,
        'VIEW_CATEGORIES',
        true,
        { customCategoryCount: userCategories.length, totalExpenses: total, categoryCount: sorted.length }
      );
    } catch (error) {
      logger.error('Error viewing categories:', error);
      const errorResponse = '❌ Error getting categories. Please try again.';
      this.bot.sendMessage(chatId, errorResponse);

      // Log error
      await this.logTelegramMessage(
        user,
        'text',
        originalMessage,
        errorResponse,
        'VIEW_CATEGORIES',
        false,
        { error: error.message }
      );
    }
  }

  /**
   * Intent Handler: Add Category
   */
  async handleAddCategoryIntent(chatId, user, parameters, originalMessage = '') {
    try {
      const { categoryName, type } = parameters;

      if (!categoryName) {
        const errorResponse = '❌ Please specify a category name.';
        this.bot.sendMessage(chatId, errorResponse);

        // Log failed attempt
        await this.logTelegramMessage(
          user,
          'text',
          originalMessage,
          errorResponse,
          'ADD_CATEGORY',
          false,
          { error: 'Missing category name' }
        );
        return;
      }

      // Check if category already exists
      const existing = await Category.findOne({
        user: user._id,
        name: new RegExp(`^${categoryName}$`, 'i')
      });

      if (existing) {
        const existsResponse = `⚠️ Category "${categoryName}" already exists!\n\n` +
          `Your existing categories: Use /categories to view them.`;

        this.bot.sendMessage(chatId, existsResponse);

        // Log duplicate attempt
        await this.logTelegramMessage(
          user,
          'text',
          originalMessage,
          existsResponse,
          'ADD_CATEGORY',
          false,
          { error: 'Category already exists', categoryName }
        );
        return;
      }

      // Create new category
      const category = await Category.create({
        user: user._id,
        name: categoryName,
        type: type || 'expense'
      });

      const successResponse = `✅ Category created successfully!\n\n` +
        `📁 *${categoryName}* (${type || 'expense'})\n\n` +
        `You can now use this category when adding transactions!\n\n` +
        `Example: "${categoryName} 500tk"`;

      this.bot.sendMessage(chatId, successResponse);

      // Log successful category creation
      await this.logTelegramMessage(
        user,
        'text',
        originalMessage,
        successResponse,
        'ADD_CATEGORY',
        true,
        { categoryName, type: type || 'expense' }
      );

      logger.info(`Category created via AI: ${user.email} - ${categoryName}`);
    } catch (error) {
      logger.error('Error adding category:', error);
      const errorResponse = '❌ Error creating category. Please try again.';
      this.bot.sendMessage(chatId, errorResponse);

      // Log error
      await this.logTelegramMessage(
        user,
        'text',
        originalMessage,
        errorResponse,
        'ADD_CATEGORY',
        false,
        { error: error.message }
      );
    }
  }

  /**
   * Intent Handler: View Report
   */
  async handleViewReportIntent(chatId, user, parameters, originalMessage = '') {
    try {
      // For detailed reports, direct to web app
      const reportMessage = `📊 *Monthly Report*\n\n` +
        `For detailed reports with charts and analytics, visit:\n` +
        `${process.env.APP_URL}/dashboard\n\n` +
        `Or use these commands:\n` +
        `• "show my balance" - Current summary\n` +
        `• "show this month expenses" - Monthly expenses\n` +
        `• "show my categories" - Category breakdown`;

      this.bot.sendMessage(chatId, reportMessage, { parse_mode: 'Markdown' });

      // Log report request
      await this.logTelegramMessage(
        user,
        'text',
        originalMessage,
        reportMessage,
        'VIEW_REPORT',
        true
      );
    } catch (error) {
      logger.error('Error showing report:', error);
    }
  }

  /**
   * Intent Handler: Greeting
   */
  async handleGreetingIntent(chatId, user, parameters, originalMessage = '') {
    const greetings = [
      `👋 Hello ${user.name}! How can I help you manage your expenses today?`,
      `Hi ${user.name}! 👋 Ready to track some expenses?`,
      `Hey there ${user.name}! 😊 What would you like to do?`,
      `Hello! 👋 I'm here to help with your finances.`
    ];

    const randomGreeting = greetings[Math.floor(Math.random() * greetings.length)];

    const responseMessage = `${randomGreeting}\n\n` +
      `💡 Try saying:\n` +
      `• "show my balance"\n` +
      `• "show last month expenses"\n` +
      `• "lunch 500tk"\n` +
      `• "received salary 50000"`;

    this.bot.sendMessage(chatId, responseMessage);

    // Log greeting interaction
    await this.logTelegramMessage(
      user,
      'text',
      originalMessage,
      responseMessage,
      'GENERAL_GREETING',
      true
    );
  }

  /**
   * Intent Handler: Help
   */
  async handleHelpIntent(chatId, user, parameters, originalMessage = '') {
    const helpMessage = `🤖 *AI Expense Tracker - Natural Conversation*\n\n` +
      `Just chat naturally! I understand:\n\n` +
      `*💰 Adding Transactions:*\n` +
      `• "lunch 500tk"\n` +
      `• "received salary 50000"\n` +
      `• "groceries 1500 taka"\n\n` +
      `*📊 Viewing Data:*\n` +
      `• "show my balance"\n` +
      `• "show last month expenses"\n` +
      `• "show all my transactions"\n` +
      `• "show food expenses this month"\n\n` +
      `*📁 Categories:*\n` +
      `• "show my categories"\n` +
      `• "add a category called Travel"\n\n` +
      `*🇧🇩 Bengali Support:*\n` +
      `• "আজকে ৫০০ টাকা বাজার করেছি"\n` +
      `• "আমার ব্যালেন্স দেখাও"\n\n` +
      `You can also use:\n` +
      `📸 Send receipt photos\n` +
      `🎤 Send voice messages\n\n` +
      `Type naturally - I'll understand! 🧠`;

    this.bot.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' });

    // Log help request
    await this.logTelegramMessage(
      user,
      'text',
      originalMessage,
      helpMessage,
      'HELP',
      true
    );
  }

  /**
   * Helper: Get period text for display
   */
  getPeriodText(period) {
    const texts = {
      'last_month': 'last month',
      'this_month': 'this month',
      'today': 'today',
      'this_week': 'this week',
      'all': 'overall'
    };
    return texts[period] || 'recently';
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
🤖 *Conversational AI Expense Tracker*

*💬 CHAT NATURALLY - I UNDERSTAND!*

*💰 Adding Money:*
• "lunch 500tk"
• "received salary 50000"
• "groceries 1500 taka"
• "paid 200 for transport"

*📊 Viewing Your Data:*
• "show my balance"
• "what's my balance?"
• "show last month expenses"
• "show this month transactions"
• "show all my transactions"
• "show food expenses"
• "show today's expenses"

*📁 Managing Categories:*
• "show my categories"
• "show category breakdown"
• "add a category called Travel"
• "create new category Education"

*💵 Income & Expenses:*
• "add income 50000 salary"
• "I received 5000 from bonus"
• "spent 300 on medicine"

*🇧🇩 Bengali Full Support:*
• "আজকে ৫০০ টাকা বাজার করেছি"
• "আমার ব্যালেন্স দেখাও"
• "গত মাসের খরচ দেখাও"
• "বেতন ৫০০০০ টাকা পেয়েছি"

*📸 Other Features:*
• 📷 Send receipt photo - Auto extract
• 🎤 Send voice message (Bengali/English)
• 🌍 Bilingual support

*⚡️ Quick Commands:*
/balance - Current summary
/recent - Last 5 transactions
/categories - Category breakdown
/settings - Your preferences

*🤖 Powered by Advanced AI*
No rigid commands - just chat! 🚀

Visit dashboard: ${process.env.APP_URL}
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
      // Check rate limit and restrictions
      const rateLimitCheck = await this.checkRateLimit(user);

      if (!rateLimitCheck.allowed) {
        // User is rate limited or restricted
        this.bot.sendMessage(chatId, rateLimitCheck.message, { parse_mode: 'Markdown' });

        // Log the rate limit block
        await this.logTelegramMessage(
          user,
          'voice',
          '[Voice message]',
          rateLimitCheck.message,
          'RATE_LIMIT_BLOCK',
          false,
          { reason: user.telegramRestricted ? 'admin_restricted' : 'rate_limit_exceeded' }
        );
        return;
      }

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
        const failMessage = `❌ Failed to transcribe voice message.\n\n` +
          `${transcriptionResult.error || 'Please try again or use text commands.'}\n\n` +
          `💡 Tip: Speak clearly and ensure good audio quality.`;

        await this.bot.editMessageText(
          failMessage,
          { chat_id: chatId, message_id: processingMsg.message_id }
        );

        // Log transcription failure
        await this.logTelegramMessage(
          user,
          'voice',
          '[Voice message]',
          failMessage,
          null,
          false,
          { error: 'Transcription failed', errorDetails: transcriptionResult.error }
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
          const parseFailMessage = `🎤 Voice transcribed!\n\n` +
            `📝 _"${transcribedText}"_\n\n` +
            `❌ Couldn't understand the expense format.\n\n` +
            `💡 Try saying something like:\n` +
            `• "Coffee 5"\n` +
            `• "Spent 50 on groceries"\n` +
            `• "Lunch 25 dollars"`;

          this.bot.sendMessage(chatId, parseFailMessage, { parse_mode: 'Markdown' });

          // Log parsing failure
          await this.logTelegramMessage(
            user,
            'voice',
            transcribedText,
            parseFailMessage,
            null,
            false,
            { voiceTranscribed: transcribedText, error: 'Parsing failed' }
          );
          return;
        }

        // Create transaction using old parser result
        const transaction = await this.createTransaction(user, parsed);
        const balance = await this.calculateBalance(user._id);

        // Send success message
        const successResponse = `✅ Voice expense added!\n\n` +
          `🎤 Transcribed: _"${transcribedText}"_\n\n` +
          `💰 Amount: $${parsed.amount.toFixed(2)}\n` +
          `📁 Category: ${parsed.category}\n` +
          `📝 Note: ${parsed.description}\n\n` +
          `💵 Current Balance: $${balance.toFixed(2)}`;

        this.bot.sendMessage(chatId, successResponse, { parse_mode: 'Markdown' });

        // Log successful voice transaction (fallback parser)
        await this.logTelegramMessage(
          user,
          'voice',
          transcribedText,
          successResponse,
          'ADD_TRANSACTION',
          true,
          {
            voiceTranscribed: transcribedText,
            amount: parsed.amount,
            category: parsed.category,
            parser: 'fallback_nlp'
          }
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

        const aiSuccessResponse = `✅ Voice transaction saved!\n\n` +
          `🎤 _"${transcribedText}"_\n\n` +
          `${emoji} ${symbol}${Math.abs(t.amount)} - ${t.description}\n` +
          `📁 ${t.category}\n` +
          `💵 Balance: ৳${balance.toFixed(2)}`;

        this.bot.sendMessage(chatId, aiSuccessResponse, { parse_mode: 'Markdown' });

        // Log successful voice transaction (AI parser)
        await this.logTelegramMessage(
          user,
          'voice',
          transcribedText,
          aiSuccessResponse,
          'ADD_TRANSACTION',
          true,
          {
            voiceTranscribed: transcribedText,
            amount: Math.abs(t.amount),
            category: t.category,
            type: t.type,
            parser: 'ai_clarifai'
          }
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
