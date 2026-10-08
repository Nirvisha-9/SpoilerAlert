import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
import ffmpeg from 'ffmpeg-static';
const FPS = 30, DUR = 22.0, FRAMES = Math.round(FPS * DUR);
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new' });
const p = await b.newPage(); await p.setViewport({ width: 1920, height: 1080 });
await p.goto('file://' + process.cwd() + '/video.html', { waitUntil: 'networkidle0' });
await p.evaluate(() => window.ready);
const ff = spawn(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-', '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', 'silent.mp4'], { stdio: ['pipe', 'inherit', 'inherit'] });
for (let i = 0; i < FRAMES; i++) {
  await p.evaluate((t) => render(t), i / FPS);
  const png = await p.screenshot({ type: 'png' });
  if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once('drain', r));
  if (i % 60 === 0) console.log('frame', i);
}
ff.stdin.end(); await new Promise((r) => ff.on('close', r)); await b.close(); console.log('done');
