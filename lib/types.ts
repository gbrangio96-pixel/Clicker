export type EventStatus = 'published' | 'draft';
export type PaymentMethod = 'pix' | 'credit' | 'debit' | 'boleto';
export interface Photographer {
  name: string; studioName: string; slug: string; bio: string; instagram: string;
}
export interface Photo {
  id: string; eventId: string; title: string; previewUrl: string; thumbUrl: string;
  width: number; height: number; bytes: number;
}
export interface PhotoEvent {
  id: string; title: string; slug: string; location: string; date: string;
  category: string; description: string; priceCents: number;
  packagePriceCents: number | null; coverUrl: string; status: EventStatus;
  photoCount: number; createdAt: string;
}
export interface Order {
  id: string; buyerName: string; buyerEmail: string; eventId: string; eventTitle: string;
  photoIds: string[]; totalCents: number; paymentMethod: PaymentMethod;
  status: 'pending' | 'paid'; createdAt: string; paidAt: string | null;
  demo: boolean;
}
export interface StudioState {
  photographer: Photographer; events: PhotoEvent[]; orders: Order[];
  stats: { revenueCents: number; paidOrders: number; photos: number; storageBytes: number; };
  demo: true;
}
export interface Catalog { photographer: Photographer; events: PhotoEvent[]; demo: true; }
export interface EventDetail { event: PhotoEvent; photos: Photo[]; }
export interface CheckoutResult { order: Order; accessToken: string; }
export interface Download {
  photoId: string; title: string; url: string;
}
export const formatMoney = (cents: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
export const formatDate = (date: string) => new Date(`${date.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
