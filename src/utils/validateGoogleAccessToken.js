require("dotenv").config();
const { OAuth2Client } = require("google-auth-library");
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const validateGoogleAccessToken = async (accessToken) => {
  try {
    client.setCredentials({ access_token: accessToken });

    const userInfoResponse = await client.request({
      url: "https://www.googleapis.com/oauth2/v3/userinfo",
    });

    const userInfo = userInfoResponse.data;

    return {
      valid: true,
      user: {
        googleId: userInfo.sub,
        email: userInfo.email,
        name: userInfo.name,
        picture: userInfo.picture,
      },
    };
  } catch (error) {
    return {
      valid: false,
      error: error.message,
    };
  }
};
