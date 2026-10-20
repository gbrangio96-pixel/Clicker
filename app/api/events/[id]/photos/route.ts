import { getEvent, addPhoto, AppError, deletePhoto } from '@/lib/store';
import { prepareUpload, removeUploadedFiles } from '@/lib/images';
import { apiError, assertLocalMutation } from '@/lib/http';
export const runtime='nodejs';
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}) {
  const prepared: Awaited<ReturnType<typeof prepareUpload>>[]=[];
  const added: string[]=[];
  try {
    assertLocalMutation(request);
    const eventId=(await params).id; getEvent(eventId);
    if (Number(request.headers.get('content-length')) > 200*1024*1024) throw new AppError('Envie até 200 MB por lote.',413);
    const form=await request.formData();
    const files=form.getAll('files');
    if (!files.length || files.length>30 || files.some(file=>!(file instanceof File))) throw new AppError('Selecione entre 1 e 30 imagens por lote.');
    if ((files as File[]).reduce((sum,file)=>sum+file.size,0)>200*1024*1024) throw new AppError('Envie até 200 MB por lote.',413);
    // Prepare the complete batch before committing records: bad files never leave a partial upload.
    for (const file of files as File[]) prepared.push(await prepareUpload(file));
    const photos=prepared.map(photo=>{const saved=addPhoto({...photo,eventId});added.push(saved.id);return saved;});
    return Response.json({photos},{status:201});
  } catch(error) {
    for (const id of added) { try { deletePhoto(id); } catch {} }
    await removeUploadedFiles(prepared);
    return apiError(error);
  }
}
