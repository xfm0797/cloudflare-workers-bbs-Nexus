/** 数据模型（与 D1 表结构一一对应） */

export interface User {
  id: string;
  username: string;
  email: string | null;
  password_hash: string | null;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  location: string | null;
  website: string | null;
  role: 'member' | 'moderator' | 'admin';
  status: 'active' | 'muted' | 'banned';
  locale: string | null;
  email_verified: number;
  token_version: number;
  topic_count: number;
  post_count: number;
  reputation: number;
  last_seen_at: number | null;
  created_at: number;
}

export interface Category {
  id: number;
  slug: string;
  name: string;
  name_en: string | null;
  description: string | null;
  description_en: string | null;
  icon: string | null;
  color: string | null;
  position: number;
  topic_count: number;
  post_count: number;
  admin_only: number;
  created_at: number;
}

export interface Topic {
  id: number;
  category_id: number;
  author_id: string;
  title: string;
  slug: string | null;
  excerpt: string | null;
  tags: string | null;
  is_pinned: number;
  is_locked: number;
  is_featured: number;
  is_deleted: number;
  views: number;
  reply_count: number;
  like_count: number;
  last_post_at: number;
  last_poster_id: string | null;
  created_at: number;
  updated_at: number;
}

export interface Post {
  id: number;
  topic_id: number;
  author_id: string;
  content: string;
  content_html: string;
  reply_to_post_id: number | null;
  position: number;
  is_deleted: number;
  like_count: number;
  edited_at: number | null;
  created_at: number;
}
