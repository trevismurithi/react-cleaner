/**
 * Regexes applied to concatenated `console.*(...)` argument source text.
 * If any pattern matches, the call is counted as "high-risk sensitive" in dry-run.
 *
 * Heuristic only — not a substitute for secret scanning or code review.
 */
export const HIGH_RISK_CONSOLE_ARG_REGEXES: RegExp[] = [
  // --- Passwords & authentication ---
  /\b(password|passwd|pwd|passcode|passphrase|passPhrase)\b/i,
  /\b(masterPassword|master[_-]?key|userPassword|adminPassword)\b/,
  /\b(login|signin|sign-in|signup|sign-up)[_-]?(password|pwd|pass)\b/i,

  // --- Secrets, keys, signing ---
  /\bsecrets?\b/i,
  /\b(clientSecret|client_secret|sharedSecret|shared_secret)\b/,
  /\b(signingKey|signing[_-]?key|verificationKey|symmetricKey)\b/i,
  /\b(privateKey|private[_-]?key|secretKey|secret[_-]?key)\b/i,
  /\b(publicKey|public[_-]?key)\b/i,
  /\bencryptionKey|decryptionKey|cryptoKey\b/i,
  /\b(hmac|jwt)[_-]?(secret|key)\b/i,

  // --- API keys & headers ---
  /\bapi[_-]?key\b/i,
  /\bapikey\b/i,
  /\b(x-api-key|x_api_key|apikeyheader)\b/i,
  /\b(serviceAccount|service[_-]?account)\b/i,
  /\b(subscription[_-]?key|subscriptionkey)\b/i,

  // --- Tokens (named & camelCase) ---
  /\b(access|refresh|session|auth|id|bearer|csrf|oauth|jwt)[_-]?tokens?\b/i,
  /\b(accessToken|refreshToken|sessionToken|idToken|authToken|csrfToken|oauthToken)\b/,
  /\bBearer\s+[A-Za-z0-9._~+/-]+=*\b/,
  /\btokens?\b/i,
  /\bjwt\b/i,
  /\bid_token|access_token|refresh_token|session_token\b/i,

  // --- Cloud / vendor secret shapes (prefixes) ---
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bASIA[0-9A-Z]{16}\b/,
  /\bghp_[a-zA-Z0-9]{20,}\b/,
  /\bgho_[a-zA-Z0-9]{20,}\b/,
  /\bghu_[a-zA-Z0-9]{20,}\b/,
  /\bghs_[a-zA-Z0-9]{20,}\b/,
  /\bgithub_pat_[a-zA-Z0-9_]{20,}\b/i,
  /\bxox[baprs]-[0-9a-z-]{10,}\b/i,
  /\bsk_(live|test)_[0-9a-zA-Z]{20,}\b/,
  /\brk_(live|test)_[0-9a-zA-Z]{20,}\b/,
  /\barn:aws:secretsmanager:/i,
  /\bAIza[0-9A-Za-z_-]{30,}\b/,
  /\bsk-ant-api[0-9a-z-]{10,}\b/i,
  /\bsk-proj-[0-9a-zA-Z_-]{20,}\b/,
  /\bnpm_[0-9A-Za-z]{36,}\b/,
  /\bNUGET_API_KEY\b|\bnuget[_-]?api[_-]?key\b/i,
  /\bSG\.[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}\b/,
  /\bkey-[0-9a-zA-Z]{32,}\b/i,
  /\bhttps:\/\/hooks\.slack\.com\/services\//i,
  /\bhttps:\/\/discord(?:app)?\.com\/api\/webhooks\//i,
  /\bhttps:\/\/[a-z0-9.-]+\.ingest\.(sentry|de\.sentry)\.io\//i,
  /\bAC[a-z0-9]{32,}\b/,
  /\bSK[0-9a-fA-F]{32,}\b/,
  /\bBasic\s+[A-Za-z0-9+/=_-]{8,}\b/,

  // --- Connection strings & inline credentials ---
  /mongodb(\+srv)?:\/\/[^\s'"`]+/i,
  /postgres(ql)?:\/\/[^\s'"`]+/i,
  /mysql:\/\/[^\s'"`]+/i,
  /redis(s)?:\/\/[^\s'"`]+/i,
  /jdbc:[^\s'"`]+/i,
  /:\/\/[^:]+:[^@\s'"`]+@/,

  // --- PEM / SSH material ---
  /BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY/,
  /BEGIN CERTIFICATE/,

  // --- Cookies & browser auth ---
  /\bset-cookie\b/i,
  /\bcookie\b.*\b(httpOnly|secure|sameSite)\b/i,
  /\bdocument\.cookie\b/i,
  /\blocalStorage\b|\bsessionStorage\b/i,
  /\bauthorization\b/i,
  /\bwww-authenticate\b/i,

  // --- Payment & financial ---
  /credit\s*card|creditcard|credit-card|\bccnum\b|\bcc_number\b/i,
  /\bcvv|cvc|cid\b/i,
  /\b(cardNumber|card_number|pan)\b/i,
  /\biban\b/i,
  /\b(routing|aba)[_-]?(number|no)\b/i,
  /\b(bank|checking|savings)[_-]?(account|acct)\b/i,
  /\baccountNumber|account_number\b/i,

  // --- Government / strong PII ---
  /\bssn\b|\bsocial\s*security\b/i,
  /\b(taxId|tax_id|itin|ein)\b/i,
  /\b(passport|drivers?License|driver[_-]?license|nationalId|national[_-]?id)\b/i,
  /\b(dateOfBirth|date_of_birth|dob|birthdate|birthDate)\b/i,

  // --- Contact & comms ---
  /\bemail\b|\be-mail\b/i,
  /@[a-z0-9._%+-]+\.[a-z]{2,}/i,
  /\b(phone|mobile|cell|telephone|sms)[_-]?(number|no|num)?\b/i,
  /\b(homeAddress|mailingAddress|streetAddress|postalCode|zipcode|zipCode)\b/i,

  // --- MFA / OTP ---
  /\b(otp|mfa|2fa|totp|one[-_]?time)\b/i,
  /\b(verification|security)[_-]?(code|pin|token)\b/i,
  /\brecovery[_-]?(codes?|keys?)\b/i,

  // --- Health & children (regulated categories) ---
  /\b(medicalRecord|healthRecord|diagnosis|prescription|hipaa)\b/i,
  /\b(child|minor)[_-]?(id|data|info)\b/i,

  // --- Session & impersonation ---
  /\bimpersonat|sudo|runAs|elevat(e|ion)\b/i,
  /\b(sessionId|session_id|jsessionid)\b/i,

  // --- Misc sensitive dumps ---
  /\b(credentials?|credentialJson|secretsJson)\b/i,
  /\benv\.|process\.env\b/i,
  /\bDATABASE_URL|SECRET_|API_KEY|_TOKEN\b/i,
  /\b(auth|credential|identity)Token\b/,
  /\b(webhook[_-]?(url|secret|key)|signing[_-]?secret)\b/i,
  /\b(twilio|sendgrid|mailgun|postmark|ses)[_-]?(key|secret|token|auth)\b/i,
  /\b(firebase|googleapis|gcp)[_-]?(key|secret|credential|token)\b/i,
  /\b(kubernetes|kube)[_-]?(secret|token|config)\b/i,
  /\b(docker|registry)[_-]?(password|token|auth)\b/i,
  /\bldap[_-]?(password|bind|dn)\b/i,
  /\b(saml|oidc|openid)[_-]?(assertion|token|response)\b/i,
  /\b(pin|PIN)\b.*\b(code|number|digit)\b|\b(card|debit)[_-]?pin\b/i,
  /\b(mother|maiden|security)[_-]?(name|question|answer)\b/i,
  /\b(geolocation|gps|latitude|longitude|coordinates)\b/i,
  /\b(ssnLast4|last4|cardLast4)\b/i,
  /\b(wallet|seed)[_-]?(phrase|words|mnemonic)\b/i,
  /\bencryption[_-]?(iv|salt|nonce)\b/i,
  /\b(httpOnly|secure|sameSite)\b.*\b(cookie|session)\b/i,
  /\b(vault|kms|hsm)[_-]?(key|secret|token)\b/i,
  /\b(datadog|dd)_?(api|app)_?key\b/i,
  /\b(newrelic|nr[_-]?license|license[_-]?key)\b/i,
  /\b(pagerduty|pager_duty)[_-]?(key|token)\b/i,
  /\blinear[_-]?(api|key)\b/i,
  /\bnotion[_-]?(secret|token|key)\b/i,
  /\b(algolia|stripe|paypal|braintree)[_-]?(secret|key|token)\b/i,
  /\b(openai|anthropic|cohere|mistral)[_-]?(key|api|token)\b/i,
  /\b(huggingface|hf_)[_-]?(token|key)\b/i,
  /\b(supabase|planetscale|neon)[_-]?(key|secret|url|token)\b/i,
  /\b(vercel|netlify|heroku)[_-]?(token|secret|key)\b/i,
  /\b(ci[_-]?)?(github|gitlab|bitbucket)[_-]?(token|secret|pat)\b/i,
  /\b(circleci|travis|jenkins)[_-]?(token|secret|key)\b/i,
  /\bSNYK[_-]?TOKEN|SONAR[_-]?TOKEN\b/i,
  /\bNPM[_-]?TOKEN|YARN[_-]?NPM[_-]?AUTH[_-]?TOKEN\b/i,
  /\bPYPI[_-]?API[_-]?TOKEN|TWINE[_-]?PASSWORD\b/i,
  /\b(mTLS|mtls|clientCert|client_cert)\b/i,
  /\b(keystore|truststore|cacerts)\b/i,
  /\b(samlResponse|SAMLResponse|oidcToken)\b/,
  /\b(rawBody|rawPayload).*\b(signature|sign)\b/i,
  /\b(plaintext|clear[_-]?text).*\b(password|secret|key)\b/i,
];

/** Section titles matching `// --- ... ---` blocks (for `prune-logs --list-risk-categories`). */
export const CONSOLE_LOG_HIGH_RISK_CATEGORY_LABELS: string[] = [
  "Passwords & authentication",
  "Secrets, keys, signing",
  "API keys & headers",
  "Tokens (named & camelCase)",
  "Cloud / vendor secret shapes (prefixes)",
  "Connection strings & inline credentials",
  "PEM / SSH material",
  "Cookies & browser auth",
  "Payment & financial",
  "Government / strong PII",
  "Contact & comms",
  "MFA / OTP",
  "Health & children (regulated categories)",
  "Session & impersonation",
  "Misc sensitive dumps",
];

/**
 * @param text Concatenated argument source from a console call
 */
export function matchesHighRiskConsoleArgText(text: unknown): boolean {
  const s = text == null ? "" : String(text);
  if (!s.trim()) {
    return false;
  }
  return HIGH_RISK_CONSOLE_ARG_REGEXES.some((re) => re.test(s));
}
