// Email addresses typed into free text or feedback never reach an admin page
// (issue #51, CLAUDE.md non-negotiable 3). Applied on the server, before the
// text is handed to a page, which renders it as plain text.
//
// Same pattern as the publish scan (scripts/publish-scan.mjs). Known limit: an
// address spelled out ("name at gmail dot com") is left as typed.

const EMAIL = /[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+\.)+[A-Za-z]{2,}/g;

export const EMAIL_REMOVED = "[email removed]";

export function maskEmails(text: string): string {
  return text.replace(EMAIL, EMAIL_REMOVED);
}
