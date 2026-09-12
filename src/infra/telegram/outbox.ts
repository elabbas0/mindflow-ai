export interface OutboxButton {
  text: string;
  callback_data: string;
}

export interface OutboxMessage {
  chatId: number;
  text: string;
  buttons: OutboxButton[][];
  at: string;
}

const box: OutboxMessage[] = [];

export function pushOutbox(chatId: number, text: string, buttons: OutboxButton[][] = []): void {
  box.push({ chatId, text, buttons, at: new Date().toISOString() });
}

export function readOutbox(chatId?: number): OutboxMessage[] {
  return chatId === undefined ? [...box] : box.filter((m) => m.chatId === chatId);
}

export function clearOutbox(): void {
  box.length = 0;
}
