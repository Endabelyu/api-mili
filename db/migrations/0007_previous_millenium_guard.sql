CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"amount" text,
	"time" varchar(50),
	"icon" varchar(30) DEFAULT 'Zap',
	"color" varchar(30) DEFAULT 'bg-orange-50',
	"iconColor" varchar(30) DEFAULT 'text-orange-500',
	"unread" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;