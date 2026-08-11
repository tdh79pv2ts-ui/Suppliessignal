import { EmptyState } from '../components/EmptyState';

export function PlaceholderPage({ title, phase }: { title: string; phase: number }) {
  return <div className="p-5 sm:p-8"><p className="text-sm font-medium text-signal">Module</p><h1 className="mt-1 text-2xl font-semibold tracking-tight">{title}</h1><div className="mt-7"><EmptyState title={`${title} is not configured`} description={`This module is scheduled for Phase ${phase}. No placeholder controls are presented as functional.`} /></div></div>;
}
