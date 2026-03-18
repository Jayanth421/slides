const bcrypt = require("bcrypt");
const crypto = require("crypto");
const { OTP_PURPOSES } = require("../config/constants");
const ApiError = require("../utils/apiError");
const {
  createOtp,
  getLatestActiveOtp,
  markOtpUsed,
  revokeActiveOtps
} = require("../models/otpModel");
const { sendMail } = require("./mailerService");

function generateOtpCode() {
  return String(crypto.randomInt(100000, 1000000));
}

function getOtpPolicy() {
  const expiryMinutes = Math.max(1, Number(process.env.OTP_EXPIRY_MINUTES || 5));
  const resendCooldownSeconds = Math.max(
    0,
    Number(process.env.OTP_RESEND_COOLDOWN_SECONDS || 60)
  );
  return { expiryMinutes, resendCooldownSeconds };
}

function buildExpiryDate(expiryMinutes) {
  return new Date(Date.now() + expiryMinutes * 60 * 1000);
}

function getRemainingCooldownSeconds(createdAt, cooldownSeconds) {
  const elapsed = Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000);
  return Math.max(0, cooldownSeconds - elapsed);
}

async function createAndSendOtp({
  email,
  userId = null,
  purpose = OTP_PURPOSES.REGISTRATION,
  contextToken = null
}) {
  const { expiryMinutes, resendCooldownSeconds } = getOtpPolicy();
  const latestActiveOtp = await getLatestActiveOtp({ email, purpose, contextToken });
  if (latestActiveOtp && resendCooldownSeconds > 0) {
    const retryAfterSeconds = getRemainingCooldownSeconds(
      latestActiveOtp.createdAt,
      resendCooldownSeconds
    );
    if (retryAfterSeconds > 0) {
      throw new ApiError(429, "OTP requested too frequently. Please try again shortly.", {
        retryAfterSeconds
      });
    }
  }

  const otp = generateOtpCode();
  const otpHash = await bcrypt.hash(otp, 10);
  const expiresAt = buildExpiryDate(expiryMinutes);

  await revokeActiveOtps({ email, purpose, contextToken });
  await createOtp({
    email,
    userId,
    otpHash,
    purpose,
    contextToken,
    expiresAt
  });

  const text = `Your CMR Smart Portal OTP is ${otp}. It expires in ${expiryMinutes} minutes.`;
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.4;">
      <h3>CMR Smart Presentation Portal</h3>
      <p>Your OTP is:</p>
      <p style="font-size: 24px; font-weight: bold; letter-spacing: 2px;">${otp}</p>
      <p>This OTP expires in ${expiryMinutes} minutes.</p>
    </div>
  `;

  await sendMail({
    to: email,
    subject: "CMR Smart Portal OTP Verification",
    text,
    html
  });

  return { expiresAt };
}

async function verifyOtp({ email, otp, purpose, contextToken = null }) {
  const record = await getLatestActiveOtp({ email, purpose, contextToken });
  if (!record) {
    return { valid: false, reason: "OTP_NOT_FOUND" };
  }

  if (record.usedAt) {
    return { valid: false, reason: "OTP_USED" };
  }

  if (new Date(record.expiresAt).getTime() < Date.now()) {
    return { valid: false, reason: "OTP_EXPIRED" };
  }

  const isMatch = await bcrypt.compare(String(otp), record.otpHash);
  if (!isMatch) {
    return { valid: false, reason: "OTP_INVALID" };
  }

  await markOtpUsed(record.id);
  return { valid: true, userId: record.userId };
}

module.exports = {
  createAndSendOtp,
  verifyOtp
};
