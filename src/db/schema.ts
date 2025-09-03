import {
    pgTable,
    varchar,
    text,
    timestamp,
    serial,
    numeric,
    integer,
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

// Define relations for the users table
export const usersRelations = relations(users, ({ many }) => ({
    actions: many(userActions),
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
