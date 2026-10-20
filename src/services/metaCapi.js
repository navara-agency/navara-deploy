const crypto = require('crypto');
const logger = require('../config/logger');

// Meta Conversions API — server-side copy of the browser Pixel events. The browser
// sends the same event with the same event_id, so Meta keeps one and drops the other.
// Pixel ID is public (it's in the page source); the access token is a secret and only
// ever comes from env. Without a token every call is a no-op so dev/test never hit Meta.
const GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v21.0';
const MARKET_TO_COUNTRY = { Egypt: 'eg', KSA: 'sa' };

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

// Meta's normalisation rules: trim + lowercase, phones as digits only with country code.
function hashed(value) {
  if (value == null) return undefined;
  const v = String(value).trim().toLowerCase();
  return v ? [sha256(v)] : undefined;
}

function hashedPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits ? [sha256(digits)] : undefined;
}

function buildUserData(lead, ctx = {}) {
  const [first, ...rest] = String(lead.name || '').trim().split(/\s+/);
  const userData = {
    em: hashed(lead.email),
    ph: hashedPhone(lead.phone),
    fn: hashed(first),
    ln: hashed(rest.join(' ')),
    country: hashed(MARKET_TO_COUNTRY[lead.market]),
    external_id: hashed(`lead-${lead.id}`),
    client_ip_address: ctx.ip || undefined,
    client_user_agent: ctx.userAgent || undefined,
    fbp: ctx.fbp || undefined,
    fbc: ctx.fbc || undefined,
  };
  // Drop empty keys — Meta rejects nulls in user_data.
  return Object.fromEntries(Object.entries(userData).filter(([, v]) => v !== undefined));
}

async function sendEvent({ eventName, eventId, sourceUrl, userData, customData }) {
  const pixelId = process.env.META_PIXEL_ID || '1786477375958405';
  const token = process.env.META_CAPI_TOKEN;
  if (!pixelId || !token) return { skipped: true };

  const body = {
    data: [{
      event_name: eventName,
      event_time: Math.floor(Date.now() / 1000),
      event_id: eventId,
      action_source: 'website',
      event_source_url: sourceUrl || undefined,
      user_data: userData,
      custom_data: customData || undefined,
    }],
  };
  if (process.env.META_TEST_EVENT_CODE) body.test_event_code = process.env.META_TEST_EVENT_CODE;

  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${pixelId}/events?access_token=${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    logger.warn({ status: res.status, error: json?.error?.message, eventName, eventId }, 'meta capi rejected event');
    return { ok: false, error: json?.error?.message || `HTTP ${res.status}` };
  }
  return { ok: true, received: json?.events_received };
}

// Lead = contact form saved (success panel) or Cal.com booking confirmed — the page sends one.
async function sendLeadEvent(lead, ctx = {}) {
  return sendEvent({
    eventName: 'Lead',
    eventId: `lead-${lead.id}`,
    sourceUrl: ctx.sourceUrl,
    userData: buildUserData(lead, ctx),
    customData: {
      content_name: 'Contact form',
      content_category: lead.industry || undefined,
      lead_market: lead.market,
      lead_budget: lead.budget || undefined,
    },
  });
}

module.exports = { sendLeadEvent, buildUserData, hashedPhone };
