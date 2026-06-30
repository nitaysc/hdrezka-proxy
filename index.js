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
    const res = await fetch('https://hdrezka.ag/', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    const setCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    parseCookies(setCookies);
    console.log('Warm-up cookies:', getCookieString());
  } catch (e) {
    console.error('Warm-up failed:', e.message);
  }
}

// Proxy endpoint
app.use('/proxy', createProxyMiddleware({
  target: 'https://hdrezka.ag',
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
