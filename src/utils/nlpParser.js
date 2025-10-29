const nlp = require('compromise');

/**
 * Natural Language Parser for expense messages
 * Parses messages like:
 * - "spent 50 on groceries"
 * - "paid 45.50 for lunch"
 * - "coffee 5 bucks"
 * - "earned 2000 from salary"
 */

class NLPParser {
  constructor() {
    // Category keywords mapping
    this.categoryKeywords = {
      'Groceries': ['grocery', 'groceries', 'walmart', 'supermarket', 'food', 'vegetables', 'meat', 'bread'],
      'Transport': ['gas', 'fuel', 'petrol', 'uber', 'lyft', 'taxi', 'bus', 'train', 'transport'],
      'Entertainment': ['movie', 'cinema', 'netflix', 'spotify', 'game', 'concert', 'entertainment'],
      'Food & Dining': ['lunch', 'dinner', 'breakfast', 'restaurant', 'cafe', 'pizza', 'burger'],
      'Coffee': ['coffee', 'starbucks', 'cafe', 'espresso', 'latte'],
      'Medicine': ['medicine', 'pharmacy', 'drug', 'doctor', 'hospital', 'medical'],
      'Family': ['family', 'kids', 'children', 'baby', 'school'],
      'Salary': ['salary', 'paycheck', 'wage', 'income', 'payment'],
      'Gift': ['gift', 'present', 'bonus'],
    };

    // Income keywords
    this.incomeKeywords = ['earned', 'income', 'salary', 'paycheck', 'received', 'got paid', 'bonus', 'gift'];

    // Expense keywords
    this.expenseKeywords = ['spent', 'paid', 'bought', 'purchase', 'cost', 'expense'];
  }

  /**
   * Parse expense/income from natural language text
   * @param {string} text - The text to parse
   * @returns {Object} - Parsed expense data
   */
  parse(text) {
    const lowerText = text.toLowerCase();

    // Extract amount
    const amount = this.extractAmount(text);

    // Detect type (income or expense)
    const type = this.detectType(lowerText);

    // Detect category
    const category = this.detectCategory(lowerText, type);

    // Extract description/note
    const description = this.extractDescription(text, amount);

    return {
      amount,
      type,
      category,
      description,
      originalText: text
    };
  }

  /**
   * Extract monetary amount from text
   */
  extractAmount(text) {
    // Try to find numbers with compromise
    const doc = nlp(text);
    const values = doc.values().toNumber().out('array');

    if (values.length > 0) {
      return parseFloat(values[0]);
    }

    // Fallback to regex for various formats
    const patterns = [
      /\$?\s*(\d+\.?\d*)/,           // $50, 50, 50.50
      /(\d+\.?\d*)\s*(?:dollar|buck|usd|rs)/i,  // 50 dollars, 50 bucks
      /(\d+\.?\d*)\s*tk/i,           // 50 tk (Taka)
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return parseFloat(match[1]);
      }
    }

    return null;
  }

  /**
   * Detect if it's income or expense
   */
  detectType(lowerText) {
    // Check for income keywords
    for (const keyword of this.incomeKeywords) {
      if (lowerText.includes(keyword)) {
        return 'income';
      }
    }

    // Check for expense keywords
    for (const keyword of this.expenseKeywords) {
      if (lowerText.includes(keyword)) {
        return 'expense';
      }
    }

    // Default to expense if no specific keyword found
    return 'expense';
  }

  /**
   * Detect category from text
   */
  detectCategory(lowerText, type) {
    let bestMatch = null;
    let maxMatches = 0;

    for (const [category, keywords] of Object.entries(this.categoryKeywords)) {
      let matches = 0;

      for (const keyword of keywords) {
        if (lowerText.includes(keyword)) {
          matches++;
        }
      }

      if (matches > maxMatches) {
        maxMatches = matches;
        bestMatch = category;
      }
    }

    // If no match found, use defaults based on type
    if (!bestMatch) {
      return type === 'income' ? 'Salary' : 'Entertainment';
    }

    return bestMatch;
  }

  /**
   * Extract description from text
   */
  extractDescription(text, amount) {
    // Remove the amount from text to get description
    let description = text.replace(/\$?\s*\d+\.?\d*/g, '').trim();

    // Remove common words
    const removeWords = ['spent', 'paid', 'bought', 'on', 'for', 'at', 'in', 'the', 'a', 'an'];
    removeWords.forEach(word => {
      description = description.replace(new RegExp(`\\b${word}\\b`, 'gi'), '').trim();
    });

    // Clean up multiple spaces
    description = description.replace(/\s+/g, ' ').trim();

    return description || 'Quick expense';
  }

  /**
   * Parse quick format: "category amount"
   * Examples: "groceries 50", "coffee 5.50"
   */
  parseQuickFormat(text) {
    const parts = text.trim().split(/\s+/);

    if (parts.length >= 2) {
      const amount = parseFloat(parts[parts.length - 1]);

      if (!isNaN(amount)) {
        const categoryText = parts.slice(0, -1).join(' ').toLowerCase();
        const category = this.detectCategory(categoryText, 'expense');

        return {
          amount,
          type: 'expense',
          category,
          description: categoryText,
          originalText: text
        };
      }
    }

    return null;
  }

  /**
   * Validate parsed result
   */
  isValid(parsed) {
    return parsed && parsed.amount && parsed.amount > 0 && parsed.category;
  }
}

module.exports = new NLPParser();
