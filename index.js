require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const morgan = require('morgan');
const http = require('http');
const { Server } = require('socket.io');
const axios = require("axios");
const OAuth = require('oauth-1.0a');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
  }
});

app.use(cors());
app.use(bodyParser.json());

// Custom NetSuite config
const config = {
  realm: '7930273_SB2',
  consumerKey: process.env.CONSUMER_KEY,
  consumerSecret: process.env.CONSUMER_SECRET,
  tokenKey: process.env.TOKEN_ID,
  tokenSecret: process.env.TOKEN_SECRET,
};

// Generate OAuth Header
const createNetsuiteAuthHeaders = (consumerKey, consumerSecret, tokenKey, tokenSecret, url, method, realm) => {
  const oauth = OAuth({
    consumer: { key: consumerKey, secret: consumerSecret },
    signature_method: 'HMAC-SHA256',
    hash_function(baseString, key) {
      return crypto.createHmac('sha256', key).update(baseString).digest('base64');
    },
  });

  const token = { key: tokenKey, secret: tokenSecret };
  const requestData = { url, method };

  const header = oauth.toHeader(oauth.authorize(requestData, token));
  header.Authorization += `, realm="${realm}"`;

  return header;
};

// Realtime logs
const logs = [];
const customFormat = ':remote-addr - [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] - :response-time ms ":user-agent"';
app.use(morgan(customFormat, {
  stream: {
    write: (message) => {
      const cleanMessage = message.trim();
      logs.push(cleanMessage);
      if (logs.length > 100) logs.shift();
      io.emit('log', cleanMessage);
    }
  }
}));

// 🔹 GET driver record by ID
app.get('/netsuite/driver', async (req, res) => {
  const url = 'https://7930273-sb2.suitetalk.api.netsuite.com/services/rest/record/v1/customrecord_driver_master_ag/150';

  const headers = createNetsuiteAuthHeaders(
    config.consumerKey,
    config.consumerSecret,
    config.tokenKey,
    config.tokenSecret,
    url,
    'GET',
    config.realm
  );

  try {
    const response = await axios.get(url, { headers });
    res.json(response.data);
  } catch (err) {
    console.error('Error fetching driver:', err.response?.data || err.message);
    res.status(500).send('Failed to fetch driver data');
  }
});

// 🔸 POST create new driver record
app.post('/netsuite/driver', async (req, res) => {
  const url = 'https://7930273-sb2.suitetalk.api.netsuite.com/services/rest/record/v1/customrecord_driver_master_ag';

  const headers = createNetsuiteAuthHeaders(
    config.consumerKey,
    config.consumerSecret,
    config.tokenKey,
    config.tokenSecret,
    url,
    'POST',
    config.realm
  );

  headers['Content-Type'] = 'application/json';

  try {
    const response = await axios.post(url, req.body, { headers });
    res.json({
      message: 'Driver record created successfully',
      result: response.data
    });
  } catch (err) {
    console.error('Error posting to NetSuite:', err.response?.data || err.message);
    res.status(500).json({
      message: 'Failed to create driver record',
      error: err.response?.data || err.message
    });
  }
});

// Serve log viewer (optional)
app.get('/realtime-logs', (req, res) => {
  res.sendFile(__dirname + '/log-viewer.html');
});

// Default test route
app.get('/', (req, res) => res.send('VMS is Up and Running ✅'));

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
