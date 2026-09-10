const ACTIONS: Record<string, string> = {
  login: 'Signed in',
  login_failed: 'Sign-in failed',
  logout: 'Signed out',
  session_expired: 'Session expired',
  save_draft: 'Draft saved',
  publish: 'Published',
  restore_version: 'Version restored',
  media_complete: 'Media uploaded',
  media_delete: 'Media removed',
  create_user: 'Person added',
  update_user: 'Person updated',
  delete_user: 'Person removed',
  update_settings: 'Settings changed',
  bootstrap_admin: 'Administrator created',
  import: 'Content imported',
};

export function auditActionLabel(action: string) {
  return ACTIONS[action] || action.replace(/_/g, ' ');
}
