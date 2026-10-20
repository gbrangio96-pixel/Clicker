import { updateProfile } from '@/lib/store';
import { apiError, assertLocalMutation } from '@/lib/http';
export async function PATCH(request:Request) { try { assertLocalMutation(request); return Response.json({photographer:updateProfile(await request.json())}); } catch(error) { return apiError(error); } }
