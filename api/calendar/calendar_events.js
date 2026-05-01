const { google } = require('googleapis');
const { getOAuthClient } = require('../_sheets-auth');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { from, to } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'from and to query params required' });

  try {
    const auth = getOAuthClient();
    const calendar = google.calendar({ version: 'v3', auth });

    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: new Date(from).toISOString(),
      timeMax: new Date(to).toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 250,
    });

    const events = (response.data.items || [])
      .filter(e => e.status !== 'cancelled')
      .filter(e => e.start?.dateTime) // only timed events, not all-day
      .map(e => {
        const start = new Date(e.start.dateTime);
        const end   = new Date(e.end.dateTime);
        const hours = Math.round(((end - start) / (1000 * 60 * 60)) * 4) / 4; // round to nearest 0.25h
        return {
          id: e.id,
          title: e.summary || '(No title)',
          date: start.toISOString().split('T')[0],
          start: e.start.dateTime,
          end: e.end.dateTime,
          hours: hours > 0 ? hours : 0,
          attendees: (e.attendees || []).map(a => a.email).filter(Boolean),
          description: e.description || '',
        };
      })
      .filter(e => e.hours > 0);

    return res.status(200).json({ events });
  } catch (err) {
    console.error('Calendar error:', err.message);
    if (err.code === 403 || err.message?.includes('insufficient')) {
      return res.status(403).json({
        error: 'Calendar access not authorised.',
        fix: 'Regenerate your GMAIL_REFRESH_TOKEN including the calendar.readonly scope at OAuth Playground.',
        scope_required: 'https://www.googleapis.com/auth/calendar.readonly',
      });
    }
    return res.status(500).json({ error: err.message });
  }
};
