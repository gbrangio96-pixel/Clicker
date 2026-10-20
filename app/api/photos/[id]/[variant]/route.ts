import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { photoFiles, authorizeOriginal, AppError } from '@/lib/store';
import { apiError } from '@/lib/http';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{id:string;variant:string}>}) {
  try {
    const {id,variant}=await params;
    const search=new URL(request.url).searchParams;
    if (!['original','preview','thumb'].includes(variant)) throw new AppError('Arquivo não encontrado.',404);
    const photo=variant==='original'?authorizeOriginal(id,search.get('orderId')||'',search.get('token')):photoFiles(id);
    const filename=variant==='original'?photo.originalPath:variant==='thumb'?photo.thumbPath:photo.previewPath;
    const bytes=await readFile(filename);
    const ext=path.extname(filename).toLowerCase();
    const headers:Record<string,string>={ 'Content-Type': ext==='.png'?'image/png':ext==='.webp'?'image/webp':'image/jpeg', 'X-Content-Type-Options':'nosniff', 'Cache-Control':variant==='original'?'private, no-store':'public, max-age=3600', 'Referrer-Policy':'no-referrer' };
    if (variant==='original') headers['Content-Disposition']=`attachment; filename="clicker-${id}${ext}"; filename*=UTF-8''${encodeURIComponent(photo.title+ext)}`;
    return new Response(bytes,{headers});
  } catch(error) { return apiError(error); }
}
