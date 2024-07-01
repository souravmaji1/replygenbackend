import express from 'express';
import multer from 'multer';
import { Client } from '@gradio/client';
import cors from 'cors';

const app = express();
const upload = multer();
app.use(cors());

app.post('/api/tryon', upload.fields([
  { name: 'background', maxCount: 1 },
  { name: 'garment', maxCount: 1 }
]), async (req, res) => {
  try {
    console.log("API route called");

    const backgroundFile = req.files['background'][0];
    const garmentFile = req.files['garment'][0];

    if (!backgroundFile || !garmentFile) {
      console.log("Missing files");
      return res.status(400).json({ error: 'Both background and garment files are required.' });
    }

    const backgroundBlob = new Blob([backgroundFile.buffer]);
    const garmentBlob = new Blob([garmentFile.buffer]);

    console.log("Files converted to Blob");

    const gradioClient = await Client.connect("yisol/IDM-VTON");
    console.log("Connected to Gradio client");

    const result = await gradioClient.predict("/tryon", [
      {"background": backgroundBlob, "layers": [], "composite": null},
      garmentBlob,
      "Hello!!",
      true,
      true,
      20,
      20,
    ]);

    console.log("Prediction result:", JSON.stringify(result, null, 2));

    if (Array.isArray(result.data) && result.data.length >= 2) {
      const backgroundUrl = result.data[0]?.url;
      const garmentUrl = result.data[1]?.url;

      if (backgroundUrl && garmentUrl) {
        return res.json({ backgroundUrl, garmentUrl });
      }
    }

    console.log('Unexpected result format:', JSON.stringify(result.data, null, 2));
    return res.status(500).json({ error: 'Received an unexpected result format from the server.', data: result.data });
  } catch (error) {
    console.error("An error occurred:", error);
    return res.status(500).json({ error: 'An error occurred while processing your request: ' + error.message });
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});