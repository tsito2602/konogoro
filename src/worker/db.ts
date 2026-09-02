import { canCreatePost, canDeleteComment, canDeletePost } from "../shared/permissions";
import type { Comment, Media, Post, SeenUser, User } from "../shared/types";

type PostRow = {
  id: string;
  title: string;
  caption: string;
  event_id: string | null;
  event_title: string | null;
  section_id: string | null;
  section_title: string | null;
  captured_at: string | null;
  published_at: string | null;
  author_name: string;
};

type MediaRow = {
  id: string;
  post_id: string;
  kind: "image" | "video";
  mime_type: string;
  original_filename: string;
  byte_size: number | null;
  width: number | null;
  height: number | null;
  duration_seconds: number | null;
  captured_at: string | null;
  position: number;
};

type CommentRow = {
  id: string;
  post_id: string;
  user_id: string;
  body: string;
  created_at: string;
  author_name: string;
};

type SeenRow = {
  post_id: string;
  user_id: string;
  display_name: string;
  avatar_url: string | null;
};

export async function loadPosts(db: D1Database, rows: PostRow[], currentUser: User): Promise<Post[]> {
  if (rows.length === 0) return [];

  const placeholders = rows.map(() => "?").join(",");
  const [mediaResult, commentsResult, seenResult] = await Promise.all([db.prepare(
    `SELECT id, post_id, kind, mime_type, original_filename, byte_size,
            width, height, duration_seconds, captured_at, position
       FROM media
      WHERE status = 'uploaded' AND post_id IN (${placeholders})
      ORDER BY post_id, position`,
  ).bind(...rows.map(({ id }) => id)).all<MediaRow>(), db.prepare(`
    SELECT c.id, c.post_id, c.user_id, c.body, c.created_at, u.display_name AS author_name
      FROM comments c JOIN users u ON u.id = c.user_id
     WHERE c.post_id IN (${placeholders}) ORDER BY c.created_at, c.id
  `).bind(...rows.map(({ id }) => id)).all<CommentRow>(), db.prepare(`
    SELECT v.post_id, v.user_id, u.display_name, u.avatar_url
      FROM view_histories v JOIN users u ON u.id = v.user_id
     WHERE v.post_id IN (${placeholders}) ORDER BY v.first_viewed_at, v.id
  `).bind(...rows.map(({ id }) => id)).all<SeenRow>()]);

  const mediaByPost = new Map<string, Media[]>();
  for (const item of mediaResult.results) {
    const media: Media = {
      id: item.id,
      kind: item.kind,
      mimeType: item.mime_type,
      originalFilename: item.original_filename,
      byteSize: item.byte_size,
      width: item.width,
      height: item.height,
      durationSeconds: item.duration_seconds,
      capturedAt: item.captured_at,
      position: item.position,
      contentUrl: `/api/media/${item.id}/content?variant=preview`,
      thumbnailUrl: `/api/media/${item.id}/content?variant=thumbnail`,
      downloadUrl: `/api/media/${item.id}/download`,
    };
    const list = mediaByPost.get(item.post_id) ?? [];
    list.push(media);
    mediaByPost.set(item.post_id, list);
  }

  const commentsByPost = new Map<string, Comment[]>();
  for (const item of commentsResult.results) {
    const comment: Comment = { id: item.id, body: item.body, userId: item.user_id, authorName: item.author_name, createdAt: item.created_at, canDelete: canDeleteComment(currentUser, item.user_id) };
    const list = commentsByPost.get(item.post_id) ?? [];
    list.push(comment);
    commentsByPost.set(item.post_id, list);
  }

  const seenByPost = new Map<string, SeenUser[]>();
  for (const item of seenResult.results) {
    const list = seenByPost.get(item.post_id) ?? [];
    list.push({ id: item.user_id, displayName: item.display_name, avatarUrl: item.avatar_url });
    seenByPost.set(item.post_id, list);
  }

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    caption: row.caption,
    eventId: row.event_id,
    eventTitle: row.event_title,
    sectionId: row.section_id,
    sectionTitle: row.section_title,
    capturedAt: row.captured_at,
    publishedAt: row.published_at,
    authorName: row.author_name,
    canEdit: canCreatePost(currentUser),
    canDelete: canDeletePost(currentUser),
    media: mediaByPost.get(row.id) ?? [],
    comments: commentsByPost.get(row.id) ?? [],
    seenBy: seenByPost.get(row.id) ?? [],
  }));
}

export const postSelect = `
  SELECT p.id, p.title, p.caption, p.event_id, e.title AS event_title,
         p.section_id, s.title AS section_title, p.captured_at,
         p.published_at, u.display_name AS author_name
    FROM posts p
    JOIN users u ON u.id = p.created_by
    LEFT JOIN events e ON e.id = p.event_id
    LEFT JOIN event_sections s ON s.id = p.section_id`;

export type { PostRow };
