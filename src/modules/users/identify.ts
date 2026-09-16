import { getUserStore, type UserRecord } from './users.repository.js';

export async function findUser(telegramId?: number, gmail?: string): Promise<UserRecord | null> {
  const store = getUserStore();
  if (telegramId !== undefined) return store.find(telegramId);
  if (gmail) return store.findByGmail(gmail);
  return null;
}
