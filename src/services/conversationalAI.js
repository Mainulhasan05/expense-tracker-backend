const ClarifaiAccount = require("../models/ClarifaiAccount");
const logger = require("../config/logger");
const OpenAI = require("openai");

class ConversationalAI {
  constructor() {
    this.baseUrl = "https://api.clarifai.com/v2/ext/openai/v1";
  }

  /**
   * Generate intent classification prompt
   */
  generateIntentPrompt(userMessage, userCategories = []) {
    const categoryList = userCategories.length > 0
      ? userCategories.map(cat => `"${cat.name}"`).join(", ")
      : "Groceries, Transport, Food, Shopping, Bills, Entertainment, Health, Medicine, Salary, Gift";

    return `You are an AI assistant for a Bangladeshi expense tracker app. Users communicate in ENGLISH or BENGALI (বাংলা).

TASK: Understand the user's intent and extract relevant information.

SUPPORTED INTENTS:
1. ADD_TRANSACTION - User wants to add a single expense or income
2. ADD_MULTIPLE_TRANSACTIONS - User wants to add multiple expenses or incomes in one message
3. VIEW_TRANSACTIONS - User wants to see their transactions (with optional filters: last month, this month, today, date range, category)
4. VIEW_BALANCE - User wants to see their current balance or summary
5. VIEW_CATEGORIES - User wants to see all categories and spending breakdown
6. ADD_CATEGORY - User wants to create a new category
7. VIEW_REPORT - User wants to see monthly or periodic reports
8. GENERAL_GREETING - User is greeting or having casual conversation
9. HELP - User needs help or doesn't understand something
10. OTHER - Cannot determine intent

RULES:
1. Return ONLY valid JSON, nothing else
2. Identify the PRIMARY intent
3. Extract relevant parameters (dates, amounts, categories, etc.)
4. Support Bengali and English (including romanized Bengali)
5. For single transactions: Extract amount, type (income/expense), description, category
6. For multiple transactions: Use ADD_MULTIPLE_TRANSACTIONS intent with an array of transactions
7. For queries: Extract time period (last month, this month, today, custom dates)

USER'S EXISTING CATEGORIES: ${categoryList}

OUTPUT FORMAT (JSON):
{
  "intent": "INTENT_NAME",
  "confidence": 0.0-1.0,
  "parameters": {
    // Intent-specific parameters
  },
  "response_hint": "suggested response text"
}

EXAMPLES:

Input: "show my last month expense"
Output: {"intent": "VIEW_TRANSACTIONS", "confidence": 0.95, "parameters": {"period": "last_month", "type": "expense"}, "response_hint": "Showing expenses from last month"}

Input: "আমার এই মাসের খরচ দেখাও"
Output: {"intent": "VIEW_TRANSACTIONS", "confidence": 0.95, "parameters": {"period": "this_month", "type": "expense"}, "response_hint": "Showing expenses from this month"}

Input: "lunch 250tk"
Output: {"intent": "ADD_TRANSACTION", "confidence": 0.9, "parameters": {"type": "expense", "amount": 250, "description": "lunch", "category": "Food", "currency": "BDT"}, "response_hint": "Adding expense"}

Input: "received salary 50000 taka"
Output: {"intent": "ADD_TRANSACTION", "confidence": 0.95, "parameters": {"type": "income", "amount": 50000, "description": "salary", "category": "Salary", "currency": "BDT"}, "response_hint": "Adding income"}

Input: "rice 434, food 453, bills 222"
Output: {"intent": "ADD_MULTIPLE_TRANSACTIONS", "confidence": 0.9, "parameters": {"transactions": [{"type": "expense", "amount": 434, "description": "rice", "category": "Groceries", "currency": "BDT"}, {"type": "expense", "amount": 453, "description": "food", "category": "Food", "currency": "BDT"}, {"type": "expense", "amount": 222, "description": "bills", "category": "Bills", "currency": "BDT"}]}, "response_hint": "Adding multiple expenses"}

Input: "বাজার ৫০০, রিকশা ৩০, খাবার ২০০"
Output: {"intent": "ADD_MULTIPLE_TRANSACTIONS", "confidence": 0.9, "parameters": {"transactions": [{"type": "expense", "amount": 500, "description": "বাজার", "category": "Groceries", "currency": "BDT"}, {"type": "expense", "amount": 30, "description": "রিকশা", "category": "Transport", "currency": "BDT"}, {"type": "expense", "amount": 200, "description": "খাবার", "category": "Food", "currency": "BDT"}]}, "response_hint": "Adding multiple expenses"}

Input: "breakfast 150 lunch 300 dinner 250"
Output: {"intent": "ADD_MULTIPLE_TRANSACTIONS", "confidence": 0.9, "parameters": {"transactions": [{"type": "expense", "amount": 150, "description": "breakfast", "category": "Food", "currency": "BDT"}, {"type": "expense", "amount": 300, "description": "lunch", "category": "Food", "currency": "BDT"}, {"type": "expense", "amount": 250, "description": "dinner", "category": "Food", "currency": "BDT"}]}, "response_hint": "Adding multiple expenses"}

Input: "what's my balance?"
Output: {"intent": "VIEW_BALANCE", "confidence": 0.95, "parameters": {}, "response_hint": "Showing current balance"}

Input: "show my categories"
Output: {"intent": "VIEW_CATEGORIES", "confidence": 0.95, "parameters": {}, "response_hint": "Showing all categories"}

Input: "add a new category called Education"
Output: {"intent": "ADD_CATEGORY", "confidence": 0.9, "parameters": {"categoryName": "Education", "type": "expense"}, "response_hint": "Creating new category"}

Input: "show all my transactions"
Output: {"intent": "VIEW_TRANSACTIONS", "confidence": 0.9, "parameters": {"period": "all"}, "response_hint": "Showing all transactions"}

Input: "show food expenses this month"
Output: {"intent": "VIEW_TRANSACTIONS", "confidence": 0.9, "parameters": {"period": "this_month", "type": "expense", "category": "Food"}, "response_hint": "Showing Food expenses for this month"}

Input: "hello"
Output: {"intent": "GENERAL_GREETING", "confidence": 0.9, "parameters": {}, "response_hint": "Hello! How can I help you with your expenses today?"}

Input: "how do I add an expense?"
Output: {"intent": "HELP", "confidence": 0.9, "parameters": {}, "response_hint": "You can simply type your expense naturally"}

USER MESSAGE: ${userMessage}

RETURN ONLY JSON:`;
  }

  /**
   * Classify user intent using AI
   */
  async classifyIntent(userMessage, userCategories = []) {
    const startTime = Date.now();

    try {
      // Get available account
      const account = await ClarifaiAccount.getAvailableAccount();

      if (!account) {
        throw new Error("No AI accounts available");
      }

      logger.info(`Classifying intent with account: ${account.name}`);

      // Generate prompt
      const prompt = this.generateIntentPrompt(userMessage, userCategories);

      // Create OpenAI client with Clarifai base URL
      const client = new OpenAI({
        baseURL: this.baseUrl,
        apiKey: account.pat,
      });

      // Use stable model URL if available
      const modelUrl = account.modelUrl ||
        `https://clarifai.com/${account.userId}/${account.appId}/models/${account.modelId}`;

      // Call AI
      const response = await client.chat.completions.create({
        model: modelUrl,
        messages: [
          {
            role: "system",
            content: "You are an intent classification AI. Return ONLY valid JSON responses."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.2, // Lower temperature for consistent classification
      });

      const rawText = response.choices[0]?.message?.content;
      if (!rawText) {
        throw new Error("No response from AI");
      }

      // Increment usage
      await account.incrementUsage(true);

      // Parse JSON response
      let parsedResponse;
      try {
        const cleanedResponse = rawText
          .replace(/```json\n?/g, "")
          .replace(/```\n?/g, "")
          .trim();

        parsedResponse = JSON.parse(cleanedResponse);
      } catch (parseError) {
        logger.error("Failed to parse AI intent response:", rawText);
        throw new Error("AI returned invalid JSON format");
      }

      const duration = Date.now() - startTime;
      logger.info(`Intent classified in ${duration}ms: ${parsedResponse.intent}`);

      return {
        success: true,
        data: parsedResponse,
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(`Intent classification failed after ${duration}ms:`, error.message);

      return {
        success: false,
        error: error.message,
        duration,
      };
    }
  }

  /**
   * Generate conversational response using AI
   */
  async generateResponse(context, data) {
    try {
      const account = await ClarifaiAccount.getAvailableAccount();
      if (!account) {
        return this.getFallbackResponse(context, data);
      }

      const client = new OpenAI({
        baseURL: this.baseUrl,
        apiKey: account.pat,
      });

      const modelUrl = account.modelUrl ||
        `https://clarifai.com/${account.userId}/${account.appId}/models/${account.modelId}`;

      const prompt = `You are a friendly financial assistant. Generate a concise, helpful response.

Context: ${context}
Data: ${JSON.stringify(data)}

Generate a friendly response in 2-3 sentences. Use emojis appropriately. Keep it conversational and helpful.`;

      const response = await client.chat.completions.create({
        model: modelUrl,
        messages: [
          { role: "system", content: "You are a friendly financial assistant." },
          { role: "user", content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 150,
      });

      await account.incrementUsage(true);

      return response.choices[0]?.message?.content || this.getFallbackResponse(context, data);
    } catch (error) {
      logger.error("Failed to generate AI response:", error);
      return this.getFallbackResponse(context, data);
    }
  }

  /**
   * Fallback response if AI fails
   */
  getFallbackResponse(context, data) {
    const templates = {
      transaction_added: "Transaction saved successfully!",
      balance_shown: "Here's your current balance.",
      transactions_shown: "Here are your transactions.",
      categories_shown: "Here are your categories.",
      category_added: "Category created successfully!",
      error: "Something went wrong. Please try again."
    };

    return templates[context] || templates.error;
  }
}

module.exports = new ConversationalAI();
