CREATE TABLE "rate_limits" (
	"key" varchar(255) PRIMARY KEY NOT NULL,
	"total_hits" integer DEFAULT 1 NOT NULL,
	"expires_at" timestamp NOT NULL
);
