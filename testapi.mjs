import { Client } from "@gradio/client";


const RunApi = async() => {
  try {
    // Fetch the image once and use it for both the background and the garment
    const response = await fetch("https://i.pinimg.com/474x/69/22/fc/6922fc3b3d7cee2fe453c9f2e7cf7a77.jpg");
    const imageBlob = await response.blob();

    const garment = await fetch("https://m.media-amazon.com/images/I/419kPkpseLL._AC_UY1000_.jpg");
    const garmentresult = await garment.blob();

    const app = await Client.connect("yisol/IDM-VTON");
    const result = await app.predict("/tryon", [
      {"background": imageBlob, "layers": [], "composite": null}, // Use imageBlob for background
      garmentresult, // Use the same imageBlob for the garment
      "Hello!!", // string in 'parameter_17' Textbox component
      true, // boolean in 'Yes' Checkbox component
      true, // boolean in 'Yes' Checkbox component
      20, // number in 'Denoising Steps' Number component
      20, // number in 'Seed' Number component
    ]);

    console.log(result.data);
  } catch (error) {
    console.error("An error occurred:", error);
  }
}

RunApi();