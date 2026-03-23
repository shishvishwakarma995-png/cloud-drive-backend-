import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

// Share notification email
export const sendShareNotification = async ({
  toEmail,
  fromName,
  fileName,
  permission,
  shareUrl,
}: {
  toEmail: string;
  fromName: string;
  fileName: string;
  permission: string;
  shareUrl: string;
}) => {
  try {
    await transporter.sendMail({
      from: `"Cloud Drive" <${process.env.GMAIL_USER}>`,
      to: toEmail,
      subject: `${fromName} shared "${fileName}" with you`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin:0;padding:0;background:#f5f5f5;font-family:Georgia,serif;">
          <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
            
            <!-- Header -->
            <div style="background:linear-gradient(135deg,#7c3aed,#d4af37);padding:32px;text-align:center;">
              <div style="width:48px;height:48px;background:rgba(255,255,255,0.2);border-radius:12px;margin:0 auto 12px;display:flex;align-items:center;justify-content:center;">
                ☁️
              </div>
              <h1 style="color:#fff;margin:0;font-size:22px;font-weight:bold;">Cloud Drive</h1>
            </div>

            <!-- Body -->
            <div style="padding:32px;">
              <h2 style="color:#1a1a2e;font-size:18px;margin:0 0 8px;">
                ${fromName} shared a file with you
              </h2>
              <p style="color:#6b7280;font-size:14px;margin:0 0 24px;">
                You now have <strong>${permission === 'edit' ? 'edit' : 'view'}</strong> access to:
              </p>

              <!-- File Card -->
              <div style="background:#f8f7ff;border:1px solid #e5e0ff;border-radius:12px;padding:16px;margin-bottom:24px;display:flex;align-items:center;gap:12px;">
                <div style="width:40px;height:40px;background:linear-gradient(135deg,#7c3aed,#d4af37);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:18px;">
                  📄
                </div>
                <div>
                  <p style="color:#1a1a2e;font-weight:bold;margin:0;font-size:15px;">${fileName}</p>
                  <p style="color:#7c3aed;margin:0;font-size:12px;">
                    ${permission === 'edit' ? '✏️ Can edit' : '👁️ View only'}
                  </p>
                </div>
              </div>

              <!-- CTA Button -->
              <a href="${shareUrl}" 
                style="display:block;background:linear-gradient(135deg,#7c3aed,#d4af37);color:#fff;text-decoration:none;padding:14px 24px;border-radius:12px;font-weight:bold;font-size:15px;text-align:center;">
                Open in Cloud Drive →
              </a>

              <p style="color:#9ca3af;font-size:12px;text-align:center;margin-top:24px;">
                You received this email because ${fromName} shared a file with you on Cloud Drive.
              </p>
            </div>

          </div>
        </body>
        </html>
      `,
    });
    console.log(`✅ Share email sent to ${toEmail}`);
  } catch (err: any) {
    console.log('❌ Email send failed:', err.message);
    // Email fail ho to bhi share kaam kare
  }
};

// Public link share email
export const sendLinkShareEmail = async ({
  toEmail,
  fromName,
  fileName,
  shareUrl,
  expiresAt,
}: {
  toEmail: string;
  fromName: string;
  fileName: string;
  shareUrl: string;
  expiresAt?: string;
}) => {
  try {
    await transporter.sendMail({
      from: `"Cloud Drive" <${process.env.GMAIL_USER}>`,
      to: toEmail,
      subject: `${fromName} shared a file link with you`,
      html: `
        <!DOCTYPE html>
        <html>
        <body style="margin:0;padding:0;background:#f5f5f5;font-family:Georgia,serif;">
          <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
            <div style="background:linear-gradient(135deg,#7c3aed,#d4af37);padding:32px;text-align:center;">
              <h1 style="color:#fff;margin:0;font-size:22px;">☁️ Cloud Drive</h1>
            </div>
            <div style="padding:32px;">
              <h2 style="color:#1a1a2e;font-size:18px;margin:0 0 8px;">
                ${fromName} shared a file with you
              </h2>
              <p style="color:#6b7280;font-size:14px;margin:0 0 24px;">
                <strong>${fileName}</strong>
                ${expiresAt ? `<br><span style="color:#ef4444;">Expires: ${new Date(expiresAt).toLocaleDateString()}</span>` : ''}
              </p>
              <a href="${shareUrl}"
                style="display:block;background:linear-gradient(135deg,#7c3aed,#d4af37);color:#fff;text-decoration:none;padding:14px 24px;border-radius:12px;font-weight:bold;font-size:15px;text-align:center;">
                View File →
              </a>
            </div>
          </div>
        </body>
        </html>
      `,
    });
    console.log(`✅ Link share email sent to ${toEmail}`);
  } catch (err: any) {
    console.log('❌ Link email failed:', err.message);
  }
};