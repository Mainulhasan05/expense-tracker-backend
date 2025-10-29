const ClarifaiAccount = require("../models/ClarifaiAccount");
const logger = require("../config/logger");

class ClarifaiService {
  constructor() {
    this.baseUrl = "https://api.clarifai.com/v2/models";
  }

  /**
   * Generate optimized prompt for transaction parsing
   * Supports English, Bengali, and mixed language inputs
   */
  generatePrompt(userMessage, userCategories = []) {
    const categoryList = userCategories.length > 0
      ? userCategories.map(cat => `"${cat.name}" (${cat.type})`).join(", ")
      : "Groceries, Transport, Food, Shopping, Bills, Entertainment, Health, Medicine, Salary, Gift";

    return `You are a financial transaction parser for a Bangladeshi expense tracker app. Users may write in English, Bengali (বাংলা), Banglish (Bengali with English letters), or mixed language.

TASK: Parse the user's message and extract ALL transactions mentioned.

RULES:
1. Return ONLY valid JSON, nothing else
2. If the message is NOT about money/transactions, return: {"valid": false, "reason": "Not a transaction"}
3. Support multiple currencies: Taka (টাকা, tk, taka, ৳), Dollar ($), Rupee (₹)
4. Expense = negative amount, Income = positive amount
5. If no category matches perfectly, use "other"
6. Extract date if mentioned, otherwise use "today"
7. Support Bengali numbers: ০১২৩৪৫৬৭৮৯ and English numbers: 0123456789
8. Handle multiple transactions in one message

USER'S CATEGORIES: ${categoryList}

OUTPUT FORMAT (JSON):
{
  "valid": true,
  "transactions": [
    {
      "type": "expense" or "income",
      "amount": number (positive for income, negative for expense),
      "description": "brief description",
      "category": "category name from user's list or 'other'",
      "date": "YYYY-MM-DD" or "today",
      "currency": "BDT" or "USD" or "INR"
    }
  ]
}

EXAMPLES:
Input: "ricksha vara 20tk"
Output: {"valid": true, "transactions": [{"type": "expense", "amount": -20, "description": "Rickshaw fare", "category": "Transport", "date": "today", "currency": "BDT"}]}

Input: "আজকে ৫০০ টাকা বাজার করেছি"
Output: {"valid": true, "transactions": [{"type": "expense", "amount": -500, "description": "Grocery shopping", "category": "Groceries", "date": "today", "currency": "BDT"}]}

Input: "salary peyechi 50000 taka"
Output: {"valid": true, "transactions": [{"type": "income", "amount": 50000, "description": "Salary received", "category": "Salary", "date": "today", "currency": "BDT"}]}

Input: "lunch 250tk and coffee 80tk"
Output: {"valid": true, "transactions": [{"type": "expense", "amount": -250, "description": "Lunch", "category": "Food", "date": "today", "currency": "BDT"}, {"type": "expense", "amount": -80, "description": "Coffee", "category": "Food", "date": "today", "currency": "BDT"}]}

Input: "hello how are you"
Output: {"valid": false, "reason": "Not a transaction"}

USER MESSAGE: ${userMessage}

RETURN ONLY JSON:`;
  }

  /**
   * Call Clarifai API with a message
   */
  async callClarifai(account, prompt) {
    const raw = JSON.stringify({
      user_app_id: {
        user_id: account.userId,
        app_id: account.appId,
      },
      inputs: [
        {
          data: {
            text: {
              raw: prompt,
            },
          },
        },
      ],
    });

    const requestOptions = {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Key ${account.pat}`,
        "Content-Type": "application/json",
      },
      body: raw,
    };

    const url = `${this.baseUrl}/${account.modelId}/versions/${account.modelVersionId}/outputs`;

    try {
      const response = await fetch(url, requestOptions);
      const data = await response.json();

      if (data.status.code !== 10000) {
        throw new Error(data.status.description || "Clarifai API error");
      }

      const rawText = data.outputs[0]?.data?.text?.raw;
      if (!rawText) {
        throw new Error("No response from AI");
      }

      return rawText;
    } catch (error) {
      logger.error("Clarifai API call failed:", error);
      throw error;
    }
  }

  /**
   * Parse user message and extract transaction(s)
   */
  async parseTransaction(userMessage, userCategories = []) {
    const startTime = Date.now();

    try {
      // Get available account
      const account = await ClarifaiAccount.getAvailableAccount();

      if (!account) {
        throw new Error("No Clarifai accounts available. Please add an account first.");
      }

      logger.info(`Using Clarifai account: ${account.name}`);

      // Generate prompt
      const prompt = this.generatePrompt(userMessage, userCategories);

      // Call Clarifai API
      const rawResponse = await this.callClarifai(account, prompt);

      // Increment usage (success)
      await account.incrementUsage(true);

      // Parse JSON response
      let parsedResponse;
      try {
        // Clean response (remove markdown code blocks if present)
        const cleanedResponse = rawResponse
          .replace(/```json\n?/g, "")
          .replace(/```\n?/g, "")
          .trim();

        parsedResponse = JSON.parse(cleanedResponse);
      } catch (parseError) {
        logger.error("Failed to parse AI response as JSON:", rawResponse);
        throw new Error("AI returned invalid JSON format");
      }

      const duration = Date.now() - startTime;
      logger.info(`Transaction parsed in ${duration}ms using ${account.name}`);

      return {
        success: true,
        data: parsedResponse,
        accountUsed: account.name,
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(`Transaction parsing failed after ${duration}ms:`, error.message);

      // Try to increment usage (failure) if we have an account
      try {
        const account = await ClarifaiAccount.findOne({ isActive: true });
        if (account) {
          await account.incrementUsage(false);
        }
      } catch (err) {
        // Ignore error in error handler
      }

      return {
        success: false,
        error: error.message,
        duration,
      };
    }
  }

  /**
   * Test an account's configuration
   */
  async testAccount(accountId) {
    try {
      const account = await ClarifaiAccount.findById(accountId);
      if (!account) {
        throw new Error("Account not found");
      }

      const testMessage = "I spent 50 taka on lunch today";
      const prompt = this.generatePrompt(testMessage, []);

      const response = await this.callClarifai(account, prompt);

      return {
        success: true,
        response,
        message: "Account is working correctly",
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get usage statistics for all accounts
   */
  async getUsageStats() {
    try {
      const accounts = await ClarifaiAccount.find({ isActive: true });

      const stats = accounts.map((account) => ({
        id: account._id,
        name: account.name,
        totalRequests: account.usage.totalRequests,
        successfulRequests: account.usage.successfulRequests,
        failedRequests: account.usage.failedRequests,
        monthlyRequests: account.usage.monthlyRequests,
        monthlyLimit: account.limits.monthlyLimit,
        percentageUsed: (
          (account.usage.monthlyRequests / account.limits.monthlyLimit) *
          100
        ).toFixed(1),
        lastUsed: account.usage.lastUsed,
        hasReachedLimit: account.hasReachedLimit(),
      }));

      return {
        success: true,
        stats,
        totalAccounts: accounts.length,
        totalRequests: stats.reduce((sum, s) => sum + s.totalRequests, 0),
      };
    } catch (error) {
      logger.error("Failed to get usage stats:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }
}

module.exports = new ClarifaiService();
