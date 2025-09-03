CREATE TABLE "chain_rewards" (
	"id" serial PRIMARY KEY NOT NULL,
	"userAddress" varchar(255) NOT NULL,
	"chainId" varchar(50) NOT NULL,
	"rewards" integer DEFAULT 0,
	"last_tx_hash" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chain_rewards" ADD CONSTRAINT "chain_rewards_userAddress_users_address_fk" FOREIGN KEY ("userAddress") REFERENCES "public"."users"("address") ON DELETE no action ON UPDATE no action;