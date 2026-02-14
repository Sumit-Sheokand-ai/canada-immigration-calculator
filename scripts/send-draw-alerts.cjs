#!/usr/bin/env node
const path = require('path');
const { pathToFileURL } = require('url');

const REQUIRED_ENV = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'MAILGUN_API_KEY',
  'MAILGUN_DOMAIN',
  'ALERT_FROM_EMAIL',
];

const EMAIL_HTML_TEMPLATE = `
<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f6fb;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="620" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e5e7eb;">
            <tr>
              <td style="background:linear-gradient(135deg,#4f2ab3,#7c3aed);padding:22px 24px;color:#ffffff;">
                <h1 style="margin:0;font-size:22px;line-height:1.3;">🍁 CRS Draw Alert</h1>
                <p style="margin:8px 0 0 0;font-size:14px;opacity:.95;">Official IRCC draw data update</p>
              </td>
            </tr>
            <tr>
              <td style="padding:22px 24px;">
                <p style="margin:0 0 10px 0;font-size:15px;">Hi {{name}},</p>
                <p style="margin:0 0 14px 0;font-size:15px;line-height:1.6;">
                  Good news — your saved CRS score is now at/above the latest draw cutoff.
                </p>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;">
                  <tr>
                    <td style="padding:14px 16px;font-size:14px;">
                      <div style="margin-bottom:6px;"><strong>Your CRS:</strong> {{score}}</div>
                      <div style="margin-bottom:6px;"><strong>Latest cutoff:</strong> {{cutoff}}</div>
                      <div><strong>Data updated:</strong> {{last_updated}}</div>
                    </td>
                  </tr>
                </table>
                <div style="margin-top:18px;">
                  <a href="{{site_url}}" style="display:inline-block;background:#7c3aed;color:#ffffff;text-decoration:none;padding:11px 16px;border-radius:8px;font-size:14px;font-weight:600;margin-right:8px;">
                    Open Calculator
                  </a>
                  <a href="{{share_url}}" style="display:inline-block;background:#eef2ff;color:#4c1d95;text-decoration:none;padding:11px 16px;border-radius:8px;font-size:14px;font-weight:600;">
                    View Saved Profile
                  </a>
                </div>
                <p style="margin:18px 0 0 0;font-size:13px;color:#6b7280;line-height:1.6;">
                  Tip: Compare scenarios (IELTS/experience/education) to plan your next +20 to +50 points.
                </p>
              </td>
            </tr>
            <tr>
              <td style="border-top:1px solid #e5e7eb;padding:14px 24px;background:#fafafa;">
                <p style="margin:0;font-size:12px;color:#6b7280;line-height:1.6;">
                  You’re receiving this because you opted in for draw alerts.<br/>
                  <a href="{{unsubscribe_url}}" style="color:#6d28d9;text-decoration:none;">Unsubscribe</a>
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
`;

const EMAIL_TEXT_TEMPLATE = `
Hi {{name}},

Good news — your saved CRS score ({{score}}) is at or above the latest draw cutoff ({{cutoff}}).

Data updated: {{last_updated}}
Open calculator: {{site_url}}
View saved profile: {{share_url}}

You’re receiving this because you opted in for draw alerts.
Unsubscribe: {{unsubscribe_url}}
`.trim();

function getEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function getHeaders(serviceKey) {
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  };
}

function renderTemplate(template, values) {
  let out = template;
  for (const [key, value] of Object.entries(values)) {
    out = out.replaceAll(`{{${key}}}`, String(value ?? ''));
  }
  return out;
}

async function loadLatestCutoff() {
  const modulePath = path.resolve(__dirname, '..', 'src', 'data', 'crsData.js');
  const moduleUrl = `${pathToFileURL(modulePath).href}?v=${Date.now()}`;
  const mod = await import(moduleUrl);
  const cutoff = mod?.latestDraws?.averageCutoff;
  if (!Number.isFinite(cutoff)) {
    throw new Error('Could not read latestDraws.averageCutoff from src/data/crsData.js');
  }
  return {
    cutoff,
    lastUpdated: mod?.latestDraws?.lastUpdated || new Date().toISOString().slice(0, 10),
  };
}

async function fetchSubscribers(supabaseUrl, serviceKey) {
  const select = encodeURIComponent('id,name,email,score,alert_token,last_alert_cutoff');
  const url = `${supabaseUrl}/rest/v1/saved_profiles?alert_opt_in=eq.true&email=not.is.null&select=${select}`;
  const res = await fetch(url, { headers: getHeaders(serviceKey) });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase query failed (${res.status}): ${text}`);
  }
  return res.json();
}

async function updateAlertState(supabaseUrl, serviceKey, id, cutoff) {
  const payload = {
    last_alert_cutoff: cutoff,
    last_alert_sent_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const url = `${supabaseUrl}/rest/v1/saved_profiles?id=eq.${encodeURIComponent(id)}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      ...getHeaders(serviceKey),
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase update failed (${res.status}): ${text}`);
  }
}

async function sendMailgunEmail({ apiKey, domain, from, to, subject, text, html }) {
  const auth = Buffer.from(`api:${apiKey}`).toString('base64');
  const body = new URLSearchParams({
    from,
    to,
    subject,
    text,
    html,
  });
  const res = await fetch(`https://api.mailgun.net/v3/${domain}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  if (!res.ok) {
    const textBody = await res.text();
    throw new Error(`Mailgun send failed (${res.status}): ${textBody}`);
  }
}

async function main() {
  for (const key of REQUIRED_ENV) getEnv(key);

  const supabaseUrl = getEnv('SUPABASE_URL');
  const serviceKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');
  const mailgunApiKey = getEnv('MAILGUN_API_KEY');
  const mailgunDomain = getEnv('MAILGUN_DOMAIN');
  const fromEmail = getEnv('ALERT_FROM_EMAIL');
  const siteUrl = process.env.SITE_URL || 'https://bostify.me/';

  const { cutoff, lastUpdated } = await loadLatestCutoff();
  console.log(`Latest cutoff from CRS data: ${cutoff} (updated ${lastUpdated})`);

  const subscribers = await fetchSubscribers(supabaseUrl, serviceKey);
  if (!Array.isArray(subscribers) || subscribers.length === 0) {
    console.log('No alert subscribers found.');
    return;
  }

  let sent = 0;
  let skipped = 0;
  for (const row of subscribers) {
    const score = Number(row.score) || 0;
    const alreadySentForCutoff = Number(row.last_alert_cutoff) === cutoff;
    if (score < cutoff || alreadySentForCutoff) {
      skipped++;
      continue;
    }

    const unsubscribeUrl = row.alert_token
      ? `${siteUrl.replace(/\/+$/, '')}/?unsubscribe=${encodeURIComponent(row.alert_token)}`
      : siteUrl;
    const shareUrl = `${siteUrl.replace(/\/+$/, '')}/?profile=${encodeURIComponent(row.id)}`;
    const subject = `CRS draw alert: your score (${score}) is at/above cutoff (${cutoff})`;
    const values = {
      name: row.name || 'there',
      score,
      cutoff,
      last_updated: lastUpdated,
      site_url: siteUrl,
      share_url: shareUrl,
      unsubscribe_url: unsubscribeUrl,
    };
    const text = renderTemplate(EMAIL_TEXT_TEMPLATE, values);
    const html = renderTemplate(EMAIL_HTML_TEMPLATE, values);

    await sendMailgunEmail({
      apiKey: mailgunApiKey,
      domain: mailgunDomain,
      from: fromEmail,
      to: row.email,
      subject,
      text,
      html,
    });
    await updateAlertState(supabaseUrl, serviceKey, row.id, cutoff);
    sent++;
  }

  console.log(`Draw alert run complete. sent=${sent}, skipped=${skipped}, total=${subscribers.length}`);
}

main().catch((err) => {
  console.error('Draw alert runner failed:', err.message);
  process.exit(1);
});
