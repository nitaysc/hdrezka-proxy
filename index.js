const express = require('express');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();

// Enable CORS for all routes
app.use(cors());

// Health check endpoint
app.get('/', (req, res) => {
  res.send('HDRezka Proxy is running!');
});

// Proxy endpoint
app.use('/proxy', createProxyMiddleware({
  target: 'https://hdrezka.ag',
  changeOrigin: true,
  pathRewrite: {
    '^/proxy': '', // remove /proxy from the URL
  },
  onProxyReq: (proxyReq, req, res) => {
    // Inject User-Agent to bypass basic bot protections
    proxyReq.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    // If it's a POST request, make sure we forward the body
    if (req.method === 'POST' && req.body) {
      // http-proxy-middleware automatically forwards the body, but we might need to handle specific content types
    }
  },
  onProxyRes: (proxyRes, req, res) => {
    // Some sites set X-Frame-Options, we can delete them if needed
    delete proxyRes.headers['x-frame-options'];
  },
  onError: (err, req, res) => {
    console.error('Proxy error:', err);
    res.status(500).send('Proxy Error');
  }
}));

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Proxy listening on port ${PORT}`);
});
