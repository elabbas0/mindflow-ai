import type { FastifyInstance } from 'fastify';

/** Static sample data so the frontend can test against the deployed backend without API keys. */
const DEMO_EVENTS = [
  { id: 'demo-1', title: 'Team standup', startsAt: '2026-09-14T09:00:00Z', notes: 'Daily sync' },
  { id: 'demo-2', title: 'Dentist appointment', startsAt: '2026-09-15T14:30:00Z', notes: null },
  { id: 'demo-3', title: 'Buy groceries', startsAt: null, notes: 'Milk, bread, eggs' },
];

export async function eventsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/events/demo', async () => ({ ok: true, events: DEMO_EVENTS }));
}
