import { z } from 'zod';

export const telegramUpdateSchema = z.object({
  update_id: z.number(),
  message: z
    .object({
      message_id: z.number(),
      chat: z.object({ id: z.number() }),
      from: z.object({ id: z.number() }).optional(),
      text: z.string().optional(),
      voice: z.object({ file_id: z.string() }).optional(),
    })
    .optional(),
});

export type TelegramUpdate = z.infer<typeof telegramUpdateSchema>;
