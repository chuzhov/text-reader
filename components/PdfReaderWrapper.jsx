'use client';

import dynamic from 'next/dynamic';

const PdfReader = dynamic(() => import('./PdfReader'), { ssr: false });

export default function PdfReaderWrapper() {
  return <PdfReader />;
}
