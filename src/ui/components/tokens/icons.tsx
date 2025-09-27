import type { SVGProps } from 'react';

export const SparkleIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}>
    <path
      d="M12 3.5 13.6 9l5.4 1.8-5.4 1.8L12 18.5l-1.6-5.9L5 10.8 10.4 9 12 3.5Z"
      strokeLinejoin="round"
    />
  </svg>
);

export const UserIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}>
    <path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Z" />
    <path d="M4 20a8 8 0 0 1 16 0" strokeLinecap="round" />
  </svg>
);

export const SendIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}>
    <path d="M4.5 4.5 19.5 12 4.5 19.5 7.5 12 4.5 4.5Z" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const LightningIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}>
    <path d="M11 3 5 14h6l-1 7 6-11h-6Z" strokeLinejoin="round" />
  </svg>
);
