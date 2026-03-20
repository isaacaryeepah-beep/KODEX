const express = require('express');
const router  = express.Router();
const https   = require('https');
const authenticate = require('../middleware/auth');

// POST /api/ai/generate-questions
// Proxies to Anthropic API — keeps API key server-side, never exposed to browser
router.post('/generate-questions', authenticate, async (req, res) => {
  const { prompt, max_tokens } = req.body;

  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'prompt is required' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'AI service not configured. Set ANTHROPIC_API_KEY env var.' });
  }

  const payload = JSON.stringify({
    model: 'claude-sonnet-4-20250514',
    max_tokens: Math.min(parseInt(max_tokens) || 4000, 6000),
    messages: [{ role: 'user', content: prompt }]
  });

  const options = {
    hostname: 'api.anthropic.com',
    path: '/v1/messages',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Length': Buffer.byteLength(payload)
    }
  };

  try {
    const data = await new Promise((resolve, reject) => {
      const request = https.request(options, (upstream) => {
        let body = '';
        upstream.on('data', chunk => body += chunk);
        upstream.on('end', () => {
          try { resolve({ status: upstream.statusCode, body: JSON.parse(body) }); }
          catch(e) { reject(new Error('Invalid JSON from Anthropic')); }
        });
      });
      request.on('error', reject);
      request.setTimeout(60000, () => { request.destroy(); reject(new Error('Request timed out')); });
      request.write(payload);
      request.end();
    });

    if (data.status !== 200) {
      const msg = data.body?.error?.message || 'Anthropic API error';
      return res.status(502).json({ error: msg });
    }

    return res.json(data.body);
  } catch (err) {
    console.error('[AI Proxy] Error:', err.message);
    return res.status(502).json({ error: err.message || 'Failed to reach AI service' });
  }
});

module.exports = router;
