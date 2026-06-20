'use client';

import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';

export function MarkReviewed() {
  const [reviewed, setReviewed] = useState(false);
  return (
    <button
      className={`btn ${reviewed ? '' : 'primary'}`}
      style={{ marginTop: 16 }}
      disabled={reviewed}
      onClick={() => setReviewed(true)}
    >
      {reviewed ? (
        <>
          <CheckCircle2 size={15} /> Day reviewed
        </>
      ) : (
        'Mark day reviewed'
      )}
    </button>
  );
}
