-- Sample listings for testing (the ones shown in the mockups). All are flagged
-- is_sample = true. Contact emails use example.com, which never delivers.
--   Add:     npm run samples:add
--   Remove:  npm run samples:remove     (do this before launch)

-- Start clean so running this twice doesn't duplicate anything.
delete from public.datasets where is_sample;
delete from public.profiles where is_sample;

with d as (
  insert into public.datasets (
    is_sample, status, approved_at, last_reviewed_at, submitted_at, consent_to_list,
    title, summary, keywords, study_design, years_collected, sample_size, age_range, population,
    lead_institution, state, data_types, biospecimens, biospecimens_details,
    access_levels, access_requirements, access_notes, consent_secondary_use,
    repository_url, publication_url, trial_registration, contact_name, contact_role
  ) values
  -- Published
  (true, 'approved', '2026-03-03', '2026-08-12', '2026-03-01', true,
   'Mediterranean diet feeding trial: plasma metabolome and gut microbiome',
   'Twelve-week controlled feeding trial comparing a Mediterranean diet with a habitual Australian diet in adults with overweight. Fasting plasma and stool were collected at baseline, week 6 and week 12, alongside weighed food records and clinical measures.',
   '{Mediterranean diet,feeding trial,TMAO}', 'rct', '2021–2023', 120, '30–65 years', 'Adults with overweight',
   'Institution A', 'NSW', '{dietary_intake,anthropometry,clinical_biochemistry,untargeted_metabolomics,microbiome_shotgun}',
   true, 'plasma and stool, stored at −80 °C',
   '{collaboration}', '{ethics,dua,coauthorship,proposal}', 'Data are shared as part of a collaboration agreed with the study team, under a data use agreement with Institution A. No access fee.', 'yes',
   null, 'https://doi.org/10.1234/sample.mediterranean', 'ACTRN12621000000001 (sample)', 'Dr Sample Custodian A', 'Chief Investigator'),

  (true, 'approved', '2026-05-20', '2026-05-20', '2026-05-18', true,
   'Continuous glucose monitoring in adults with prediabetes',
   'Fourteen days of CGM with photographed food records and anthropometry, repeated annually in a community cohort.',
   '{CGM,prediabetes,glycaemic response}', 'cohort', '2020–2024', 340, '40–70 years', 'Adults with prediabetes',
   'Institution B', 'VIC', '{wearables_cgm,dietary_intake,anthropometry}',
   false, null,
   '{controlled}', '{ethics,dua}', null, 'partly',
   null, null, null, 'Dr Sample Custodian B', 'Chief Investigator'),

  (true, 'approved', '2026-06-11', '2026-06-11', '2026-06-09', true,
   'Adolescent dietary patterns survey',
   'School-based survey of food intake, eating habits and measured height and weight, deposited in a public repository.',
   '{adolescents,dietary patterns,schools}', 'cross_sectional', '2018', 2100, '12–17 years', 'Secondary school students',
   'Institution C', 'QLD', '{dietary_intake,questionnaires,anthropometry}',
   false, null,
   '{open}', '{coauthorship}', 'Please acknowledge the study team in any publication.', 'yes',
   'https://example.org/repository/adolescent-diet-sample', null, null, 'Dr Sample Custodian C', 'Data manager'),

  (true, 'approved', '2026-07-02', '2026-07-02', '2026-06-30', true,
   'Plasma lipidomics after a dairy challenge meal',
   'Postprandial lipid species measured over six hours after a standardised dairy meal in healthy adults.',
   '{dairy,lipidomics,postprandial}', 'crossover', '2022', 40, '18–45 years', 'Healthy adults',
   'Institution D', 'SA', '{targeted_metabolomics,clinical_biochemistry}',
   true, 'plasma, stored at −80 °C',
   '{registered}', '{dua}', null, 'yes',
   null, null, null, 'Dr Sample Custodian D', 'Principal Investigator'),

  (true, 'approved', '2026-08-05', '2026-08-05', '2026-08-01', true,
   'Older adults nutrition and frailty cohort',
   'Community-dwelling adults aged 70 and over, followed for frailty outcomes with repeated diet and blood measures.',
   '{frailty,ageing,protein intake}', 'cohort', '2015–2022', 860, '70 years and over', 'Community-dwelling older adults',
   'Institution E', 'WA', '{dietary_intake,clinical_biochemistry,genomics}',
   true, 'whole blood and serum',
   '{registered,controlled}', '{ethics,dua,proposal}', 'Dietary and frailty measures are available to registered users. Genomic data and biospecimens are available on request, after review by the study''s data access committee.', 'partly',
   null, null, null, 'Prof Sample Custodian E', 'Cohort lead'),

  (true, 'approved', '2026-09-10', '2026-09-10', '2026-09-08', true,
   'Infant feeding and faecal microbiome pilot',
   'Pilot study of infant feeding practices and stool microbiota at 3, 6 and 12 months.',
   '{infant feeding,breastfeeding,microbiome}', 'other', '2023', 60, '0–12 months', 'Healthy term infants',
   'Institution F', 'TAS', '{microbiome_16s,questionnaires}',
   true, 'stool',
   '{collaboration}', '{ethics,coauthorship}', null, 'unsure',
   null, null, null, 'Dr Sample Custodian F', 'Chief Investigator'),

  -- Waiting for review (admin queue)
  (true, 'pending', null, null, '2026-09-24', true,
   'Continuous glucose monitoring in pregnancy',
   'Blinded CGM for 10 days in each trimester with 24-hour dietary recalls and pregnancy outcomes.',
   '{pregnancy,CGM,gestational diabetes}', 'cohort', '2022–2025', 210, '18–45 years', 'Pregnant women',
   'Institution G', 'NSW', '{wearables_cgm,dietary_intake}',
   false, null,
   '{controlled}', '{ethics,dua}', null, 'partly',
   null, null, null, 'Dr Sample Custodian G', 'Chief Investigator'),

  (true, 'pending', null, null, '2026-09-22', true,
   'Sodium intake and blood pressure in older adults',
   'Twenty-four-hour urinary sodium and ambulatory blood pressure in adults aged 65 and over, with a food frequency questionnaire.',
   '{sodium,blood pressure,urinary biomarkers}', 'cross_sectional', '2021', 480, '65 years and over', 'Older adults living in the community',
   'Institution H', 'VIC', '{dietary_intake,clinical_biochemistry,questionnaires}',
   true, 'urine',
   '{registered}', '{dua}', null, 'yes',
   null, null, null, 'Dr Sample Custodian H', 'Research fellow'),

  (true, 'pending', null, null, '2026-09-19', true,
   'Faecal short-chain fatty acids after fibre supplementation',
   'Randomised trial of two fibre supplements over eight weeks, with faecal short-chain fatty acids and stool microbiota measured before and after.',
   '{fibre,short-chain fatty acids,prebiotics}', 'rct', '2023–2024', 96, '25–60 years', 'Healthy adults with low fibre intake',
   'Institution I', 'QLD', '{targeted_metabolomics,microbiome_16s,dietary_intake}',
   true, 'stool, stored at −80 °C',
   '{collaboration}', '{ethics,coauthorship,proposal}', null, 'yes',
   null, null, 'ACTRN12623000000002 (sample)', 'Dr Sample Custodian I', 'Chief Investigator')
  returning id
)
insert into public.dataset_contacts (dataset_id, email)
select id, 'sample-custodian+' || left(id::text, 8) || '@example.com' from d;

with p as (
  insert into public.profiles (
    is_sample, status, approved_at, last_reviewed_at, submitted_at, consent_to_list,
    honorific, full_name, role, career_stage, institution, state, discipline, skills, bio,
    orcid, profile_url, looking_for, open_to
  ) values
  (true, 'approved', '2026-09-12', '2026-09-12', '2026-09-10', true,
   'dr', 'Priya Nair', 'Postdoctoral researcher', 'early_career', 'Institution B', 'VIC', 'data_science',
   '{Multi-omic integration,Machine learning,R,Python}',
   'Builds pipelines that integrate metabolomics, microbiome and clinical data. Looking for diet trial datasets to test prediction models.',
   null, null, '{datasets,collaborators}', '{collaboration}'),

  (true, 'approved', '2026-09-05', '2026-09-05', '2026-09-03', true,
   null, 'Sam Whitfield', 'PhD candidate', 'phd', 'Institution D', 'SA', 'engineering',
   '{Wearable sensors,Signal processing,CGM}',
   'Biomedical engineer developing low-cost wearable sensors. Keen to partner with nutrition teams running free-living studies.',
   null, null, '{collaborators}', '{collaboration}'),

  (true, 'approved', '2026-08-20', '2026-08-20', '2026-08-18', true,
   'a_prof', 'Helen Carter', 'Associate Professor', 'senior', 'Institution A', 'NSW', 'nutrition_dietetics',
   '{Dietary assessment,Feeding trials,Trial design}',
   'Accredited Practising Dietitian who runs controlled feeding trials. Happy to advise on dietary assessment and trial menus.',
   null, null, '{students}', '{mentoring,supervision}'),

  (true, 'approved', '2026-07-30', '2026-07-30', '2026-07-28', true,
   'dr', 'Tom Okafor', 'Biostatistician', 'mid_career', 'Institution E', 'WA', 'statistics',
   '{Longitudinal models,Causal inference}',
   'Works on longitudinal and causal models for cohort data. Available for statistical advice at the grant-writing stage.',
   null, null, '{collaborators}', '{collaboration,advice}'),

  (true, 'approved', '2026-07-14', '2026-07-14', '2026-07-12', true,
   'dr', 'Lena Fischer', 'Senior lecturer', 'mid_career', 'Institution C', 'QLD', 'biomedical',
   '{Shotgun metagenomics,Anaerobic culture}',
   'Microbiologist with a sequencing and anaerobic culture lab. Interested in diet interventions that target the gut microbiome.',
   null, null, '{collaborators,datasets}', '{collaboration}'),

  (true, 'approved', '2026-06-25', '2026-06-25', '2026-06-23', true,
   null, 'Jai Morgan', 'Software engineer', 'industry', 'Industry', 'NSW', 'engineering',
   '{Web apps,Data pipelines,Dashboards}',
   'Builds web apps and data dashboards. Volunteers time for research groups that need participant-facing tools.',
   null, null, '{collaborators}', '{advice}'),

  -- Waiting for review
  (true, 'pending', null, null, '2026-09-26', true,
   'ms', 'Mei Chen', 'Research dietitian', 'early_career', 'Institution G', 'NSW', 'nutrition_dietetics',
   '{Dietary assessment,Pregnancy nutrition}',
   'Research dietitian working on nutrition in pregnancy. Interested in linking dietary data with CGM and birth outcomes.',
   null, null, '{collaborators,datasets}', '{collaboration}'),

  (true, 'pending', null, null, '2026-09-25', true,
   'mr', 'Ravi Patel', 'Bioinformatician', 'mid_career', 'Institution H', 'VIC', 'data_science',
   '{Metagenomics,Nextflow,Cloud computing}',
   'Builds reproducible microbiome analysis pipelines and can help groups move their workflows to the cloud.',
   null, null, '{collaborators}', '{advice,collaboration}')
  returning id
)
insert into public.profile_contacts (profile_id, email)
select id, 'sample-person+' || left(id::text, 8) || '@example.com' from p;

-- Populations for the samples.
update public.datasets set life_stages = v.life, health_statuses = v.health
from (values
  ('Mediterranean diet feeding trial: plasma metabolome and gut microbiome', '{adults}'::text[], '{overweight_obesity}'::text[]),
  ('Continuous glucose monitoring in adults with prediabetes', '{adults,older_adults}', '{prediabetes_t2d}'),
  ('Adolescent dietary patterns survey', '{adolescents}', '{generally_healthy}'),
  ('Plasma lipidomics after a dairy challenge meal', '{adults}', '{generally_healthy}'),
  ('Older adults nutrition and frailty cohort', '{older_adults}', '{generally_healthy,cardiovascular}'),
  ('Infant feeding and faecal microbiome pilot', '{infants}', '{generally_healthy}'),
  ('Continuous glucose monitoring in pregnancy', '{pregnancy_lactation}', '{gestational_diabetes}'),
  ('Sodium intake and blood pressure in older adults', '{older_adults}', '{cardiovascular}'),
  ('Faecal short-chain fatty acids after fibre supplementation', '{adults}', '{generally_healthy}')
) as v(title, life, health)
where datasets.is_sample and datasets.title = v.title;

update public.profiles set life_stages = v.life, health_statuses = v.health
from (values
  ('Priya Nair', '{adults}'::text[], '{prediabetes_t2d,overweight_obesity}'::text[]),
  ('Sam Whitfield', '{adults}', '{prediabetes_t2d,type1_diabetes}'),
  ('Helen Carter', '{adults,older_adults}', '{generally_healthy,cardiovascular}'),
  ('Tom Okafor', '{older_adults}', '{}'),
  ('Lena Fischer', '{infants,adults}', '{gastrointestinal}'),
  ('Mei Chen', '{pregnancy_lactation}', '{gestational_diabetes}')
) as v(name, life, health)
where profiles.is_sample and profiles.full_name = v.name;

-- Sample news and events (identified by the samples@example.com submitter).
delete from public.news_items where submitted_email = 'samples@example.com';
insert into public.news_items (kind, title, summary, url, organisation, scope, location, is_online, starts_on, ends_on, closes_on,
  ethics_reference, ethics_committee, members_only, submitted_name, submitted_email, status, approved_at) values
  ('event', 'Nutrition Society of Australia 50th Annual Scientific Meeting',
   'The Golden Jubilee meeting, themed "Nutrition Science in Australia: 50 Years of Past Insights and Future Directions", with workshops, plenaries, symposia and oral and poster sessions.',
   'https://www.nsaconference.au/', 'Nutrition Society of Australia', 'national', 'University of Melbourne, Parkville', false,
   '2026-12-01', '2026-12-04', null, null, null, false, 'Sample Poster', 'samples@example.com', 'approved', now()),
  ('event', '18th ISNN Congress: Personalised and Planetary Nutrition for Precision Health',
   'The International Society of Nutrigenetics and Nutrigenomics congress, covering precision nutrition, multi-omics, machine learning for precision nutrition, and sustainable diets.',
   'https://isnn2026.event.utar.edu.my/', 'International Society of Nutrigenetics and Nutrigenomics', 'international', 'Kampar, Perak, Malaysia', false,
   '2026-11-05', '2026-11-06', null, null, null, false, 'Sample Poster', 'samples@example.com', 'approved', now()),
  ('news', 'Find nutrition studies recruiting in Australia',
   'The Australian Government''s clinical trials website lets you search trials that are currently recruiting, including nutrition and diet studies, using information from the Australian New Zealand Clinical Trials Registry.',
   'https://www.australianclinicaltrials.gov.au/about/find', 'Australian Government', 'national', null, true,
   null, null, null, null, null, false, 'Sample Poster', 'samples@example.com', 'approved', now());

select
  (select count(*) from public.datasets where is_sample) as sample_datasets,
  (select count(*) from public.profiles where is_sample) as sample_profiles;
