function getEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/**
 * Send an email using Resend API directly via fetch.
 * This avoids the ESM compatibility issues with the resend SDK.
 */
async function sendEmail(options: {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<void> {
  const apiKey = getEnvVar("RESEND_API_KEY");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from: options.from,
      to: [options.to],
      subject: options.subject,
      html: options.html,
      text: options.text,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      `Failed to send email: ${response.status} ${JSON.stringify(errorData)}`
    );
  }
}

/**
 * Sends a magic link email to the specified address.
 * @param email - The recipient's email address
 * @param token - The magic link token
 */
export async function sendMagicLink(email: string, token: string): Promise<void> {
  const baseUrl = process.env.APP_URL ?? "http://localhost:3000";
  const magicLinkUrl = `${baseUrl}/auth/verify?token=${encodeURIComponent(token)}`;
  const fromEmail = process.env.EMAIL_FROM ?? "OpenClawd <noreply@openclaw.ai>";

  await sendEmail({
    from: fromEmail,
    to: email,
    subject: "Sign in to OpenClawd",
    text: `Sign in to OpenClawd\n\nClick the link below to sign in. This link will expire in 15 minutes.\n\n${magicLinkUrl}\n\nIf you didn't request this email, you can safely ignore it.`,
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sign in to OpenClawd</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f5f5f5; margin: 0; padding: 20px;">
  <div style="max-width: 500px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; padding: 40px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
    <h1 style="color: #1a1a1a; font-size: 24px; margin: 0 0 20px 0;">Sign in to OpenClawd</h1>
    <p style="color: #4a4a4a; font-size: 16px; line-height: 1.5; margin: 0 0 30px 0;">
      Click the button below to sign in. This link will expire in 15 minutes.
    </p>
    <a href="${magicLinkUrl}" style="display: inline-block; background-color: #0066cc; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 6px; font-weight: 600; font-size: 16px;">
      Sign in
    </a>
    <p style="color: #888888; font-size: 14px; line-height: 1.5; margin: 30px 0 0 0;">
      If you didn't request this email, you can safely ignore it.
    </p>
    <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
    <p style="color: #888888; font-size: 12px; margin: 0;">
      If the button doesn't work, copy and paste this link into your browser:<br>
      <a href="${magicLinkUrl}" style="color: #0066cc; word-break: break-all;">${magicLinkUrl}</a>
    </p>
  </div>
</body>
</html>
    `.trim(),
  });
}
