import logo from '../assets/archa-logo.svg';

/** The ArchaDev mark (Frost Indigo: a sparkle on a framed square), as an image so its gradients render as drawn. */
export function ArchaLogo({ size = 18, className }: { size?: number; className?: string }) {
  return <img src={logo} alt="" aria-hidden draggable={false} width={size} height={size} className={className} />;
}
