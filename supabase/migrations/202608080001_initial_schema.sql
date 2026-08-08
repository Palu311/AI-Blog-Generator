create table if not exists public.review_drafts (
  id text primary key,
  token text not null unique,
  slug text not null,
  title text not null,
  status text not null default 'in_review',
  package_data jsonb not null default '{}'::jsonb,
  review_url text not null default '',
  published_url text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.published_posts (
  id text primary key,
  review_id text,
  slug text not null unique,
  title text not null,
  markdown text not null default '',
  html text not null default '',
  meta jsonb not null default '{}'::jsonb,
  image_assets jsonb not null default '[]'::jsonb,
  url text not null default '',
  published_at timestamptz not null default now()
);

create table if not exists public.image_library (
  id text primary key,
  name text not null,
  filename text not null,
  url text not null,
  mime text not null default '',
  size bigint not null default 0,
  category text not null default 'Uncategorized',
  alt_text text not null default '',
  description text not null default '',
  seo_title text not null default '',
  credits text not null default '',
  aspect_ratio text not null default 'responsive',
  tags jsonb not null default '[]'::jsonb,
  keywords jsonb not null default '[]'::jsonb,
  source text not null default '',
  featured boolean not null default false,
  usage_count integer not null default 0,
  upload_date timestamptz not null default now(),
  created_at timestamptz not null default now(),
  last_modified timestamptz not null default now()
);

alter table public.review_drafts enable row level security;
alter table public.published_posts enable row level security;
alter table public.image_library enable row level security;

grant select, insert, update, delete on public.review_drafts to service_role;
grant select, insert, update, delete on public.published_posts to service_role;
grant select, insert, update, delete on public.image_library to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'blog-images',
  'blog-images',
  true,
  12582912,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
