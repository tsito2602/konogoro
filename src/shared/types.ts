export type User = {
  id: string;
  displayName: string;
  role: "owner" | "uploader" | "viewer";
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
};

export type Comment = {
  id: string;
  body: string;
  userId: string;
  authorName: string;
  createdAt: string;
  canDelete: boolean;
};

export type SeenUser = {
  id: string;
  displayName: string;
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
  canDelete: boolean;
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
