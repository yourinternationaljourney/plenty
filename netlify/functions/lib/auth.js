// Authentication: Netlify verifies the Identity JWT before invoking the function and exposes the verified claims as
// context.clientContext.user. We never trust ids sent in the body or query; the owner is always derived from that token.
'use strict';
const { HttpError } = require('./http');

function requireUser(context) {
  const u = context && context.clientContext && context.clientContext.user;
  if (!u || !u.sub) throw new HttpError(401, 'unauthenticated', 'Sign in to use your Plenty account.');
  return { id: String(u.sub), email: String(u.email || ''), emailVerified: !!(u.email_verified || (u.app_metadata && u.app_metadata.provider)), meta: u.user_metadata || {} };
}

// Identity admin access (URL + short-lived admin token) is injected by Netlify for authenticated invocations only.
function identityAdmin(context) {
  const i = context && context.clientContext && context.clientContext.identity;
  return i && i.url && i.token ? { url: i.url, token: i.token } : null;
}

module.exports = { requireUser, identityAdmin };
