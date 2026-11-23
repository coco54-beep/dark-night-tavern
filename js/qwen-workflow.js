"use strict";

const QwenWorkflow = (() => {
  const defaults = Object.freeze({
    unet: "qwen-image-2.1-UC-Q4_K_M.gguf",
    encoder: "qwen3vl_8b_w4a8.safetensors",
    vae: "qwen_image_2.1_vae_bf16.safetensors",
    lora: "qwen-image-2.1-lightning-4step.safetensors",
    steps: 20,
    useLora: true
  });
  const dimensions = Object.freeze({ scene: [1024, 704], avatar: [704, 1024] });
  const modelNodes = [
    ["UnetLoaderGGUF", "unet_name", "unet"],
    ["CLIPLoader", "clip_name", "encoder"],
    ["VAELoader", "vae_name", "vae"],
    ["LoraLoaderModelOnly", "lora_name", "lora"]
  ];
  const encoderNode = "TextEncodeQwenImage21";

  async function missingModels(loadNode, models = defaults) {
    const checks = models.useLora === false ? modelNodes.filter(([, , key]) => key !== "lora") : modelNodes;
    const missing = await Promise.all(checks.map(async ([node, input, key]) => {
      const info = await loadNode(node);
      const choices = info?.input?.required?.[input]?.[0];
      return Array.isArray(choices) && choices.includes(models[key]) ? "" : models[key];
    }));
    if (!await loadNode(encoderNode)) missing.push(encoderNode);
    return missing.filter(Boolean);
  }

  function create(prompt, negative, kind, seed, models = defaults) {
    const [width, height] = dimensions[kind];
    const steps = Number.isFinite(Number(models.steps)) ? Math.max(1, Math.round(Number(models.steps))) : 20;
    const graph = {
      "1": { class_type: "UnetLoaderGGUF", inputs: { unet_name: models.unet } },
      "2": { class_type: "CLIPLoader", inputs: { clip_name: models.encoder, type: "qwen_image", device: "default" } },
      "3": { class_type: "VAELoader", inputs: { vae_name: models.vae } },
      "4": { class_type: encoderNode, inputs: { clip: ["2", 0], prompt, negative_prompt: negative, resolution: 1024 } },
      "5": { class_type: "EmptyLatentImage", inputs: { width, height, batch_size: 1 } },
      "6": {
        class_type: "KSampler",
        inputs: { model: ["1", 0], positive: ["4", 0], negative: ["4", 1], latent_image: ["5", 0],
          seed, steps, cfg: 1, sampler_name: "euler", scheduler: "simple", denoise: 1 }
      },
      "7": { class_type: "VAEDecode", inputs: { samples: ["6", 0], vae: ["3", 0] } },
      "8": { class_type: "SaveImage", inputs: { images: ["7", 0], filename_prefix: "Tavern-Qwen21" } }
    };
    if (models.useLora !== false) {
      graph["9"] = { class_type: "LoraLoaderModelOnly", inputs: { model: ["1", 0], lora_name: models.lora, strength_model: 1 } };
      graph["6"].inputs.model = ["9", 0];
    }
    return graph;
  }

  return { defaults, dimensions, missingModels, create };
})();

if (typeof module !== "undefined" && module.exports) module.exports = QwenWorkflow;
