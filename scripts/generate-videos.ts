/**
 * Pre-generate BMW car videos using Runway Gen-4 I2V.
 *
 * Reads test_drive_models.json, generates a 5-second video per model
 * using the car's transparent PNG + a cinematic motion prompt,
 * downloads the result (Runway URLs expire in 24h), and writes
 * a video_urls.json mapping model ID → local video path.
 *
 * Usage:
 *   npx tsx scripts/generate-videos.ts [--models i7,ix,m3-limousine] [--provider runway|wan-direct] [--duration 5]
 */

import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

// ── Config ──────────────────────────────────────────────────────────

const RUNWAY_API_KEY = process.env.RUNWAY_API_KEY || "";
const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY || "";

const RUNWAY_BASE = "https://api.dev.runwayml.com";
const RUNWAY_VERSION = "2024-11-06";
const DASHSCOPE_BASE = "https://dashscope-intl.aliyuncs.com";

const DATA_DIR = path.resolve(import.meta.dirname, "..", "data");
const VIDEO_DIR = path.resolve(import.meta.dirname, "..", "frontend", "public", "videos");
const OUTPUT_JSON = path.join(DATA_DIR, "video_urls.json");

const POLL_INTERVAL_MS = 10_000;
const MAX_POLL_MS = 600_000; // 10 min — video gen is slow

// Featured models to generate by default
const DEFAULT_MODELS = ["i7", "i4-m50", "m3-limousine", "ix", "x5", "i7-m70"];

// Motion prompts per model (cinematic, specific to the car)
const MOTION_PROMPTS: Record<string, string> = {
  "i7": "Luxury BMW i7 sedan driving smoothly through a modern city at dusk, reflections on wet road, cinematic lighting, shallow depth of field, 4K",
  "i7-m70": "BMW i7 M70 performance sedan accelerating on a sweeping mountain highway, dramatic clouds, golden hour light, motion blur on background, cinematic",
  "i4-m50": "BMW i4 M50 electric gran coupe cornering dynamically on a coastal road, ocean in background, sun flares, smooth camera tracking shot, cinematic",
  "m3-limousine": "BMW M3 Competition sedan racing through alpine curves, aggressive stance, tire smoke, dramatic mountain backdrop, cinematic tracking shot",
  "ix": "BMW iX electric SUV gliding silently through a futuristic tunnel with blue ambient lighting, reflections, smooth dolly shot, cinematic",
  "x5": "BMW X5 SUV driving confidently on a desert highway at sunset, dust particles in golden light, wide cinematic shot, premium feel",
};
const DEFAULT_PROMPT = "BMW car driving smoothly on a scenic road, cinematic lighting, professional automotive commercial, 4K quality";

// ── Types ───────────────────────────────────────────────────────────

interface Model {
  id: string;
  name: string;
  image?: string;
}

type Provider = "runway" | "wan-direct";

// ── API helpers ─────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// Runway
async function runwaySubmit(imageUrl: string, prompt: string, duration: number): Promise<string> {
  const resp = await fetch(`${RUNWAY_BASE}/v1/image_to_video`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RUNWAY_API_KEY}`,
      "X-Runway-Version": RUNWAY_VERSION,
    },
    body: JSON.stringify({
      model: "gen4_turbo",
      promptImage: imageUrl,
      promptText: prompt,
      duration,
      ratio: "1280:720",
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Runway submit ${resp.status}: ${text.slice(0, 500)}`);
  }

  const json = (await resp.json()) as { id: string };
  return json.id;
}

async function runwayPoll(taskId: string): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < MAX_POLL_MS) {
    const resp = await fetch(`${RUNWAY_BASE}/v1/tasks/${taskId}`, {
      headers: {
        Authorization: `Bearer ${RUNWAY_API_KEY}`,
        "X-Runway-Version": RUNWAY_VERSION,
      },
    });

    if (resp.status === 429) {
      console.log(`  [rate limited] waiting 15s...`);
      await sleep(15_000);
      continue;
    }
    if (!resp.ok) throw new Error(`Runway poll ${resp.status}`);

    const json = (await resp.json()) as { status: string; output?: string[] };
    if (json.status === "SUCCEEDED" && json.output?.[0]) return json.output[0];
    if (json.status === "FAILED") throw new Error("Runway generation failed");
    process.stdout.write(`.`);
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error("Runway poll timed out");
}

// DashScope I2V
async function dashscopeSubmit(imageUrl: string, prompt: string, duration: number): Promise<string> {
  const resp = await fetch(`${DASHSCOPE_BASE}/api/v1/services/aigc/video-generation/video-synthesis`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${DASHSCOPE_API_KEY}`,
      "X-DashScope-Async": "enable",
    },
    body: JSON.stringify({
      model: "wan2.6-i2v",
      input: { prompt, img_url: imageUrl },
      parameters: { size: "1280*720", duration, watermark: false, prompt_extend: true },
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`DashScope submit ${resp.status}: ${text.slice(0, 500)}`);
  }

  const json = (await resp.json()) as { output?: { task_id: string } };
  if (!json.output?.task_id) throw new Error("DashScope: no task_id");
  return json.output.task_id;
}

async function dashscopePoll(taskId: string): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < MAX_POLL_MS) {
    const resp = await fetch(`${DASHSCOPE_BASE}/api/v1/tasks/${taskId}`, {
      headers: { Authorization: `Bearer ${DASHSCOPE_API_KEY}` },
    });
    if (resp.status === 429) { await sleep(15_000); continue; }
    if (!resp.ok) throw new Error(`DashScope poll ${resp.status}`);

    const json = (await resp.json()) as { output?: { task_status: string; video_url?: string }; message?: string };
    if (json.output?.task_status === "SUCCEEDED" && json.output?.video_url) return json.output.video_url;
    if (json.output?.task_status === "FAILED") throw new Error(json.message || "DashScope failed");
    process.stdout.write(`.`);
    await sleep(15_000);
  }
  throw new Error("DashScope poll timed out");
}

// ── Download helper ─────────────────────────────────────────────────

async function downloadVideo(url: string, destPath: string): Promise<void> {
  const resp = await fetch(url);
  if (!resp.ok || !resp.body) throw new Error(`Download failed: ${resp.status}`);
  const fileStream = fs.createWriteStream(destPath);
  await pipeline(Readable.fromWeb(resp.body as any), fileStream);
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  // Parse args
  let modelIds = DEFAULT_MODELS;
  let provider: Provider = RUNWAY_API_KEY ? "runway" : "wan-direct";
  let duration = 5;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--models" && args[i + 1]) {
      modelIds = args[++i].split(",");
    } else if (args[i] === "--provider" && args[i + 1]) {
      provider = args[++i] as Provider;
    } else if (args[i] === "--duration" && args[i + 1]) {
      duration = parseInt(args[++i], 10);
    }
  }

  // Validate provider key
  if (provider === "runway" && !RUNWAY_API_KEY) {
    console.error("RUNWAY_API_KEY not set. Use --provider wan-direct or set the key.");
    process.exit(1);
  }
  if (provider === "wan-direct" && !DASHSCOPE_API_KEY) {
    console.error("DASHSCOPE_API_KEY not set.");
    process.exit(1);
  }

  // Load models
  const allModels: Model[] = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "test_drive_models.json"), "utf-8"));
  const models = modelIds.map((id) => allModels.find((m) => m.id === id)).filter(Boolean) as Model[];

  if (models.length === 0) {
    console.error("No matching models found.");
    process.exit(1);
  }

  // Ensure output dir
  fs.mkdirSync(VIDEO_DIR, { recursive: true });

  // Load existing results
  let results: Record<string, string> = {};
  if (fs.existsSync(OUTPUT_JSON)) {
    results = JSON.parse(fs.readFileSync(OUTPUT_JSON, "utf-8"));
  }

  console.log(`\nGenerating ${models.length} videos with ${provider} (${duration}s each)\n`);

  for (const model of models) {
    if (!model.image) {
      console.log(`⏭ ${model.id} (${model.name}) — no image, skipping`);
      continue;
    }

    // Skip if already generated
    const videoFile = path.join(VIDEO_DIR, `${model.id}.mp4`);
    if (fs.existsSync(videoFile) && results[model.id]) {
      console.log(`✓ ${model.id} — already exists, skipping`);
      continue;
    }

    const prompt = MOTION_PROMPTS[model.id] || `${model.name} ${DEFAULT_PROMPT}`;
    console.log(`▶ ${model.id} (${model.name})`);
    console.log(`  prompt: ${prompt.slice(0, 80)}...`);
    console.log(`  image: ${model.image.slice(0, 60)}...`);

    try {
      let videoUrl: string;
      process.stdout.write(`  generating`);

      if (provider === "runway") {
        const taskId = await runwaySubmit(model.image, prompt, duration);
        console.log(` task=${taskId}`);
        process.stdout.write(`  polling`);
        videoUrl = await runwayPoll(taskId);
      } else {
        const taskId = await dashscopeSubmit(model.image, prompt, duration);
        console.log(` task=${taskId}`);
        process.stdout.write(`  polling`);
        videoUrl = await dashscopePoll(taskId);
      }
      console.log(` done!`);

      // Download to local file
      console.log(`  downloading to ${videoFile}...`);
      await downloadVideo(videoUrl, videoFile);

      results[model.id] = `/videos/${model.id}.mp4`;
      // Save after each successful generation
      fs.writeFileSync(OUTPUT_JSON, JSON.stringify(results, null, 2));
      console.log(`  ✓ saved\n`);
    } catch (err) {
      console.error(`  ✗ failed: ${err instanceof Error ? err.message : err}\n`);
    }
  }

  console.log(`\nResults written to ${OUTPUT_JSON}`);
  console.log(JSON.stringify(results, null, 2));
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
