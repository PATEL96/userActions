CREATE TABLE "user_actions" (
	"id" serial PRIMARY KEY NOT NULL,
	"userAddress" varchar(255) NOT NULL,
	"actionType" varchar(100) NOT NULL,
	"action_data" text,
	"performed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"address" varchar(255) PRIMARY KEY NOT NULL,
	"rewards" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_actions" ADD CONSTRAINT "user_actions_userAddress_users_address_fk" FOREIGN KEY ("userAddress") REFERENCES "public"."users"("address") ON DELETE no action ON UPDATE no action;