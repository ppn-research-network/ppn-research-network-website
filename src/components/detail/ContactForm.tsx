import { useRef, useState, type SubmitEvent } from 'react';
import { supabase } from '../../lib/supabase';
import {
  EMAIL_RE, ErrorSummary, Honeypot, TextArea, TextField, friendlyError, lengthError, type Errors,
} from '../forms/Fields';

// Message form on a dataset or profile page. Saves to contact_requests through
// send_contact_request; the email job (Phase 5) passes it on. The recipient's
// email address never reaches this page.
export default function ContactForm({ targetType, targetId, recipient, messageHint }: {
  targetType: 'dataset' | 'profile';
  targetId: string;
  recipient: string;             // e.g. "the custodian", "Priya"
  messageHint: string;
}) {
  const [v, setV] = useState({ name: '', email: '', institution: '', message: '', acknowledged: false, website: '' });
  const [errors, setErrors] = useState<Errors>({});
  const [problem, setProblem] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const summaryRef = useRef<HTMLDivElement>(null);
  const doneRef = useRef<HTMLDivElement>(null);

  const set = <K extends keyof typeof v>(key: K) => (value: (typeof v)[K]) => setV((prev) => ({ ...prev, [key]: value }));

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setProblem('');
    const e: Errors = {};
    const name = lengthError(v.name, 2, 120, 'your name');
    if (name) e.name = name;
    if (!EMAIL_RE.test(v.email.trim())) e.email = 'Enter your email address, like name@example.edu.au';
    const inst = lengthError(v.institution, 0, 200, '');
    if (inst) e.institution = inst;
    const msg = lengthError(v.message, 20, 3000, 'a message');
    if (msg) e.message = msg;
    if (!v.acknowledged) e.acknowledged = 'Tick the box to continue';
    setErrors(e);
    if (Object.keys(e).length) {
      requestAnimationFrame(() => summaryRef.current?.focus());
      return;
    }

    setSending(true);
    const { error } = await supabase.rpc('send_contact_request', {
      p_target_type: targetType,
      p_target_id: targetId,
      p_name: v.name.trim(),
      p_email: v.email.trim(),
      p_institution: v.institution.trim(),
      p_message: v.message.trim(),
      p_acknowledged: v.acknowledged,
      p_website: v.website,
    });
    setSending(false);
    if (error) {
      setProblem(friendlyError(error).replace('your listing was not sent', 'your message was not sent'));
      return;
    }
    setSent(true);
    requestAnimationFrame(() => doneRef.current?.focus());
  }

  if (sent) {
    return (
      <div ref={doneRef} tabIndex={-1} role="status" className="mt-5 rounded-lg bg-open p-5 text-open-ink">
        <p className="font-semibold">Message sent</p>
        <p className="mt-2 text-sm">
          We'll pass your message on to {recipient}. They'll reply to you directly at {v.email.trim()}.
        </p>
      </div>
    );
  }

  return (
    <form noValidate onSubmit={onSubmit} className="relative mt-5 space-y-5">
      <ErrorSummary ref={summaryRef} errors={errors} labels={{ name: 'Your name', email: 'Your email', institution: 'Institution', message: 'Message', acknowledged: 'Confirmation' }} />
      <TextField name="name" label="Your name" required autoComplete="name" value={v.name} onChange={set('name')} error={errors.name} />
      <TextField name="email" label="Your email" type="email" required autoComplete="email" value={v.email} onChange={set('email')} error={errors.email} />
      <TextField name="institution" label="Institution" autoComplete="organization" value={v.institution} onChange={set('institution')} error={errors.institution} />
      <TextArea name="message" label="Message" required maxLength={3000} rows={5} placeholder={messageHint} value={v.message} onChange={set('message')} error={errors.message} />
      <div>
        <label className="choice text-sm">
          <input id="f-acknowledged" type="checkbox" checked={v.acknowledged} onChange={(e) => set('acknowledged')(e.target.checked)}
            aria-invalid={errors.acknowledged ? true : undefined} aria-describedby={errors.acknowledged ? 'f-acknowledged-error' : undefined} />
          <span>
            {targetType === 'dataset'
              ? 'I understand the network passes on my message but does not grant access to data.'
              : 'I understand the network passes on my message, and my name, email and institution are shared so they can reply.'}
          </span>
        </label>
        {errors.acknowledged && <span id="f-acknowledged-error" className="field-error">{errors.acknowledged}</span>}
      </div>
      <Honeypot value={v.website} onChange={set('website')} />
      {problem && <p role="alert" className="rounded-lg border-2 border-danger bg-card p-3 text-sm font-semibold text-danger">{problem}</p>}
      <button type="submit" className="btn-primary w-full" disabled={sending}>{sending ? 'Sending…' : 'Send message'}</button>
    </form>
  );
}
