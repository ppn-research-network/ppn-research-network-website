// Shapes of rows read from the database.

// public_datasets view (approved only, no emails)
export interface PublicDataset {
  id: string;
  slug: string;
  title: string;
  summary: string;
  keywords: string[];
  study_design: string;
  years_collected: string | null;
  sample_size: number | null;
  age_range: string | null;
  population: string | null;
  lead_institution: string;
  state: string;
  data_types: string[];
  data_types_other: string | null;
  biospecimens: boolean;
  biospecimens_details: string | null;
  access_levels: string[];
  access_requirements: string[];
  access_notes: string | null;
  consent_secondary_use: string;
  repository_url: string | null;
  publication_url: string | null;
  trial_registration: string | null;
  contact_name: string;
  contact_role: string;
  listed_at: string | null;
  last_reviewed_at: string | null;
}

// public_profiles view
export interface PublicProfile {
  id: string;
  slug: string;
  honorific: string | null;
  full_name: string;
  role: string;
  career_stage: string;
  institution: string;
  state: string;
  discipline: string;
  skills: string[];
  bio: string;
  orcid: string | null;
  profile_url: string | null;
  looking_for: string[];
  open_to: string[];
  listed_at: string | null;
  last_reviewed_at: string | null;
}

export type ListingStatus = 'pending' | 'approved' | 'rejected' | 'unpublished' | 'withdrawn';

interface Moderation {
  status: ListingStatus;
  review_note: string | null;
  submitted_at: string;
  updated_at: string;
  approved_at: string | null;
  last_reviewed_at: string | null;
  is_sample: boolean;
  consent_to_list: boolean;
  reminder_sent_at: string | null;
}

// Full rows, visible to admins only
export type AdminDataset = Omit<PublicDataset, 'listed_at' | 'last_reviewed_at'> & Moderation;
export type AdminProfile = Omit<PublicProfile, 'listed_at' | 'last_reviewed_at'> & Moderation;
