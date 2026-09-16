-- Hand-written: extensions must exist before the generated schema migration runs.
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE TYPE "public"."area_change_kind" AS ENUM('opened', 'closed', 'ownership_changed', 'license_renewed');--> statement-breakpoint
CREATE TYPE "public"."auth_provider" AS ENUM('apple', 'google');--> statement-breakpoint
CREATE TYPE "public"."claim_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."event_source" AS ENUM('owner', 'park_district', 'ticketmaster', 'bandsintown', 'community');--> statement-breakpoint
CREATE TYPE "public"."independence" AS ENUM('verified', 'vouched', 'unverified', 'chain', 'excluded');--> statement-breakpoint
CREATE TYPE "public"."layer_key" AS ENUM('expressways', 'arterials', 'transit-lines', 'transit-stations');--> statement-breakpoint
CREATE TYPE "public"."place_category" AS ENUM('restaurant', 'cafe', 'bar', 'retail', 'grocery', 'service', 'landmark', 'arts', 'other');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('user', 'owner', 'moderator', 'admin');--> statement-breakpoint
CREATE TYPE "public"."source_kind" AS ENUM('overture', 'osm', 'license', 'owner', 'community', 'seed');--> statement-breakpoint
CREATE TYPE "public"."submission_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "area_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"community_area" text NOT NULL,
	"kind" "area_change_kind" NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"place_id" uuid,
	"license_id" text,
	"name" text NOT NULL,
	"address" text,
	"detail" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"target" text,
	"detail" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cache" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"place_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"status" "claim_status" DEFAULT 'pending' NOT NULL,
	"evidence" text,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "community_areas" (
	"number" integer PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"summary" text,
	"image_url" text,
	"attribution" text,
	"boundary" geography(MultiPolygon,4326) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "community_areas_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid,
	"platform" text NOT NULL,
	"push_token" text NOT NULL,
	"home_area" text,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "devices_push_token_unique" UNIQUE("push_token")
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"venue_name" text,
	"place_id" uuid,
	"location" geography(Point,4326) NOT NULL,
	"source" "event_source" NOT NULL,
	"external_id" text,
	"url" text,
	"free" boolean,
	"raw" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identities" (
	"provider" "auth_provider" NOT NULL,
	"subject" text NOT NULL,
	"profile_id" uuid NOT NULL,
	"email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "identities_provider_subject_pk" PRIMARY KEY("provider","subject")
);
--> statement-breakpoint
CREATE TABLE "licenses" (
	"license_id" text PRIMARY KEY NOT NULL,
	"account_number" text NOT NULL,
	"site_number" integer NOT NULL,
	"legal_name" text NOT NULL,
	"doing_business_as" text,
	"address" text,
	"license_description" text,
	"status" text,
	"start_date" timestamp with time zone,
	"expiration_date" timestamp with time zone,
	"community_area" text,
	"location" geography(Point,4326),
	"place_id" uuid,
	"raw" jsonb NOT NULL,
	"seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "owners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_number" text NOT NULL,
	"owner_first_name" text,
	"owner_last_name" text,
	"legal_entity_owner" text,
	"title" text,
	"raw" jsonb NOT NULL,
	"seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "place_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"place_id" uuid NOT NULL,
	"kind" "source_kind" NOT NULL,
	"external_id" text NOT NULL,
	"raw" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "places" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"category" "place_category" DEFAULT 'other' NOT NULL,
	"independence" "independence" DEFAULT 'unverified' NOT NULL,
	"independence_reason" text,
	"description" text,
	"address" text,
	"community_area" text,
	"location" geography(Point,4326) NOT NULL,
	"hours" jsonb,
	"hours_confirmed_at" timestamp with time zone,
	"website" text,
	"phone" text,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"owner_profile_id" uuid,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "places_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"display_name" text NOT NULL,
	"role" "role" DEFAULT 'user' NOT NULL,
	"home_area" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refresh_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submitted_by" uuid NOT NULL,
	"status" "submission_status" DEFAULT 'pending' NOT NULL,
	"payload" jsonb NOT NULL,
	"location" geography(Point,4326) NOT NULL,
	"autochecks" jsonb,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"decision_reason" text,
	"place_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vouches" (
	"place_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vouches_place_id_profile_id_pk" PRIMARY KEY("place_id","profile_id")
);
--> statement-breakpoint
CREATE TABLE "layer_features" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"layer" "layer_key" NOT NULL,
	"osm_key" text NOT NULL,
	"properties" jsonb NOT NULL,
	"line" geography(LineString,4326),
	"point" geography(Point,4326),
	"run_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "layer_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"layer" "layer_key" NOT NULL,
	"feature_count" integer NOT NULL,
	"attribution" text NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"current" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "area_changes" ADD CONSTRAINT "area_changes_community_area_community_areas_slug_fk" FOREIGN KEY ("community_area") REFERENCES "public"."community_areas"("slug") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "area_changes" ADD CONSTRAINT "area_changes_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_profiles_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_decided_by_profiles_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identities" ADD CONSTRAINT "identities_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "licenses" ADD CONSTRAINT "licenses_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "place_sources" ADD CONSTRAINT "place_sources_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "places" ADD CONSTRAINT "places_community_area_community_areas_slug_fk" FOREIGN KEY ("community_area") REFERENCES "public"."community_areas"("slug") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "places" ADD CONSTRAINT "places_owner_profile_id_profiles_id_fk" FOREIGN KEY ("owner_profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_home_area_community_areas_slug_fk" FOREIGN KEY ("home_area") REFERENCES "public"."community_areas"("slug") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_submitted_by_profiles_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_decided_by_profiles_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vouches" ADD CONSTRAINT "vouches_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vouches" ADD CONSTRAINT "vouches_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "area_changes_area_time_idx" ON "area_changes" USING btree ("community_area","occurred_at");--> statement-breakpoint
CREATE INDEX "community_areas_boundary_gix" ON "community_areas" USING gist ("boundary");--> statement-breakpoint
CREATE INDEX "devices_profile_idx" ON "devices" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "events_location_gix" ON "events" USING gist ("location");--> statement-breakpoint
CREATE INDEX "events_starts_idx" ON "events" USING btree ("starts_at");--> statement-breakpoint
CREATE UNIQUE INDEX "events_source_ext_uidx" ON "events" USING btree ("source","external_id");--> statement-breakpoint
CREATE INDEX "licenses_account_idx" ON "licenses" USING btree ("account_number");--> statement-breakpoint
CREATE INDEX "licenses_location_gix" ON "licenses" USING gist ("location");--> statement-breakpoint
CREATE INDEX "owners_account_idx" ON "owners" USING btree ("account_number");--> statement-breakpoint
CREATE UNIQUE INDEX "owners_identity_uidx" ON "owners" USING btree ("account_number","owner_first_name","owner_last_name","legal_entity_owner");--> statement-breakpoint
CREATE UNIQUE INDEX "place_sources_kind_ext_uidx" ON "place_sources" USING btree ("kind","external_id");--> statement-breakpoint
CREATE INDEX "place_sources_place_idx" ON "place_sources" USING btree ("place_id");--> statement-breakpoint
CREATE INDEX "places_location_gix" ON "places" USING gist ("location");--> statement-breakpoint
CREATE INDEX "places_area_idx" ON "places" USING btree ("community_area");--> statement-breakpoint
CREATE INDEX "places_name_trgm_idx" ON "places" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "refresh_tokens_profile_idx" ON "refresh_tokens" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "submissions_status_idx" ON "submissions" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "submissions_location_gix" ON "submissions" USING gist ("location");--> statement-breakpoint
CREATE INDEX "layer_features_layer_idx" ON "layer_features" USING btree ("layer","run_id");--> statement-breakpoint
CREATE INDEX "layer_features_line_gix" ON "layer_features" USING gist ("line");--> statement-breakpoint
CREATE INDEX "layer_features_point_gix" ON "layer_features" USING gist ("point");