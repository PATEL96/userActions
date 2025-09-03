import {
    pgTable,
    varchar,
    text,
    timestamp,
    serial,
    numeric,
    integer,
    unique,
    primaryKey,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// Users table with address as primary key
export const users = pgTable("users", {
    address: varchar({ length: 255 }).primaryKey().notNull(),
    rewards: integer().default(0),
    lastTxHash: text("last_tx_hash"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Chain-specific user rewards table
export const chainRewards = pgTable(
    "chain_rewards",
    {
        id: serial().primaryKey(),
        userAddress: varchar({ length: 255 })
            .notNull()
            .references(() => users.address),
        chainId: varchar({ length: 50 }).notNull(),
        rewards: integer().default(0),
        lastTxHash: text("last_tx_hash"),
        createdAt: timestamp("created_at").defaultNow().notNull(),
        updatedAt: timestamp("updated_at").defaultNow().notNull(),
    },
    (table) => {
        return {
            // Add a unique constraint on userAddress and chainId
            uniqueUserChain: unique("unique_user_chain_idx").on(
                table.userAddress,
                table.chainId,
            ),
        };
    },
);

// Define relations for the users table
export const usersRelations = relations(users, ({ many }) => ({
    actions: many(userActions),
    chainRewards: many(chainRewards),
}));

// Define relations for chain rewards
export const chainRewardsRelations = relations(chainRewards, ({ one }) => ({
    user: one(users, {
        fields: [chainRewards.userAddress],
        references: [users.address],
    }),
}));

// User actions table that references user address
export const userActions = pgTable("user_actions", {
    id: serial().primaryKey(),
    userAddress: varchar({ length: 255 })
        .notNull()
        .references(() => users.address),
    actionType: varchar({ length: 100 }).notNull(),
    actionData: text("action_data"),
    performedAt: timestamp("performed_at").defaultNow().notNull(),
});

// Define relations for the userActions table
export const userActionsRelations = relations(userActions, ({ one }) => ({
    user: one(users, {
        fields: [userActions.userAddress],
        references: [users.address],
    }),
}));
