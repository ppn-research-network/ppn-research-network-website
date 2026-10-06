// The wording of every email the network sends. Plain text, Australian English.
import { CONTACT_EMAIL, NETWORK_NAME, REVIEW_TIME, listingLink, oneLine, site } from './lib.mjs';

const signOff = `\n\nThe ${NETWORK_NAME}\nQuestions? Reply to this email or write to ${CONTACT_EMAIL}.`;

const noun = (type) => (type === 'dataset' ? 'dataset listing' : 'skills profile');
// "the dataset "Title"" or "your skills profile", for use mid-sentence.
const what = (d) => (d.type === 'dataset' ? `"${d.title}"` : 'your skills profile');
const noteBlock = (note) => (note ? `\n\nA note from the admin:\n\n${note}` : '');

// ---------------------------------------------------------------------------
// Contact messages, passed on to the custodian or researcher.
// Reply-To is set to the sender, so a reply goes straight to them.
// ---------------------------------------------------------------------------
const TOPICS = {
  access: 'Data access request',
  data_question: 'Question about your data',
  collaboration: 'Collaboration enquiry',
  mentoring: 'Mentoring enquiry',
  supervision: 'Supervision enquiry',
  advice: 'Request for advice',
  other: 'Message',
};

export function relayEmail({ type, title, sender_name, sender_institution, sender_email, message, topic }) {
  const who = `${sender_name}${sender_institution ? ` (${sender_institution})` : ''}`;
  const what = TOPICS[topic] ?? (type === 'dataset' ? 'Enquiry' : 'Message');
  const subject = type === 'dataset'
    ? `${what} about your dataset: ${oneLine(title)}`
    : `${what} from ${oneLine(sender_name)} via the ${NETWORK_NAME}`;
  const text = `${who} has sent you a message through the ${NETWORK_NAME} website about your ${noun(type)} "${title}".${topic ? `\n\nWhat it's about: ${TOPICS[topic] ?? 'Other'}` : ''}

------------------------------------------------------------
${message}
------------------------------------------------------------

To respond, just reply to this email: it goes straight to ${sender_name} at ${sender_email}. Your own email address has not been shown to them, and they will only see it if you reply.
${type === 'dataset' ? '\nThe network passes on messages but does not hold, host or grant access to data. Any access is up to you and your study team.\n' : ''}
To update or remove your listing, sign in at ${site('/account/')} with this email address.

The ${NETWORK_NAME}
This message was sent through the network's contact form. If it looks like spam, please forward it to ${CONTACT_EMAIL}.`;
  return { subject, text };
}

// ---------------------------------------------------------------------------
// Emails about someone's own submission (from the outbox).
// ---------------------------------------------------------------------------
export function outboxEmail(kind, d) {
  const t = oneLine(d.title);
  switch (kind) {
    case 'listing_received':
      return {
        subject: `We've received your ${noun(d.type)}`,
        text: `Thank you for submitting ${what(d)} to the ${NETWORK_NAME}.

An admin from the leadership committee will review it within ${REVIEW_TIME} and may email you with a question. We'll let you know as soon as it's live.

Need to correct something in the meantime? Sign in at ${site('/account/')} with this email address.${signOff}`,
      };
    case 'listing_approved':
      return {
        subject: `Your ${noun(d.type)} is now live: ${t}`,
        text: `Good news: ${what(d)} has been approved and now appears in the ${d.type === 'dataset' ? 'data' : 'skills'} directory:

${listingLink(d.type, d.slug)}

When someone sends you a message through the site, we'll pass it on by email. Your email address stays private until you reply.

To update or withdraw your listing at any time, sign in at ${site('/account/')} with this email address.${noteBlock(d.note)}${signOff}`,
      };
    case 'listing_rejected':
      return {
        subject: `About your ${noun(d.type)}: ${t}`,
        text: `Thank you for submitting ${what(d)} to the ${NETWORK_NAME}. We weren't able to list it as it stands.${noteBlock(d.note)}

You're welcome to submit it again with changes at ${site(d.type === 'dataset' ? '/submit/' : '/submit/profile/')}, or reply to this email if you have any questions.${signOff}`,
      };
    case 'revision_approved':
      return {
        subject: `Your update is live: ${t}`,
        text: `An admin has approved your update to ${what(d)}, and the listing now shows your changes:

${listingLink(d.type, d.slug)}${noteBlock(d.note)}${signOff}`,
      };
    case 'revision_declined':
      return {
        subject: `About your update to: ${t}`,
        text: `An admin has reviewed your update to ${what(d)} and wasn't able to approve it. Your listing is unchanged.${noteBlock(d.note)}

You can propose a new update at ${site('/account/')}.${signOff}`,
      };
    case 'revision_question':
      return {
        subject: `A question about your update to: ${t}`,
        text: `An admin is reviewing your update to ${what(d)} and has a question.${noteBlock(d.note)}

You can reply to this email, or change your update at ${site('/account/')}. Your current listing stays live in the meantime.${signOff}`,
      };
    case 'membership_received':
      return {
        subject: `We've received your membership request`,
        text: `Hello ${d.name ?? ''},

Thank you for asking to join the ${NETWORK_NAME}. An admin will review your request within ${REVIEW_TIME}, and we'll email you when it's done.${signOff}`,
      };
    case 'membership_approved':
      return {
        subject: `Welcome to the ${NETWORK_NAME}`,
        text: `Hello ${d.name ?? ''},

Your membership has been approved. Sign in with this email address to see recordings, templates and protocols shared by other members, and to share your own:

${site('/resources/')}

Please keep members-only resources within the network, as set out in the member code of conduct: ${site('/code-of-conduct/')}${noteBlock(d.note)}${signOff}`,
      };
    case 'membership_declined':
      return {
        subject: `About your membership request`,
        text: `Hello ${d.name ?? ''},

Thank you for your interest in the ${NETWORK_NAME}. We weren't able to approve your membership request at this stage.${noteBlock(d.note)}

The data and skills directories remain open to everyone at ${site('/')}.${signOff}`,
      };
    case 'resource_approved':
      return {
        subject: `Your resource is now shared: ${t}`,
        text: `Thank you for sharing "${d.title}". An admin has approved it, and it's now available to network members at ${site('/resources/')}.${noteBlock(d.note)}${signOff}`,
      };
    case 'resource_rejected':
      return {
        subject: `About the resource you shared: ${t}`,
        text: `Thank you for sharing "${d.title}". An admin reviewed it and wasn't able to add it to the members' resources.${noteBlock(d.note)}${signOff}`,
      };
    case 'news_approved':
      return {
        subject: `Your post is live: ${t}`,
        text: `Thank you for sharing "${d.title}". An admin has approved it, and it now appears in News and events${d.members_only ? ' for network members' : ''}:

${site('/news/')}${noteBlock(d.note)}${signOff}`,
      };
    case 'news_rejected':
      return {
        subject: `About your post: ${t}`,
        text: `Thank you for sharing "${d.title}". An admin reviewed it and wasn't able to publish it in News and events.${noteBlock(d.note)}${signOff}`,
      };
    case 'annual_reminder':
      return {
        subject: `Is your ${noun(d.type)} still current? ${t}`,
        text: `Once a year we ask everyone listed in the ${NETWORK_NAME} to check their listing is still accurate.

Please take a minute to check ${what(d)}:

${listingLink(d.type, d.slug)}

Then sign in at ${site('/account/')} with this email address and choose one of:
- "Yes, it's still current" if nothing has changed
- Edit, if something needs updating
- Withdraw listing, if you can no longer share it

If we don't hear from you in the next few weeks, an admin may take the listing down until it's confirmed.${signOff}`,
      };
    default:
      throw new Error(`No email wording for ${kind}`);
  }
}

// ---------------------------------------------------------------------------
// Daily digest for admins (only sent when something is waiting).
// ---------------------------------------------------------------------------
export function digestEmail(counts) {
  const lines = [
    ['Pending datasets', counts.datasets],
    ['Pending profiles', counts.profiles],
    ['Update requests', counts.updates],
    ['Membership requests', counts.members],
    ['Pending resources', counts.resources],
    ['News and events posts', counts.news],
    ['Contact messages that failed to send', counts.failedMessages],
    ['Listings with no reply to their annual check (30+ days)', counts.overdueReviews],
  ].filter(([, n]) => n > 0);
  const total = lines.reduce((s, [, n]) => s + n, 0);
  return {
    subject: `${total} ${total === 1 ? 'item is' : 'items are'} waiting for review`,
    text: `Good morning,

These are waiting in the admin dashboard:

${lines.map(([label, n]) => `- ${label}: ${n}`).join('\n')}

Review them at ${site('/admin/')}

You're receiving this because you're an admin of the ${NETWORK_NAME}. It's sent at most once a day, and only when something is waiting.`,
  };
}
