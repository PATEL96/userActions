ALTER TABLE "chain_rewards" DROP CONSTRAINT "unique_user_chain_idx";--> statement-breakpoint
ALTER TABLE "chain_rewards" ADD CONSTRAINT "chain_rewards_userAddress_chainId_pk" PRIMARY KEY("userAddress","chainId");--> statement-breakpoint
ALTER TABLE "chain_rewards" DROP COLUMN "id";