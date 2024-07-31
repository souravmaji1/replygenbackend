const express = require('express');
const { Gradient } = require('@gradientai/nodejs-sdk');
const cors = require('cors');
const app = express();
const port = 4000;
app.use(cors());
app.use(express.json());

const gradient = new Gradient({
  accessToken: '35dD5ZSHG4GGOSYVu3ymtyoVcqRUxHiF',
    workspaceId: '982a4f80-e68a-4afe-a20f-831158916f55_workspace'
});

app.post('/create-and-finetune', async (req, res) => {
  try {
    const { modelName, samples } = req.body;

    if (!modelName || !samples || !Array.isArray(samples) || samples.length === 0) {
      return res.status(400).json({ error: 'Invalid input. Please provide a modelName and an array of samples.' });
    }

    // Get the base model
    const baseModel = await gradient.getBaseModel({
      baseModelSlug: "nous-hermes2",
    });

    // Create a new model adapter
    const newModelAdapter = await baseModel.createModelAdapter({
      name: modelName,
    });

    console.log("Created model adapter with id:", newModelAdapter.id);

    // Fine-tune the model
    await newModelAdapter.fineTune({ samples });

    res.json({ 
      message: 'Model created and fine-tuned successfully', 
      modelId: newModelAdapter.id,
      modelName: modelName
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'An error occurred during model creation and fine-tuning' });
  }
});

app.post('/chat', async (req, res) => {
  try {
    const { modelAdapterId, query, maxTokens } = req.body;

    if (!modelAdapterId || !query) {
      return res.status(400).json({ error: 'Missing required parameters. Please provide modelAdapterId and query.' });
    }

    const newModel = await gradient.getModelAdapter({ modelAdapterId });

    const sampleQuery = `### Instruction: ${query}\n\n### Response:`;

    const completeResponse = await newModel.complete({
      query: sampleQuery,
      maxGeneratedTokenCount: maxTokens || 100,
    });

    res.json({ 
      response: completeResponse.generatedOutput.trim(),
      usage: completeResponse.usage
    });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'An error occurred while generating the response' });
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});