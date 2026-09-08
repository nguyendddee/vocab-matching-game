const { put, head, list } = require('@vercel/blob');

const BLOB_PATH = 'vocab-progress.json';

module.exports = async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (req.method === 'GET') {
      // Load progress from Vercel Blob
      const { blobs } = await list({ prefix: BLOB_PATH });

      if (blobs.length === 0) {
        return res.status(200).json({ progress: null });
      }

      const blobUrl = blobs[0].url;
      const response = await fetch(blobUrl);
      const data = await response.json();

      return res.status(200).json({ progress: data });

    } else if (req.method === 'POST') {
      // Save progress to Vercel Blob
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

      const blob = await put(BLOB_PATH, JSON.stringify(body), {
        access: 'public',
        addRandomSuffix: false,
      });

      return res.status(200).json({ success: true, url: blob.url });

    } else {
      return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: error.message });
  }
};
