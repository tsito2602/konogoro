export type User = {
  id: string;
  displayName: string;
  role: "owner" | "uploader" | "viewer";
  avatarUrl?: string | null;
};

export type FamilyMember = User & {
  avatarUrl: string | null;
  notificationEnabled: boolean;
  lineConnected: boolean;
};

export type CurrentUser = User & {
  avatarUrl?: string | null;
  notificationEnabled?: boolean;
  lineConnected?: boolean;
  lineFriend?: boolean;
};

export type Media = {
  id: string;
  kind: "image" | "video";
  mimeType: string;
  originalFilename: string;
  byteSize: number | null;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  capturedAt: string | null;
  position: number;
  contentUrl: string;
  thumbnailUrl: string;
  downloadUrl: string;
};

export type AlbumMedia = Pick<Media, "id" | "kind" | "thumbnailUrl"> & {
  postId: string;
  postTitle: string;
  capturedAt: string;
  previewUrl: string;
};

export type Activity = {
  id: string;
  kind: "post" | "comment";
  occurredAt: string;
  actorId: string;
  actorName: string;
  postId: string;
  postTitle: string;
  body: string | null;
  thumbnailUrl: string | null;
};

export type MemberLastViewed = Pick<User, "id" | "displayName"> & {
  avatarUrl: string | null;
  lastViewedAt: string | null;
};

export type Comment = {
  id: string;
  body: string;
  userId: string;
  authorName: string;
  avatarUrl: string | null;
  createdAt: string;
  canDelete: boolean;
};

export type SeenUser = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
};

export type Post = {
  id: string;
  title: string;
  caption: string;
  eventId: string | null;
  eventTitle: string | null;
  sectionId: string | null;
  sectionTitle: string | null;
  capturedAt: string | null;
  publishedAt: string | null;
  authorName: string;
  authorAvatarUrl: string | null;
  canEdit: boolean;
  canDelete: boolean;
  viewedByCurrentUser: boolean;
  media: Media[];
  comments: Comment[];
  seenBy: SeenUser[];
};

export type EventSummary = {
  id: string;
  title: string;
  description: string;
  startDate: string | null;
  endDate: string | null;
  coverUrl: string | null;
  coverSource: "auto" | "manual";
  postCount: number;
  photoCount: number;
  videoCount: number;
};

export type EventCoverMedia = Pick<Media, "id" | "kind" | "thumbnailUrl">;

export type EventSection = {
  id: string;
  title: string;
  sortOrder: number;
};

export type EventDetail = EventSummary & {
  sections: EventSection[];
  posts: Post[];
};

export type UploadTarget = {
  id: string;
  uploadUrl: string;
  thumbnailUploadUrl: string;
  previewUploadUrl?: string;
  contentType: string;
};
