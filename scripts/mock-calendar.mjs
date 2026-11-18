// Imported only by regression tests. Keep all Calendar API traffic in memory.
import { GoogleCalendarService } from '../dist/modules/admin/google-calendar.service.js';
const events = new Map();
GoogleCalendarService.prototype.client = async function () {
  return { calendarId: 'regression-test-calendar', api: {
    calendars: { get: async () => ({ data: { conferenceProperties: { allowedConferenceSolutionTypes: [] } } }) },
    events: {
      insert: async ({ requestBody }) => { const event = { ...requestBody, status: 'confirmed', htmlLink: 'https://calendar.google.com/test' }; events.set(event.id, event); return { data: event }; },
      patch: async ({ eventId, requestBody }) => { const event = { ...events.get(eventId), ...requestBody }; events.set(eventId, event); return { data: event }; },
      delete: async ({ eventId }) => { events.delete(eventId); },
      list: async () => ({ data: { items: [] } }),
    },
  } };
};
GoogleCalendarService.prototype.busy = async () => [...events.values()].map(e => ({ start: e.start.dateTime, end: e.end.dateTime }));
GoogleCalendarService.prototype.event = async id => events.get(id) || null;
