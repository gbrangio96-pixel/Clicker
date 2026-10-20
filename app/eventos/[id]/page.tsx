import Storefront from '@/components/storefront';

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Storefront eventId={id} />;
}
