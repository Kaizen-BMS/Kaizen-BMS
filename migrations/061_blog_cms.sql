-- Blog CMS: Kaizen's own public marketing blog becomes admin-manageable
-- instead of a hand-written file per post. This is PLATFORM content (it
-- belongs to Kaizen the company, not to any hospital tenant), so
-- blog_posts carries no tenant_id — same category as `tenants`/`users`,
-- queried with the raw `prisma` client, never `tenantDb`.
--
-- 1. users.role + CONTENT_EDITOR — a new platform-level role (tenant_id
--    NULL, same as SUPER_ADMIN) with exactly one job: write/manage blog
--    posts. Given no "*" wildcard — see rbac.js's BLOG_EDITOR permission
--    list and SCOPE_RESTRICTED_ACTIONS for why a tenant admin's own
--    wildcard still can't reach these actions.
-- 2. blog_posts (new table).
--
-- Backed up automatically by scripts/dbApplyGuard.js before this runs.

ALTER TABLE users
  MODIFY COLUMN role ENUM(
    'SUPER_ADMIN','HOSPITAL_ADMIN','DOCTOR','PHARMACIST','LAB_TECH',
    'BILLING_STAFF','RECEPTIONIST','NURSE','OWNER_DOCTOR','OWNER_PHARMACIST',
    'OWNER_LAB_TECH','RADIOLOGY_STAFF','CONTENT_EDITOR'
  ) NOT NULL;

CREATE TABLE IF NOT EXISTS blog_posts (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  slug            VARCHAR(191) NOT NULL,
  title           VARCHAR(255) NOT NULL,
  excerpt         VARCHAR(500) NOT NULL,
  category        VARCHAR(100) NOT NULL,
  -- Client-compressed JPEG data URL, or a plain /images/... or https://
  -- path — same no-file-storage convention as print_branding.logo_url
  -- (migration 058). NULL = no cover image set yet.
  cover_image     MEDIUMTEXT NULL,
  -- Paragraphs separated by a blank line, rendered as <p> tags — no
  -- markdown/rich-text library in this project, matching its existing
  -- "plain, fast, functional" admin tooling.
  content         LONGTEXT NOT NULL,
  status          ENUM('DRAFT','PUBLISHED') NOT NULL DEFAULT 'DRAFT',
  -- NULL = written before per-author attribution existed (the 3 seeded
  -- posts below) — the public page falls back to "Kaizen BMS Team".
  author_user_id  BIGINT UNSIGNED NULL,
  published_at    DATETIME NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_blog_posts_slug (slug),
  KEY idx_blog_posts_status_published (status, published_at),
  KEY idx_blog_posts_author (author_user_id),
  CONSTRAINT fk_blog_posts_author FOREIGN KEY (author_user_id) REFERENCES users (id) ON DELETE SET NULL
);

-- Seed the 3 existing hand-written posts so every current /blog/<slug> URL
-- keeps working once the static page files are removed in favour of one
-- dynamic route reading from this table.
INSERT INTO blog_posts (slug, title, excerpt, category, cover_image, content, status, author_user_id, published_at, created_at)
VALUES
(
  'hospitals-need-real-systems',
  'Why Hospitals Need Real Systems, Not Just Software',
  'Software alone doesn''t fix a hospital''s operations — it only reflects the discipline, or lack of it, already in place.',
  'Hospital Management',
  '/images/stock/hero-skyline.jpg',
  'Most hospitals that call us don''t start the conversation by asking for software. They ask for help with a doctor who won''t follow protocol, a pharmacy that can''t explain its own stock, or a front desk that loses track of patients between departments. By the time software comes up, it''s usually the third or fourth thing we discuss — not the first.\n\nThat order matters. A hospital management system can log every prescription, every bed, every rupee — but it can only log what the hospital actually does. If the OPD protocol is unclear, the system will faithfully record an unclear protocol. If nobody owns the pharmacy''s stock-in process, the system will faithfully record nobody owning it. Software makes a hospital''s existing discipline visible; it doesn''t supply the discipline itself.\n\nThis is why our own approach to hospital management starts with governance, not screens: a clear organogram, defined OPD/IPD/Emergency protocols, and role accountability that survives a staff member going on leave. Only once that structure exists does a cloud dashboard or a pharmacy module become genuinely useful — because now there''s a real process underneath it for the data to describe.\n\nThe hospitals that get the most out of their systems aren''t necessarily the ones with the newest software. They''re the ones that did the harder work first — defining who is responsible for what, and holding that line even when it''s inconvenient. Everything digital after that is easier, because it''s describing something real.\n\nIf you''re evaluating hospital software right now, it''s worth asking a different question first: is there a real system underneath it, or will the software just be a faster way to see the same gaps?',
  'PUBLISHED', NULL, '2026-11-10 09:00:00', '2026-11-10 09:00:00'
),
(
  'digital-transformation-starts-with-process',
  'Digital Transformation Starts With the Process, Not the Tool',
  'Buying new software before fixing the workflow underneath it just gives you a faster way to do the wrong thing.',
  'Business Consulting',
  '/images/stock/office-skyscrapers.jpg',
  '"We need to digitize" is one of the most common requests we hear, and one of the least useful on its own. Digitizing a broken process doesn''t fix it — it just makes the breakage happen faster, with a dashboard attached. Before any tool enters the conversation, we want to understand the workflow it''s meant to replace: who does what, in what order, and why it''s done that way today.\n\nOften the honest answer to "why is it done that way" is "because that''s how it''s always been done," not because it''s the best way. That gap — between inherited habit and actual necessity — is where most of the real improvement in a transformation project happens. It costs nothing but attention, and it has to happen before a single rupee is spent on software.\n\nOnce the process itself is sound, choosing the tool gets much easier. A clear workflow tells you exactly what the software needs to do, which roles need access to what, and where automation actually saves time instead of just moving the same manual step into a new interface. Teams skip this step because it feels slower than just buying something — but it''s almost always the faster path to a system people actually use.\n\nThe failure mode we see most often isn''t a bad piece of software. It''s a good piece of software layered over an unresolved process, where staff quietly keep working around it in spreadsheets and WhatsApp groups because the system was never built to match how work actually happens. The fix isn''t a better tool. It''s going back to the process first.\n\nIf you''re planning a transformation project, start by writing down the workflow exactly as it happens today — the messy, inconsistent version, not the ideal one. That document is worth more than any demo you''ll sit through.',
  'PUBLISHED', NULL, '2026-10-28 09:00:00', '2026-10-28 09:00:00'
),
(
  'choosing-the-right-study-abroad-path',
  'Choosing the Right Study-Abroad Path: What Actually Matters',
  'The right country and course fit matters more than the most prestigious name on the admit letter.',
  'Education Consultancy',
  '/images/stock/team-office.jpg',
  'A lot of study-abroad advice starts and ends with rankings — chase the highest-ranked university you can get into, and the rest will sort itself out. In practice, the students who struggle most abroad are rarely the ones at a lower-ranked school. They''re the ones who picked a name over a fit, and found out the gap between the two only after landing.\n\nFit is a combination of things rankings don''t capture: the actual course content against your real academic background, the cost of living against your real budget (not just the tuition fee), the post-study work and visa pathway for your specific course and country, and — underrated, but real — whether the city and climate are somewhere you can actually live for two or more years.\n\nScholarships and funding deserve the same scrutiny as the course itself. A partial scholarship at a slightly less prestigious university, paired with a realistic cost of living, often produces a far better outcome than an unfunded seat at a bigger name — especially once you account for the loan interest that compounds over the years you''re still studying.\n\nVisa filing is where good planning gets undone by late paperwork more often than by a weak profile. Financial documentation, sponsor affidavits and interview preparation all take real time to get right, and the deadlines for a visa interview rarely move to suit an application that was finished at the last minute.\n\nThe shortlist that actually works is usually a reach, a match and a safety option, built around your own budget and goals rather than a single dream university. It''s a less exciting list to make — but it''s the one that gets students through the whole journey, not just the admit letter.',
  'PUBLISHED', NULL, '2026-10-14 09:00:00', '2026-10-14 09:00:00'
);
