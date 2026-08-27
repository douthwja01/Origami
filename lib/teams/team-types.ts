export type TeamRole = "owner" | "admin" | "member";

export type TeamDTO = {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
  role: TeamRole;
  memberCount: number;
};

export type TeamMemberDTO = {
  userId: string;
  username: string;
  displayName: string | null;
  role: TeamRole;
  joinedAt: string;
};

export type TeamInviteDTO = {
  id: string;
  teamId: string;
  teamName: string;
  username: string;
  role: TeamRole;
  expiresAt: string;
  acceptedAt: string | null;
  createdAt: string;
};

export type PendingInviteDTO = {
  token: string;
  teamName: string;
  username: string;
  role: TeamRole;
  expiresAt: string;
  userExists: boolean;
};
