CREATE TABLE teams (
  id uuid,
  slug text NOT NULL
);

CREATE TABLE memberships (
  team_id uuid NOT NULL,
  member_id uuid NOT NULL
);

ALTER TABLE teams
  ADD CONSTRAINT teams_pkey PRIMARY KEY (id);
ALTER TABLE teams
  ADD CONSTRAINT teams_slug_key UNIQUE (slug);
ALTER TABLE memberships
  ADD CONSTRAINT memberships_pkey PRIMARY KEY (team_id, member_id);
ALTER TABLE memberships
  ADD CONSTRAINT memberships_team_fkey FOREIGN KEY (team_id)
  REFERENCES teams (id) ON DELETE CASCADE ON UPDATE NO ACTION;
