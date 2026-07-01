const express = require('express');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');
const http = require('http');
const https = require('https');

const app = express();

// Enable CORS for all routes
app.use(cors());

// Health check endpoint
app.get('/', (req, res) => {
  res.send('HDRezka Proxy is running!');
});

// Global cookie jar - stores cookies from HDRezka responses
let cookieJar = {};

function parseCookies(setCookieHeaders) {
  if (!setCookieHeaders) return;
  const headers = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
  for (const header of headers) {
    const parts = header.split(';')[0].split('=');
    const name = parts[0].trim();
    const value = parts.slice(1).join('=').trim();
    if (value && value !== 'deleted') {
      cookieJar[name] = value;
    } else {
      delete cookieJar[name];
    }
  }
}

function getCookieString() {
  return Object.entries(cookieJar).map(([k, v]) => `${k}=${v}`).join('; ');
}

// Warm-up: fetch the homepage to get initial cookies
async function warmUpCookies() {
  try {
    const res = await fetch('https://hdrezka-home.tv/', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    const setCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    parseCookies(setCookies);
    console.log('Warm-up cookies:', getCookieString());
  } catch (e) {
    console.error('Warm-up failed:', e.message);
  }
}

// Direct fetch endpoint - bypasses http-proxy-middleware redirect issues
app.get('/fetch-page', async (req, res) => {
  const targetPath = req.query.path;
  if (!targetPath) {
    return res.status(400).json({ error: 'Missing path parameter' });
  }
  
  const url = `https://hdrezka-home.tv${targetPath}`;
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Cookie': getCookieString(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'identity',
        'Referer': 'https://hdrezka-home.tv/',
      },
      redirect: 'follow',
    });
    
    // Update cookies from response
    const setCookies = response.headers.getSetCookie ? response.headers.getSetCookie() : [];
    parseCookies(setCookies);
    
    const html = await response.text();
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (e) {
    console.error('Fetch-page error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Proxy endpoint
app.use('/proxy', createProxyMiddleware({
  target: 'https://hdrezka-home.tv',
  changeOrigin: true,
  pathRewrite: {
    '^/proxy': '',
  },
  onProxyReq: (proxyReq, req, res) => {
    proxyReq.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Always inject cookies from our jar
    const cookies = getCookieString();
    if (cookies) {
      proxyReq.setHeader('Cookie', cookies);
    }
  },
  onProxyRes: (proxyRes, req, res) => {
    delete proxyRes.headers['x-frame-options'];
    proxyRes.headers['Access-Control-Allow-Origin'] = '*';
    proxyRes.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, PATCH, OPTIONS';
    proxyRes.headers['Access-Control-Allow-Headers'] = 'X-Requested-With, content-type, Authorization';
    
    // Rewrite Location header for redirects
    if (proxyRes.headers.location) {
      const loc = proxyRes.headers.location;
      if (loc.startsWith('http')) {
        proxyRes.headers.location = loc.replace(/^https?:\/\/[^\/]+/, '/proxy');
      } else if (loc.startsWith('/')) {
        proxyRes.headers.location = '/proxy' + loc;
      }
    }
    
    // Update cookie jar from response
    parseCookies(proxyRes.headers['set-cookie']);
  },
  onError: (err, req, res) => {
    console.error('Proxy error:', err);
    res.status(500).send('Proxy Error');
  }
}));

const PORT = process.env.PORT || 8080;
app.listen(PORT, async () => {
  console.log(`Proxy listening on port ${PORT}`);
  await warmUpCookies();
});
