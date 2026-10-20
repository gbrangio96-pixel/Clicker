import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { watermarkedPreview } from '../lib/images.ts';
const source = path.join(process.cwd(),'fixtures','photos');
const destination = path.join(process.cwd(),'public','demo');
await mkdir(destination,{recursive:true});
const files = (await readdir(source)).filter(name=>name.endsWith('.jpg'));
for (const file of files) {
  await writeFile(path.join(destination,file),await watermarkedPreview(await readFile(path.join(source,file)),1400));
}
console.log(`Preparadas ${files.length} prévias de demonstração com marca-d’água.`);
