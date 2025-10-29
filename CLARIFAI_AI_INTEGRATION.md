# Clarifai AI Integration Guide

## Overview

This system uses Clarifai's GPT model to intelligently parse user messages and extract transaction data. It supports:
- ✅ English, Bengali (বাংলা), and Banglish (mixed) language
- ✅ Multiple transactions in one message
- ✅ Voice message transcription with AI parsing
- ✅ Multi-account management with usage tracking
- ✅ Automatic category suggestion based on user's categories
- ✅ Smart validation (detects non-transaction messages)

## Architecture

```
User Message (Text/Voice)
       │
       ▼
[AssemblyAI Transcription] ← (if voice message)
       │                      ← Language Detection Enabled
       │                      ← Supports Bengali
       ▼
Transcribed Text
       │
       ▼
[Clarifai AI Parser]
       │                      ← Multi-language prompt
       │                      ← User's categories provided
       │                      ← Multi-transaction support
       ▼
Parsed Transactions (JSON)
       │
       ▼
[User Confirmation]
       │
       ▼
[Save to Database]
```

## Setup Instructions

### 1. Get Clarifai API Key (PAT)

1. Sign up at https://clarifai.com/
2. Go to Settings > Security
3. Create a new Personal Access Token (PAT)
4. Copy the PAT (starts with something like `4725d9b2bed749ce988762c9aa7c4a71`)

### 2. Add Clarifai Account via API

#### Option A: Using Postman/cURL

```bash
curl -X POST http://localhost:8000/api/admin/clarifai/accounts \
  -H "Authorization: Bearer YOUR_ADMIN_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Clarifai Account 1",
    "pat": "4725d9b2bed749ce988762c9aa7c4a71",
    "userId": "openai",
    "appId": "chat-completion",
    "modelId": "gpt-oss-120b",
    "modelVersionId": "b3c129d719144dd49f4cb8cb96585223",
    "monthlyLimit": 1000,
    "dailyLimit": 50,
    "notes": "Free tier account"
  }'
```

#### Option B: Using Admin Dashboard (Frontend)

Create `src/pages/admin/ClarifaiAccounts.js` in your frontend:

```javascript
import React, { useState, useEffect } from 'react';
import axios from 'axios';

function ClarifaiAccounts() {
  const [accounts, setAccounts] = useState([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    pat: '',
    userId: 'openai',
    appId: 'chat-completion',
    modelId: 'gpt-oss-120b',
    modelVersionId: 'b3c129d719144dd49f4cb8cb96585223',
    monthlyLimit: 1000,
    dailyLimit: 50,
    notes: ''
  });

  useEffect(() => {
    fetchAccounts();
  }, []);

  const fetchAccounts = async () => {
    try {
      const response = await axios.get('/api/admin/clarifai/accounts', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setAccounts(response.data.accounts);
    } catch (error) {
      console.error('Failed to fetch accounts:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await axios.post('/api/admin/clarifai/accounts', formData, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      alert('Account added successfully!');
      fetchAccounts();
      setShowAddForm(false);
      setFormData({ ...formData, name: '', pat: '', notes: '' });
    } catch (error) {
      alert('Failed to add account: ' + error.response?.data?.message);
    }
  };

  const testAccount = async (accountId) => {
    try {
      const response = await axios.post(
        `/api/admin/clarifai/test/${accountId}`,
        {},
        { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
      );
      alert('✅ Test successful!\\n\\n' + response.data.response);
    } catch (error) {
      alert('❌ Test failed: ' + error.response?.data?.error);
    }
  };

  const deleteAccount = async (accountId) => {
    if (!confirm('Are you sure you want to delete this account?')) return;

    try {
      await axios.delete(`/api/admin/clarifai/accounts/${accountId}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      alert('Account deleted successfully!');
      fetchAccounts();
    } catch (error) {
      alert('Failed to delete account: ' + error.response?.data?.message);
    }
  };

  const toggleActive = async (account) => {
    try {
      await axios.put(
        `/api/admin/clarifai/accounts/${account._id}`,
        { isActive: !account.isActive },
        { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
      );
      fetchAccounts();
    } catch (error) {
      alert('Failed to update account');
    }
  };

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Clarifai AI Accounts</h1>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
        >
          {showAddForm ? 'Cancel' : '+ Add Account'}
        </button>
      </div>

      {showAddForm && (
        <div className="bg-white p-6 rounded-lg shadow-md mb-6">
          <h2 className="text-xl font-bold mb-4">Add New Clarifai Account</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block mb-2">Account Name *</label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full p-2 border rounded"
                placeholder="e.g., Clarifai Account 1"
              />
            </div>

            <div>
              <label className="block mb-2">Personal Access Token (PAT) *</label>
              <input
                type="text"
                required
                value={formData.pat}
                onChange={(e) => setFormData({ ...formData, pat: e.target.value })}
                className="w-full p-2 border rounded font-mono"
                placeholder="Get from clarifai.com/settings/security"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block mb-2">User ID</label>
                <input
                  type="text"
                  value={formData.userId}
                  onChange={(e) => setFormData({ ...formData, userId: e.target.value })}
                  className="w-full p-2 border rounded"
                />
              </div>
              <div>
                <label className="block mb-2">App ID</label>
                <input
                  type="text"
                  value={formData.appId}
                  onChange={(e) => setFormData({ ...formData, appId: e.target.value })}
                  className="w-full p-2 border rounded"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block mb-2">Monthly Limit</label>
                <input
                  type="number"
                  value={formData.monthlyLimit}
                  onChange={(e) => setFormData({ ...formData, monthlyLimit: parseInt(e.target.value) })}
                  className="w-full p-2 border rounded"
                />
              </div>
              <div>
                <label className="block mb-2">Daily Limit</label>
                <input
                  type="number"
                  value={formData.dailyLimit}
                  onChange={(e) => setFormData({ ...formData, dailyLimit: parseInt(e.target.value) })}
                  className="w-full p-2 border rounded"
                />
              </div>
            </div>

            <div>
              <label className="block mb-2">Notes</label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="w-full p-2 border rounded"
                rows="2"
                placeholder="Optional notes about this account"
              />
            </div>

            <button
              type="submit"
              className="bg-green-500 text-white px-6 py-2 rounded hover:bg-green-600"
            >
              Add Account
            </button>
          </form>
        </div>
      )}

      <div className="grid gap-4">
        {accounts.map((account) => (
          <div key={account._id} className="bg-white p-6 rounded-lg shadow-md">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-xl font-bold">{account.name}</h3>
                <p className="text-sm text-gray-600">PAT: {account.pat}</p>
              </div>
              <div className="flex gap-2">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={account.isActive}
                    onChange={() => toggleActive(account)}
                    className="w-5 h-5"
                  />
                  <span>Active</span>
                </label>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-4 mb-4">
              <div>
                <p className="text-sm text-gray-600">Total Requests</p>
                <p className="text-lg font-bold">{account.usage.totalRequests}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">This Month</p>
                <p className="text-lg font-bold">
                  {account.usage.monthlyRequests} / {account.limits.monthlyLimit}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Success Rate</p>
                <p className="text-lg font-bold">
                  {account.usage.totalRequests > 0
                    ? Math.round((account.usage.successfulRequests / account.usage.totalRequests) * 100)
                    : 0}%
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Last Used</p>
                <p className="text-sm">
                  {account.usage.lastUsed
                    ? new Date(account.usage.lastUsed).toLocaleString()
                    : 'Never'}
                </p>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => testAccount(account._id)}
                className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
              >
                Test Account
              </button>
              <button
                onClick={() => deleteAccount(account._id)}
                className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
              >
                Delete
              </button>
            </div>

            {account.notes && (
              <p className="mt-4 text-sm text-gray-600 italic">Note: {account.notes}</p>
            )}
          </div>
        ))}

        {accounts.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <p>No Clarifai accounts added yet.</p>
            <p className="text-sm mt-2">Click "Add Account" to get started.</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default ClarifaiAccounts;
```

### 3. Integrate with Telegram Bot

Update `src/services/telegramBot.js` to use AI parsing:

```javascript
const clarifaiService = require('./clarifaiService');
const Category = require('../models/Category');
const Transaction = require('../models/Transaction');

// Store pending transactions for user confirmation
const pendingTransactions = new Map();

// Handle text messages with AI parsing
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  // Skip commands
  if (text?.startsWith('/')) return;

  try {
    // Get user from database
    const user = await User.findOne({ telegramId: chatId.toString() });
    if (!user) {
      bot.sendMessage(chatId, '❌ Please link your account first using /link command');
      return;
    }

    // Get user's categories
    const categories = await Category.find({ user: user._id });

    // Send "processing" message
    const processingMsg = await bot.sendMessage(chatId, '🤖 Analyzing your message...');

    // Parse message with AI
    const result = await clarifaiService.parseTransaction(text, categories);

    // Delete processing message
    await bot.deleteMessage(chatId, processingMsg.message_id);

    if (!result.success) {
      bot.sendMessage(chatId, `❌ Failed to parse: ${result.error}`);
      return;
    }

    const { data } = result;

    // Check if valid transaction
    if (!data.valid) {
      bot.sendMessage(chatId, `💬 I didn't detect any transaction in your message.\\n\\nTry something like:\\n- "lunch 250tk"\\n- "আজকে ৫০০ টাকা বাজার করেছি"\\n- "salary received 50000 taka"`);
      return;
    }

    // Show parsed transactions for confirmation
    const { transactions } = data;

    if (transactions.length === 0) {
      bot.sendMessage(chatId, '❌ No transactions found in your message.');
      return;
    }

    // Create confirmation message
    let confirmMsg = `✅ I found ${transactions.length} transaction(s):\\n\\n`;

    transactions.forEach((t, index) => {
      const emoji = t.type === 'expense' ? '💸' : '💰';
      const symbol = t.currency === 'BDT' ? '৳' : t.currency === 'USD' ? '$' : '₹';

      confirmMsg += `${index + 1}. ${emoji} ${symbol}${Math.abs(t.amount)} - ${t.description}\\n`;
      confirmMsg += `   Category: ${t.category}\\n`;
      confirmMsg += `   Date: ${t.date}\\n\\n`;
    });

    confirmMsg += `Do you want to save these transactions?`;

    // Store for confirmation
    const confirmId = `${chatId}_${Date.now()}`;
    pendingTransactions.set(confirmId, {
      userId: user._id,
      transactions,
      expiresAt: Date.now() + 5 * 60 * 1000 // 5 minutes
    });

    // Send confirmation buttons
    bot.sendMessage(chatId, confirmMsg, {
      reply_markup: {
        inline_keyboard: [[
          { text: '✅ Save All', callback_data: `save_all_${confirmId}` },
          { text: '❌ Cancel', callback_data: `cancel_${confirmId}` }
        ]]
      }
    });

  } catch (error) {
    console.error('Error processing message:', error);
    bot.sendMessage(chatId, '❌ An error occurred while processing your message.');
  }
});

// Handle confirmation callbacks
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;

  if (data.startsWith('save_all_')) {
    const confirmId = data.replace('save_all_', '');
    const pending = pendingTransactions.get(confirmId);

    if (!pending) {
      bot.answerCallbackQuery(query.id, { text: '❌ Transaction expired or not found' });
      return;
    }

    if (pending.expiresAt < Date.now()) {
      pendingTransactions.delete(confirmId);
      bot.answerCallbackQuery(query.id, { text: '❌ Transaction expired' });
      return;
    }

    try {
      // Save all transactions
      const savedTransactions = [];
      for (const t of pending.transactions) {
        const transaction = await Transaction.create({
          user: pending.userId,
          amount: t.amount,
          description: t.description,
          category: t.category,
          type: t.type,
          currency: t.currency,
          date: t.date === 'today' ? new Date() : new Date(t.date),
        });
        savedTransactions.push(transaction);
      }

      pendingTransactions.delete(confirmId);

      bot.answerCallbackQuery(query.id, { text: '✅ Transactions saved!' });
      bot.editMessageText(
        `✅ Successfully saved ${savedTransactions.length} transaction(s)!\\n\\nYou can view them in the app.`,
        {
          chat_id: chatId,
          message_id: query.message.message_id
        }
      );

    } catch (error) {
      console.error('Error saving transactions:', error);
      bot.answerCallbackQuery(query.id, { text: '❌ Failed to save transactions' });
    }
  } else if (data.startsWith('cancel_')) {
    const confirmId = data.replace('cancel_', '');
    pendingTransactions.delete(confirmId);

    bot.answerCallbackQuery(query.id, { text: 'Cancelled' });
    bot.editMessageText('❌ Cancelled. No transactions were saved.', {
      chat_id: chatId,
      message_id: query.message.message_id
    });
  }
});

// Handle voice messages
bot.on('voice', async (msg) => {
  const chatId = msg.chat.id;
  const voice = msg.voice;

  try {
    const user = await User.findOne({ telegramId: chatId.toString() });
    if (!user) {
      bot.sendMessage(chatId, '❌ Please link your account first');
      return;
    }

    const processingMsg = await bot.sendMessage(chatId, '🎤 Transcribing voice message...');

    // Get file info and download
    const fileInfo = await bot.getFile(voice.file_id);
    const filePath = fileInfo.file_path;
    const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${filePath}`;

    // Download voice file
    const response = await axios.get(fileUrl, { responseType: 'arraybuffer' });
    const tempPath = `./uploads/temp/voice_${Date.now()}.ogg`;
    fs.writeFileSync(tempPath, response.data);

    // Transcribe with AssemblyAI (language detection enabled)
    const voiceTranscriptionService = require('./voiceTranscriptionService');
    const transcriptionResult = await voiceTranscriptionService.transcribeAudio(tempPath);

    if (!transcriptionResult.success) {
      throw new Error(transcriptionResult.error || 'Transcription failed');
    }

    const transcribedText = transcriptionResult.text;

    // Update processing message
    await bot.editMessageText(
      `🎤 Transcribed: "${transcribedText}"\\n\\n🤖 Analyzing...`,
      { chat_id: chatId, message_id: processingMsg.message_id }
    );

    // Parse with Clarifai AI
    const categories = await Category.find({ user: user._id });
    const parseResult = await clarifaiService.parseTransaction(transcribedText, categories);

    // Delete processing message
    await bot.deleteMessage(chatId, processingMsg.message_id);

    // Continue with same confirmation flow as text messages...
    // (Use the same code as above for confirmation)

  } catch (error) {
    console.error('Error processing voice:', error);
    bot.sendMessage(chatId, '❌ Failed to process voice message');
  }
});
```

## API Endpoints

### Admin Endpoints (Require Admin Role)

#### Get All Accounts
```
GET /api/admin/clarifai/accounts
Authorization: Bearer <admin_token>
```

#### Add Account
```
POST /api/admin/clarifai/accounts
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "name": "Account 1",
  "pat": "your_pat_here",
  "monthlyLimit": 1000
}
```

#### Update Account
```
PUT /api/admin/clarifai/accounts/:id
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "isActive": true,
  "monthlyLimit": 2000
}
```

#### Delete Account
```
DELETE /api/admin/clarifai/accounts/:id
Authorization: Bearer <admin_token>
```

#### Test Account
```
POST /api/admin/clarifai/test/:id
Authorization: Bearer <admin_token>
```

#### Get Usage Stats
```
GET /api/admin/clarifai/usage-stats
Authorization: Bearer <admin_token>
```

#### Test Parsing (for debugging)
```
POST /api/admin/clarifai/test-parsing
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "message": "lunch 250tk and coffee 80tk",
  "categories": [
    {"name": "Food", "type": "expense"},
    {"name": "Transport", "type": "expense"}
  ]
}
```

## Language Support

### Supported Formats

**English:**
- "I spent 50 taka on lunch"
- "paid 200 for rickshaw"
- "salary received 50000"

**Bengali (বাংলা):**
- "আজকে ৫০০ টাকা বাজার করেছি" (Today I spent 500 taka on groceries)
- "দুপুরের খাবার ২৫০ টাকা" (Lunch was 250 taka)
- "বেতন পেয়েছি ৫০০০০ টাকা" (Received salary 50000 taka)

**Banglish (Bengali with English letters):**
- "ajke 500 taka bazar korechi"
- "lunch 250tk"
- "ricksha vara 20tk"

**Mixed:**
- "আজকে lunch korsi 300tk"
- "bazar korechi today ৫০০ টাকা"

### Multiple Transactions

The AI can handle multiple transactions in one message:

```
"lunch 250tk and coffee 80tk"
→ Transaction 1: -250 BDT (Food - Lunch)
→ Transaction 2: -80 BDT (Food - Coffee)

"আজকে ৫০০ টাকা বাজার করেছি আর ২০ টাকা রিকশা ভাড়া"
→ Transaction 1: -500 BDT (Groceries - Shopping)
→ Transaction 2: -20 BDT (Transport - Rickshaw)
```

## Usage Limits & Account Rotation

The system automatically rotates between accounts:
1. Uses account with lowest usage
2. Tracks monthly request limits
3. Automatically switches when limit reached
4. Prioritizes accounts by priority value (higher = used first)

Default limits:
- Monthly: 1000 requests
- Daily: 50 requests

Configure limits when adding accounts.

## Testing

### Test with cURL

```bash
# Test parsing
curl -X POST http://localhost:8000/api/admin/clarifai/test-parsing \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "আজকে ৫০০ টাকা বাজার করেছি আর ricksha vara 20tk",
    "categories": [
      {"name": "Groceries", "type": "expense"},
      {"name": "Transport", "type": "expense"},
      {"name": "Food", "type": "expense"}
    ]
  }'
```

Expected response:
```json
{
  "success": true,
  "data": {
    "valid": true,
    "transactions": [
      {
        "type": "expense",
        "amount": -500,
        "description": "Grocery shopping",
        "category": "Groceries",
        "date": "today",
        "currency": "BDT"
      },
      {
        "type": "expense",
        "amount": -20,
        "description": "Rickshaw fare",
        "category": "Transport",
        "date": "today",
        "currency": "BDT"
      }
    ]
  },
  "accountUsed": "Clarifai Account 1",
  "duration": 1234
}
```

## Troubleshooting

### Issue: "No Clarifai accounts available"
**Solution**: Add at least one Clarifai account via the admin API

### Issue: "AI returned invalid JSON format"
**Solution**: The AI response wasn't valid JSON. This is rare but can happen. Try:
1. Check if your PAT is valid
2. Test with the test endpoint
3. Check usage limits

### Issue: Parsing not accurate
**Solution**:
1. Ensure you've added your custom categories
2. Test with clearer message format
3. Check the prompt in `clarifaiService.js` and adjust if needed

### Issue: Bengali not working
**Solution**:
1. Ensure AssemblyAI language detection is enabled (it is by default)
2. Try Banglish format if pure Bengali isn't working
3. The AI understands mixed language better

## Cost Estimation

Clarifai Free Tier:
- Approximately 1000 requests/month free
- Each message parsing = 1 request
- Voice transcription uses AssemblyAI (separate account)

For 100 users:
- Average 10 messages/day = 1000 messages/month per user
- Total: 100,000 requests/month
- Need: ~100 free tier accounts OR paid plan

**Recommendation**: Start with 5-10 free accounts, then upgrade to paid if needed.

## Next Steps

1. ✅ Add your first Clarifai account
2. ✅ Test parsing with the test endpoint
3. ✅ Integrate with Telegram bot
4. ✅ Create frontend admin UI
5. ✅ Monitor usage stats
6. ✅ Add more accounts as needed

## Support

If you encounter issues:
1. Check backend logs: `tail -f logs/combined.log`
2. Test account: `POST /api/admin/clarifai/test/:id`
3. Check usage stats: `GET /api/admin/clarifai/usage-stats`
4. Verify PAT at https://clarifai.com/settings/security
