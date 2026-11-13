import type { Comment, Post, PublicUser } from '@shared/contract';

export function sampleUser(overrides: Partial<PublicUser> = {}): PublicUser {
  return {
    id: 'u1',
    username: 'alice',
    displayName: '爱丽丝',
    createdAt: 1_700_000_000_000,
    ...overrides,
  };
}

export function samplePost(overrides: Partial<Post> = {}): Post {
  return {
    id: 'p1',
    authorId: 'u1',
    content: '第一条动态',
    createdAt: 1_700_000_000_000,
    ...overrides,
  };
}

export function sampleComment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: 'c1',
    postId: 'p1',
    authorId: 'u1',
    content: '第一条评论',
    createdAt: 1_700_000_000_000,
    ...overrides,
  };
}
