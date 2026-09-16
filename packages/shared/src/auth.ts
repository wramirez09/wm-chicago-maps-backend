import { z } from 'zod';

/**
 * Auth is owned by the API. The mobile app signs in natively with Apple or
 * Google, posts the resulting identity token here, and receives our own JWT
 * pair. No third-party auth vendor.
 */
export const Role = z.enum(['user', 'owner', 'moderator', 'admin']);
export type Role = z.infer<typeof Role>;

export const NativeSignIn = z.object({
  provider: z.enum(['apple', 'google']),
  identityToken: z.string().min(20),
  /** Apple only sends the name on the first sign-in; the client forwards it. */
  displayName: z.string().max(80).optional(),
});
export const TokenPair = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number().int(),
});
export const RefreshRequest = z.object({ refreshToken: z.string() });

export const Profile = z.object({
  id: z.string().uuid(),
  displayName: z.string(),
  role: Role,
  homeArea: z.string().nullable(),
  vouchCount: z.number().int(),
  submissionCount: z.number().int(),
  createdAt: z.string(),
});
export const ProfilePatch = z.object({
  displayName: z.string().min(1).max(80).optional(),
  homeArea: z.string().nullable().optional(),
});
