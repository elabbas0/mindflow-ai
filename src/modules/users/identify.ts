import { getUserStore, type UserRecord } from './users.repository.js';

/** Find a user by telegramId or gmail (no creation). Used to scope API access. */
export async function findUser(telegramId?: number, gmail?: string): Promise<UserRecord | null> {
  const store = getUserStore();
  if (telegramId !== undefined) return store.find(telegramId);
  if (gmail) return store.findByGmail(gmail);
  return null;
}
