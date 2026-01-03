'use client';

import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { dbHelpers } from '@/lib/db';
import { DomainEntity, Tag } from '@/lib/types';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

// Icon components
const ArchiveBoxArrowDownIcon = ({ className, style }: { className?: string; style?: React.CSSProperties }) => (
  <svg className={className} style={style} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0l-3-3m3 3l3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z"
    />
  </svg>
);

const ArrowUturnLeftIcon = ({ className, style }: { className?: string; style?: React.CSSProperties }) => (
  <svg className={className} style={style} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3"
    />
  </svg>
);

export default function ArchivePage() {
  const router = useRouter();
  const [confirmTitle, setConfirmTitle] = useState('');
  const [confirmMessage, setConfirmMessage] = useState('');
  const [confirmAction, setConfirmAction] = useState<(() => void) | null>(null);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [errorTitle, setErrorTitle] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isErrorOpen, setIsErrorOpen] = useState(false);

  // Fetch archived domains and tags
  const archivedDomains = useLiveQuery(async () => {
    return await dbHelpers.getArchivedDomains();
  }, []);

  const archivedTags = useLiveQuery(async () => {
    return await dbHelpers.getArchivedTags();
  }, []);

  // Group archived tags by domain
  const tagsByDomainId = React.useMemo(() => {
    if (!archivedTags) return {} as Record<string, Tag[]>;
    return archivedTags.reduce(
      (acc, tag) => {
        if (!acc[tag.domainId]) acc[tag.domainId] = [];
        acc[tag.domainId].push(tag);
        return acc;
      },
      {} as Record<string, Tag[]>
    );
  }, [archivedTags]);

  const handleUnarchiveDomain = async (domainId: string, domainName: string) => {
    setConfirmTitle('Unarchive Domain');
    setConfirmMessage(
      `Unarchive "${domainName}"? It will be restored to your active domains list.`
    );
    setConfirmAction(() => async () => {
      try {
        await dbHelpers.unarchiveDomain(domainId);
        setIsConfirmOpen(false);
      } catch (error) {
        setIsConfirmOpen(false);
        setErrorTitle('Failed to unarchive domain');
        setErrorMessage(error instanceof Error ? error.message : 'Unknown error occurred');
        setIsErrorOpen(true);
      }
    });
    setIsConfirmOpen(true);
  };

  const handleUnarchiveTag = async (tagId: string, tagName: string) => {
    setConfirmTitle('Unarchive Sub-domain');
    setConfirmMessage(
      `Unarchive "${tagName}"? It will be restored to your active sub-domains list.`
    );
    setConfirmAction(() => async () => {
      try {
        await dbHelpers.unarchiveTag(tagId);
        setIsConfirmOpen(false);
      } catch (error) {
        setIsConfirmOpen(false);
        setErrorTitle('Failed to unarchive sub-domain');
        setErrorMessage(error instanceof Error ? error.message : 'Unknown error occurred');
        setIsErrorOpen(true);
      }
    });
    setIsConfirmOpen(true);
  };

  const lightenColor = (hex: string, percent: number) => {
    const num = parseInt(hex.replace('#', ''), 16);
    const r = Math.min(255, Math.floor((num >> 16) + ((255 - (num >> 16)) * percent) / 100));
    const g = Math.min(
      255,
      Math.floor(((num >> 8) & 0x00ff) + ((255 - ((num >> 8) & 0x00ff)) * percent) / 100)
    );
    const b = Math.min(
      255,
      Math.floor((num & 0x0000ff) + ((255 - (num & 0x0000ff)) * percent) / 100)
    );
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
  };

  // Get orphaned tags (tags whose domain is not archived)
  const orphanedTags = React.useMemo(() => {
    if (!archivedTags || !archivedDomains) return [];
    const archivedDomainIds = new Set(archivedDomains.map((d) => d.id));
    return archivedTags.filter((tag) => !archivedDomainIds.has(tag.domainId));
  }, [archivedTags, archivedDomains]);

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--background)' }}>
      {/* Header */}
      <div
        className="border-b"
        style={{
          backgroundColor: 'var(--card)',
          borderColor: 'rgba(184, 203, 224, 0.3)',
        }}
      >
        <div className="max-w-6xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <ArchiveBoxArrowDownIcon className="w-10 h-10" style={{ color: 'var(--primary)' }} />
              <div>
                <h1 className="text-2xl font-bold leading-tight" style={{ color: 'var(--foreground)' }}>
                  Archive
                </h1>
                <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
                  Archived domains and sub-domains. Time slots are preserved.
                </p>
              </div>
            </div>

            {/* Logo - Click to return home */}
            <button
              onClick={() => router.push('/')}
              className="transition-all hover:opacity-80 flex items-center"
              title="Return to Home"
            >
              <Image
                src="/logo_bar.png"
                alt="DomainFlow Logo"
                width={48}
                height={48}
                className="object-contain"
              />
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Archived Domains */}
        <div className="mb-8">
          <h2
            className="text-lg font-semibold mb-4"
            style={{ color: 'var(--foreground)' }}
          >
            Archived Domains
          </h2>
          {archivedDomains && archivedDomains.length === 0 ? (
            <div
              className="rounded-xl p-8 text-center"
              style={{
                backgroundColor: 'var(--card)',
                border: '1px solid rgba(184, 203, 224, 0.3)',
              }}
            >
              <p style={{ color: 'var(--muted-foreground)' }}>
                No archived domains yet
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {archivedDomains?.map((domain) => {
                const tags = tagsByDomainId[domain.id] || [];
                return (
                  <div
                    key={domain.id}
                    className="rounded-xl p-4"
                    style={{
                      backgroundColor: 'var(--card)',
                      border: '1px solid rgba(184, 203, 224, 0.3)',
                    }}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-4 h-4 rounded-sm shadow-sm"
                          style={{
                            background: `linear-gradient(135deg, ${domain.color} 0%, ${domain.colorEnd || domain.color} 100%)`,
                          }}
                        />
                        <span className="font-semibold" style={{ color: 'var(--foreground)' }}>
                          {domain.name}
                        </span>
                        <span className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
                          ({tags.length} sub-domain{tags.length !== 1 ? 's' : ''})
                        </span>
                      </div>
                      <button
                        onClick={() => handleUnarchiveDomain(domain.id, domain.name)}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
                        style={{
                          backgroundColor: 'var(--primary)',
                          color: 'white',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.85')}
                        onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
                      >
                        <ArrowUturnLeftIcon className="w-4 h-4" />
                        Unarchive
                      </button>
                    </div>

                    {/* Sub-domains under this domain */}
                    {tags.length > 0 && (
                      <div className="ml-7 space-y-1.5">
                        {tags.map((tag) => (
                          <div
                            key={tag.id}
                            className="flex items-center justify-between px-3 py-2 rounded-lg"
                            style={{ backgroundColor: 'var(--hover)' }}
                          >
                            <div className="flex items-center gap-2">
                              <div
                                className="w-2.5 h-2.5 rounded-sm"
                                style={{ backgroundColor: tag.color }}
                              />
                              <span className="text-sm" style={{ color: 'var(--foreground)' }}>
                                {tag.name}
                              </span>
                            </div>
                            <button
                              onClick={() => handleUnarchiveTag(tag.id, tag.name)}
                              className="text-xs px-2 py-1 rounded transition-colors"
                              style={{
                                color: 'var(--primary)',
                                backgroundColor: 'transparent',
                              }}
                              onMouseEnter={(e) =>
                                (e.currentTarget.style.backgroundColor = 'rgba(74, 140, 199, 0.1)')
                              }
                              onMouseLeave={(e) =>
                                (e.currentTarget.style.backgroundColor = 'transparent')
                              }
                            >
                              Unarchive
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Orphaned Archived Sub-domains */}
        {orphanedTags.length > 0 && (
          <div>
            <h2
              className="text-lg font-semibold mb-4"
              style={{ color: 'var(--foreground)' }}
            >
              Archived Sub-domains (from active domains)
            </h2>
            <div
              className="rounded-xl p-4"
              style={{
                backgroundColor: 'var(--card)',
                border: '1px solid rgba(184, 203, 224, 0.3)',
              }}
            >
              <div className="space-y-1.5">
                {orphanedTags.map((tag) => (
                  <div
                    key={tag.id}
                    className="flex items-center justify-between px-3 py-2 rounded-lg"
                    style={{ backgroundColor: 'var(--hover)' }}
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className="w-2.5 h-2.5 rounded-sm"
                        style={{ backgroundColor: tag.color }}
                      />
                      <span className="text-sm" style={{ color: 'var(--foreground)' }}>
                        {tag.name}
                      </span>
                    </div>
                    <button
                      onClick={() => handleUnarchiveTag(tag.id, tag.name)}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
                      style={{
                        backgroundColor: 'var(--primary)',
                        color: 'white',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.85')}
                      onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
                    >
                      <ArrowUturnLeftIcon className="w-4 h-4" />
                      Unarchive
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Confirmation Dialog */}
      <ConfirmDialog
        open={isConfirmOpen}
        onOpenChange={setIsConfirmOpen}
        title={confirmTitle}
        description={confirmMessage}
        confirmText="Confirm"
        cancelText="Cancel"
        onConfirm={() => {
          if (confirmAction) confirmAction();
        }}
      />

      {/* Error Dialog */}
      <ConfirmDialog
        open={isErrorOpen}
        onOpenChange={setIsErrorOpen}
        title={errorTitle}
        description={errorMessage}
        confirmText="OK"
        showCancel={false}
        onConfirm={() => setIsErrorOpen(false)}
      />
    </div>
  );
}

