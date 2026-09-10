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
};

export function friendlyError(code?: string | null, fallback = 'That action could not be completed. Try again.') {
  if (!code) return fallback;
  return MESSAGES[code] || fallback;
}
