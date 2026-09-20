import { db } from '@/lib/db';
import { eq, desc, and } from 'drizzle-orm';
import { conversations, messages } from '@/storage/database/shared/schema';
import { randomUUID } from 'node:crypto';

export async function getOrCreateConversation(userId: string, title?: string) {
  try {
    let [conv] = await db.select().from(conversations)
      .where(eq(conversations.user_id, userId)).limit(1);

    if (!conv) {
      const id = randomUUID();
      await db.insert(conversations).values({
        id,
        user_id: userId,
        title: title || 'Chat',
        status: 'active',
      } );
      [conv] = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
    }

    return conv;
  } catch (error) {
    throw error;
  }
}

export async function getMessages(conversationId: string) {
  try {
    const data = await db.select().from(messages)
      .where(eq(messages.conversation_id, conversationId))
      .orderBy(messages.created_at);
    return { data: data || [], error: null };
  } catch (error) {
    return { data: [], error };
  }
}

export async function createMessage(conversationId: string, role: string, content: string, metadata?: unknown) {
  try {
    const id = randomUUID();
    await db.insert(messages).values({
      id,
      conversation_id: conversationId,
      role,
      content,
      metadata: metadata || null,
    } );
    const [data] = await db.select().from(messages).where(eq(messages.id, id)).limit(1);
    return data;
  } catch (error) {
    throw error;
  }
}

export async function markConversationRead(conversationId: string) {
  try {
    await db.update(conversations).set({ status: 'active' } )
      .where(eq(conversations.id, conversationId));
  } catch (error) {
    throw error;
  }
}

export async function closeConversation(conversationId: string) {
  try {
    await db.update(conversations).set({ status: 'closed' } )
      .where(eq(conversations.id, conversationId));
  } catch (error) {
    throw error;
  }
}

export async function aiReply(data: { conversation_id: string; content: string; metadata?: unknown }) {
  return createMessage(data.conversation_id, "ai", data.content);
}
export async function sendUserMessage(data: { userId: string; content: string; title?: string }) {
  const conversation = await getOrCreateConversation(data.userId, data.title);
  return createMessage(conversation.id, "user", data.content);
}
export async function getConversationHistory(conversationId: string, userId: string) {
  const [conversation] = await db.select({ id: conversations.id }).from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.user_id, userId)))
    .limit(1);
  if (!conversation) {
    return { data: [], error: null };
  }
  return getMessages(conversationId);
}
export async function getUserConversations(userId: string) {
  return getOrCreateConversation(userId);
}
