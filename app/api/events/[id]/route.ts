import { getEvent, updateEvent, deleteEvent } from '@/lib/store';
import { removeUploadedFiles } from '@/lib/images';
import { apiError, assertLocalMutation } from '@/lib/http';
export const dynamic='force-dynamic';
type Context = { params: Promise<{id:string}> };
export async function GET(request:Request,{params}:Context) { try { return Response.json(getEvent((await params).id,new URL(request.url).searchParams.get('public')==='1'),{headers:{'Cache-Control':'no-store'}}); } catch(error) { return apiError(error); } }
export async function PATCH(request:Request,{params}:Context) { try { assertLocalMutation(request); return Response.json({event:updateEvent((await params).id,await request.json())}); } catch(error) { return apiError(error); } }
export async function DELETE(request:Request,{params}:Context) { try { assertLocalMutation(request); const files = deleteEvent((await params).id); await removeUploadedFiles(files); return Response.json({ok:true}); } catch(error) { return apiError(error); } }
