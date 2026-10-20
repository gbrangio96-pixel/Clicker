import sharp from 'sharp';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { AppError, dataDir } from './store.ts';

if (!process.env.XDG_CACHE_HOME) {
  process.env.XDG_CACHE_HOME = path.join(dataDir(), 'cache');
  mkdirSync(process.env.XDG_CACHE_HOME, { recursive: true });
}

export async function watermarkedPreview(input: Buffer, maxSize = 1600) {
  const resized = await sharp(input, { limitInputPixels: 40_000_000 }).rotate().resize({ width: maxSize, height: maxSize, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 83 }).toBuffer({ resolveWithObject: true });
  const { width, height } = resized.info;
  const fontSize = Math.max(14, Math.round(width/24));
  const pattern = Math.max(170,Math.round(width/2.5));
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><defs><pattern id="w" width="${pattern}" height="${Math.round(pattern/2)}" patternUnits="userSpaceOnUse" patternTransform="rotate(-25)"><text x="8" y="${Math.round(pattern/3)}" font-family="sans-serif" font-size="${fontSize}" font-weight="700" fill="white" fill-opacity="0.42" stroke="black" stroke-opacity="0.14" stroke-width="1">CLICKER · PRÉVIA</text></pattern></defs><rect width="100%" height="100%" fill="url(#w)"/></svg>`;
  return sharp(resized.data).composite([{ input: Buffer.from(svg) }]).jpeg({ quality: 83 }).toBuffer();
}

export async function prepareUpload(file: File) {
  if (!file.size || file.size > 20*1024*1024) throw new AppError(`${file.name}: cada imagem deve ter até 20 MB.`);
  if (!['image/jpeg','image/png','image/webp'].includes(file.type)) throw new AppError(`${file.name}: envie arquivos JPEG, PNG ou WebP.`);
  const input = Buffer.from(await file.arrayBuffer());
  let metadata;
  try { metadata = await sharp(input,{ limitInputPixels:40_000_000 }).metadata(); }
  catch { throw new AppError(`${file.name}: não foi possível ler esta imagem. Limite de 40 megapixels.`); }
  if (!metadata.width || !metadata.height || !['jpeg','png','webp'].includes(metadata.format || '') || (metadata.pages || 1) > 1) throw new AppError(`${file.name}: formato de imagem não suportado.`);
  const id = randomBytes(12).toString('hex');
  const extension = metadata.format === 'jpeg' ? 'jpg' : metadata.format;
  const originalPath = path.join(dataDir(),'originals',`${id}.${extension}`);
  const previewPath = path.join(dataDir(),'previews',`${id}.jpg`);
  const thumbPath = path.join(dataDir(),'previews',`${id}-thumb.jpg`);
  const paths = [originalPath,previewPath,thumbPath];
  try {
    await mkdir(path.dirname(originalPath),{recursive:true});
    await mkdir(path.dirname(previewPath),{recursive:true});
    const preview = await watermarkedPreview(input);
    const thumb = await sharp(preview).resize({width:600,height:600,fit:'inside',withoutEnlargement:true}).jpeg({quality:78}).toBuffer();
    await writeFile(originalPath,input,{flag:'wx'});
    await writeFile(previewPath,preview,{flag:'wx'});
    await writeFile(thumbPath,thumb,{flag:'wx'});
  } catch (error) { await Promise.all(paths.map(filename=>unlink(filename).catch(()=>{}))); throw error; }
  return { id, title: file.name.replace(/\.[^.]+$/, '').slice(0,160) || 'Fotografia', originalPath, previewPath, thumbPath, width: metadata.width, height: metadata.height, bytes: input.length };
}
export async function removeUploadedFiles(files: { originalPath:string;previewPath:string;thumbPath:string }[]) {
  const root = dataDir()+path.sep;
  await Promise.all(files.flatMap(file=>[file.originalPath,file.previewPath,file.thumbPath]).filter(filename=>path.resolve(filename).startsWith(root)).map(filename=>unlink(filename).catch(()=>{})));
}
