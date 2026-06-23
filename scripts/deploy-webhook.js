'use strict';
const http = require('http');
const { exec } = require('child_process');

const PORT   = 9001;
const TOKEN  = process.env.DEPLOY_TOKEN;

if (!TOKEN) {
  console.error('[deploy-agent] DEPLOY_TOKEN env var is required');
  process.exit(1);
}

const DEPLOY_CMD = [
  'git -C /workspace fetch origin main',
  'git -C /workspace checkout jitsi-config/web/custom-config.js 2>/dev/null || true',
  'git -C /workspace reset --hard origin/main',
  'docker compose -f /workspace/docker-compose.yml up -d --build --force-recreate --remove-orphans app',
  'docker restart kodex-web-1 2>/dev/null || true',
].join(' && ');

let deploying = false;

http.createServer((req, res) => {
  if (req.method !== 'POST' || req.url !== '/deploy') {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Not found' }));
  }

  const token = req.headers['x-deploy-token'];
  if (!token || token !== TOKEN) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Unauthorized' }));
  }

  if (deploying) {
    res.writeHead(409, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Deploy already in progress' }));
  }

  deploying = true;
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: 'deploying' }));

  console.log('[deploy-agent] Deploy triggered at', new Date().toISOString());

  exec(DEPLOY_CMD, {
    timeout: 600_000,
    env: { ...process.env, GIT_SSH_COMMAND: 'ssh -o StrictHostKeyChecking=no -o BatchMode=yes' },
  }, (err, stdout, stderr) => {
    deploying = false;
    if (err) {
      console.error('[deploy-agent] FAILED:', err.message);
      if (stderr) console.error(stderr);
    } else {
      console.log('[deploy-agent] Deploy complete at', new Date().toISOString());
      if (stdout) console.log(stdout);
    }
  });
}).listen(PORT, '0.0.0.0', () => {
  console.log('[deploy-agent] Listening on port', PORT);
});
