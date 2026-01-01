// netlify/functions/deploy.js
const axios = require('axios');

exports.handler = async function(event, context) {
  // Cek method
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { websiteName, fileData, fileName } = JSON.parse(event.body);
    
    // 🛡️ API Key aman disini (tidak terlihat di frontend)
    const NETLIFY_API_KEY = process.env.NETLIFY_API_KEY;
    
    if (!NETLIFY_API_KEY) {
      throw new Error('API Key tidak ditemukan');
    }

    // 1. Buat site baru di Netlify
    const siteResponse = await axios.post(
      'https://api.netlify.com/api/v1/sites',
      {
        name: websiteName.toLowerCase().replace(/[^a-z0-9-]/g, '-')
      },
      {
        headers: {
          'Authorization': `Bearer ${NETLIFY_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const siteId = siteResponse.data.id;
    const siteUrl = siteResponse.data.ssl_url || siteResponse.data.url;

    // 2. Upload file ke Netlify
    // Untuk HP, kita perlu handle file upload berbeda
    let deployResponse;
    
    if (fileName.endsWith('.zip')) {
      // File ZIP
      const buffer = Buffer.from(fileData, 'base64');
      deployResponse = await axios.post(
        `https://api.netlify.com/api/v1/sites/${siteId}/deploys`,
        buffer,
        {
          headers: {
            'Authorization': `Bearer ${NETLIFY_API_KEY}`,
            'Content-Type': 'application/zip'
          }
        }
      );
    } else {
      // File HTML tunggal - kita bungkus dalam ZIP
      const JSZip = require('jszip');
      const zip = new JSZip();
      
      // Tambahkan file HTML
      zip.file("index.html", Buffer.from(fileData, 'base64').toString());
      
      // Tambahkan netlify.toml
      zip.file("netlify.toml", `
[build]
  publish = "."
  
[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
      `);
      
      const zipBuffer = await zip.generateAsync({type: "nodebuffer"});
      
      deployResponse = await axios.post(
        `https://api.netlify.com/api/v1/sites/${siteId}/deploys`,
        zipBuffer,
        {
          headers: {
            'Authorization': `Bearer ${NETLIFY_API_KEY}`,
            'Content-Type': 'application/zip'
          }
        }
      );
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        url: siteUrl,
        adminUrl: `https://app.netlify.com/sites/${websiteName}`,
        siteId: siteId,
        deployId: deployResponse.data.id,
        message: 'Website berhasil di-deploy!'
      })
    };

  } catch (error) {
    console.error('Deploy error:', error);
    
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: error.response?.data?.message || error.message
      })
    };
  }
};
