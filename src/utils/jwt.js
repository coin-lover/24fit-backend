const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const RefreshToken = require('../models/RefreshToken');

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
const ACCESS_EXPIRY = process.env.JWT_ACCESS_EXPIRY || '15m';
const REFRESH_EXPIRY_DAYS = parseInt(process.env.JWT_REFRESH_EXPIRY || '7d', 10);

function generateAccessToken(user) {
  // 'none' issues a token without exp — valid until revoked (no revocation
  // mechanism exists; deleting the user invalidates the sub lookup downstream).
  const signOptions = { algorithm: 'HS256' };
  if (ACCESS_EXPIRY.trim().toLowerCase() !== 'none') {
    signOptions.expiresIn = ACCESS_EXPIRY;
  }
  return jwt.sign(
    { sub: user._id.toString(), email: user.email },
    ACCESS_SECRET,
    signOptions
  );
}

function verifyAccessToken(token) {
  return jwt.verify(token, ACCESS_SECRET, { algorithms: ['HS256'] });
}

async function generateRefreshToken(userId) {
  const token = uuidv4();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + REFRESH_EXPIRY_DAYS);

  await RefreshToken.create({
    userId,
    token,
    expiresAt,
  });

  return token;
}

module.exports = {
  generateAccessToken,
  verifyAccessToken,
  generateRefreshToken,
};
