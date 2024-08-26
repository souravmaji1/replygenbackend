const express = require('express');
const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
const multer = require('multer');
const path = require('path');
const cors = require('cors');
const app = express();
const cheerio = require('cheerio');
const { Client, GatewayIntentBits } = require('discord.js');
const { Telegraf } = require('telegraf');
const { Client: WhatsAppClient } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

app.use(cors());
app.use(express.json());

// Configure multer to accept only .jsonl files
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  if (file.mimetype === 'application/json' || path.extname(file.originalname) === '.jsonl') {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JSONL files are allowed.'), false);
  }
};

const upload = multer({ 
  storage: storage,
  fileFilter: fileFilter
});

const API_KEY = 'suaH02pXwO37aD8XQsYca1XlE3chrOvMGcdHJRJV';


async function callVapiApi(fileBuffer, originalname, token) {
  const form = new FormData();
  form.append('file', fileBuffer, { filename: originalname });

  try {
    const response = await axios.post('https://api.vapi.ai/file', form, {
      headers: {
        ...form.getHeaders(),
        'Authorization': `Bearer ${token}`
      }
    });
    return response.data;
  } catch (error) {
    console.error('Error calling Vapi API:', error.response ? error.response.data : error.message);
    throw error;
  }
}

// Endpoint to handle file upload
app.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).send('No file uploaded.');
  }

  const token = req.headers['vapi-token']; // Get token from request headers
  if (!token) {
    return res.status(400).send('No Vapi token provided.');
  }

  try {
    const vapiResponse = await callVapiApi(req.file.buffer, req.file.originalname, token);
    
    // Clean up: delete the uploaded file after processing
    fs.unlinkSync(req.file.path);
    
    res.json({
      message: 'File uploaded and processed successfully',
      vapiResponse
    });
  } catch (error) {
    res.status(500).json({
      message: 'Error processing file',
      error: error.message
    });
  }
});

// Upload dataset API
app.post('/upload-dataset', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No JSONL file uploaded' });
  }

  try {
    const form = new FormData();
    form.append('file', fs.createReadStream(req.file.path));

    const datasetResponse = await axios.post('https://api.cohere.com/v1/datasets', form, {
      params: {
        name: 'my-dataset',
        type: 'chat-finetune-input'
      },
      headers: {
        ...form.getHeaders(),
        'Authorization': `Bearer ${API_KEY}`
      }
    });

    const datasetId = datasetResponse.data.id;

    // Clean up the uploaded file
    fs.unlinkSync(req.file.path);

    res.json({
      message: 'JSONL dataset uploaded successfully',
      datasetId: datasetId
    });
  } catch (error) {
    console.error('Error:', error.response ? error.response.data : error.message);
    res.status(500).json({ error: 'An error occurred during the upload process' });
  }
});

// Start fine-tuning API
app.post('/start-finetuning', async (req, res) => {
  const { datasetId, modelName } = req.body;

  if (!datasetId || !modelName) {
    return res.status(400).json({ error: 'Dataset ID and model name are required' });
  }

  try {
    const finetuneData = {
      name: modelName,
      settings: {
        base_model: {
          base_type: "BASE_TYPE_CHAT",
        },
        dataset_id: datasetId
      }
    };

    const finetuneResponse = await axios.post('https://api.cohere.com/v1/finetuning/finetuned-models', finetuneData, {
      headers: {
        'accept': 'application/json',
        'content-type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      }
    });

    res.json({
      message: 'Fine-tuning started successfully',
      finetuneJobId: finetuneResponse.data.id
    });
  } catch (error) {
    console.error('Error:', error.response ? error.response.data : error.message);
    res.status(500).json({ error: 'An error occurred during the fine-tuning process' });
  }
});

app.get('/scrape', async (req, res) => {
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'URL parameter is required' });
  }

  try {
    const response = await axios.get(url);
    const html = response.data;
    const $ = cheerio.load(html);

    const extractedData = {
      title: $('title').text(),
      metaDescription: $('meta[name="description"]').attr('content'),
      h1: $('h1').map((i, el) => $(el).text()).get(),
      h2: $('h2').map((i, el) => $(el).text()).get(),
      h3: $('h3').map((i, el) => $(el).text()).get(),
      paragraphs: $('p').map((i, el) => $(el).text()).get(),
    };

    res.json(extractedData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});



async function callCohereAPI(message, modelId) {
  try {
    const response = await axios.post('https://api.cohere.com/v1/chat', {
      model: modelId,
      message: message
    }, {
      headers: {
        'Authorization': 'Bearer suaH02pXwO37aD8XQsYca1XlE3chrOvMGcdHJRJV',
        'Content-Type': 'application/json'
      }
    });

    console.log(response.data);
    return response.data;
  } catch (error) {
    console.error('Error:', error.response ? error.response.data : error.message);
    throw error;
  }
}

app.post('/start-discord-bot', async (req, res) => {
  const { botToken, modelId } = req.body;

  if (!botToken || !modelId) {
    return res.status(400).json({ error: 'Bot token and model ID are required' });
  }

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
  });

  client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    try {
      const cohereResponse = await callCohereAPI(message.content, modelId);
      const reply = cohereResponse.text;
      message.reply(reply);
    } catch (error) {
      console.error('Error processing message:', error);
      message.reply('Sorry, I encountered an error while processing your message.');
    }
  });

  try {
    await client.login(botToken);
    res.json({ message: 'Discord bot started successfully', modelId: modelId });
  } catch (error) {
    res.status(500).json({ error: 'Failed to start Discord bot: ' + error.message });
  }
});




// Add new endpoint for starting Telegram bot using Telegraf
app.post('/start-telegram-bot', async (req, res) => {
  const { botToken, modelId } = req.body;

  if (!botToken || !modelId) {
    return res.status(400).json({ error: 'Bot token and model ID are required' });
  }

  try {
    const bot = new Telegraf(botToken);

    bot.on('text', async (ctx) => {
      const userMessage = ctx.message.text;

      try {
        const cohereResponse = await callCohereAPI(userMessage, modelId);
        const reply = cohereResponse.text;
        ctx.reply(reply);
      } catch (error) {
        console.error('Error processing message:', error);
        ctx.reply('Sorry, I encountered an error while processing your message.');
      }
    });

    // Handle errors
    bot.catch((err, ctx) => {
      console.error(`Error for ${ctx.updateType}`, err);
    });

    // Start the bot
    await bot.launch();
    console.log('Telegram bot is running');

    res.json({ message: 'Telegram bot started successfully', modelId: modelId });
  } catch (error) {
    res.status(500).json({ error: 'Failed to start Telegram bot: ' + error.message });
  }
});


app.post('/start-whatsapp-bot', async (req, res) => {
  const { modelId } = req.body;

  if (!modelId) {
    return res.status(400).json({ error: 'Model ID is required' });
  }

  try {
    const client = new WhatsAppClient();

    client.on('qr', (qr) => {
      // Generate and display QR code in console
      qrcode.generate(qr, {small: true});
      res.json({ qrCode: qr });
    });

    client.on('ready', () => {
      console.log('WhatsApp bot is ready!');
    });

    client.on('message', async (message) => {
      if (message.body.startsWith('!bot')) {
        const userMessage = message.body.slice(4).trim();
        try {
          const cohereResponse = await callCohereAPI(userMessage, modelId);
          const reply = cohereResponse.text;
          message.reply(reply);
        } catch (error) {
          console.error('Error processing message:', error);
          message.reply('Sorry, I encountered an error while processing your message.');
        }
      }
    });

    client.initialize();
  } catch (error) {
    res.status(500).json({ error: 'Failed to start WhatsApp bot: ' + error.message });
  }
});



const PORT = 4000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});