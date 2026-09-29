-- Phase 2 · Foundations: admins, the is_admin() check, and the editable word lists.

-- ---------------------------------------------------------------------------
-- Admins
-- Which signed-in users are admins. Rows are added by hand in the Supabase
-- dashboard (Table Editor) or SQL editor; the site never writes here.
-- ---------------------------------------------------------------------------
create table public.admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  email      text not null,
  added_at   timestamptz not null default now()
);

comment on table public.admins is
  'Signed-in users who can moderate the site. Add rows by hand; see README.';

-- True when the current signed-in user is in admins. SECURITY DEFINER so it
-- can read admins even though ordinary users cannot.
create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins a where a.user_id = auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- Word lists
-- Every pick-list the forms and filters use. Admins can add, rename (label)
-- or hide (active = false) options in the dashboard without a code change.
-- The code is what listings store, so never change a code once used; change
-- the label instead.
-- ---------------------------------------------------------------------------
create table public.vocab_terms (
  list          text not null check (list in (
                  'study_design', 'data_type', 'access_requirement',
                  'discipline', 'career_stage', 'looking_for', 'open_to')),
  code          text not null check (code ~ '^[a-z0-9_]+$'),
  label         text not null check (length(label) between 1 and 80),
  filter_group  text,          -- optional: groups options under one directory filter
  sort_order    integer not null default 0,
  active        boolean not null default true,   -- false = hidden from forms and filters
  primary key (list, code)
);

comment on table public.vocab_terms is
  'Word lists for forms and filters. Edit label, sort_order or active freely; do not change code once in use.';

-- Checks that every code in a list of codes exists in the named word list.
create function public.vocab_codes_valid(p_list text, p_codes text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(bool_and(exists (
    select 1 from public.vocab_terms v where v.list = p_list and v.code = c
  )), true)
  from unnest(p_codes) as c;
$$;

insert into public.vocab_terms (list, code, label, filter_group, sort_order) values
  -- Study design
  ('study_design', 'rct',              'Randomised controlled trial',                'Randomised or crossover trial', 10),
  ('study_design', 'crossover',        'Crossover trial',                            'Randomised or crossover trial', 20),
  ('study_design', 'non_randomised',   'Non-randomised controlled trial',            'Other intervention study',      30),
  ('study_design', 'single_arm',       'Single-arm intervention (no control group)', 'Other intervention study',      40),
  ('study_design', 'cohort',           'Cohort',                                     'Cohort',                        50),
  ('study_design', 'cross_sectional',  'Cross-sectional',                            'Cross-sectional',               60),
  ('study_design', 'other',            'Other',                                      'Other',                         70),

  -- Data types
  ('data_type', 'dietary_intake',          'Dietary intake',            null,  10),
  ('data_type', 'anthropometry',           'Anthropometry',             null,  20),
  ('data_type', 'clinical_biochemistry',   'Clinical biochemistry',     null,  30),
  ('data_type', 'targeted_metabolomics',   'Targeted metabolomics',     null,  40),
  ('data_type', 'untargeted_metabolomics', 'Untargeted metabolomics',   null,  50),
  ('data_type', 'microbiome_16s',          'Gut microbiome (16S)',      'Gut microbiome', 60),
  ('data_type', 'microbiome_shotgun',      'Gut microbiome (shotgun)',  'Gut microbiome', 70),
  ('data_type', 'genomics',                'Genomics',                  null,  80),
  ('data_type', 'wearables_cgm',           'Wearables or CGM',          null,  90),
  ('data_type', 'questionnaires',          'Questionnaires',            null, 100),
  ('data_type', 'other',                   'Other',                     null, 110),

  -- What people need to access a dataset
  ('access_requirement', 'ethics',        'Ethics approval',                   null, 10),
  ('access_requirement', 'dua',           'Data use agreement',                null, 20),
  ('access_requirement', 'coauthorship',  'Co-authorship or acknowledgement',  null, 30),
  ('access_requirement', 'proposal',      'Project proposal review',           null, 40),
  ('access_requirement', 'fee',           'Access fee',                        null, 50),

  -- Disciplines
  ('discipline', 'nutrition_dietetics', 'Nutrition & dietetics',          null, 10),
  ('discipline', 'biomedical',          'Biomedical science',             null, 20),
  ('discipline', 'data_science',        'Data science & bioinformatics',  null, 30),
  ('discipline', 'engineering',         'Engineering',                    null, 40),
  ('discipline', 'statistics',          'Statistics',                     null, 50),
  ('discipline', 'clinical',            'Clinical',                       null, 60),
  ('discipline', 'public_health',       'Public health',                  null, 70),
  ('discipline', 'other',               'Other',                          null, 80),

  -- Career stage
  ('career_stage', 'phd',          'PhD candidate',              null, 10),
  ('career_stage', 'early_career', 'Early-career researcher',    null, 20),
  ('career_stage', 'mid_career',   'Mid-career researcher',      null, 30),
  ('career_stage', 'senior',       'Senior researcher',          null, 40),
  ('career_stage', 'clinician',    'Clinician or practitioner',  null, 50),
  ('career_stage', 'industry',     'Industry',                   null, 60),
  ('career_stage', 'other',        'Other',                      null, 70),

  -- Looking for
  ('looking_for', 'collaborators', 'Collaborators', null, 10),
  ('looking_for', 'datasets',      'Datasets',      null, 20),
  ('looking_for', 'students',      'Students',      null, 30),
  ('looking_for', 'advice',        'Advice',        null, 40),

  -- Open to
  ('open_to', 'collaboration', 'Collaboration', null, 10),
  ('open_to', 'mentoring',     'Mentoring',     null, 20),
  ('open_to', 'supervision',   'Supervision',   null, 30),
  ('open_to', 'advice',        'Advice',        null, 40);
