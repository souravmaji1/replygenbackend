const express = require('express');
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");
const { jsPDF } = require("jspdf");
const axios = require('axios');
const cors = require('cors');
const Replicate = require('replicate');
const app = express();
const port = 4200;

app.use(express.json());
app.use(cors({
  origin: 'https://simplifiaiplatform.netlify.app'
}));

const apiKey = "AIzaSyAmUcYgO4KOVusTdWXc7xEHRY-8l7dKMWc";
const genAI = new GoogleGenerativeAI(apiKey);

const model = genAI.getGenerativeModel({
  model: "gemini-1.5-flash",
});

const generationConfig = {
  temperature: 1,
  topP: 0.95,
  topK: 64,
  maxOutputTokens: 8192,
};

const safetySettings = [
  {
    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  }
];


async function generateStory(prompt) {
  const chatSession = model.startChat({
    generationConfig,
    safetySettings,
  });

  const result = await chatSession.sendMessage(`Write a short 3-page children's story based on the following prompt: ${prompt}. Each page should have a brief paragraph.`);
  return result.response.text();
}

async function generateImage(prompt) {
    try {
      const response = await axios.post('https://api.prodia.com/v1/sd/generate', {
        prompt: prompt
      }, {
        headers: {
          'accept': 'application/json',
          'content-type': 'application/json',
          'X-Prodia-Key': "1ef69fed-ed01-4807-88c6-ee55545f98ec"
        }
      });
  
      // Wait for the image generation to complete
      const jobId = response.data.job;
      let imageUrl;
      while (!imageUrl) {
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for 1 second
        const statusResponse = await axios.get(`https://api.prodia.com/v1/job/${jobId}`, {
          headers: {
            'accept': 'application/json',
            'X-Prodia-Key': "1ef69fed-ed01-4807-88c6-ee55545f98ec"
          }
        });
        if (statusResponse.data.status === 'succeeded') {
          imageUrl = statusResponse.data.imageUrl;
        } else if (statusResponse.data.status === 'failed') {
          throw new Error('Image generation failed');
        }
      }
  
      return imageUrl;
    } catch (error) {
      console.error('Error generating image:', error.response ? error.response.data : error.message);
      throw error;
    }
  }

  app.post('/generate-storybook', async (req, res) => {
    try {
      const { prompt } = req.body;
      if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
      }

      const story = await generateStory(prompt);
      console.log("Story generated successfully:", story);
  
      const pages = story.split('\n\n').filter(page => page.trim() !== '');
      console.log("Pages split:", pages);
  
      const pdf = new jsPDF();
      const pageWidth = pdf.internal.pageSize.width;
      const pageHeight = pdf.internal.pageSize.height;
      
      for (let i = 0; i < pages.length; i++) {
        if (i > 0) pdf.addPage();
  
        const imagePrompt = `Illustration for children's story: ${pages[i].trim()}`;
        console.log("Generating image for prompt:", imagePrompt);
        const imageUrl = await generateImage(imagePrompt);
        console.log("Image URL generated:", imageUrl);
  
        // Add image to PDF
        console.log("Fetching image...");
        const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
        const imageBuffer = Buffer.from(response.data, 'binary');
        const imageBase64 = imageBuffer.toString('base64');
  
        console.log("Adding image to PDF...");
        const imgProps = pdf.getImageProperties(imageBase64);
        const maxImgHeight = pageHeight * 0.6; // Limit image height to 60% of page height
        let imgWidth = pageWidth - 20; // 10px margin on each side
        let imgHeight = (imgProps.height * imgWidth) / imgProps.width;
        
        if (imgHeight > maxImgHeight) {
          imgHeight = maxImgHeight;
          imgWidth = (imgProps.width * imgHeight) / imgProps.height;
        }
  
        const imgX = (pageWidth - imgWidth) / 2; // Center the image horizontally
        pdf.addImage(imageBase64, 'JPEG', imgX, 10, imgWidth, imgHeight);
  
        // Add text to PDF
        console.log("Adding text to PDF...");
        pdf.setFontSize(12);
        pdf.setTextColor(0, 0, 0);
        
        const textY = imgHeight + 20; // Start text 20px below the image
        const maxWidth = pageWidth - 20;
        const lines = pdf.splitTextToSize(pages[i].trim(), maxWidth);
        
        // Ensure text fits on the same page
        const availableHeight = pageHeight - textY - 10; // 10px bottom margin
        const textHeight = lines.length * pdf.getLineHeight();
        
        if (textHeight > availableHeight) {
          // If text doesn't fit, reduce font size
          pdf.setFontSize(10);
          const lines = pdf.splitTextToSize(pages[i].trim(), maxWidth);
        }
        
        pdf.text(lines, 10, textY);
  
        console.log("Page text:", pages[i].trim());
      }
  
      console.log("Generating PDF buffer...");
      const pdfBuffer = pdf.output('arraybuffer');
      console.log("PDF buffer size:", pdfBuffer.byteLength);
  
      console.log("Sending response...");
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename=storybook.pdf');
      res.end(Buffer.from(pdfBuffer));
      console.log("Response sent successfully");
    } catch (error) {
      console.error('Error:', error);
      res.status(500).json({ 
        error: 'An error occurred while generating the storybook',
        details: error.message,
        stack: error.stack
      });
    }
  });


  
const replicate = new Replicate({
  auth: "r8_CGykQEKC09ONArKnKrDF6UYrq8jV7lC4ephb4",
});

app.post('/api/generate-video', async (req, res) => {
  try {
    const { prompt,width,height,fps,batch_size,negative_prompt } = req.body;
    
    const output = await replicate.run(
      "anotherjesse/zeroscope-v2-xl:9f747673945c62801b13b84701c783929c0ee784e4748ec062204894dda1a351",
      {
        input: {
          fps: fps,
          model: "xl",
          width: width,
          height: height,
          prompt: prompt,
          batch_size: batch_size,
          num_frames: 24,
          init_weight: 0.5,
          guidance_scale: 17.5,
          negative_prompt: negative_prompt,
          remove_watermark: false,
          num_inference_steps: 50
        }
      }
    );

    res.json({ videoUrl: output[0] });
  } catch (error) {
    console.error('Error generating video:', error);
    res.status(500).json({ error: 'Error generating video' });
  }
});

app.post('/api/generate-music', async (req, res) => {
  try {
    const { prompt_a, prompt_b,alpha,denoising,seed_image_id,num_inference_steps } = req.body;
    
    const output = await replicate.run(
      "riffusion/riffusion:8cf61ea6c56afd61d8f5b9ffd14d7c216c0a93844ce2d82ac1c9ecc9c7f24e05",
      {
        input: {
          alpha: alpha,
          prompt_a: prompt_a,
          prompt_b: prompt_b,
          denoising: denoising,
          seed_image_id: seed_image_id,
          num_inference_steps: num_inference_steps
        }
      }
    );

    res.json({ audioUrl: output.audio });
  } catch (error) {
    console.error('Error generating music:', error);
    res.status(500).json({ error: 'Error generating music' });
  }
});


app.post('/generate-image', async (req, res) => {
  try {
    const { prompt } = req.body;

    const output = await replicate.run(
      "bytedance/sdxl-lightning-4step:5f24084160c9089501c1b3545d9be3c27883ae2239b6f412990e82d4a6210f8f",
      {
        input: {
          width: 1024,
          height: 1024,
          prompt: prompt,
          scheduler: "K_EULER",
          num_outputs: 1,
          guidance_scale: 0,
          negative_prompt: "worst quality, low quality",
          num_inference_steps: 4
        }
      }
    );
    
    res.json({ output });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'An error occurred while generating the image' });
  }
});

app.post('/api/create-video', async (req, res) => {
  try {
    const { sourceUrl, inputText } = req.body;

    const response = await axios.post('https://api.d-id.com/talks', {
      script: {
        type: "text",
        subtitles: "false",
        provider: {
          type: "microsoft",
          voice_id: "en-US-JennyNeural"
        },
        input: inputText
      },
      config: {
        fluent: "false",
        pad_audio: "0.0"
      },
      source_url: sourceUrl
    }, {
      headers: {
        'authorization': `Bearer ZXh0cmE3NTExQGdtYWlsLmNvbQ:QhQYlFEP1Z7IjGOuG8rZl`
      }
    });

    res.json(response.data);
  } catch (error) {
    console.error('Error:', error.response ? error.response.data : error.message);
    res.status(500).json({ error: 'Failed to create video' });
  }
});
  


app.listen(port, () => {
  console.log(`Storybook generator API listening at http://localhost:${port}`);
});