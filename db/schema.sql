-- e-Karmakshetra production reference schema (PostgreSQL 15+ with PostGIS)
-- STATUS: reference design. It is NOT executed by the browser prototype and has not been run
-- against a live database yet. Review with a database engineer before deployment.

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 0. Prabhag reference data (load official JCMC boundaries; the sample app uses invented ones)
CREATE TABLE prabhags (
    id          VARCHAR(30) PRIMARY KEY,
    name        VARCHAR(100) NOT NULL,
    boundary    GEOGRAPHY(MultiPolygon, 4326),
    centroid    GEOGRAPHY(Point, 4326) NOT NULL
);

-- 1. Users and role-based access control
-- Identity: store a salted hash of a verified-identity TOKEN from the identity provider.
-- Do NOT store or hash Aadhaar numbers; Indian law restricts private storage of Aadhaar numbers.
CREATE TABLE users (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    identity_ref_hash  VARCHAR(64) UNIQUE NOT NULL,
    pseudonym          VARCHAR(50) UNIQUE NOT NULL,
    age_bracket        VARCHAR(10) NOT NULL CHECK (age_bracket IN ('0-10','11-17','18-35','36-59','60+')),
    is_profile_public  BOOLEAN NOT NULL DEFAULT TRUE,
    prabhag_id         VARCHAR(30) NOT NULL REFERENCES prabhags(id),
    app_role           VARCHAR(20) NOT NULL DEFAULT 'resident' CHECK (app_role IN ('resident','saathi','official','admin')),
    active_role        VARCHAR(30) CHECK (active_role IN
                         ('Critic/Spotter','Dreamer/Solver','Experimenter/Pilot','Influencer/Promoter','Volunteer-Deliverer')),
    identity_verified  BOOLEAN NOT NULL DEFAULT FALSE,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Pilot rule: only adults file or earn points. Minor access needs verified parental consent (DPDP).
    CONSTRAINT pilot_adults_only CHECK (age_bracket IN ('18-35','36-59','60+'))
);

-- 2. Civic submissions (reports, proposals, pilot proofs, campaigns, deliveries)
CREATE TABLE reports (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_id        UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    kind               VARCHAR(20) NOT NULL CHECK (kind IN ('hazard','solution','pilot','campaign','delivery')),
    category           VARCHAR(50) NOT NULL,
    description        TEXT NOT NULL,
    exact_location     GEOGRAPHY(Point, 4326) NOT NULL,       -- RESTRICTED official layer
    public_prabhag     VARCHAR(30) NOT NULL REFERENCES prabhags(id),  -- public layer
    evidence_url       TEXT NOT NULL,
    evidence_captured  TIMESTAMPTZ NOT NULL,
    peer_confirmations INT NOT NULL DEFAULT 0 CHECK (peer_confirmations >= 0),
    revival_chances    INT NOT NULL DEFAULT 4 CHECK (revival_chances BETWEEN 0 AND 4),
    is_saathi_assisted BOOLEAN NOT NULL DEFAULT FALSE,
    beneficiary_name   VARCHAR(100),
    status             VARCHAR(30) NOT NULL DEFAULT 'PENDING_VERIFICATION' CHECK (status IN
                         ('PENDING_VERIFICATION','AWAITING_OFFICIAL_REVIEW','VERIFIED',
                          'REVISE_OR_DISMISS','REJECTED','DISPUTE_TRIBUNAL')),
    resolved_at        TIMESTAMPTZ,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Verification audit trail (one action per person per report)
CREATE TABLE verifications (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id     UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
    verifier_id   UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    action_type   VARCHAR(20) NOT NULL CHECK (action_type IN
                    ('PEER_CONFIRM','FLAG_FAKE','OFFICIAL_APPROVE','OFFICIAL_REJECT')),
    reason        TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT one_action_per_person UNIQUE (report_id, verifier_id)
);

-- 4. Append-only points ledger. Corrections are OFFSET rows with negative deltas.
CREATE TABLE points_ledger (
    id              BIGSERIAL PRIMARY KEY,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    entry_type      VARCHAR(10) NOT NULL CHECK (entry_type IN ('EARN','OFFSET')),
    activity_type   VARCHAR(60) NOT NULL,
    points_delta    INT NOT NULL,
    reference_id    UUID,
    offsets_entry   BIGINT REFERENCES points_ledger(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK ((entry_type = 'EARN' AND points_delta >= 0) OR (entry_type = 'OFFSET' AND points_delta <= 0 AND offsets_entry IS NOT NULL))
);
CREATE UNIQUE INDEX one_offset_per_entry ON points_ledger(offsets_entry) WHERE offsets_entry IS NOT NULL;

-- 5. General audit log (append-only)
CREATE TABLE audit_log (
    id         BIGSERIAL PRIMARY KEY,
    actor_id   UUID,
    action     VARCHAR(40) NOT NULL,
    ref_id     TEXT,
    detail     TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Immutability: block UPDATE and DELETE on ledger and audit log
CREATE OR REPLACE FUNCTION forbid_change() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'append-only table: % not allowed on %', TG_OP, TG_TABLE_NAME; END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER ledger_append_only BEFORE UPDATE OR DELETE ON points_ledger FOR EACH ROW EXECUTE FUNCTION forbid_change();
CREATE TRIGGER audit_append_only  BEFORE UPDATE OR DELETE ON audit_log     FOR EACH ROW EXECUTE FUNCTION forbid_change();

-- Public layer: Prabhag centroid only, pseudonym only if the profile is public.
CREATE VIEW public_reports AS
SELECT r.id, r.kind, r.category, r.status, r.description, r.public_prabhag,
       ST_Y(p.centroid::geometry) AS centroid_lat, ST_X(p.centroid::geometry) AS centroid_lng,
       CASE WHEN u.is_profile_public THEN u.pseudonym ELSE 'Anonymous resident' END AS by_pseudonym
FROM reports r
JOIN prabhags p ON p.id = r.public_prabhag
JOIN users u ON u.id = r.reporter_id;

-- Row-level security sketch: residents may read public_reports only; officials read reports directly.
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY official_read ON reports FOR SELECT TO official_role USING (true);   -- define roles in deployment
REVOKE ALL ON reports FROM PUBLIC;
GRANT SELECT ON public_reports TO PUBLIC;

-- Performance indexes
CREATE INDEX idx_reports_prabhag ON reports(public_prabhag, status);
CREATE INDEX idx_reports_location ON reports USING GIST (exact_location);
CREATE INDEX idx_ledger_user ON points_ledger(user_id, created_at);
