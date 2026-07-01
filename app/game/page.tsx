'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function GamePage() {
  const router = useRouter();
  useEffect(() => { router.replace('/game/067'); }, [router]);
  return null;
}
