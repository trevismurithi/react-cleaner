/**
 * Regexes for "medium" sensitivity: correlation, tenancy, errors, URLs/paths,
 * structured dumps of request/user objects, etc. — not direct secrets (those are high-risk).
 *
 * Applied only after high-risk patterns ({@link ./consoleLogHighRiskPatterns}) do not match.
 */
const MEDIUM_RISK_CONSOLE_ARG_REGEXES = [
  // --- Stable identifiers & tenancy ---
  /\b(userId|user_id|uid|accountId|account_id|accountKey)\b/i,
  /\b(customerId|customer_id|clientId|client_id|subscriberId)\b/i,
  /\b(orgId|org_id|organizationId|tenantId|tenant_id|workspaceId|workspace_id)\b/i,
  /\b(projectId|project_id|teamId|team_id|memberId|member_id)\b/i,
  /\b(sessionKey|session_key)\b/i,

  // --- Request tracing & HTTP metadata ---
  /\b(requestId|request_id|correlationId|correlation_id|traceId|trace_id|spanId|span_id)\b/i,
  /\b(x-request-id|x-correlation-id|x-trace-id)\b/i,
  /\b(statusCode|status_code|httpStatus|http_status|statusText)\b/i,
  /\b(pathname|pathName|searchParams|queryParams|query_string|originalUrl)\b/i,
  /\b(httpMethod|reqMethod|requestMethod)\b/i,
  /\b(userAgent|user_agent|User-Agent|referrer|referer)\b/i,
  /\b(contentType|content_type|acceptLanguage)\b/i,

  // --- URLs & API surfaces (without embedded user:pass@) ---
  /\bhttps?:\/\/[^\s'"`]+/i,
  /\b['"`]\/api\/[^'"`]+['"`]/i,
  /\bgraphql|\/graphql\b/i,
  /\b(webhook|callback)[_-]?(url|path|endpoint)\b/i,

  // --- Errors & diagnostics ---
  /\bstack(Trace)?\b/i,
  /\bstacktrace\b/i,
  /\b(error|err)\.(message|stack|cause)\b/i,
  /\bUnhandled(Rejection|Exception)?\b/,
  /\b(exception|throwable|failureReason)\b/i,
  /\bconsole\.(trace|assert)\b/,

  // --- Likely structured / domain dumps ---
  /\bJSON\.stringify\s*\(/i,
  /\b(util\.inspect|inspect\s*\()\b/i,
  /\bserialize(d|ToString)?\b/i,
  /\b(payload|requestBody|req\.body|res\.body|responseBody|formData)\b/i,
  /\b(req|request|res|response)\.(query|params|headers|path|url|method|route)\b/i,
  /\b(ctx|context)\.(state|request|response|path|params)\b/i,
  /\b(eventType|eventName|eventId|recordId|documentId|evt\.)\b/i,

  // --- DB / ORM (shape or entity names, not connection secrets) ---
  /\b(prisma|sequelize|typeorm|knex|drizzle)\b/i,
  /\b(rawSql|rawQuery|sqlQuery|executeQuery|runQuery)\b/i,
  /\bSELECT\s+[\w.*,\s]+\s+FROM\b/i,
  /\b(INSERT|UPDATE|DELETE)\s+INTO\b/i,
  /\btransaction\b/i,

  // --- Feature flags & rollout ---
  /\b(featureFlag|feature_flag|launchDarkly|ldClient|unleash|splitio)\b/i,
  /\b(experiment|variant|abTest|ab_test)\b/i,

  // --- Business / commerce identifiers ---
  /\b(orderId|order_id|invoiceId|invoice_id|paymentId|payment_id|transactionId)\b/i,
  /\b(cart|checkout|subscriptionId|subscription_id|planId|plan_id)\b/i,

  // --- AuthZ surface (not secrets) ---
  /\b(role|roles|permission|permissions|scope|scopes|claims)\b/i,
  /\b(isAdmin|is_admin|superuser|elevated)\b/i,

  // --- Network-ish (IPv4 as data; high-risk list avoids generic IP) ---
  /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/,

  // --- Host / infra context ---
  /\b(hostname|hostName|domain|subdomain|origin|baseUrl|baseURL|endpoint)\b/i,
  /\b(kubernetes|k8s|namespace|podName|containerId)\b/i,
  /\b(release|envName|nodeEnv|APP_ENV|NODE_ENV|RUN_ENV)\b/i,

  // --- File paths that often carry app structure ---
  /\b(__dirname|__filename|import\.meta)\b/,
  /\/(?:src|dist|build|lib|app)\/[^'"`\s]+/i,

  // --- Rate / quota signals ---
  /\b(rateLimit|rate_limit|quota|throttle|retryAfter)\b/i,

  // --- PII-adjacent labels (values may still be benign) ---
  /\b(username|userName|login|nickname|displayName)\b/i,
  /\b(avatarUrl|profileUrl|photoUrl)\b/i,
  /\b(geolocation|coordinates|latLng)\b/i,
  /\b(latitude|longitude)\b/i,

  // --- Caching & queues (keys / topics, not values) ---
  /\b(cacheKey|cache_key|redisKey|queueName|topicName|consumerGroup)\b/i,

  // --- Timing / perf (can reveal hotspots with args) ---
  /\b(durationMs|latencyMs|timeToFirstByte|ttfb)\b/i,
];

/** Section titles matching `// --- ... ---` blocks (for `prune-logs --list-risk-categories`). */
const CONSOLE_LOG_MEDIUM_RISK_CATEGORY_LABELS = [
  "Stable identifiers & tenancy",
  "Request tracing & HTTP metadata",
  "URLs & API surfaces (without embedded user:pass@)",
  "Errors & diagnostics",
  "Likely structured / domain dumps",
  "DB / ORM (shape or entity names, not connection secrets)",
  "Feature flags & rollout",
  "Business / commerce identifiers",
  "AuthZ surface (not secrets)",
  "Network-ish (IPv4 as data)",
  "Host / infra context",
  "File paths that often carry app structure",
  "Rate / quota signals",
  "PII-adjacent labels (values may still be benign)",
  "Caching & queues (keys / topics, not values)",
  "Timing / perf (can reveal hotspots with args)",
];

/**
 * @param {string} text Concatenated argument source from a console call
 * @returns {boolean}
 */
function matchesMediumRiskConsoleArgText(text) {
  const s = text == null ? "" : String(text);
  if (!s.trim()) {
    return false;
  }
  return MEDIUM_RISK_CONSOLE_ARG_REGEXES.some((re) => re.test(s));
}

module.exports = {
  MEDIUM_RISK_CONSOLE_ARG_REGEXES,
  matchesMediumRiskConsoleArgText,
  CONSOLE_LOG_MEDIUM_RISK_CATEGORY_LABELS,
};
