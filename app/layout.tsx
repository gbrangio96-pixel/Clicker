import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Clicker — Sua fotografia, suas regras', description: 'Crie eventos, publique álbuns e venda suas fotografias. Primeira versão de demonstração.' };
export default function RootLayout({ children }: Readonly<{children: React.ReactNode}>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
