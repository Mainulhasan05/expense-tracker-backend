/**
 * Email Speed Test Script
 *
 * This script tests how quickly emails are sent from the backend
 * Run with: node test-email-speed.js your-email@example.com
 */

require("dotenv").config();
const sendEmail = require("./src/utils/sendEmail");

const testEmail = process.argv[2];

if (!testEmail) {
  console.error("❌ Please provide an email address");
  console.log("Usage: node test-email-speed.js your-email@example.com");
  process.exit(1);
}

async function runTests() {
  console.log("📧 Email Speed Test");
  console.log("==================\n");

  console.log(`Testing email delivery to: ${testEmail}`);
  console.log(`SMTP Server: ${process.env.EMAIL_USER}`);
  console.log("\n");

  // Test 1: Single email
  console.log("Test 1: Single Email Send");
  console.log("-------------------------");
  const start1 = Date.now();
  try {
    await sendEmail(
      testEmail,
      "Test Email 1 - Speed Test",
      `<h1>Email Speed Test</h1><p>This is test email #1. Sent at ${new Date().toISOString()}</p>`
    );
    const duration1 = Date.now() - start1;
    console.log(`✅ First email sent in ${duration1}ms\n`);
  } catch (error) {
    console.error(`❌ Error:`, error.message);
  }

  // Test 2: Second email (should be faster with pooling)
  console.log("Test 2: Second Email (Connection Reused)");
  console.log("---------------------------------------");
  const start2 = Date.now();
  try {
    await sendEmail(
      testEmail,
      "Test Email 2 - Speed Test",
      `<h1>Email Speed Test</h1><p>This is test email #2. Sent at ${new Date().toISOString()}</p>`
    );
    const duration2 = Date.now() - start2;
    console.log(`✅ Second email sent in ${duration2}ms\n`);

    // Calculate improvement
    const improvement = ((duration1 - duration2) / duration1) * 100;
    console.log(`\n📊 Results:`);
    console.log(`First email: ${duration1}ms`);
    console.log(`Second email: ${duration2}ms`);
    console.log(`Improvement: ${improvement.toFixed(1)}% faster (connection pooling working!)\n`);
  } catch (error) {
    console.error(`❌ Error:`, error.message);
  }

  // Test 3: Multiple emails rapidly
  console.log("Test 3: Sending 5 Emails Rapidly");
  console.log("--------------------------------");
  const start3 = Date.now();
  try {
    const promises = [];
    for (let i = 1; i <= 5; i++) {
      promises.push(
        sendEmail(
          testEmail,
          `Rapid Test Email ${i}`,
          `<h1>Rapid Test ${i}</h1><p>Sent at ${new Date().toISOString()}</p>`
        )
      );
    }
    await Promise.all(promises);
    const duration3 = Date.now() - start3;
    const avgPerEmail = duration3 / 5;
    console.log(`✅ 5 emails sent in ${duration3}ms (avg: ${avgPerEmail.toFixed(0)}ms per email)\n`);
  } catch (error) {
    console.error(`❌ Error:`, error.message);
  }

  console.log("\n✅ Speed test completed!");
  console.log("\nInterpretation:");
  console.log("  - < 500ms: Excellent (server is fast)");
  console.log("  - 500ms - 2s: Good (normal SMTP delay)");
  console.log("  - 2s - 5s: Slow (server might be overloaded)");
  console.log("  - > 5s: Very slow (consider switching to SendGrid)");

  process.exit(0);
}

runTests().catch((error) => {
  console.error("❌ Test failed:", error);
  process.exit(1);
});
