import { useRef, useState, type SubmitEvent } from 'react';
import { supabase } from '../../lib/supabase';
import { useVocab, activeTerms } from '../../lib/vocab';
import { STATES } from '../../lib/listings';
import type { AdminProfile } from '../../lib/types';
import { withBase } from '../../lib/url';
import {
  CheckboxGroup, ConsentBox, EMAIL_RE, ErrorSummary, Honeypot, LoadFailed, PrivacyNotice,
  Section, SelectField, TagField, TextArea, TextField,
  friendlyError, lengthError, splitList, urlError, type Errors,
} from './Fields';

const TOTAL = 4;

const blank = {
  honorific: '',
  full_name: '',
  role: '',
  career_stage: '',
  institution: '',
  state: '',
  discipline: '',
  skills: '',
  bio: '',
  orcid: '',
  profile_url: '',
  looking_for: [] as string[],
  open_to: [] as string[],
  email: '',
  consent_to_list: false,
  website: '',
};

export type ProfileValues = typeof blank;
export type ProfileListing = ReturnType<typeof toListing>;

const LABELS: Record<string, string> = {
  full_name: 'Name',
  role: 'Role',
  career_stage: 'Career stage',
  institution: 'Institution or organisation',
  state: 'State or territory',
  discipline: 'Main discipline',
  skills: 'Skills and methods',
  bio: 'Short bio',
  orcid: 'ORCID',
  profile_url: 'Profile link',
  email: 'Email',
  consent_to_list: 'Consent',
};

// Accepts a bare ORCID iD or an orcid.org link; returns the bare iD.
function cleanOrcid(value: string): string {
  return value.trim().replace(/^https?:\/\/(www\.)?orcid\.org\//i, '').toUpperCase();
}

const orNull = (s: string) => (s.trim() ? s.trim() : null);

export function toListing(v: ProfileValues) {
  return {
    honorific: v.honorific || null,
    full_name: v.full_name.trim(),
    role: v.role.trim(),
    career_stage: v.career_stage,
    institution: v.institution.trim(),
    state: v.state,
    discipline: v.discipline,
    skills: splitList(v.skills),
    bio: v.bio.trim(),
    orcid: v.orcid.trim() ? cleanOrcid(v.orcid) : null,
    profile_url: orNull(v.profile_url),
    looking_for: v.looking_for,
    open_to: v.open_to,
  };
}

export function fromProfile(p: AdminProfile, email: string): ProfileValues {
  return {
    ...blank,
    honorific: p.honorific ?? '',
    full_name: p.full_name,
    role: p.role,
    career_stage: p.career_stage,
    institution: p.institution,
    state: p.state,
    discipline: p.discipline,
    skills: p.skills.join(', '),
    bio: p.bio,
    orcid: p.orcid ?? '',
    profile_url: p.profile_url ?? '',
    looking_for: p.looking_for,
    open_to: p.open_to,
    email,
    consent_to_list: true,
  };
}

function validate(v: ProfileValues, needsConsent: boolean): Errors {
  const e: Errors = {};
  const set = (name: string, msg?: string) => { if (msg) e[name] = msg; };

  set('full_name', lengthError(v.full_name, 2, 120, 'your name'));
  set('role', lengthError(v.role, 2, 120, 'your role'));
  if (!v.career_stage) e.career_stage = 'Choose a career stage';
  set('institution', lengthError(v.institution, 2, 200, 'your institution or organisation'));
  if (!v.state) e.state = 'Choose a state or territory';

  if (!v.discipline) e.discipline = 'Choose your main discipline';
  const skills = splitList(v.skills);
  if (skills.length > 15) e.skills = 'Use 15 skills or fewer';
  else if (skills.some((s) => s.length > 40)) e.skills = 'Keep each skill to 40 characters or fewer';
  set('bio', lengthError(v.bio, 20, 800, 'a short bio'));
  if (v.orcid.trim() && !/^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/.test(cleanOrcid(v.orcid))) {
    e.orcid = 'Enter an ORCID iD like 0000-0002-1825-0097';
  }
  set('profile_url', urlError(v.profile_url));

  if (!EMAIL_RE.test(v.email.trim())) e.email = 'Enter an email address, like name@example.edu.au';
  if (needsConsent && !v.consent_to_list) e.consent_to_list = 'Tick the box to confirm your profile can be listed';
  return e;
}

interface Props {
  mode?: 'submit' | 'admin';
  initial?: ProfileValues;
  onSave?: (listing: ProfileListing, email: string) => Promise<string | null>;
  onCancel?: () => void;
}

export default function ProfileForm({ mode = 'submit', initial = blank, onSave, onCancel }: Props) {
  const { vocab, failed } = useVocab();
  const [v, setV] = useState<ProfileValues>(initial);
  const [errors, setErrors] = useState<Errors>({});
  const [submitError, setSubmitError] = useState('');
  const [sending, setSending] = useState(false);
  const summaryRef = useRef<HTMLDivElement>(null);
  const submitErrorRef = useRef<HTMLParagraphElement>(null);
  const isSubmit = mode === 'submit';

  if (failed) return <LoadFailed />;
  if (!vocab) return <p className="card p-6 text-muted" role="status">Loading the form…</p>;

  const set = <K extends keyof ProfileValues>(key: K) => (value: ProfileValues[K]) => setV((prev) => ({ ...prev, [key]: value }));
  const err = (name: string) => errors[name];

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError('');
    const found = validate(v, isSubmit);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      requestAnimationFrame(() => summaryRef.current?.focus());
      return;
    }

    setSending(true);
    const listing = toListing(v);
    let problem: string | null = null;
    if (isSubmit) {
      const { error } = await supabase.rpc('submit_profile', {
        p_profile: { ...listing, consent_to_list: v.consent_to_list },
        p_email: v.email.trim(),
        p_website: v.website,
      });
      if (error) problem = friendlyError(error);
    } else if (onSave) {
      problem = await onSave(listing, v.email.trim());
    }
    setSending(false);

    if (problem) {
      setSubmitError(problem);
      requestAnimationFrame(() => submitErrorRef.current?.focus());
      return;
    }
    if (isSubmit) window.location.href = withBase('/submit/thanks/?type=profile');
  }

  return (
    <form noValidate onSubmit={onSubmit} className="relative space-y-10">
      <ErrorSummary ref={summaryRef} errors={errors} labels={LABELS} />

      <Section step={1} total={TOTAL} title="About you">
        <div className="grid gap-6 sm:grid-cols-[10rem_1fr]">
          <SelectField
            name="honorific" label="Title" placeholder="None"
            options={activeTerms(vocab, 'honorific')}
            value={v.honorific} onChange={set('honorific')}
          />
          <TextField name="full_name" label="Name" required autoComplete="name" value={v.full_name} onChange={set('full_name')} error={err('full_name')} />
        </div>
        <div className="grid gap-6 sm:grid-cols-2">
          <TextField name="role" label="Role" required placeholder="e.g. Biostatistician" autoComplete="organization-title" value={v.role} onChange={set('role')} error={err('role')} />
          <SelectField name="career_stage" label="Career stage" required options={activeTerms(vocab, 'career_stage')} value={v.career_stage} onChange={set('career_stage')} error={err('career_stage')} />
          <TextField name="institution" label="Institution or organisation" required autoComplete="organization" value={v.institution} onChange={set('institution')} error={err('institution')} />
          <SelectField name="state" label="State or territory" required options={[...STATES]} value={v.state} onChange={set('state')} error={err('state')} />
        </div>
      </Section>

      <Section step={2} total={TOTAL} title="Your expertise">
        <SelectField
          name="discipline" label="Main discipline" required
          options={activeTerms(vocab, 'discipline')}
          value={v.discipline} onChange={set('discipline')} error={err('discipline')}
        />
        <TagField
          source="skills" name="skills" label="Skills and methods"
          hint="Your own words, separated by commas, for example: shotgun metagenomics, R, trial design"
          value={v.skills} onChange={set('skills')} error={err('skills')}
        />
        <TextArea
          name="bio" label="Short bio" required maxLength={800}
          hint="What you work on and what you could offer collaborators. Two or three sentences is plenty."
          value={v.bio} onChange={set('bio')} error={err('bio')}
        />
        <div className="grid gap-6 sm:grid-cols-2">
          <TextField name="orcid" label="ORCID iD" placeholder="0000-0000-0000-0000" value={v.orcid} onChange={set('orcid')} error={err('orcid')} />
          <TextField name="profile_url" label="Profile link" type="url" placeholder="https://" hint="A university or lab page." value={v.profile_url} onChange={set('profile_url')} error={err('profile_url')} />
        </div>
      </Section>

      <Section step={3} total={TOTAL} title="What are you looking for?">
        <CheckboxGroup
          name="looking_for" legend="I'm looking for"
          options={activeTerms(vocab, 'looking_for')}
          values={v.looking_for} onChange={set('looking_for')}
        />
        <CheckboxGroup
          name="open_to" legend="I'm open to"
          options={activeTerms(vocab, 'open_to')}
          values={v.open_to} onChange={set('open_to')}
        />
      </Section>

      <Section step={4} total={TOTAL} title={isSubmit ? 'Contact and consent' : 'Contact'}>
        <TextField
          name="email" label="Email" type="email" required autoComplete="email"
          hint="Never shown on the site. We use it to pass on messages and so you can update your profile later."
          value={v.email} onChange={set('email')} error={err('email')}
        />
        {isSubmit && (
          <ConsentBox name="consent_to_list" checked={v.consent_to_list} onChange={set('consent_to_list')} error={err('consent_to_list')}>
            I agree to this profile being shown publicly in the skills directory once approved, and to receiving messages
            passed on through the site.
          </ConsentBox>
        )}
      </Section>

      {isSubmit && <Honeypot value={v.website} onChange={set('website')} />}

      <div className="space-y-4 border-t border-line pt-8">
        {submitError && (
          <p ref={submitErrorRef} tabIndex={-1} role="alert" className="rounded-lg border-2 border-danger bg-card p-4 text-sm font-semibold text-danger">
            {submitError}
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <button type="submit" className="btn-primary w-full sm:w-auto" disabled={sending}>
            {sending ? 'Saving…' : isSubmit ? 'Submit for review' : 'Save changes'}
          </button>
          {onCancel && <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>}
        </div>
        {isSubmit && <PrivacyNotice what="profile" />}
      </div>
    </form>
  );
}
