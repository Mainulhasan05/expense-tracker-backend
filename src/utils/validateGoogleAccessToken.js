require("dotenv").config();
const { OAuth2Client } = require("google-auth-library");

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const validateGoogleAccessToken = async (idToken) => {
  try {
    // Verify the ID Token
    const ticket = await client.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();

    return {
      valid: true,
      user: {
        googleId: payload.sub,
        email: payload.email,
        name: payload.name,
        picture: payload.picture,
      },
    };
  } catch (error) {
    console.error("Token Validation Error:", error);
    return {
      valid: false,
      error: error.message,
    };
  }
};

module.exports = validateGoogleAccessToken;
