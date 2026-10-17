export default function handler(_request, response) {
  response.setHeader('Cache-Control', 'no-store');
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) return response.status(503).json({ configured: false });
  return response.status(200).json({ configured: true, url, anonKey });
}
