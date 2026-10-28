const express = require('express');
const supabase = require('../supabase');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();
router.use(requireAuth);
router.get('/mine', async (req, res, next) => { try {
  const { data, error } = await supabase.from('registrations').select('id,event_id,status,created_at,events(title,event_date,venue,fee)').eq('student_id', req.auth.id).order('created_at',{ascending:false});
  if (error) throw error;
  res.json({ registrations: (data || []).map(r => ({ id:r.id,event_id:r.event_id,status:r.status,created_at:r.created_at,event_title:r.events?.title || 'Event unavailable',event_date:r.events?.event_date,venue:r.events?.venue,fee:r.events?.fee })) });
} catch(e) { next(e); } });
router.post('/', async (req, res, next) => { try {
  const eventId = req.body.event_id;
  if (typeof eventId !== 'string' || !/^[0-9a-f-]{36}$/i.test(eventId)) return res.status(400).json({ error: 'A valid event_id is required.' });
  const { data, error } = await supabase.rpc('register_for_event', { p_event_id: eventId, p_student_id: req.auth.id });
  if (error) { if (error.message.includes('EVENT_NOT_FOUND')) return res.status(404).json({ error: 'Event not found or not available.' }); if (error.message.includes('ALREADY_REGISTERED')) return res.status(409).json({ error: 'You are already registered for this event.' }); if (error.message.includes('EVENT_FULL')) return res.status(409).json({ error: 'This event has reached capacity.' }); if (error.message.includes('EVENT_CLOSED')) return res.status(409).json({ error: 'This event is cancelled or has already started.' }); throw error; }
  res.status(201).json({ registration: data });
} catch(e) { next(e); } });
router.delete('/:id', async (req, res, next) => { try {
  if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) return res.status(400).json({ error: 'Invalid registration ID.' });
  const { data, error } = await supabase.from('registrations').update({ status:'cancelled' }).eq('id',req.params.id).eq('student_id',req.auth.id).eq('status','confirmed').select('id').maybeSingle();
  if (error) throw error;
  if (!data) return res.status(404).json({ error: 'Active registration not found.' });
  res.json({ message:'Registration cancelled.' });
} catch(e) { next(e); } });
module.exports = router;