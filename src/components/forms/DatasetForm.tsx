import { useRef, useState, type SubmitEvent } from 'react';
import { supabase } from '../../lib/supabase';
import { useVocab, activeTerms } from '../../lib/vocab';
import { ACCESS_LEVELS, CONSENT_OPTIONS, STATES } from '../../lib/listings';
import { withBase } from '../../lib/url';
import {
  CheckboxGroup, ConsentBox, EMAIL_RE, ErrorSummary, Honeypot, LoadFailed, PrivacyNotice,
  RadioCards, RadioGroup, Section, SelectField, TextArea, TextField,
  friendlyError, lengthError, splitList, urlError, type Errors,
} from './Fields';

const TOTAL = 5;

const initial = {
  title: '',
  summary: '',
  keywords: '',
  study_design: '',
  years_collected: '',
  sample_size: '',
  age_range: '',
  population: '',
  lead_institution: '',
  state: '',
  data_types: [] as string[],
  data_types_other: '',
  biospecimens: '',
  biospecimens_details: '',
  access_level: '',
  access_requirements: [] as string[],
  access_notes: '',
  consent_secondary_use: '',
  repository_url: '',
  publication: '',
  trial_registration: '',
  contact_name: '',
  contact_role: '',
  email: '',
  consent_to_list: false,
  website: '',
};

type Values = typeof initial;

const LABELS: Record<string, string> = {
  title: 'Dataset title',
  summary: 'Short description',
  keywords: 'Keywords',
  study_design: 'Study design',
  years_collected: 'Years collected',
  sample_size: 'Sample size',
  age_range: 'Age range',
  population: 'Population or health status',
  lead_institution: 'Lead institution',
  state: 'State or territory',
  data_types: 'Data available',
  data_types_other: 'Other data types',
  biospecimens: 'Biospecimens',
  biospecimens_details: 'Biospecimen details',
  access_level: 'Access level',
  access_notes: 'Other access details',
  consent_secondary_use: 'Consent for secondary use',
  repository_url: 'Repository',
  publication: 'Key publication',
  trial_registration: 'Trial registration',
  contact_name: 'Contact name',
  contact_role: 'Contact role',
  email: 'Contact email',
  consent_to_list: 'Consent',
};

// Accepts a DOI ("10.1234/abc"), a doi: prefix or a full link; returns a link.
function publicationLink(value: string): string {
  const v = value.trim();
  const doi = v.replace(/^doi:\s*/i, '');
  if (/^10\.\d{4,9}\/\S+$/.test(doi)) return `https://doi.org/${doi}`;
  return v;
}

function validate(v: Values): Errors {
  const e: Errors = {};
  const set = (name: string, msg?: string) => { if (msg) e[name] = msg; };

  set('title', lengthError(v.title, 5, 200, 'a title'));
  set('summary', lengthError(v.summary, 20, 1500, 'a short description'));
  const keywords = splitList(v.keywords);
  if (keywords.length > 20) e.keywords = 'Use 20 keywords or fewer';
  else if (keywords.some((k) => k.length > 60)) e.keywords = 'Keep each keyword to 60 characters or fewer';

  if (!v.study_design) e.study_design = 'Choose a study design';
  set('years_collected', lengthError(v.years_collected, 0, 40, ''));
  if (v.sample_size.trim() && !/^\d+$/.test(v.sample_size.replace(/[,\s]/g, ''))) e.sample_size = 'Enter a whole number, for example 120';
  set('age_range', lengthError(v.age_range, 0, 80, ''));
  set('population', lengthError(v.population, 0, 300, ''));
  set('lead_institution', lengthError(v.lead_institution, 2, 200, 'the lead institution'));
  if (!v.state) e.state = 'Choose a state or territory';

  if (v.data_types.length === 0) e.data_types = 'Tick at least one type of data';
  if (v.data_types.includes('other')) set('data_types_other', lengthError(v.data_types_other, 2, 200, 'the other data types'));
  if (!v.biospecimens) e.biospecimens = 'Choose yes or no';
  set('biospecimens_details', lengthError(v.biospecimens_details, 0, 300, ''));

  if (!v.access_level) e.access_level = 'Choose an access level';
  set('access_notes', lengthError(v.access_notes, 0, 1000, ''));
  if (!v.consent_secondary_use) e.consent_secondary_use = 'Choose yes, partly or unsure';
  set('repository_url', urlError(v.repository_url));
  set('publication', urlError(publicationLink(v.publication)) && 'Enter a DOI (for example 10.1234/abcd) or a full web address');
  set('trial_registration', lengthError(v.trial_registration, 0, 200, ''));

  set('contact_name', lengthError(v.contact_name, 2, 120, 'a contact name'));
  set('contact_role', lengthError(v.contact_role, 2, 120, 'the contact’s role'));
  if (!EMAIL_RE.test(v.email.trim())) e.email = 'Enter an email address, like name@example.edu.au';
  if (!v.consent_to_list) e.consent_to_list = 'Tick the box to confirm the dataset can be listed';
  return e;
}

export default function DatasetForm() {
  const { vocab, failed } = useVocab();
  const [v, setV] = useState<Values>(initial);
  const [errors, setErrors] = useState<Errors>({});
  const [submitError, setSubmitError] = useState('');
  const [sending, setSending] = useState(false);
  const summaryRef = useRef<HTMLDivElement>(null);
  const submitErrorRef = useRef<HTMLParagraphElement>(null);

  if (failed) return <LoadFailed />;
  if (!vocab) return <p className="card p-6 text-muted" role="status">Loading the form…</p>;

  const set = <K extends keyof Values>(key: K) => (value: Values[K]) => setV((prev) => ({ ...prev, [key]: value }));
  const err = (name: string) => errors[name];

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError('');
    const found = validate(v);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      requestAnimationFrame(() => summaryRef.current?.focus());
      return;
    }

    setSending(true);
    const listing = {
      title: v.title,
      summary: v.summary,
      keywords: splitList(v.keywords),
      study_design: v.study_design,
      years_collected: v.years_collected,
      sample_size: v.sample_size.replace(/[,\s]/g, ''),
      age_range: v.age_range,
      population: v.population,
      lead_institution: v.lead_institution,
      state: v.state,
      data_types: v.data_types,
      data_types_other: v.data_types.includes('other') ? v.data_types_other : '',
      biospecimens: v.biospecimens === 'yes',
      biospecimens_details: v.biospecimens === 'yes' ? v.biospecimens_details : '',
      access_level: v.access_level,
      access_requirements: v.access_requirements,
      access_notes: v.access_notes,
      consent_secondary_use: v.consent_secondary_use,
      repository_url: v.repository_url,
      publication_url: publicationLink(v.publication),
      trial_registration: v.trial_registration,
      contact_name: v.contact_name,
      contact_role: v.contact_role,
      consent_to_list: v.consent_to_list,
    };
    const { error } = await supabase.rpc('submit_dataset', {
      p_listing: listing,
      p_email: v.email.trim(),
      p_website: v.website,
    });
    setSending(false);

    if (error) {
      setSubmitError(friendlyError(error));
      requestAnimationFrame(() => submitErrorRef.current?.focus());
      return;
    }
    window.location.href = withBase('/submit/thanks/?type=dataset');
  }

  return (
    <form noValidate onSubmit={onSubmit} className="relative space-y-10">
      <ErrorSummary ref={summaryRef} errors={errors} labels={LABELS} />

      <Section step={1} total={TOTAL} title="About the dataset">
        <TextField name="title" label="Dataset title" required value={v.title} onChange={set('title')} error={err('title')} maxLength={200} />
        <TextArea
          name="summary" label="Short description" required maxLength={1500}
          hint="Two or three sentences. Don't include anything that could identify a participant."
          value={v.summary} onChange={set('summary')} error={err('summary')}
        />
        <TextField
          name="keywords" label="Keywords"
          hint="Separate with commas, for example: Mediterranean diet, TMAO, older adults"
          value={v.keywords} onChange={set('keywords')} error={err('keywords')}
        />
      </Section>

      <Section step={2} total={TOTAL} title="Study details">
        <div className="grid gap-6 sm:grid-cols-2">
          <SelectField
            name="study_design" label="Study design" required
            options={activeTerms(vocab, 'study_design')}
            value={v.study_design} onChange={set('study_design')} error={err('study_design')}
          />
          <TextField name="years_collected" label="Years collected" placeholder="e.g. 2019–2022" value={v.years_collected} onChange={set('years_collected')} error={err('years_collected')} />
          <TextField name="sample_size" label="Sample size" type="number" placeholder="Number of participants" value={v.sample_size} onChange={set('sample_size')} error={err('sample_size')} />
          <TextField name="age_range" label="Age range" placeholder="e.g. 18–65 years" value={v.age_range} onChange={set('age_range')} error={err('age_range')} />
        </div>
        <TextField name="population" label="Population or health status" placeholder="e.g. adults with type 2 diabetes" value={v.population} onChange={set('population')} error={err('population')} />
        <div className="grid gap-6 sm:grid-cols-2">
          <TextField name="lead_institution" label="Lead institution" required autoComplete="organization" value={v.lead_institution} onChange={set('lead_institution')} error={err('lead_institution')} />
          <SelectField name="state" label="State or territory" required options={[...STATES]} value={v.state} onChange={set('state')} error={err('state')} />
        </div>
      </Section>

      <Section step={3} total={TOTAL} title="What data are available?">
        <CheckboxGroup
          name="data_types" legend="Tick everything that applies." required columns={3}
          options={activeTerms(vocab, 'data_type')}
          values={v.data_types} onChange={set('data_types')} error={err('data_types')}
        />
        {v.data_types.includes('other') && (
          <TextField name="data_types_other" label="What other data are available?" required value={v.data_types_other} onChange={set('data_types_other')} error={err('data_types_other')} />
        )}
        <RadioGroup
          name="biospecimens" legend="Are biospecimens available?" required
          options={[{ code: 'yes', label: 'Yes' }, { code: 'no', label: 'No' }]}
          value={v.biospecimens} onChange={set('biospecimens')} error={err('biospecimens')}
        />
        {v.biospecimens === 'yes' && (
          <TextField
            name="biospecimens_details" label="Which biospecimens, and how are they stored?"
            placeholder="e.g. plasma and stool, stored at −80 °C"
            value={v.biospecimens_details} onChange={set('biospecimens_details')} error={err('biospecimens_details')}
          />
        )}
      </Section>

      <Section step={4} total={TOTAL} title="Access">
        <RadioCards
          name="access_level" legend="Access level"
          options={ACCESS_LEVELS.map((a) => ({ code: a.code, label: a.label, description: a.description }))}
          value={v.access_level} onChange={set('access_level')} error={err('access_level')}
        />
        <CheckboxGroup
          name="access_requirements" legend="What will people need?"
          options={activeTerms(vocab, 'access_requirement')}
          values={v.access_requirements} onChange={set('access_requirements')}
        />
        <TextArea
          name="access_notes" label="Anything else people should know about access?" maxLength={1000} rows={3}
          hint="For example, which data use agreement applies, or who reviews proposals."
          value={v.access_notes} onChange={set('access_notes')} error={err('access_notes')}
        />
        <RadioGroup
          name="consent_secondary_use" legend="Does participant consent cover secondary use?" required
          options={[...CONSENT_OPTIONS]}
          value={v.consent_secondary_use} onChange={set('consent_secondary_use')} error={err('consent_secondary_use')}
        />
        <TextField name="repository_url" label="Repository link" type="url" placeholder="https://" value={v.repository_url} onChange={set('repository_url')} error={err('repository_url')} />
        <TextField
          name="publication" label="Key publication"
          hint="A DOI, such as 10.1234/abcd, or a full web address."
          value={v.publication} onChange={set('publication')} error={err('publication')}
        />
        <TextField name="trial_registration" label="Trial registration number" placeholder="e.g. ACTRN12621000123456" value={v.trial_registration} onChange={set('trial_registration')} error={err('trial_registration')} />
      </Section>

      <Section step={5} total={TOTAL} title="Contact person">
        <div className="grid gap-6 sm:grid-cols-2">
          <TextField name="contact_name" label="Name" hint="Shown on the listing" required autoComplete="name" value={v.contact_name} onChange={set('contact_name')} error={err('contact_name')} />
          <TextField name="contact_role" label="Role" hint="Shown on the listing" required placeholder="e.g. Chief Investigator" value={v.contact_role} onChange={set('contact_role')} error={err('contact_role')} />
        </div>
        <TextField
          name="email" label="Email" type="email" required autoComplete="email"
          hint="Never shown on the site. We use it to pass on messages and so you can update the listing later."
          value={v.email} onChange={set('email')} error={err('email')}
        />
        <ConsentBox name="consent_to_list" checked={v.consent_to_list} onChange={set('consent_to_list')} error={err('consent_to_list')}>
          I am the custodian of this dataset, or have their permission to list it, and I agree to this description being
          shown publicly once approved.
        </ConsentBox>
      </Section>

      <Honeypot value={v.website} onChange={set('website')} />

      <div className="space-y-4 border-t border-line pt-8">
        {submitError && (
          <p ref={submitErrorRef} tabIndex={-1} role="alert" className="rounded-lg border-2 border-danger bg-card p-4 text-sm font-semibold text-danger">
            {submitError}
          </p>
        )}
        <button type="submit" className="btn-primary w-full sm:w-auto" disabled={sending}>
          {sending ? 'Sending…' : 'Submit for review'}
        </button>
        <PrivacyNotice what="dataset" />
      </div>
    </form>
  );
}
