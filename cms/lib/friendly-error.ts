const MESSAGES: Record<string, string> = {
  unauthorized: 'Your session has expired. Please sign in again.',
  forbidden: "You don't have permission to do that.",
  invalid_credentials: 'Those details were not accepted.',
  too_many_attempts: 'Too many sign-in attempts. Wait a few minutes and try again.',
  csrf_required: 'This action could not be verified. Refresh the page and try again.',
  csrf_invalid: 'This action could not be verified. Refresh the page and try again.',
  csrf_origin: 'This action could not be verified. Refresh the page and try again.',
  password_too_short: 'Use a password of at least 12 characters.',
  media_not_found: 'That media item is no longer in the library.',
  media_referenced_by_published: 'This file is used on the live site. Delete only if you accept broken media.',
  cloudinary_asset_incomplete: 'Upload finished but the file was not recorded. Retry this file.',
  user_not_found: 'That person is no longer in the CMS.',
  cannot_delete_self: 'You cannot remove your own account.',
  version_not_found: 'That version is no longer available.',
  version_content_invalid: 'That version could not be opened.',
  invalid_json: 'That request was not understood. Try again.',
  email_and_password_required: 'Enter both email and password.',
  email_name_password_required: 'Name, email, and password are required.',
  invalid_role: 'Choose Administrator or Editor.',
  cms_secret_not_configured: 'The CMS is not fully configured. Ask an administrator.',
  database_unreachable: "We couldn't save your changes. Please try again.",
  host_unreachable: "We couldn't reach the database. Please try again.",
  schema_missing: 'The CMS database is not ready. Ask an administrator.',
  missing_database_url: 'The CMS database is not configured. Ask an administrator.',
  auth_failed: "We couldn't save your changes. Please try again.",
  draft_content_not_found: 'The draft could not be loaded. Please try again.',
  draft_content_invalid: 'Those fields could not be saved. Check the form and try again.',
  no_settings: 'Settings could not be loaded.',
  setting_not_allowed: 'That setting cannot be changed here.',
};

export function friendlyError(code?: string | null, fallback = 'That action could not be completed. Try again.') {
  if (!code) return fallback;
  if (MESSAGES[code]) return MESSAGES[code];
  if (code.startsWith('content.')) return 'Those fields could not be saved. Check the form and try again.';
  if (/prisma|sql|p100|p200|stack|neon|postgres/i.test(code)) {
    return "We couldn't save your changes. Please try again.";
  }
  return fallback;
}
