import type { User } from "./types";

export function canCreatePost(user: User): boolean {
  return user.role === "owner" || user.role === "uploader";
}

export function canDeleteComment(user: User, authorId: string): boolean {
  return user.role === "owner" || user.id === authorId;
}

export function canManageEvent(user: User): boolean {
  return user.role === "owner";
}
