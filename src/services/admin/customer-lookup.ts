import { eq, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/storage/database/shared/schema";

/** Finds a customer by exact email or user id. */
export async function findCustomer(query: string) {
  const q = query.trim();
  if (!q) return null;
  const [user] = await db.select({ id: users.id, email: users.email, name: users.name })
    .from(users)
    .where(or(eq(users.email, q.toLowerCase()), eq(users.id, q)))
    .limit(1);
  return user ?? null;
}
