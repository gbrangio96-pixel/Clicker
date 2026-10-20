import { deletePhoto } from '@/lib/store';
import { removeUploadedFiles } from '@/lib/images';
import { apiError, assertLocalMutation } from '@/lib/http';
export async function DELETE(request:Request,{params}:{params:Promise<{id:string}>}) { try { assertLocalMutation(request); const photo=deletePhoto((await params).id);await removeUploadedFiles([photo]);return Response.json({ok:true}); } catch(error) { return apiError(error); } }
