import { CircleDashed } from 'lucide-react';

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-xl border border-dashed bg-white px-6 py-14 text-center">
      <CircleDashed className="mx-auto mb-4 h-8 w-8 text-muted" aria-hidden="true" />
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">{description}</p>
    </div>
  );
}
