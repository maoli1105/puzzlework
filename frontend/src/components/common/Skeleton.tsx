import React from 'react';

interface SkeletonProps {
  width?: string | number;
  height?: number;
  radius?: number;
  style?: React.CSSProperties;
}

export function Skeleton({ width = '100%', height = 14, radius = 4, style }: SkeletonProps) {
  return (
    <div style={{
      width, height, borderRadius: radius,
      background: 'var(--zinc-200)',
      animation: 'skeleton-pulse 1.4s ease-in-out infinite',
      ...style,
    }} />
  );
}

export function SkeletonBlock({ rows = 3 }: { rows?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--r-lg)', padding: '14px 16px',
          display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Skeleton width={60} height={20} radius={100} />
            <Skeleton width={`${60 + (i % 3) * 20}%`} height={14} />
          </div>
          <Skeleton width="40%" height={11} />
        </div>
      ))}
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 'var(--r-lg)', padding: 16,
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <Skeleton width="55%" height={16} />
        <Skeleton width={48} height={22} radius={100} />
      </div>
      <Skeleton width="80%" height={12} />
      <Skeleton width="30%" height={11} />
    </div>
  );
}

export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{
          display: 'flex', gap: 16, alignItems: 'center',
          padding: '10px 16px', background: 'var(--surface)',
          borderBottom: '1px solid var(--border)',
        }}>
          <Skeleton width={16} height={16} radius={3} />
          <Skeleton width={`${40 + (i % 4) * 10}%`} height={13} />
          <Skeleton width={64} height={20} radius={100} style={{ marginLeft: 'auto' }} />
          <Skeleton width={80} height={13} />
        </div>
      ))}
    </div>
  );
}
