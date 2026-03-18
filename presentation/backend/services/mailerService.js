const nodemailer = require("nodemailer");
const path = require("path");
const { spawn } = require("child_process");
const ApiError = require("../utils/apiError");

let transporter;
let transporterSignature = "";

function toBool(value, defaultValue = false) {
  if (value === undefined || value === null) return defaultValue;
  return String(value).toLowerCase() === "true";
}

function getMailProvider() {
  return String(process.env.MAIL_PROVIDER || "node").trim().toLowerCase();
}

function getSmtpConfig(overrideConfig = null) {
  const baseConfig = {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: toBool(process.env.SMTP_SECURE, false),
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.SMTP_FROM || process.env.SMTP_USER || "",
    starttls: toBool(process.env.SMTP_STARTTLS, true),
    timeoutSeconds: Number(process.env.SMTP_TIMEOUT_SECONDS || 20),
    provider: getMailProvider()
  };

  if (!overrideConfig) return baseConfig;

  return {
    ...baseConfig,
    ...overrideConfig,
    port: Number(overrideConfig.port ?? baseConfig.port),
    secure:
      overrideConfig.secure !== undefined
        ? Boolean(overrideConfig.secure)
        : baseConfig.secure,
    starttls:
      overrideConfig.starttls !== undefined
        ? Boolean(overrideConfig.starttls)
        : baseConfig.starttls,
    timeoutSeconds: Number(overrideConfig.timeoutSeconds ?? baseConfig.timeoutSeconds),
    provider: String(overrideConfig.provider || baseConfig.provider || "node")
      .trim()
      .toLowerCase()
  };
}

function assertSmtpConfig(config) {
  if (!config.host || !config.port || !config.user || !config.pass || !config.from) {
    throw new ApiError(500, "SMTP configuration is incomplete");
  }
}

function buildTransporter(smtpConfig) {
  return nodemailer.createTransport({
    host: smtpConfig.host,
    port: smtpConfig.port,
    secure: smtpConfig.secure,
    auth: {
      user: smtpConfig.user,
      pass: smtpConfig.pass
    },
    requireTLS: smtpConfig.starttls
  });
}

function getTransporter(smtpConfigOverride = null) {
  const smtpConfig = getSmtpConfig(smtpConfigOverride);
  assertSmtpConfig(smtpConfig);

  if (smtpConfigOverride) {
    return buildTransporter(smtpConfig);
  }

  const signature = `${smtpConfig.host}:${smtpConfig.port}:${smtpConfig.user}:${smtpConfig.secure}:${smtpConfig.starttls}`;
  if (!transporter || transporterSignature !== signature) {
    transporter = buildTransporter(smtpConfig);
    transporterSignature = signature;
  }

  return transporter;
}

function sendWithPythonMailer(payload, smtpConfigOverride = null) {
  const smtpConfig = getSmtpConfig(smtpConfigOverride);
  assertSmtpConfig(smtpConfig);

  const pythonBin =
    process.env.PYTHON_BIN || (process.platform === "win32" ? "python" : "python3");
  const scriptPath =
    process.env.PYTHON_MAIL_SCRIPT || path.join(__dirname, "..", "scripts", "send_mail.py");

  return new Promise((resolve, reject) => {
    const child = spawn(pythonBin, [scriptPath], {
      stdio: ["pipe", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      reject(
        new ApiError(502, "Failed to execute Python mailer", {
          error: error.message
        })
      );
    });

    child.on("close", (code) => {
      if (code !== 0) {
        reject(
          new ApiError(502, "Python mailer exited with an error", {
            stderr: (stderr || stdout || "").trim() || `exit_code_${code}`
          })
        );
        return;
      }

      let parsed;
      try {
        parsed = JSON.parse((stdout || "").trim() || "{}");
      } catch (error) {
        reject(new ApiError(502, "Python mailer returned invalid JSON"));
        return;
      }

      if (!parsed.ok) {
        reject(
          new ApiError(502, "Python mailer could not send email", {
            error: parsed.error || "unknown_error"
          })
        );
        return;
      }

      resolve(parsed);
    });

    child.stdin.write(
      JSON.stringify({
        smtp: smtpConfig,
        message: payload
      })
    );
    child.stdin.end();
  });
}

async function sendMail({ to, subject, text, html, smtpConfig = null }) {
  const smtpConfigOverride = smtpConfig;
  const effectiveSmtpConfig = getSmtpConfig(smtpConfigOverride);
  const payload = {
    from: effectiveSmtpConfig.from,
    to,
    subject,
    text,
    html
  };

  if (effectiveSmtpConfig.provider === "python") {
    return sendWithPythonMailer(payload, effectiveSmtpConfig);
  }

  const smtp = getTransporter(smtpConfigOverride);
  return smtp.sendMail(payload);
}

module.exports = {
  sendMail
};
