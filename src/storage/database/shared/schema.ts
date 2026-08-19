import { pgTable, serial, timestamp, varchar, boolean, index } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"



export const healthCheck = pgTable("health_check", {
	id: serial().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: serial().primaryKey(),
    email: varchar("email", { length: 255 }).notNull().unique(),
    is_active: boolean("is_active").default(true).notNull(),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    unsubscribed_at: timestamp("unsubscribed_at", { withTimezone: true }),
  },
  (table) => [
    index("subscriptions_email_idx").on(table.email),
    index("subscriptions_is_active_idx").on(table.is_active),
    index("subscriptions_created_at_idx").on(table.created_at),
  ]
);
