import { defineSchema } from "convex/server";
import { tables } from "./generatedSchema";

// Keep custom indexes separate from the Better Auth CLI's generated tables.
export default defineSchema({
  ...tables,
  passkey: tables.passkey.index("credentialID", ["credentialID"]),
  rateLimit: tables.rateLimit.index("lastRequest", ["lastRequest"]),
  member: tables.member
    .index("organizationId_userId", ["organizationId", "userId"])
    .index("organizationId_role", ["organizationId", "role"]),
  invitation: tables.invitation
    .index("organizationId_email", ["organizationId", "email"])
    .index("organizationId_inviterId", ["organizationId", "inviterId"])
    .index("email_status", ["email", "status"])
    .index("expiresAt", ["expiresAt"]),
});
