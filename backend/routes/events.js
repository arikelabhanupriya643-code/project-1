const express = require('express');
const supabase = require('../supabase');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const router = express.Router();
router.get('/', async (req, res, next) => { try {
  const { data, error } = await supabase.from('events').select('id,title,category,description,event_date,venue,capacity,fee,status,created_at,registrations(count)').eq('status','published').order('event_date',{ascending:true});
  if (error) throw error;
  res.json({ events: (data || []).map(e => ({ ...e, registration_count: e.registrations?.[0]?.count || 0, registrations: undefined })) });
} catch(e) { next(e); } });
module.exports = router;