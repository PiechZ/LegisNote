// Seed / update a LegisNote user (v1 is invite-only — no public sign-up).
//
// Usage (from apps/web, with DATABASE_URL set):
//   node scripts/create-user.mjs <email> <password> [role] [displayName]
//   role ∈ reader | editor | admin   (default: admin)
//
// In Docker:
//   docker compose -f infra/docker-compose.yml exec web \
//     node scripts/create-user.mjs admin@example.com 's3cret' admin "Admin"
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const [email, password, role = "admin", displayName] = process.argv.slice(2);

if (!email || !password) {
  console.error("Usage: node scripts/create-user.mjs <email> <password> [role] [displayName]");
  process.exit(1);
}
if (!["reader", "editor", "admin"].includes(role)) {
  console.error(`Invalid role '${role}'. Use reader | editor | admin.`);
  process.exit(1);
}

const db = new PrismaClient();
try {
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await db.appUser.upsert({
    where: { email },
    update: { passwordHash, role, displayName: displayName ?? email },
    create: { email, passwordHash, role, displayName: displayName ?? email },
  });
  console.log(`User ${user.email} (${user.role}) ready — id ${user.id}.`);
} finally {
  await db.$disconnect();
}
