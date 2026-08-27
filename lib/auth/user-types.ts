export type AuthUser = {
  id: string;
  username: string;
  displayName: string | null;
};

export type UserDTO = AuthUser & {
  createdAt: string;
};
