BEGIN;

-- Private platform feedback and public testimonials have separate storage so
-- private records cannot become public through a state change. Existing
-- classroom feedback is intentionally neither referenced nor backfilled.
CREATE TABLE IF NOT EXISTS "PlatformFeedbackSubmissions" (
  "id" SERIAL PRIMARY KEY,
  "authorUserId" INTEGER NOT NULL,
  "message" VARCHAR(1000) NOT NULL,
  "idempotencyKey" VARCHAR(96) NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "platform_feedback_submissions_author_fk"
    FOREIGN KEY ("authorUserId") REFERENCES "Users"("id") ON DELETE RESTRICT,
  CONSTRAINT "platform_feedback_submissions_message_valid"
    CHECK (
      "message" = regexp_replace(
        "message",
        U&'^[\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+|[\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+$',
        '',
        'g'
      )
      AND length("message") BETWEEN 1 AND 1000
    ),
  CONSTRAINT "platform_feedback_submissions_key_valid"
    CHECK ("idempotencyKey" ~ '^[A-Za-z0-9_-]{8,96}$')
);

CREATE TABLE IF NOT EXISTS "PublicTestimonialSubmissions" (
  "id" SERIAL PRIMARY KEY,
  "authorUserId" INTEGER NOT NULL,
  "idempotencyKey" VARCHAR(96) NOT NULL,
  "withdrawnAt" TIMESTAMPTZ,
  "publicationSuspendedAt" TIMESTAMPTZ,
  "publicationSuspensionReason" VARCHAR(40),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "public_testimonial_submissions_author_fk"
    FOREIGN KEY ("authorUserId") REFERENCES "Users"("id") ON DELETE RESTRICT,
  CONSTRAINT "public_testimonial_submissions_id_author"
    UNIQUE ("id", "authorUserId"),
  CONSTRAINT "public_testimonial_submissions_key_valid"
    CHECK ("idempotencyKey" ~ '^[A-Za-z0-9_-]{8,96}$'),
  CONSTRAINT "public_testimonial_submissions_suspension_valid"
    CHECK (
      ("publicationSuspendedAt" IS NULL AND "publicationSuspensionReason" IS NULL)
      OR
      ("publicationSuspendedAt" IS NOT NULL
        AND "publicationSuspensionReason" = 'account_deactivated')
    )
);

CREATE TABLE IF NOT EXISTS "PublicTestimonialRevisions" (
  "id" SERIAL PRIMARY KEY,
  "submissionId" INTEGER NOT NULL,
  "authorUserId" INTEGER NOT NULL,
  "revisionNumber" INTEGER NOT NULL,
  "isCurrent" BOOLEAN NOT NULL,
  "message" VARCHAR(1000) NOT NULL,
  "attributionMode" VARCHAR(16) NOT NULL,
  "publicDisplayNameSnapshot" VARCHAR(300),
  "publicNamePreviewVersion" VARCHAR(96),
  "consentVersion" VARCHAR(64) NOT NULL,
  "consentedAt" TIMESTAMPTZ NOT NULL,
  "idempotencyKey" VARCHAR(96) NOT NULL,
  "moderationStatus" VARCHAR(16) NOT NULL DEFAULT 'pending',
  "moderationExplanation" VARCHAR(500),
  "approvedByUserId" INTEGER,
  "approvedAt" TIMESTAMPTZ,
  "rejectedByUserId" INTEGER,
  "rejectedAt" TIMESTAMPTZ,
  "revokedByUserId" INTEGER,
  "revokedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "public_testimonial_revisions_submission_author_fk"
    FOREIGN KEY ("submissionId", "authorUserId")
    REFERENCES "PublicTestimonialSubmissions"("id", "authorUserId") ON DELETE RESTRICT,
  CONSTRAINT "public_testimonial_revisions_author_fk"
    FOREIGN KEY ("authorUserId") REFERENCES "Users"("id") ON DELETE RESTRICT,
  CONSTRAINT "public_testimonial_revisions_approved_by_fk"
    FOREIGN KEY ("approvedByUserId") REFERENCES "Users"("id") ON DELETE RESTRICT,
  CONSTRAINT "public_testimonial_revisions_rejected_by_fk"
    FOREIGN KEY ("rejectedByUserId") REFERENCES "Users"("id") ON DELETE RESTRICT,
  CONSTRAINT "public_testimonial_revisions_revoked_by_fk"
    FOREIGN KEY ("revokedByUserId") REFERENCES "Users"("id") ON DELETE RESTRICT,
  CONSTRAINT "public_testimonial_revisions_revision_valid"
    CHECK ("revisionNumber" > 0),
  CONSTRAINT "public_testimonial_revisions_message_valid"
    CHECK (
      "message" = regexp_replace(
        "message",
        U&'^[\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+|[\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+$',
        '',
        'g'
      )
      AND length("message") BETWEEN 1 AND 1000
    ),
  CONSTRAINT "public_testimonial_revisions_attribution_valid"
    CHECK (
      ("attributionMode" = 'named'
        AND length(trim("publicDisplayNameSnapshot")) BETWEEN 1 AND 300
        AND length(trim("publicNamePreviewVersion")) BETWEEN 1 AND 96)
      OR
      ("attributionMode" = 'anonymous'
        AND "publicDisplayNameSnapshot" IS NULL
        AND "publicNamePreviewVersion" IS NULL)
    ),
  CONSTRAINT "public_testimonial_revisions_consent_valid"
    CHECK (length(trim("consentVersion")) BETWEEN 1 AND 64),
  CONSTRAINT "public_testimonial_revisions_key_valid"
    CHECK ("idempotencyKey" ~ '^[A-Za-z0-9_-]{8,96}$'),
  CONSTRAINT "public_testimonial_revisions_moderation_valid"
    CHECK (
      ("moderationStatus" = 'pending'
        AND "moderationExplanation" IS NULL
        AND "approvedByUserId" IS NULL AND "approvedAt" IS NULL
        AND "rejectedByUserId" IS NULL AND "rejectedAt" IS NULL
        AND "revokedByUserId" IS NULL AND "revokedAt" IS NULL)
      OR
      ("moderationStatus" = 'approved'
        AND "moderationExplanation" IS NULL
        AND "approvedByUserId" IS NOT NULL AND "approvedAt" IS NOT NULL
        AND "rejectedByUserId" IS NULL AND "rejectedAt" IS NULL
        AND "revokedByUserId" IS NULL AND "revokedAt" IS NULL)
      OR
      ("moderationStatus" = 'rejected'
        AND "moderationExplanation" = regexp_replace(
          "moderationExplanation",
          U&'^[\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+|[\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+$',
          '',
          'g'
        )
        AND length("moderationExplanation") BETWEEN 1 AND 500
        AND "approvedByUserId" IS NULL AND "approvedAt" IS NULL
        AND "rejectedByUserId" IS NOT NULL AND "rejectedAt" IS NOT NULL
        AND "revokedByUserId" IS NULL AND "revokedAt" IS NULL)
      OR
      ("moderationStatus" = 'revoked'
        AND "moderationExplanation" = regexp_replace(
          "moderationExplanation",
          U&'^[\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+|[\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+$',
          '',
          'g'
        )
        AND length("moderationExplanation") BETWEEN 1 AND 500
        AND "approvedByUserId" IS NOT NULL AND "approvedAt" IS NOT NULL
        AND "rejectedByUserId" IS NULL AND "rejectedAt" IS NULL
        AND "revokedByUserId" IS NOT NULL AND "revokedAt" IS NOT NULL
        AND "revokedAt" >= "approvedAt")
    )
);

-- sequelize.sync() runs in the baseline migration. Refuse missing or
-- incompatible model-created columns rather than coercing retained history.
DO $feedback_testimonial_column_types$
DECLARE
  current_table TEXT;
  incompatible_column TEXT;
BEGIN
  FOR current_table IN
    SELECT unnest(ARRAY[
      'PlatformFeedbackSubmissions',
      'PublicTestimonialSubmissions',
      'PublicTestimonialRevisions'
    ])
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_class relation
      JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public'
        AND relation.relname = current_table
        AND relation.relkind = 'r'
        AND relation.relispartition IS FALSE
    ) THEN
      RAISE EXCEPTION '% must be an ordinary public table', current_table;
    END IF;

    SELECT expected.column_name
      INTO incompatible_column
    FROM (
      SELECT * FROM (VALUES
        ('PlatformFeedbackSubmissions', 'id', 'integer'),
        ('PlatformFeedbackSubmissions', 'authorUserId', 'integer'),
        ('PlatformFeedbackSubmissions', 'message', 'character varying(1000)'),
        ('PlatformFeedbackSubmissions', 'idempotencyKey', 'character varying(96)'),
        ('PlatformFeedbackSubmissions', 'createdAt', 'timestamp with time zone'),
        ('PlatformFeedbackSubmissions', 'updatedAt', 'timestamp with time zone'),
        ('PublicTestimonialSubmissions', 'id', 'integer'),
        ('PublicTestimonialSubmissions', 'authorUserId', 'integer'),
        ('PublicTestimonialSubmissions', 'idempotencyKey', 'character varying(96)'),
        ('PublicTestimonialSubmissions', 'withdrawnAt', 'timestamp with time zone'),
        ('PublicTestimonialSubmissions', 'publicationSuspendedAt', 'timestamp with time zone'),
        ('PublicTestimonialSubmissions', 'publicationSuspensionReason', 'character varying(40)'),
        ('PublicTestimonialSubmissions', 'createdAt', 'timestamp with time zone'),
        ('PublicTestimonialSubmissions', 'updatedAt', 'timestamp with time zone'),
        ('PublicTestimonialRevisions', 'id', 'integer'),
        ('PublicTestimonialRevisions', 'submissionId', 'integer'),
        ('PublicTestimonialRevisions', 'authorUserId', 'integer'),
        ('PublicTestimonialRevisions', 'revisionNumber', 'integer'),
        ('PublicTestimonialRevisions', 'isCurrent', 'boolean'),
        ('PublicTestimonialRevisions', 'message', 'character varying(1000)'),
        ('PublicTestimonialRevisions', 'attributionMode', 'character varying(16)'),
        ('PublicTestimonialRevisions', 'publicDisplayNameSnapshot', 'character varying(300)'),
        ('PublicTestimonialRevisions', 'publicNamePreviewVersion', 'character varying(96)'),
        ('PublicTestimonialRevisions', 'consentVersion', 'character varying(64)'),
        ('PublicTestimonialRevisions', 'consentedAt', 'timestamp with time zone'),
        ('PublicTestimonialRevisions', 'idempotencyKey', 'character varying(96)'),
        ('PublicTestimonialRevisions', 'moderationStatus', 'character varying(16)'),
        ('PublicTestimonialRevisions', 'moderationExplanation', 'character varying(500)'),
        ('PublicTestimonialRevisions', 'approvedByUserId', 'integer'),
        ('PublicTestimonialRevisions', 'approvedAt', 'timestamp with time zone'),
        ('PublicTestimonialRevisions', 'rejectedByUserId', 'integer'),
        ('PublicTestimonialRevisions', 'rejectedAt', 'timestamp with time zone'),
        ('PublicTestimonialRevisions', 'revokedByUserId', 'integer'),
        ('PublicTestimonialRevisions', 'revokedAt', 'timestamp with time zone'),
        ('PublicTestimonialRevisions', 'createdAt', 'timestamp with time zone'),
        ('PublicTestimonialRevisions', 'updatedAt', 'timestamp with time zone')
      ) AS all_expected(table_name, column_name, data_type)
      WHERE all_expected.table_name = current_table
    ) AS expected
    LEFT JOIN pg_attribute attribute
      ON attribute.attrelid = format('public.%I', current_table)::regclass
      AND attribute.attname = expected.column_name
      AND attribute.attnum > 0
      AND NOT attribute.attisdropped
    WHERE attribute.attname IS NULL
      OR format_type(attribute.atttypid, attribute.atttypmod) <> expected.data_type
    ORDER BY expected.column_name
    LIMIT 1;

    IF incompatible_column IS NOT NULL THEN
      RAISE EXCEPTION '% has a missing or incompatible type for column %',
        current_table, incompatible_column;
    END IF;
  END LOOP;
END
$feedback_testimonial_column_types$;

-- sequelize.sync() omits database defaults for managed timestamps, which is a
-- supported compatibility case. Any other nullability/default mismatch must
-- fail before ALTER statements could conceal an incompatible pre-existing
-- definition.
DO $feedback_testimonial_preexisting_column_shape$
DECLARE
  expected RECORD;
  incompatible_column TEXT;
  current_default TEXT;
BEGIN
  FOR expected IN
    SELECT * FROM (VALUES
      (
        'PlatformFeedbackSubmissions',
        ARRAY['id', 'authorUserId', 'message', 'idempotencyKey', 'createdAt', 'updatedAt']::TEXT[],
        ARRAY[]::TEXT[]
      ),
      (
        'PublicTestimonialSubmissions',
        ARRAY['id', 'authorUserId', 'idempotencyKey', 'createdAt', 'updatedAt']::TEXT[],
        ARRAY['withdrawnAt', 'publicationSuspendedAt', 'publicationSuspensionReason']::TEXT[]
      ),
      (
        'PublicTestimonialRevisions',
        ARRAY[
          'id', 'submissionId', 'authorUserId', 'revisionNumber', 'isCurrent',
          'message', 'attributionMode', 'consentVersion', 'consentedAt',
          'idempotencyKey', 'moderationStatus', 'createdAt', 'updatedAt'
        ]::TEXT[],
        ARRAY[
          'publicDisplayNameSnapshot', 'publicNamePreviewVersion',
          'moderationExplanation', 'approvedByUserId', 'approvedAt',
          'rejectedByUserId', 'rejectedAt', 'revokedByUserId', 'revokedAt'
        ]::TEXT[]
      )
    ) AS definitions(table_name, required_columns, optional_columns)
  LOOP
    SELECT attribute.attname
      INTO incompatible_column
    FROM pg_attribute attribute
    WHERE attribute.attrelid = format('public.%I', expected.table_name)::regclass
      AND attribute.attname = ANY(expected.required_columns || expected.optional_columns)
      AND attribute.attnum > 0
      AND NOT attribute.attisdropped
      AND attribute.attnotnull IS DISTINCT FROM (
        attribute.attname = ANY(expected.required_columns)
      )
    ORDER BY attribute.attname
    LIMIT 1;
    IF incompatible_column IS NOT NULL THEN
      RAISE EXCEPTION '% has incompatible pre-existing nullability for column %',
        expected.table_name, incompatible_column;
    END IF;

    SELECT attribute.attname
      INTO incompatible_column
    FROM pg_attribute attribute
    JOIN pg_attrdef attribute_default
      ON attribute_default.adrelid = attribute.attrelid
      AND attribute_default.adnum = attribute.attnum
    WHERE attribute.attrelid = format('public.%I', expected.table_name)::regclass
      AND attribute.attname = ANY(expected.required_columns || expected.optional_columns)
      AND attribute.attname NOT IN ('id', 'createdAt', 'updatedAt', 'moderationStatus')
      AND attribute.attnum > 0
      AND NOT attribute.attisdropped
    ORDER BY attribute.attname
    LIMIT 1;
    IF incompatible_column IS NOT NULL THEN
      RAISE EXCEPTION '% has an unexpected pre-existing default for column %',
        expected.table_name, incompatible_column;
    END IF;

    IF pg_get_serial_sequence(format('public.%I', expected.table_name), 'id') IS NULL
      OR NOT EXISTS (
        SELECT 1
        FROM pg_attribute attribute
        JOIN pg_attrdef attribute_default
          ON attribute_default.adrelid = attribute.attrelid
          AND attribute_default.adnum = attribute.attnum
        JOIN pg_depend dependency
          ON dependency.classid = 'pg_attrdef'::regclass
          AND dependency.objid = attribute_default.oid
          AND dependency.refclassid = 'pg_class'::regclass
          AND dependency.deptype = 'n'
        WHERE attribute.attrelid = format('public.%I', expected.table_name)::regclass
          AND attribute.attname = 'id'
          AND dependency.refobjid = pg_get_serial_sequence(
            format('public.%I', expected.table_name), 'id'
          )::regclass
      ) THEN
      RAISE EXCEPTION '% has an incompatible pre-existing generated identifier',
        expected.table_name;
    END IF;

    FOR incompatible_column IN SELECT unnest(ARRAY['createdAt', 'updatedAt'])
    LOOP
      SELECT pg_get_expr(attribute_default.adbin, attribute_default.adrelid)
        INTO current_default
      FROM pg_attribute attribute
      LEFT JOIN pg_attrdef attribute_default
        ON attribute_default.adrelid = attribute.attrelid
        AND attribute_default.adnum = attribute.attnum
      WHERE attribute.attrelid = format('public.%I', expected.table_name)::regclass
        AND attribute.attname = incompatible_column;
      IF current_default IS NOT NULL
        AND lower(replace(current_default, ' ', '')) NOT IN ('now()', 'current_timestamp') THEN
        RAISE EXCEPTION '% has an incompatible pre-existing timestamp default for column %',
          expected.table_name, incompatible_column;
      END IF;
    END LOOP;
  END LOOP;

  SELECT pg_get_expr(attribute_default.adbin, attribute_default.adrelid)
    INTO current_default
  FROM pg_attribute attribute
  LEFT JOIN pg_attrdef attribute_default
    ON attribute_default.adrelid = attribute.attrelid
    AND attribute_default.adnum = attribute.attnum
  WHERE attribute.attrelid = 'public."PublicTestimonialRevisions"'::regclass
    AND attribute.attname = 'moderationStatus';
  IF current_default IS NOT NULL
    AND lower(replace(current_default, ' ', '')) NOT IN (
      '''pending''::charactervarying', '''pending''::varchar'
    ) THEN
    RAISE EXCEPTION 'PublicTestimonialRevisions has an incompatible pre-existing moderation default';
  END IF;
END
$feedback_testimonial_preexisting_column_shape$;

ALTER TABLE "PlatformFeedbackSubmissions"
  ALTER COLUMN "authorUserId" SET NOT NULL,
  ALTER COLUMN "message" SET NOT NULL,
  ALTER COLUMN "idempotencyKey" SET NOT NULL,
  ALTER COLUMN "createdAt" SET DEFAULT NOW(),
  ALTER COLUMN "createdAt" SET NOT NULL,
  ALTER COLUMN "updatedAt" SET DEFAULT NOW(),
  ALTER COLUMN "updatedAt" SET NOT NULL;
ALTER TABLE "PublicTestimonialSubmissions"
  ALTER COLUMN "authorUserId" SET NOT NULL,
  ALTER COLUMN "idempotencyKey" SET NOT NULL,
  ALTER COLUMN "createdAt" SET DEFAULT NOW(),
  ALTER COLUMN "createdAt" SET NOT NULL,
  ALTER COLUMN "updatedAt" SET DEFAULT NOW(),
  ALTER COLUMN "updatedAt" SET NOT NULL;
ALTER TABLE "PublicTestimonialRevisions"
  ALTER COLUMN "submissionId" SET NOT NULL,
  ALTER COLUMN "authorUserId" SET NOT NULL,
  ALTER COLUMN "revisionNumber" SET NOT NULL,
  ALTER COLUMN "isCurrent" SET NOT NULL,
  ALTER COLUMN "message" SET NOT NULL,
  ALTER COLUMN "attributionMode" SET NOT NULL,
  ALTER COLUMN "consentVersion" SET NOT NULL,
  ALTER COLUMN "consentedAt" SET NOT NULL,
  ALTER COLUMN "idempotencyKey" SET NOT NULL,
  ALTER COLUMN "moderationStatus" SET DEFAULT 'pending',
  ALTER COLUMN "moderationStatus" SET NOT NULL,
  ALTER COLUMN "createdAt" SET DEFAULT NOW(),
  ALTER COLUMN "createdAt" SET NOT NULL,
  ALTER COLUMN "updatedAt" SET DEFAULT NOW(),
  ALTER COLUMN "updatedAt" SET NOT NULL;

-- Validate the whole required column shape after applying only the defaults
-- that sequelize.sync() cannot express for managed timestamps. Optional
-- columns must remain nullable, and unexpected defaults are incompatible.
DO $feedback_testimonial_column_definitions$
DECLARE
  expected RECORD;
  actual RECORD;
  default_expression TEXT;
BEGIN
  FOR expected IN
    SELECT * FROM (VALUES
      ('PlatformFeedbackSubmissions', 'id', TRUE, 'serial'),
      ('PlatformFeedbackSubmissions', 'authorUserId', TRUE, NULL),
      ('PlatformFeedbackSubmissions', 'message', TRUE, NULL),
      ('PlatformFeedbackSubmissions', 'idempotencyKey', TRUE, NULL),
      ('PlatformFeedbackSubmissions', 'createdAt', TRUE, 'now'),
      ('PlatformFeedbackSubmissions', 'updatedAt', TRUE, 'now'),
      ('PublicTestimonialSubmissions', 'id', TRUE, 'serial'),
      ('PublicTestimonialSubmissions', 'authorUserId', TRUE, NULL),
      ('PublicTestimonialSubmissions', 'idempotencyKey', TRUE, NULL),
      ('PublicTestimonialSubmissions', 'withdrawnAt', FALSE, NULL),
      ('PublicTestimonialSubmissions', 'publicationSuspendedAt', FALSE, NULL),
      ('PublicTestimonialSubmissions', 'publicationSuspensionReason', FALSE, NULL),
      ('PublicTestimonialSubmissions', 'createdAt', TRUE, 'now'),
      ('PublicTestimonialSubmissions', 'updatedAt', TRUE, 'now'),
      ('PublicTestimonialRevisions', 'id', TRUE, 'serial'),
      ('PublicTestimonialRevisions', 'submissionId', TRUE, NULL),
      ('PublicTestimonialRevisions', 'authorUserId', TRUE, NULL),
      ('PublicTestimonialRevisions', 'revisionNumber', TRUE, NULL),
      ('PublicTestimonialRevisions', 'isCurrent', TRUE, NULL),
      ('PublicTestimonialRevisions', 'message', TRUE, NULL),
      ('PublicTestimonialRevisions', 'attributionMode', TRUE, NULL),
      ('PublicTestimonialRevisions', 'publicDisplayNameSnapshot', FALSE, NULL),
      ('PublicTestimonialRevisions', 'publicNamePreviewVersion', FALSE, NULL),
      ('PublicTestimonialRevisions', 'consentVersion', TRUE, NULL),
      ('PublicTestimonialRevisions', 'consentedAt', TRUE, NULL),
      ('PublicTestimonialRevisions', 'idempotencyKey', TRUE, NULL),
      ('PublicTestimonialRevisions', 'moderationStatus', TRUE, 'pending'),
      ('PublicTestimonialRevisions', 'moderationExplanation', FALSE, NULL),
      ('PublicTestimonialRevisions', 'approvedByUserId', FALSE, NULL),
      ('PublicTestimonialRevisions', 'approvedAt', FALSE, NULL),
      ('PublicTestimonialRevisions', 'rejectedByUserId', FALSE, NULL),
      ('PublicTestimonialRevisions', 'rejectedAt', FALSE, NULL),
      ('PublicTestimonialRevisions', 'revokedByUserId', FALSE, NULL),
      ('PublicTestimonialRevisions', 'revokedAt', FALSE, NULL),
      ('PublicTestimonialRevisions', 'createdAt', TRUE, 'now'),
      ('PublicTestimonialRevisions', 'updatedAt', TRUE, 'now')
    ) AS definitions(table_name, column_name, required, default_kind)
  LOOP
    SELECT attribute.attnotnull,
           pg_get_expr(attribute_default.adbin, attribute_default.adrelid) AS expression
      INTO actual
    FROM pg_attribute attribute
    LEFT JOIN pg_attrdef attribute_default
      ON attribute_default.adrelid = attribute.attrelid
      AND attribute_default.adnum = attribute.attnum
    WHERE attribute.attrelid = format('public.%I', expected.table_name)::regclass
      AND attribute.attname = expected.column_name
      AND attribute.attnum > 0
      AND NOT attribute.attisdropped;

    IF NOT FOUND OR actual.attnotnull IS DISTINCT FROM expected.required THEN
      RAISE EXCEPTION '% has incompatible nullability for column %',
        expected.table_name, expected.column_name;
    END IF;

    default_expression := actual.expression;
    IF expected.default_kind IS NULL AND default_expression IS NOT NULL THEN
      RAISE EXCEPTION '% has an unexpected default for column %',
        expected.table_name, expected.column_name;
    ELSIF expected.default_kind = 'serial' AND (
      default_expression IS NULL
      OR pg_get_serial_sequence(format('public.%I', expected.table_name), expected.column_name) IS NULL
    ) THEN
      RAISE EXCEPTION '% has an incompatible generated identifier for column %',
        expected.table_name, expected.column_name;
    ELSIF expected.default_kind = 'now'
      AND lower(replace(COALESCE(default_expression, ''), ' ', '')) NOT IN (
        'now()', 'current_timestamp'
      ) THEN
      RAISE EXCEPTION '% has an incompatible timestamp default for column %',
        expected.table_name, expected.column_name;
    ELSIF expected.default_kind = 'pending'
      AND lower(replace(COALESCE(default_expression, ''), ' ', '')) NOT IN (
        '''pending''::charactervarying', '''pending''::varchar'
      ) THEN
      RAISE EXCEPTION '% has an incompatible moderation default for column %',
        expected.table_name, expected.column_name;
    END IF;
  END LOOP;
END
$feedback_testimonial_column_definitions$;

DO $feedback_testimonial_constraints$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'platform_feedback_submissions_author_fk' AND conrelid = 'public."PlatformFeedbackSubmissions"'::regclass) THEN
    ALTER TABLE "PlatformFeedbackSubmissions" ADD CONSTRAINT "platform_feedback_submissions_author_fk" FOREIGN KEY ("authorUserId") REFERENCES "Users"("id") ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'platform_feedback_submissions_message_valid' AND conrelid = 'public."PlatformFeedbackSubmissions"'::regclass) THEN
    ALTER TABLE "PlatformFeedbackSubmissions" ADD CONSTRAINT "platform_feedback_submissions_message_valid" CHECK ("message" = regexp_replace("message", U&'^[\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+|[\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+$', '', 'g') AND length("message") BETWEEN 1 AND 1000);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'platform_feedback_submissions_key_valid' AND conrelid = 'public."PlatformFeedbackSubmissions"'::regclass) THEN
    ALTER TABLE "PlatformFeedbackSubmissions" ADD CONSTRAINT "platform_feedback_submissions_key_valid" CHECK ("idempotencyKey" ~ '^[A-Za-z0-9_-]{8,96}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'public_testimonial_submissions_author_fk' AND conrelid = 'public."PublicTestimonialSubmissions"'::regclass) THEN
    ALTER TABLE "PublicTestimonialSubmissions" ADD CONSTRAINT "public_testimonial_submissions_author_fk" FOREIGN KEY ("authorUserId") REFERENCES "Users"("id") ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'public_testimonial_submissions_key_valid' AND conrelid = 'public."PublicTestimonialSubmissions"'::regclass) THEN
    ALTER TABLE "PublicTestimonialSubmissions" ADD CONSTRAINT "public_testimonial_submissions_key_valid" CHECK ("idempotencyKey" ~ '^[A-Za-z0-9_-]{8,96}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'public_testimonial_submissions_suspension_valid' AND conrelid = 'public."PublicTestimonialSubmissions"'::regclass) THEN
    ALTER TABLE "PublicTestimonialSubmissions" ADD CONSTRAINT "public_testimonial_submissions_suspension_valid" CHECK (("publicationSuspendedAt" IS NULL AND "publicationSuspensionReason" IS NULL) OR ("publicationSuspendedAt" IS NOT NULL AND "publicationSuspensionReason" = 'account_deactivated'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'public_testimonial_revisions_submission_author_fk' AND conrelid = 'public."PublicTestimonialRevisions"'::regclass) THEN
    ALTER TABLE "PublicTestimonialRevisions" ADD CONSTRAINT "public_testimonial_revisions_submission_author_fk" FOREIGN KEY ("submissionId", "authorUserId") REFERENCES "PublicTestimonialSubmissions"("id", "authorUserId") ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'public_testimonial_revisions_author_fk' AND conrelid = 'public."PublicTestimonialRevisions"'::regclass) THEN
    ALTER TABLE "PublicTestimonialRevisions" ADD CONSTRAINT "public_testimonial_revisions_author_fk" FOREIGN KEY ("authorUserId") REFERENCES "Users"("id") ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'public_testimonial_revisions_approved_by_fk' AND conrelid = 'public."PublicTestimonialRevisions"'::regclass) THEN
    ALTER TABLE "PublicTestimonialRevisions" ADD CONSTRAINT "public_testimonial_revisions_approved_by_fk" FOREIGN KEY ("approvedByUserId") REFERENCES "Users"("id") ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'public_testimonial_revisions_rejected_by_fk' AND conrelid = 'public."PublicTestimonialRevisions"'::regclass) THEN
    ALTER TABLE "PublicTestimonialRevisions" ADD CONSTRAINT "public_testimonial_revisions_rejected_by_fk" FOREIGN KEY ("rejectedByUserId") REFERENCES "Users"("id") ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'public_testimonial_revisions_revoked_by_fk' AND conrelid = 'public."PublicTestimonialRevisions"'::regclass) THEN
    ALTER TABLE "PublicTestimonialRevisions" ADD CONSTRAINT "public_testimonial_revisions_revoked_by_fk" FOREIGN KEY ("revokedByUserId") REFERENCES "Users"("id") ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'public_testimonial_revisions_revision_valid' AND conrelid = 'public."PublicTestimonialRevisions"'::regclass) THEN
    ALTER TABLE "PublicTestimonialRevisions" ADD CONSTRAINT "public_testimonial_revisions_revision_valid" CHECK ("revisionNumber" > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'public_testimonial_revisions_message_valid' AND conrelid = 'public."PublicTestimonialRevisions"'::regclass) THEN
    ALTER TABLE "PublicTestimonialRevisions" ADD CONSTRAINT "public_testimonial_revisions_message_valid" CHECK ("message" = regexp_replace("message", U&'^[\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+|[\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+$', '', 'g') AND length("message") BETWEEN 1 AND 1000);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'public_testimonial_revisions_attribution_valid' AND conrelid = 'public."PublicTestimonialRevisions"'::regclass) THEN
    ALTER TABLE "PublicTestimonialRevisions" ADD CONSTRAINT "public_testimonial_revisions_attribution_valid" CHECK (("attributionMode" = 'named' AND length(trim("publicDisplayNameSnapshot")) BETWEEN 1 AND 300 AND length(trim("publicNamePreviewVersion")) BETWEEN 1 AND 96) OR ("attributionMode" = 'anonymous' AND "publicDisplayNameSnapshot" IS NULL AND "publicNamePreviewVersion" IS NULL));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'public_testimonial_revisions_consent_valid' AND conrelid = 'public."PublicTestimonialRevisions"'::regclass) THEN
    ALTER TABLE "PublicTestimonialRevisions" ADD CONSTRAINT "public_testimonial_revisions_consent_valid" CHECK (length(trim("consentVersion")) BETWEEN 1 AND 64);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'public_testimonial_revisions_key_valid' AND conrelid = 'public."PublicTestimonialRevisions"'::regclass) THEN
    ALTER TABLE "PublicTestimonialRevisions" ADD CONSTRAINT "public_testimonial_revisions_key_valid" CHECK ("idempotencyKey" ~ '^[A-Za-z0-9_-]{8,96}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'public_testimonial_revisions_moderation_valid' AND conrelid = 'public."PublicTestimonialRevisions"'::regclass) THEN
    ALTER TABLE "PublicTestimonialRevisions" ADD CONSTRAINT "public_testimonial_revisions_moderation_valid" CHECK (("moderationStatus" = 'pending' AND "moderationExplanation" IS NULL AND "approvedByUserId" IS NULL AND "approvedAt" IS NULL AND "rejectedByUserId" IS NULL AND "rejectedAt" IS NULL AND "revokedByUserId" IS NULL AND "revokedAt" IS NULL) OR ("moderationStatus" = 'approved' AND "moderationExplanation" IS NULL AND "approvedByUserId" IS NOT NULL AND "approvedAt" IS NOT NULL AND "rejectedByUserId" IS NULL AND "rejectedAt" IS NULL AND "revokedByUserId" IS NULL AND "revokedAt" IS NULL) OR ("moderationStatus" = 'rejected' AND "moderationExplanation" = regexp_replace("moderationExplanation", U&'^[\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+|[\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+$', '', 'g') AND length("moderationExplanation") BETWEEN 1 AND 500 AND "approvedByUserId" IS NULL AND "approvedAt" IS NULL AND "rejectedByUserId" IS NOT NULL AND "rejectedAt" IS NOT NULL AND "revokedByUserId" IS NULL AND "revokedAt" IS NULL) OR ("moderationStatus" = 'revoked' AND "moderationExplanation" = regexp_replace("moderationExplanation", U&'^[\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+|[\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+$', '', 'g') AND length("moderationExplanation") BETWEEN 1 AND 500 AND "approvedByUserId" IS NOT NULL AND "approvedAt" IS NOT NULL AND "rejectedByUserId" IS NULL AND "rejectedAt" IS NULL AND "revokedByUserId" IS NOT NULL AND "revokedAt" IS NOT NULL AND "revokedAt" >= "approvedAt"));
  END IF;
END
$feedback_testimonial_constraints$;

CREATE UNIQUE INDEX IF NOT EXISTS "platform_feedback_submissions_author_key"
  ON "PlatformFeedbackSubmissions" ("authorUserId", "idempotencyKey");
CREATE INDEX IF NOT EXISTS "platform_feedback_submissions_author_created_id"
  ON "PlatformFeedbackSubmissions" ("authorUserId", "createdAt" DESC, "id" DESC);
CREATE INDEX IF NOT EXISTS "platform_feedback_submissions_admin_created_id"
  ON "PlatformFeedbackSubmissions" ("createdAt" DESC, "id" DESC);
CREATE UNIQUE INDEX IF NOT EXISTS "public_testimonial_submissions_author_key"
  ON "PublicTestimonialSubmissions" ("authorUserId", "idempotencyKey");
CREATE UNIQUE INDEX IF NOT EXISTS "public_testimonial_submissions_id_author"
  ON "PublicTestimonialSubmissions" ("id", "authorUserId");
CREATE INDEX IF NOT EXISTS "public_testimonial_submissions_author_created_id"
  ON "PublicTestimonialSubmissions" ("authorUserId", "createdAt" DESC, "id" DESC);
CREATE UNIQUE INDEX IF NOT EXISTS "public_testimonial_revisions_submission_revision"
  ON "PublicTestimonialRevisions" ("submissionId", "revisionNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "public_testimonial_revisions_author_key"
  ON "PublicTestimonialRevisions" ("authorUserId", "idempotencyKey");
CREATE UNIQUE INDEX IF NOT EXISTS "public_testimonial_revisions_one_current"
  ON "PublicTestimonialRevisions" ("submissionId") WHERE "isCurrent" = TRUE;
CREATE INDEX IF NOT EXISTS "public_testimonial_revisions_submission_history"
  ON "PublicTestimonialRevisions" ("submissionId", "revisionNumber" DESC, "id" DESC);
CREATE INDEX IF NOT EXISTS "public_testimonial_revisions_moderation_queue"
  ON "PublicTestimonialRevisions" ("moderationStatus", "createdAt" DESC, "id" DESC);
CREATE INDEX IF NOT EXISTS "public_testimonial_revisions_public_order"
  ON "PublicTestimonialRevisions" ("approvedAt" DESC, "id" DESC)
  WHERE "isCurrent" = TRUE AND "moderationStatus" = 'approved';

-- Names alone are not evidence that sync-created or pre-existing constraints
-- have the required meaning. Compare check expression parse trees and inspect
-- foreign-key/primary-key catalog metadata before installing any triggers.
DO $feedback_testimonial_constraint_definitions$
DECLARE
  expected RECORD;
  actual RECORD;
  expected_tree TEXT;
  expected_constraint_name CONSTANT TEXT := '__phase8_expected_check_definition';
BEGIN
  FOR expected IN
    SELECT * FROM (VALUES
      (
        'PlatformFeedbackSubmissions',
        'platform_feedback_submissions_message_valid',
        $check$"message" = regexp_replace("message", U&'^[\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+|[\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+$', '', 'g') AND length("message") BETWEEN 1 AND 1000$check$
      ),
      (
        'PlatformFeedbackSubmissions',
        'platform_feedback_submissions_key_valid',
        $check$"idempotencyKey" ~ '^[A-Za-z0-9_-]{8,96}$'$check$
      ),
      (
        'PublicTestimonialSubmissions',
        'public_testimonial_submissions_key_valid',
        $check$"idempotencyKey" ~ '^[A-Za-z0-9_-]{8,96}$'$check$
      ),
      (
        'PublicTestimonialSubmissions',
        'public_testimonial_submissions_suspension_valid',
        $check$("publicationSuspendedAt" IS NULL AND "publicationSuspensionReason" IS NULL) OR ("publicationSuspendedAt" IS NOT NULL AND "publicationSuspensionReason" = 'account_deactivated')$check$
      ),
      (
        'PublicTestimonialRevisions',
        'public_testimonial_revisions_revision_valid',
        $check$"revisionNumber" > 0$check$
      ),
      (
        'PublicTestimonialRevisions',
        'public_testimonial_revisions_message_valid',
        $check$"message" = regexp_replace("message", U&'^[\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+|[\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+$', '', 'g') AND length("message") BETWEEN 1 AND 1000$check$
      ),
      (
        'PublicTestimonialRevisions',
        'public_testimonial_revisions_attribution_valid',
        $check$("attributionMode" = 'named' AND length(trim("publicDisplayNameSnapshot")) BETWEEN 1 AND 300 AND length(trim("publicNamePreviewVersion")) BETWEEN 1 AND 96) OR ("attributionMode" = 'anonymous' AND "publicDisplayNameSnapshot" IS NULL AND "publicNamePreviewVersion" IS NULL)$check$
      ),
      (
        'PublicTestimonialRevisions',
        'public_testimonial_revisions_consent_valid',
        $check$length(trim("consentVersion")) BETWEEN 1 AND 64$check$
      ),
      (
        'PublicTestimonialRevisions',
        'public_testimonial_revisions_key_valid',
        $check$"idempotencyKey" ~ '^[A-Za-z0-9_-]{8,96}$'$check$
      ),
      (
        'PublicTestimonialRevisions',
        'public_testimonial_revisions_moderation_valid',
        $check$("moderationStatus" = 'pending' AND "moderationExplanation" IS NULL AND "approvedByUserId" IS NULL AND "approvedAt" IS NULL AND "rejectedByUserId" IS NULL AND "rejectedAt" IS NULL AND "revokedByUserId" IS NULL AND "revokedAt" IS NULL) OR ("moderationStatus" = 'approved' AND "moderationExplanation" IS NULL AND "approvedByUserId" IS NOT NULL AND "approvedAt" IS NOT NULL AND "rejectedByUserId" IS NULL AND "rejectedAt" IS NULL AND "revokedByUserId" IS NULL AND "revokedAt" IS NULL) OR ("moderationStatus" = 'rejected' AND "moderationExplanation" = regexp_replace("moderationExplanation", U&'^[\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+|[\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+$', '', 'g') AND length("moderationExplanation") BETWEEN 1 AND 500 AND "approvedByUserId" IS NULL AND "approvedAt" IS NULL AND "rejectedByUserId" IS NOT NULL AND "rejectedAt" IS NOT NULL AND "revokedByUserId" IS NULL AND "revokedAt" IS NULL) OR ("moderationStatus" = 'revoked' AND "moderationExplanation" = regexp_replace("moderationExplanation", U&'^[\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+|[\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+$', '', 'g') AND length("moderationExplanation") BETWEEN 1 AND 500 AND "approvedByUserId" IS NOT NULL AND "approvedAt" IS NOT NULL AND "rejectedByUserId" IS NULL AND "rejectedAt" IS NULL AND "revokedByUserId" IS NOT NULL AND "revokedAt" IS NOT NULL AND "revokedAt" >= "approvedAt")$check$
      )
    ) AS definitions(table_name, constraint_name, expression)
  LOOP
    SELECT constraint_row.contype,
           constraint_row.convalidated,
           constraint_row.connoinherit,
           constraint_row.conbin::TEXT AS conbin
      INTO actual
    FROM pg_constraint constraint_row
    WHERE constraint_row.conrelid = format('public.%I', expected.table_name)::regclass
      AND constraint_row.conname = expected.constraint_name;

    IF NOT FOUND
      OR actual.contype <> 'c'
      OR actual.convalidated IS NOT TRUE
      OR actual.connoinherit IS TRUE THEN
      RAISE EXCEPTION '% has an incompatible required check constraint %',
        expected.table_name, expected.constraint_name;
    END IF;

    IF EXISTS (
      SELECT 1 FROM pg_constraint constraint_row
      WHERE constraint_row.conrelid = format('public.%I', expected.table_name)::regclass
        AND constraint_row.conname = expected_constraint_name
    ) THEN
      RAISE EXCEPTION '% contains the reserved validation constraint %',
        expected.table_name, expected_constraint_name;
    END IF;

    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (%s) NOT VALID',
      expected.table_name,
      expected_constraint_name,
      expected.expression
    );
    SELECT constraint_row.conbin::TEXT
      INTO expected_tree
    FROM pg_constraint constraint_row
    WHERE constraint_row.conrelid = format('public.%I', expected.table_name)::regclass
      AND constraint_row.conname = expected_constraint_name;

    IF actual.conbin IS DISTINCT FROM expected_tree THEN
      RAISE EXCEPTION '% has incompatible semantics for required check constraint %',
        expected.table_name, expected.constraint_name;
    END IF;
    EXECUTE format(
      'ALTER TABLE public.%I DROP CONSTRAINT %I',
      expected.table_name,
      expected_constraint_name
    );
  END LOOP;

  FOR expected IN
    SELECT * FROM (VALUES
      ('PlatformFeedbackSubmissions', 'platform_feedback_submissions_author_fk', ARRAY['authorUserId']::TEXT[], 'Users', ARRAY['id']::TEXT[]),
      ('PublicTestimonialSubmissions', 'public_testimonial_submissions_author_fk', ARRAY['authorUserId']::TEXT[], 'Users', ARRAY['id']::TEXT[]),
      ('PublicTestimonialRevisions', 'public_testimonial_revisions_submission_author_fk', ARRAY['submissionId', 'authorUserId']::TEXT[], 'PublicTestimonialSubmissions', ARRAY['id', 'authorUserId']::TEXT[]),
      ('PublicTestimonialRevisions', 'public_testimonial_revisions_author_fk', ARRAY['authorUserId']::TEXT[], 'Users', ARRAY['id']::TEXT[]),
      ('PublicTestimonialRevisions', 'public_testimonial_revisions_approved_by_fk', ARRAY['approvedByUserId']::TEXT[], 'Users', ARRAY['id']::TEXT[]),
      ('PublicTestimonialRevisions', 'public_testimonial_revisions_rejected_by_fk', ARRAY['rejectedByUserId']::TEXT[], 'Users', ARRAY['id']::TEXT[]),
      ('PublicTestimonialRevisions', 'public_testimonial_revisions_revoked_by_fk', ARRAY['revokedByUserId']::TEXT[], 'Users', ARRAY['id']::TEXT[])
    ) AS definitions(table_name, constraint_name, source_columns, target_table, target_columns)
  LOOP
    SELECT constraint_row.contype,
           constraint_row.convalidated,
           constraint_row.confrelid,
           constraint_row.confdeltype,
           constraint_row.confupdtype,
           constraint_row.condeferrable,
           constraint_row.condeferred,
           ARRAY(
             SELECT attribute.attname::TEXT
             FROM unnest(constraint_row.conkey) WITH ORDINALITY key_column(attnum, position)
             JOIN pg_attribute attribute
               ON attribute.attrelid = constraint_row.conrelid
               AND attribute.attnum = key_column.attnum
             ORDER BY key_column.position
           ) AS source_columns,
           ARRAY(
             SELECT attribute.attname::TEXT
             FROM unnest(constraint_row.confkey) WITH ORDINALITY key_column(attnum, position)
             JOIN pg_attribute attribute
               ON attribute.attrelid = constraint_row.confrelid
               AND attribute.attnum = key_column.attnum
             ORDER BY key_column.position
           ) AS target_columns
      INTO actual
    FROM pg_constraint constraint_row
    WHERE constraint_row.conrelid = format('public.%I', expected.table_name)::regclass
      AND constraint_row.conname = expected.constraint_name;

    IF NOT FOUND
      OR actual.contype <> 'f'
      OR actual.convalidated IS NOT TRUE
      OR actual.confrelid <> format('public.%I', expected.target_table)::regclass
      OR actual.confdeltype <> 'r'
      OR actual.confupdtype <> 'a'
      OR actual.condeferrable IS TRUE
      OR actual.condeferred IS TRUE
      OR actual.source_columns IS DISTINCT FROM expected.source_columns
      OR actual.target_columns IS DISTINCT FROM expected.target_columns THEN
      RAISE EXCEPTION '% has an incompatible required foreign key %',
        expected.table_name, expected.constraint_name;
    END IF;
  END LOOP;

  FOR expected IN
    SELECT unnest(ARRAY[
      'PlatformFeedbackSubmissions',
      'PublicTestimonialSubmissions',
      'PublicTestimonialRevisions'
    ]) AS table_name
  LOOP
    SELECT constraint_row.contype,
           constraint_row.convalidated,
           ARRAY(
             SELECT attribute.attname::TEXT
             FROM unnest(constraint_row.conkey) WITH ORDINALITY key_column(attnum, position)
             JOIN pg_attribute attribute
               ON attribute.attrelid = constraint_row.conrelid
               AND attribute.attnum = key_column.attnum
             ORDER BY key_column.position
           ) AS columns
      INTO actual
    FROM pg_constraint constraint_row
    WHERE constraint_row.conrelid = format('public.%I', expected.table_name)::regclass
      AND constraint_row.contype = 'p';

    IF NOT FOUND
      OR actual.convalidated IS NOT TRUE
      OR actual.columns IS DISTINCT FROM ARRAY['id']::TEXT[] THEN
      RAISE EXCEPTION '% has an incompatible primary key', expected.table_name;
    END IF;
  END LOOP;
END
$feedback_testimonial_constraint_definitions$;

-- Validate index identity through pg_index metadata and compare predicate parse
-- trees against temporary expected indexes. Sort direction is intentionally not
-- compared: sync-created ASC indexes are scan-equivalent to the migration's DESC
-- indexes because all ordering columns used here are non-null in their predicate.
DO $feedback_testimonial_index_definitions$
DECLARE
  expected RECORD;
  actual RECORD;
  expected_index RECORD;
  column_list TEXT;
  expected_index_name CONSTANT TEXT := '__phase8_expected_index_definition';
BEGIN
  FOR expected IN
    SELECT * FROM (VALUES
      ('PlatformFeedbackSubmissions', 'platform_feedback_submissions_author_key', TRUE, ARRAY['authorUserId', 'idempotencyKey']::TEXT[], NULL),
      ('PlatformFeedbackSubmissions', 'platform_feedback_submissions_author_created_id', FALSE, ARRAY['authorUserId', 'createdAt', 'id']::TEXT[], NULL),
      ('PlatformFeedbackSubmissions', 'platform_feedback_submissions_admin_created_id', FALSE, ARRAY['createdAt', 'id']::TEXT[], NULL),
      ('PublicTestimonialSubmissions', 'public_testimonial_submissions_author_key', TRUE, ARRAY['authorUserId', 'idempotencyKey']::TEXT[], NULL),
      ('PublicTestimonialSubmissions', 'public_testimonial_submissions_id_author', TRUE, ARRAY['id', 'authorUserId']::TEXT[], NULL),
      ('PublicTestimonialSubmissions', 'public_testimonial_submissions_author_created_id', FALSE, ARRAY['authorUserId', 'createdAt', 'id']::TEXT[], NULL),
      ('PublicTestimonialRevisions', 'public_testimonial_revisions_submission_revision', TRUE, ARRAY['submissionId', 'revisionNumber']::TEXT[], NULL),
      ('PublicTestimonialRevisions', 'public_testimonial_revisions_author_key', TRUE, ARRAY['authorUserId', 'idempotencyKey']::TEXT[], NULL),
      ('PublicTestimonialRevisions', 'public_testimonial_revisions_one_current', TRUE, ARRAY['submissionId']::TEXT[], $predicate$"isCurrent" = TRUE$predicate$),
      ('PublicTestimonialRevisions', 'public_testimonial_revisions_submission_history', FALSE, ARRAY['submissionId', 'revisionNumber', 'id']::TEXT[], NULL),
      ('PublicTestimonialRevisions', 'public_testimonial_revisions_moderation_queue', FALSE, ARRAY['moderationStatus', 'createdAt', 'id']::TEXT[], NULL),
      ('PublicTestimonialRevisions', 'public_testimonial_revisions_public_order', FALSE, ARRAY['approvedAt', 'id']::TEXT[], $predicate$"isCurrent" = TRUE AND "moderationStatus" = 'approved'$predicate$)
    ) AS definitions(table_name, index_name, is_unique, columns, predicate)
  LOOP
    SELECT index_row.indisunique,
           index_row.indisprimary,
           index_row.indisexclusion,
           index_row.indimmediate,
           index_row.indisvalid,
           index_row.indisready,
           index_row.indislive,
           index_row.indnkeyatts,
           index_row.indnatts,
           index_row.indexprs,
           index_row.indpred::TEXT AS indpred,
           index_row.indclass::TEXT AS operator_classes,
           index_row.indcollation::TEXT AS collations,
           access_method.amname,
           ARRAY(
             SELECT attribute.attname::TEXT
             FROM unnest(index_row.indkey) WITH ORDINALITY key_column(attnum, position)
             JOIN pg_attribute attribute
               ON attribute.attrelid = index_row.indrelid
               AND attribute.attnum = key_column.attnum
             WHERE key_column.position <= index_row.indnkeyatts
             ORDER BY key_column.position
           ) AS columns
      INTO actual
    FROM pg_class index_relation
    JOIN pg_namespace namespace ON namespace.oid = index_relation.relnamespace
    JOIN pg_index index_row ON index_row.indexrelid = index_relation.oid
    JOIN pg_class table_relation ON table_relation.oid = index_row.indrelid
    JOIN pg_am access_method ON access_method.oid = index_relation.relam
    WHERE namespace.nspname = 'public'
      AND index_relation.relname = expected.index_name
      AND table_relation.oid = format('public.%I', expected.table_name)::regclass;

    IF NOT FOUND
      OR actual.indisunique IS DISTINCT FROM expected.is_unique
      OR actual.indisvalid IS NOT TRUE
      OR actual.indisprimary IS TRUE
      OR actual.indisexclusion IS TRUE
      OR actual.indimmediate IS NOT TRUE
      OR actual.indisready IS NOT TRUE
      OR actual.indislive IS NOT TRUE
      OR actual.indnkeyatts <> cardinality(expected.columns)
      OR actual.indnatts <> cardinality(expected.columns)
      OR actual.indexprs IS NOT NULL
      OR actual.amname <> 'btree'
      OR actual.columns IS DISTINCT FROM expected.columns THEN
      RAISE EXCEPTION '% has an incompatible required index %',
        expected.table_name, expected.index_name;
    END IF;

    IF to_regclass(format('public.%I', expected_index_name)) IS NOT NULL THEN
      RAISE EXCEPTION 'public schema contains the reserved validation index %',
        expected_index_name;
    END IF;
    SELECT string_agg(format('%I', column_name), ', ' ORDER BY position)
      INTO column_list
    FROM unnest(expected.columns) WITH ORDINALITY column_value(column_name, position);
    EXECUTE format(
      'CREATE INDEX %I ON public.%I (%s)%s',
      expected_index_name,
      expected.table_name,
      column_list,
      CASE WHEN expected.predicate IS NULL
        THEN ''
        ELSE format(' WHERE %s', expected.predicate)
      END
    );
    SELECT index_row.indpred::TEXT AS indpred,
           index_row.indclass::TEXT AS operator_classes,
           index_row.indcollation::TEXT AS collations
      INTO expected_index
    FROM pg_class index_relation
    JOIN pg_index index_row ON index_row.indexrelid = index_relation.oid
    WHERE index_relation.oid = format('public.%I', expected_index_name)::regclass;

    IF actual.indpred IS DISTINCT FROM expected_index.indpred
      OR actual.operator_classes IS DISTINCT FROM expected_index.operator_classes
      OR actual.collations IS DISTINCT FROM expected_index.collations THEN
      RAISE EXCEPTION '% has an incompatible definition for required index %',
        expected.table_name, expected.index_name;
    END IF;
    EXECUTE format('DROP INDEX public.%I', expected_index_name);
  END LOOP;
END
$feedback_testimonial_index_definitions$;

CREATE OR REPLACE FUNCTION enforce_public_testimonial_submission_transitions()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF ROW(NEW."id", NEW."authorUserId", NEW."idempotencyKey", NEW."createdAt")
    IS DISTINCT FROM ROW(OLD."id", OLD."authorUserId", OLD."idempotencyKey", OLD."createdAt") THEN
    RAISE EXCEPTION 'Public testimonial submission identity is immutable';
  END IF;
  IF OLD."withdrawnAt" IS NOT NULL AND ROW(
    NEW."withdrawnAt", NEW."publicationSuspendedAt", NEW."publicationSuspensionReason"
  ) IS DISTINCT FROM ROW(
    OLD."withdrawnAt", OLD."publicationSuspendedAt", OLD."publicationSuspensionReason"
  ) THEN
    RAISE EXCEPTION 'Public testimonial withdrawal is terminal';
  END IF;
  IF OLD."withdrawnAt" IS NOT NULL AND NEW."withdrawnAt" IS NULL THEN
    RAISE EXCEPTION 'Public testimonial withdrawal cannot be cleared';
  END IF;
  IF OLD."withdrawnAt" IS NOT NULL AND NEW."withdrawnAt" IS DISTINCT FROM OLD."withdrawnAt" THEN
    RAISE EXCEPTION 'Public testimonial withdrawal cannot be changed';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS public_testimonial_submissions_enforce_transitions
  ON "PublicTestimonialSubmissions";
CREATE TRIGGER public_testimonial_submissions_enforce_transitions
  BEFORE UPDATE ON "PublicTestimonialSubmissions"
  FOR EACH ROW EXECUTE FUNCTION enforce_public_testimonial_submission_transitions();

CREATE OR REPLACE FUNCTION enforce_public_testimonial_revision_transitions()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF ROW(
    NEW."id", NEW."submissionId", NEW."authorUserId", NEW."revisionNumber",
    NEW."message", NEW."attributionMode", NEW."publicDisplayNameSnapshot",
    NEW."publicNamePreviewVersion", NEW."consentVersion", NEW."consentedAt",
    NEW."idempotencyKey", NEW."createdAt"
  ) IS DISTINCT FROM ROW(
    OLD."id", OLD."submissionId", OLD."authorUserId", OLD."revisionNumber",
    OLD."message", OLD."attributionMode", OLD."publicDisplayNameSnapshot",
    OLD."publicNamePreviewVersion", OLD."consentVersion", OLD."consentedAt",
    OLD."idempotencyKey", OLD."createdAt"
  ) THEN
    RAISE EXCEPTION 'Public testimonial revision evidence is immutable';
  END IF;

  IF OLD."isCurrent" = FALSE AND NEW."isCurrent" = TRUE THEN
    RAISE EXCEPTION 'Historical public testimonial revision cannot become current';
  END IF;

  IF NEW."moderationStatus" = OLD."moderationStatus" THEN
    IF ROW(
      NEW."moderationExplanation", NEW."approvedByUserId", NEW."approvedAt",
      NEW."rejectedByUserId", NEW."rejectedAt", NEW."revokedByUserId", NEW."revokedAt"
    ) IS DISTINCT FROM ROW(
      OLD."moderationExplanation", OLD."approvedByUserId", OLD."approvedAt",
      OLD."rejectedByUserId", OLD."rejectedAt", OLD."revokedByUserId", OLD."revokedAt"
    ) THEN
      RAISE EXCEPTION 'Public testimonial moderation decision evidence is write-once';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD."moderationStatus" = 'pending'
    AND NEW."moderationStatus" IN ('approved', 'rejected') THEN
    IF OLD."isCurrent" IS NOT TRUE OR NEW."isCurrent" IS NOT TRUE THEN
      RAISE EXCEPTION 'Only the current pending public testimonial revision can be decided';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD."moderationStatus" = 'approved' AND NEW."moderationStatus" = 'revoked' THEN
    IF ROW(NEW."approvedByUserId", NEW."approvedAt")
      IS DISTINCT FROM ROW(OLD."approvedByUserId", OLD."approvedAt") THEN
      RAISE EXCEPTION 'Public testimonial approval evidence is write-once';
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Illegal public testimonial moderation transition';
END;
$$;

DROP TRIGGER IF EXISTS public_testimonial_revisions_enforce_transitions
  ON "PublicTestimonialRevisions";
CREATE TRIGGER public_testimonial_revisions_enforce_transitions
  BEFORE UPDATE ON "PublicTestimonialRevisions"
  FOR EACH ROW EXECUTE FUNCTION enforce_public_testimonial_revision_transitions();

ALTER TABLE "PlatformFeedbackSubmissions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PublicTestimonialSubmissions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PublicTestimonialRevisions" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "PlatformFeedbackSubmissions" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE "PublicTestimonialSubmissions" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE "PublicTestimonialRevisions" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON SEQUENCE "PlatformFeedbackSubmissions_id_seq" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON SEQUENCE "PublicTestimonialSubmissions_id_seq" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON SEQUENCE "PublicTestimonialRevisions_id_seq" FROM PUBLIC;

DO $feedback_testimonial_roles$
DECLARE role_name TEXT;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = role_name) THEN
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON TABLE public.%I, public.%I, public.%I FROM %I',
        'PlatformFeedbackSubmissions', 'PublicTestimonialSubmissions',
        'PublicTestimonialRevisions', role_name
      );
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON SEQUENCE public.%I, public.%I, public.%I FROM %I',
        'PlatformFeedbackSubmissions_id_seq', 'PublicTestimonialSubmissions_id_seq',
        'PublicTestimonialRevisions_id_seq', role_name
      );
    END IF;
  END LOOP;
END
$feedback_testimonial_roles$;

COMMIT;
