--
-- PostgreSQL database dump
--

\restrict MA1ssH7NFt5Ffm4k8S1fGEnxTTRNa9887yyCN5lrgA9JEirQEMyhu0wW0NLKhYi

-- Dumped from database version 16.13 (Homebrew)
-- Dumped by pg_dump version 16.13 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: agent_keys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_keys (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    company_id uuid NOT NULL,
    name text NOT NULL,
    key_hash text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: board_states; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.board_states (
    company_id uuid NOT NULL,
    state jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid
);


--
-- Name: companies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.companies (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name text NOT NULL,
    plan text DEFAULT 'free'::text NOT NULL,
    skill_tree jsonb DEFAULT '{}'::jsonb NOT NULL,
    external_pieces_published integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT companies_plan_check CHECK ((plan = ANY (ARRAY['free'::text, 'pro'::text, 'enterprise'::text])))
);


--
-- Name: company_memberships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.company_memberships (
    user_id uuid NOT NULL,
    company_id uuid NOT NULL,
    role text DEFAULT 'worker'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    CONSTRAINT company_memberships_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'worker'::text, 'external'::text]))),
    CONSTRAINT company_memberships_status_check CHECK ((status = ANY (ARRAY['active'::text, 'paused'::text, 'left'::text])))
);


--
-- Name: company_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.company_settings (
    company_id uuid NOT NULL,
    key character varying(64) NOT NULL,
    value text
);


--
-- Name: connections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.connections (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    from_piece_id uuid NOT NULL,
    to_piece_id uuid NOT NULL,
    type text DEFAULT 'sequential'::text NOT NULL,
    condition text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT connections_type_check CHECK ((type = ANY (ARRAY['sequential'::text, 'parallel'::text, 'conditional'::text])))
);


--
-- Name: contact_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contact_requests (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    target_user_id uuid NOT NULL,
    sender_name text NOT NULL,
    sender_email text NOT NULL,
    message text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    read_at timestamp with time zone
);


--
-- Name: flow_alerts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.flow_alerts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    alert_type text NOT NULL,
    blocking_piece_id uuid NOT NULL,
    affected_count integer DEFAULT 0 NOT NULL,
    severity integer DEFAULT 1 NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    detected_at timestamp with time zone DEFAULT now(),
    acknowledged_at timestamp with time zone,
    resolved_at timestamp with time zone,
    acknowledged_by uuid,
    CONSTRAINT flow_alerts_severity_check CHECK ((severity = ANY (ARRAY[1, 2, 3])))
);


--
-- Name: flow_score_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.flow_score_log (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    company_id uuid NOT NULL,
    score integer NOT NULL,
    recorded_at timestamp with time zone DEFAULT now() NOT NULL,
    recorded_date date
);


--
-- Name: flow_unlock_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.flow_unlock_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    unlocking_piece_id uuid NOT NULL,
    unlocked_piece_id uuid NOT NULL,
    unlocking_user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: invite_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invite_tokens (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    token character varying(64) NOT NULL,
    company_id uuid NOT NULL,
    created_by uuid NOT NULL,
    used_by uuid,
    role text DEFAULT 'worker'::text NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '7 days'::interval) NOT NULL,
    used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT invite_tokens_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'worker'::text])))
);


--
-- Name: key_results; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.key_results (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    okr_id uuid,
    title text NOT NULL,
    target_value numeric(14,2) DEFAULT 100,
    current_value numeric(14,2) DEFAULT 0,
    unit text DEFAULT '%'::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: leave_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.leave_requests (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    company_id uuid NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    reason text DEFAULT ''::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT leave_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    company_id uuid NOT NULL,
    user_id uuid NOT NULL,
    type text NOT NULL,
    title text NOT NULL,
    body text,
    piece_id uuid,
    read boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: okrs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.okrs (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    company_id uuid,
    title text NOT NULL,
    description text DEFAULT ''::text,
    owner_id uuid,
    quarter text NOT NULL,
    status text DEFAULT 'active'::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT okrs_status_check CHECK ((status = ANY (ARRAY['active'::text, 'completed'::text, 'cancelled'::text])))
);


--
-- Name: piece_comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.piece_comments (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    piece_id uuid NOT NULL,
    user_id uuid NOT NULL,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    is_support_reply boolean DEFAULT false NOT NULL,
    support_reaction character varying(50) DEFAULT NULL::character varying,
    parent_comment_id uuid,
    is_support_message boolean DEFAULT false NOT NULL
);


--
-- Name: piece_completion_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.piece_completion_records (
    id text NOT NULL,
    piece_id text NOT NULL,
    piece_name text NOT NULL,
    assignee_id text NOT NULL,
    estimated_minutes integer,
    actual_minutes integer NOT NULL,
    completed_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: piece_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.piece_logs (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    piece_id uuid NOT NULL,
    user_id uuid,
    event_type text NOT NULL,
    old_value text,
    new_value text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    reason text
);


--
-- Name: piece_okr_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.piece_okr_links (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    piece_id uuid NOT NULL,
    okr_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: piece_proposals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.piece_proposals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    proposed_by uuid NOT NULL,
    title text NOT NULL,
    objective text DEFAULT ''::text NOT NULL,
    skill_tags text[] DEFAULT '{}'::text[] NOT NULL,
    priority integer DEFAULT 3 NOT NULL,
    estimated_days integer,
    due_date date,
    project_id uuid,
    reason text DEFAULT ''::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    reject_reason text,
    created_piece_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT piece_proposals_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))
);


--
-- Name: piece_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.piece_templates (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    company_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    skill_tags text[] DEFAULT '{}'::text[] NOT NULL,
    difficulty integer DEFAULT 3 NOT NULL,
    priority text DEFAULT 'medium'::text NOT NULL,
    estimated_days integer,
    checklist jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: piece_velocity_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.piece_velocity_log (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    piece_id uuid,
    assignee_id uuid,
    company_id uuid,
    actual_days integer,
    skill_tags text[],
    business_impact bigint DEFAULT 0,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: piece_watchers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.piece_watchers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    piece_id uuid NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: pieces; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pieces (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    title text NOT NULL,
    objective text DEFAULT ''::text NOT NULL,
    value_metric text DEFAULT ''::text NOT NULL,
    expected_impact text DEFAULT ''::text NOT NULL,
    assignee_id uuid,
    company_id uuid,
    status text DEFAULT 'locked'::text NOT NULL,
    priority integer DEFAULT 0 NOT NULL,
    skill_tags text[] DEFAULT '{}'::text[] NOT NULL,
    is_external boolean DEFAULT false NOT NULL,
    reward numeric(12,2) DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    due_date timestamp with time zone,
    project_id uuid,
    start_date timestamp with time zone,
    progress integer DEFAULT 0 NOT NULL,
    business_impact bigint DEFAULT 0 NOT NULL,
    display_order double precision DEFAULT 0,
    sprint_id uuid,
    parent_id uuid,
    is_self_assignable boolean DEFAULT false NOT NULL,
    skill_weight jsonb DEFAULT '{}'::jsonb NOT NULL,
    difficulty text DEFAULT 'M'::text NOT NULL,
    checklist jsonb DEFAULT '[]'::jsonb NOT NULL,
    lessons_learned text,
    estimated_days numeric(6,1),
    milestone_id uuid,
    worker_memo text,
    source text DEFAULT 'internal'::text,
    recurrence_rule text,
    is_today_focus boolean DEFAULT false NOT NULL,
    estimated_minutes integer,
    actual_minutes integer,
    personal_tags text[] DEFAULT '{}'::text[] NOT NULL,
    is_confidential boolean DEFAULT false NOT NULL,
    confidential_until timestamp with time zone,
    CONSTRAINT pieces_difficulty_check CHECK ((difficulty = ANY (ARRAY['S'::text, 'M'::text, 'L'::text]))),
    CONSTRAINT pieces_progress_check CHECK (((progress >= 0) AND (progress <= 100))),
    CONSTRAINT pieces_recurrence_rule_check CHECK ((recurrence_rule = ANY (ARRAY['daily'::text, 'weekly'::text, 'monthly'::text]))),
    CONSTRAINT pieces_source_check CHECK ((source = ANY (ARRAY['internal'::text, 'marketplace'::text, 'personal'::text]))),
    CONSTRAINT pieces_status_check CHECK ((status = ANY (ARRAY['locked'::text, 'ready'::text, 'in_progress'::text, 'done'::text])))
);


--
-- Name: COLUMN pieces.skill_weight; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pieces.skill_weight IS '{"main":{"key":"sales","base":"M"},"sub":[{"key":"communication","base":"S"}]}';


--
-- Name: COLUMN pieces.difficulty; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pieces.difficulty IS 'S=easy(×1.0), M=normal(×1.2), L=hard(×1.5)';


--
-- Name: project_milestones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_milestones (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    project_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    due_date date NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    completed_at timestamp with time zone,
    CONSTRAINT project_milestones_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'completed'::text, 'missed'::text])))
);


--
-- Name: project_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_templates (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    company_id uuid,
    name text NOT NULL,
    source_project_id uuid,
    structure jsonb NOT NULL,
    avg_duration_days integer,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: projects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.projects (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    company_id uuid NOT NULL,
    name text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    color text DEFAULT '#6366f1'::text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    due_date timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT projects_status_check CHECK ((status = ANY (ARRAY['active'::text, 'completed'::text, 'archived'::text])))
);


--
-- Name: residue_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.residue_notes (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    piece_id uuid NOT NULL,
    author_id uuid,
    type text NOT NULL,
    body text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT residue_notes_body_check CHECK (((char_length(body) >= 1) AND (char_length(body) <= 140))),
    CONSTRAINT residue_notes_type_check CHECK ((type = ANY (ARRAY['blocker'::text, 'insight'::text, 'caution'::text, 'handoff'::text, 'uncertainty'::text, 'decision'::text])))
);


--
-- Name: retro_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.retro_items (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    retro_id uuid,
    category text NOT NULL,
    content text NOT NULL,
    votes integer DEFAULT 0,
    author_id uuid,
    author_name text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT retro_items_category_check CHECK ((category = ANY (ARRAY['good'::text, 'bad'::text, 'action'::text])))
);


--
-- Name: retrospectives; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.retrospectives (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    company_id uuid,
    title text NOT NULL,
    sprint_label text NOT NULL,
    date date DEFAULT CURRENT_DATE NOT NULL,
    status text DEFAULT 'open'::text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT retrospectives_status_check CHECK ((status = ANY (ARRAY['open'::text, 'closed'::text])))
);


--
-- Name: reward_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reward_logs (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    piece_id uuid NOT NULL,
    user_id uuid,
    amount numeric(12,2) NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT reward_logs_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'paid'::text])))
);


--
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schema_migrations (
    filename text NOT NULL,
    applied_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: share_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.share_tokens (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    token character varying(64) NOT NULL,
    company_id uuid NOT NULL,
    created_by uuid NOT NULL,
    label text DEFAULT ''::text NOT NULL,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: sprints; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sprints (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    company_id uuid NOT NULL,
    name text NOT NULL,
    goal text DEFAULT ''::text NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT sprints_status_check CHECK ((status = ANY (ARRAY['planning'::text, 'active'::text, 'completed'::text])))
);


--
-- Name: subtasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subtasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    piece_id uuid NOT NULL,
    title text NOT NULL,
    done boolean DEFAULT false NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: time_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.time_logs (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    piece_id uuid,
    user_id uuid,
    company_id uuid,
    logged_minutes integer NOT NULL,
    note text DEFAULT ''::text,
    logged_date date DEFAULT CURRENT_DATE NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT time_logs_logged_minutes_check CHECK ((logged_minutes > 0))
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    password_hash text NOT NULL,
    role text DEFAULT 'worker'::text NOT NULL,
    company_id uuid,
    skill_tree jsonb DEFAULT '{"badges": [], "skills": {}, "overall_rating": 0, "total_pieces_done": 0}'::jsonb NOT NULL,
    total_pieces_done integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    onboarded boolean DEFAULT false NOT NULL,
    user_skills text[] DEFAULT '{}'::text[] NOT NULL,
    target_skill text,
    is_portfolio_public boolean DEFAULT false NOT NULL,
    CONSTRAINT users_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'worker'::text, 'external'::text])))
);


--
-- Name: agent_keys agent_keys_key_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_keys
    ADD CONSTRAINT agent_keys_key_hash_key UNIQUE (key_hash);


--
-- Name: agent_keys agent_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_keys
    ADD CONSTRAINT agent_keys_pkey PRIMARY KEY (id);


--
-- Name: board_states board_states_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.board_states
    ADD CONSTRAINT board_states_pkey PRIMARY KEY (company_id);


--
-- Name: companies companies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_pkey PRIMARY KEY (id);


--
-- Name: company_memberships company_memberships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_memberships
    ADD CONSTRAINT company_memberships_pkey PRIMARY KEY (user_id, company_id);


--
-- Name: company_settings company_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_settings
    ADD CONSTRAINT company_settings_pkey PRIMARY KEY (company_id, key);


--
-- Name: connections connections_from_piece_id_to_piece_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.connections
    ADD CONSTRAINT connections_from_piece_id_to_piece_id_key UNIQUE (from_piece_id, to_piece_id);


--
-- Name: connections connections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.connections
    ADD CONSTRAINT connections_pkey PRIMARY KEY (id);


--
-- Name: contact_requests contact_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_requests
    ADD CONSTRAINT contact_requests_pkey PRIMARY KEY (id);


--
-- Name: flow_alerts flow_alerts_company_id_blocking_piece_id_alert_type_status_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flow_alerts
    ADD CONSTRAINT flow_alerts_company_id_blocking_piece_id_alert_type_status_key UNIQUE (company_id, blocking_piece_id, alert_type, status);


--
-- Name: flow_alerts flow_alerts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flow_alerts
    ADD CONSTRAINT flow_alerts_pkey PRIMARY KEY (id);


--
-- Name: flow_score_log flow_score_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flow_score_log
    ADD CONSTRAINT flow_score_log_pkey PRIMARY KEY (id);


--
-- Name: flow_unlock_events flow_unlock_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flow_unlock_events
    ADD CONSTRAINT flow_unlock_events_pkey PRIMARY KEY (id);


--
-- Name: invite_tokens invite_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invite_tokens
    ADD CONSTRAINT invite_tokens_pkey PRIMARY KEY (id);


--
-- Name: invite_tokens invite_tokens_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invite_tokens
    ADD CONSTRAINT invite_tokens_token_key UNIQUE (token);


--
-- Name: key_results key_results_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.key_results
    ADD CONSTRAINT key_results_pkey PRIMARY KEY (id);


--
-- Name: leave_requests leave_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leave_requests
    ADD CONSTRAINT leave_requests_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: okrs okrs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.okrs
    ADD CONSTRAINT okrs_pkey PRIMARY KEY (id);


--
-- Name: piece_comments piece_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.piece_comments
    ADD CONSTRAINT piece_comments_pkey PRIMARY KEY (id);


--
-- Name: piece_completion_records piece_completion_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.piece_completion_records
    ADD CONSTRAINT piece_completion_records_pkey PRIMARY KEY (id);


--
-- Name: piece_logs piece_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.piece_logs
    ADD CONSTRAINT piece_logs_pkey PRIMARY KEY (id);


--
-- Name: piece_okr_links piece_okr_links_piece_id_okr_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.piece_okr_links
    ADD CONSTRAINT piece_okr_links_piece_id_okr_id_key UNIQUE (piece_id, okr_id);


--
-- Name: piece_okr_links piece_okr_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.piece_okr_links
    ADD CONSTRAINT piece_okr_links_pkey PRIMARY KEY (id);


--
-- Name: piece_proposals piece_proposals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.piece_proposals
    ADD CONSTRAINT piece_proposals_pkey PRIMARY KEY (id);


--
-- Name: piece_templates piece_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.piece_templates
    ADD CONSTRAINT piece_templates_pkey PRIMARY KEY (id);


--
-- Name: piece_velocity_log piece_velocity_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.piece_velocity_log
    ADD CONSTRAINT piece_velocity_log_pkey PRIMARY KEY (id);


--
-- Name: piece_watchers piece_watchers_piece_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.piece_watchers
    ADD CONSTRAINT piece_watchers_piece_id_user_id_key UNIQUE (piece_id, user_id);


--
-- Name: piece_watchers piece_watchers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.piece_watchers
    ADD CONSTRAINT piece_watchers_pkey PRIMARY KEY (id);


--
-- Name: pieces pieces_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pieces
    ADD CONSTRAINT pieces_pkey PRIMARY KEY (id);


--
-- Name: project_milestones project_milestones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_milestones
    ADD CONSTRAINT project_milestones_pkey PRIMARY KEY (id);


--
-- Name: project_templates project_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_templates
    ADD CONSTRAINT project_templates_pkey PRIMARY KEY (id);


--
-- Name: projects projects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_pkey PRIMARY KEY (id);


--
-- Name: residue_notes residue_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.residue_notes
    ADD CONSTRAINT residue_notes_pkey PRIMARY KEY (id);


--
-- Name: retro_items retro_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retro_items
    ADD CONSTRAINT retro_items_pkey PRIMARY KEY (id);


--
-- Name: retrospectives retrospectives_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retrospectives
    ADD CONSTRAINT retrospectives_pkey PRIMARY KEY (id);


--
-- Name: reward_logs reward_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reward_logs
    ADD CONSTRAINT reward_logs_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (filename);


--
-- Name: share_tokens share_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.share_tokens
    ADD CONSTRAINT share_tokens_pkey PRIMARY KEY (id);


--
-- Name: share_tokens share_tokens_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.share_tokens
    ADD CONSTRAINT share_tokens_token_key UNIQUE (token);


--
-- Name: sprints sprints_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sprints
    ADD CONSTRAINT sprints_pkey PRIMARY KEY (id);


--
-- Name: subtasks subtasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subtasks
    ADD CONSTRAINT subtasks_pkey PRIMARY KEY (id);


--
-- Name: time_logs time_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_logs
    ADD CONSTRAINT time_logs_pkey PRIMARY KEY (id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: idx_agent_keys_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_keys_company ON public.agent_keys USING btree (company_id);


--
-- Name: idx_connections_from; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_connections_from ON public.connections USING btree (from_piece_id);


--
-- Name: idx_connections_to; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_connections_to ON public.connections USING btree (to_piece_id);


--
-- Name: idx_contact_requests_target; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contact_requests_target ON public.contact_requests USING btree (target_user_id);


--
-- Name: idx_flow_score_log_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_flow_score_log_company ON public.flow_score_log USING btree (company_id, recorded_at DESC);


--
-- Name: idx_flow_score_log_daily; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_flow_score_log_daily ON public.flow_score_log USING btree (company_id, recorded_date);


--
-- Name: idx_flow_unlock_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_flow_unlock_created ON public.flow_unlock_events USING btree (created_at);


--
-- Name: idx_flow_unlock_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_flow_unlock_user ON public.flow_unlock_events USING btree (unlocking_user_id);


--
-- Name: idx_invite_tokens_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invite_tokens_token ON public.invite_tokens USING btree (token);


--
-- Name: idx_leave_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leave_company_id ON public.leave_requests USING btree (company_id);


--
-- Name: idx_leave_dates; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leave_dates ON public.leave_requests USING btree (start_date, end_date);


--
-- Name: idx_leave_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leave_user_id ON public.leave_requests USING btree (user_id);


--
-- Name: idx_milestones_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_milestones_company ON public.project_milestones USING btree (company_id);


--
-- Name: idx_milestones_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_milestones_project ON public.project_milestones USING btree (project_id);


--
-- Name: idx_notifications_unread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_unread ON public.notifications USING btree (user_id, read) WHERE (read = false);


--
-- Name: idx_notifications_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_user ON public.notifications USING btree (user_id, created_at DESC);


--
-- Name: idx_piece_comments_piece; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_piece_comments_piece ON public.piece_comments USING btree (piece_id);


--
-- Name: idx_piece_comments_reply; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_piece_comments_reply ON public.piece_comments USING btree (piece_id, is_support_reply, created_at DESC) WHERE (is_support_reply = true);


--
-- Name: idx_piece_comments_support; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_piece_comments_support ON public.piece_comments USING btree (piece_id, is_support_message, created_at DESC) WHERE (is_support_message = true);


--
-- Name: idx_piece_logs_piece_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_piece_logs_piece_id ON public.piece_logs USING btree (piece_id);


--
-- Name: idx_piece_okr_links_okr; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_piece_okr_links_okr ON public.piece_okr_links USING btree (okr_id);


--
-- Name: idx_piece_okr_links_piece; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_piece_okr_links_piece ON public.piece_okr_links USING btree (piece_id);


--
-- Name: idx_piece_templates_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_piece_templates_company ON public.piece_templates USING btree (company_id, created_at DESC);


--
-- Name: idx_piece_watchers_piece; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_piece_watchers_piece ON public.piece_watchers USING btree (piece_id);


--
-- Name: idx_piece_watchers_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_piece_watchers_user ON public.piece_watchers USING btree (user_id);


--
-- Name: idx_pieces_assignee_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pieces_assignee_id ON public.pieces USING btree (assignee_id);


--
-- Name: idx_pieces_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pieces_company_id ON public.pieces USING btree (company_id);


--
-- Name: idx_pieces_due_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pieces_due_date ON public.pieces USING btree (due_date);


--
-- Name: idx_pieces_milestone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pieces_milestone ON public.pieces USING btree (milestone_id) WHERE (milestone_id IS NOT NULL);


--
-- Name: idx_pieces_parent_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pieces_parent_id ON public.pieces USING btree (parent_id);


--
-- Name: idx_pieces_personal; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pieces_personal ON public.pieces USING btree (assignee_id, source) WHERE (source = 'personal'::text);


--
-- Name: idx_pieces_portfolio; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pieces_portfolio ON public.pieces USING btree (assignee_id, status, completed_at) WHERE ((status = 'done'::text) AND (completed_at IS NOT NULL));


--
-- Name: idx_pieces_project_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pieces_project_id ON public.pieces USING btree (project_id);


--
-- Name: idx_pieces_self_assignable; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pieces_self_assignable ON public.pieces USING btree (company_id, is_self_assignable, assignee_id) WHERE ((is_self_assignable = true) AND (assignee_id IS NULL));


--
-- Name: idx_pieces_sprint; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pieces_sprint ON public.pieces USING btree (sprint_id);


--
-- Name: idx_pieces_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pieces_status ON public.pieces USING btree (status);


--
-- Name: idx_projects_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_projects_company_id ON public.projects USING btree (company_id);


--
-- Name: idx_proposals_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_proposals_company ON public.piece_proposals USING btree (company_id);


--
-- Name: idx_proposals_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_proposals_status ON public.piece_proposals USING btree (company_id, status);


--
-- Name: idx_proposals_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_proposals_user ON public.piece_proposals USING btree (proposed_by);


--
-- Name: idx_residue_notes_piece_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_residue_notes_piece_id ON public.residue_notes USING btree (piece_id);


--
-- Name: idx_reward_logs_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reward_logs_user_id ON public.reward_logs USING btree (user_id);


--
-- Name: idx_share_tokens_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_share_tokens_token ON public.share_tokens USING btree (token);


--
-- Name: idx_subtasks_piece_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_subtasks_piece_id ON public.subtasks USING btree (piece_id);


--
-- Name: idx_time_logs_piece; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_time_logs_piece ON public.time_logs USING btree (piece_id);


--
-- Name: idx_time_logs_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_time_logs_user ON public.time_logs USING btree (user_id);


--
-- Name: agent_keys agent_keys_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_keys
    ADD CONSTRAINT agent_keys_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: board_states board_states_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.board_states
    ADD CONSTRAINT board_states_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: board_states board_states_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.board_states
    ADD CONSTRAINT board_states_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: company_memberships company_memberships_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_memberships
    ADD CONSTRAINT company_memberships_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: company_memberships company_memberships_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_memberships
    ADD CONSTRAINT company_memberships_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: connections connections_from_piece_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.connections
    ADD CONSTRAINT connections_from_piece_id_fkey FOREIGN KEY (from_piece_id) REFERENCES public.pieces(id) ON DELETE CASCADE;


--
-- Name: connections connections_to_piece_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.connections
    ADD CONSTRAINT connections_to_piece_id_fkey FOREIGN KEY (to_piece_id) REFERENCES public.pieces(id) ON DELETE CASCADE;


--
-- Name: contact_requests contact_requests_target_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_requests
    ADD CONSTRAINT contact_requests_target_user_id_fkey FOREIGN KEY (target_user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: flow_alerts flow_alerts_acknowledged_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flow_alerts
    ADD CONSTRAINT flow_alerts_acknowledged_by_fkey FOREIGN KEY (acknowledged_by) REFERENCES public.users(id);


--
-- Name: flow_alerts flow_alerts_blocking_piece_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flow_alerts
    ADD CONSTRAINT flow_alerts_blocking_piece_id_fkey FOREIGN KEY (blocking_piece_id) REFERENCES public.pieces(id) ON DELETE CASCADE;


--
-- Name: flow_alerts flow_alerts_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flow_alerts
    ADD CONSTRAINT flow_alerts_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: flow_score_log flow_score_log_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flow_score_log
    ADD CONSTRAINT flow_score_log_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: flow_unlock_events flow_unlock_events_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flow_unlock_events
    ADD CONSTRAINT flow_unlock_events_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: flow_unlock_events flow_unlock_events_unlocked_piece_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flow_unlock_events
    ADD CONSTRAINT flow_unlock_events_unlocked_piece_id_fkey FOREIGN KEY (unlocked_piece_id) REFERENCES public.pieces(id) ON DELETE CASCADE;


--
-- Name: flow_unlock_events flow_unlock_events_unlocking_piece_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flow_unlock_events
    ADD CONSTRAINT flow_unlock_events_unlocking_piece_id_fkey FOREIGN KEY (unlocking_piece_id) REFERENCES public.pieces(id) ON DELETE CASCADE;


--
-- Name: flow_unlock_events flow_unlock_events_unlocking_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flow_unlock_events
    ADD CONSTRAINT flow_unlock_events_unlocking_user_id_fkey FOREIGN KEY (unlocking_user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: invite_tokens invite_tokens_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invite_tokens
    ADD CONSTRAINT invite_tokens_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: invite_tokens invite_tokens_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invite_tokens
    ADD CONSTRAINT invite_tokens_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: invite_tokens invite_tokens_used_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invite_tokens
    ADD CONSTRAINT invite_tokens_used_by_fkey FOREIGN KEY (used_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: key_results key_results_okr_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.key_results
    ADD CONSTRAINT key_results_okr_id_fkey FOREIGN KEY (okr_id) REFERENCES public.okrs(id) ON DELETE CASCADE;


--
-- Name: leave_requests leave_requests_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leave_requests
    ADD CONSTRAINT leave_requests_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: leave_requests leave_requests_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leave_requests
    ADD CONSTRAINT leave_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_piece_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_piece_id_fkey FOREIGN KEY (piece_id) REFERENCES public.pieces(id) ON DELETE SET NULL;


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: okrs okrs_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.okrs
    ADD CONSTRAINT okrs_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: okrs okrs_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.okrs
    ADD CONSTRAINT okrs_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: piece_comments piece_comments_parent_comment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.piece_comments
    ADD CONSTRAINT piece_comments_parent_comment_id_fkey FOREIGN KEY (parent_comment_id) REFERENCES public.piece_comments(id) ON DELETE CASCADE;


--
-- Name: piece_comments piece_comments_piece_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.piece_comments
    ADD CONSTRAINT piece_comments_piece_id_fkey FOREIGN KEY (piece_id) REFERENCES public.pieces(id) ON DELETE CASCADE;


--
-- Name: piece_comments piece_comments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.piece_comments
    ADD CONSTRAINT piece_comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: piece_logs piece_logs_piece_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.piece_logs
    ADD CONSTRAINT piece_logs_piece_id_fkey FOREIGN KEY (piece_id) REFERENCES public.pieces(id) ON DELETE CASCADE;


--
-- Name: piece_logs piece_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.piece_logs
    ADD CONSTRAINT piece_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: piece_okr_links piece_okr_links_okr_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.piece_okr_links
    ADD CONSTRAINT piece_okr_links_okr_id_fkey FOREIGN KEY (okr_id) REFERENCES public.okrs(id) ON DELETE CASCADE;


--
-- Name: piece_okr_links piece_okr_links_piece_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.piece_okr_links
    ADD CONSTRAINT piece_okr_links_piece_id_fkey FOREIGN KEY (piece_id) REFERENCES public.pieces(id) ON DELETE CASCADE;


--
-- Name: piece_proposals piece_proposals_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.piece_proposals
    ADD CONSTRAINT piece_proposals_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: piece_proposals piece_proposals_created_piece_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.piece_proposals
    ADD CONSTRAINT piece_proposals_created_piece_id_fkey FOREIGN KEY (created_piece_id) REFERENCES public.pieces(id) ON DELETE SET NULL;


--
-- Name: piece_proposals piece_proposals_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.piece_proposals
    ADD CONSTRAINT piece_proposals_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;


--
-- Name: piece_proposals piece_proposals_proposed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.piece_proposals
    ADD CONSTRAINT piece_proposals_proposed_by_fkey FOREIGN KEY (proposed_by) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: piece_proposals piece_proposals_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.piece_proposals
    ADD CONSTRAINT piece_proposals_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: piece_templates piece_templates_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.piece_templates
    ADD CONSTRAINT piece_templates_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: piece_templates piece_templates_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.piece_templates
    ADD CONSTRAINT piece_templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: piece_velocity_log piece_velocity_log_assignee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.piece_velocity_log
    ADD CONSTRAINT piece_velocity_log_assignee_id_fkey FOREIGN KEY (assignee_id) REFERENCES public.users(id);


--
-- Name: piece_velocity_log piece_velocity_log_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.piece_velocity_log
    ADD CONSTRAINT piece_velocity_log_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: piece_velocity_log piece_velocity_log_piece_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.piece_velocity_log
    ADD CONSTRAINT piece_velocity_log_piece_id_fkey FOREIGN KEY (piece_id) REFERENCES public.pieces(id);


--
-- Name: piece_watchers piece_watchers_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.piece_watchers
    ADD CONSTRAINT piece_watchers_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: piece_watchers piece_watchers_piece_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.piece_watchers
    ADD CONSTRAINT piece_watchers_piece_id_fkey FOREIGN KEY (piece_id) REFERENCES public.pieces(id) ON DELETE CASCADE;


--
-- Name: piece_watchers piece_watchers_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.piece_watchers
    ADD CONSTRAINT piece_watchers_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: pieces pieces_assignee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pieces
    ADD CONSTRAINT pieces_assignee_id_fkey FOREIGN KEY (assignee_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: pieces pieces_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pieces
    ADD CONSTRAINT pieces_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: pieces pieces_milestone_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pieces
    ADD CONSTRAINT pieces_milestone_id_fkey FOREIGN KEY (milestone_id) REFERENCES public.project_milestones(id) ON DELETE SET NULL;


--
-- Name: pieces pieces_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pieces
    ADD CONSTRAINT pieces_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.pieces(id) ON DELETE SET NULL;


--
-- Name: pieces pieces_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pieces
    ADD CONSTRAINT pieces_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;


--
-- Name: pieces pieces_sprint_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pieces
    ADD CONSTRAINT pieces_sprint_id_fkey FOREIGN KEY (sprint_id) REFERENCES public.sprints(id) ON DELETE SET NULL;


--
-- Name: project_milestones project_milestones_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_milestones
    ADD CONSTRAINT project_milestones_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: project_milestones project_milestones_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_milestones
    ADD CONSTRAINT project_milestones_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: project_templates project_templates_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_templates
    ADD CONSTRAINT project_templates_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: project_templates project_templates_source_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_templates
    ADD CONSTRAINT project_templates_source_project_id_fkey FOREIGN KEY (source_project_id) REFERENCES public.projects(id);


--
-- Name: projects projects_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: residue_notes residue_notes_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.residue_notes
    ADD CONSTRAINT residue_notes_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: residue_notes residue_notes_piece_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.residue_notes
    ADD CONSTRAINT residue_notes_piece_id_fkey FOREIGN KEY (piece_id) REFERENCES public.pieces(id) ON DELETE CASCADE;


--
-- Name: retro_items retro_items_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retro_items
    ADD CONSTRAINT retro_items_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: retro_items retro_items_retro_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retro_items
    ADD CONSTRAINT retro_items_retro_id_fkey FOREIGN KEY (retro_id) REFERENCES public.retrospectives(id) ON DELETE CASCADE;


--
-- Name: retrospectives retrospectives_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retrospectives
    ADD CONSTRAINT retrospectives_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: reward_logs reward_logs_piece_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reward_logs
    ADD CONSTRAINT reward_logs_piece_id_fkey FOREIGN KEY (piece_id) REFERENCES public.pieces(id) ON DELETE CASCADE;


--
-- Name: reward_logs reward_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reward_logs
    ADD CONSTRAINT reward_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: share_tokens share_tokens_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.share_tokens
    ADD CONSTRAINT share_tokens_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: share_tokens share_tokens_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.share_tokens
    ADD CONSTRAINT share_tokens_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: sprints sprints_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sprints
    ADD CONSTRAINT sprints_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: subtasks subtasks_piece_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subtasks
    ADD CONSTRAINT subtasks_piece_id_fkey FOREIGN KEY (piece_id) REFERENCES public.pieces(id) ON DELETE CASCADE;


--
-- Name: time_logs time_logs_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_logs
    ADD CONSTRAINT time_logs_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: time_logs time_logs_piece_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_logs
    ADD CONSTRAINT time_logs_piece_id_fkey FOREIGN KEY (piece_id) REFERENCES public.pieces(id) ON DELETE CASCADE;


--
-- Name: time_logs time_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_logs
    ADD CONSTRAINT time_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: users users_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE SET NULL;


--
-- PostgreSQL database dump complete
--

\unrestrict MA1ssH7NFt5Ffm4k8S1fGEnxTTRNa9887yyCN5lrgA9JEirQEMyhu0wW0NLKhYi

