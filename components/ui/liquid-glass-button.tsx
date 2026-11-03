"use client"

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva('inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0', {
  variants: {
    variant: {
      default: 'bg-primary text-primary-foreground hover:bg-primary/90',
      destructive: 'bg-destructive text-primary-foreground hover:bg-destructive/90',
      cool: 'dark:inset-shadow-2xs dark:inset-shadow-white/10 bg-linear-to-t border border-b-2 border-zinc-950/40 from-primary to-primary/85 shadow-md shadow-primary/20 ring-1 ring-inset ring-white/25 transition-[filter] duration-200 hover:brightness-110 active:brightness-90 dark:border-x-0 text-primary-foreground dark:border-t-0 dark:border-primary/50 dark:ring-white/5',
      outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
      secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
      ghost: 'hover:bg-accent hover:text-accent-foreground',
      link: 'text-primary underline-offset-4 hover:underline',
    },
    size: { default: 'h-9 px-4 py-2', sm: 'h-8 rounded-md px-3 text-xs', lg: 'h-10 rounded-md px-8', icon: 'h-9 w-9' },
  }, defaultVariants: { variant: 'default', size: 'default' },
});
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> { asChild?: boolean }
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : 'button';
  return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
});
Button.displayName = 'Button';

const liquidbuttonVariants = cva('inline-flex items-center justify-center cursor-pointer gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-[color,box-shadow,transform] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*=size-])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive motion-reduce:transition-none', {
  variants: {
    variant: {
      default: 'bg-transparent hover:scale-105 duration-300 text-primary motion-reduce:hover:scale-100',
      destructive: 'bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20',
      outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
      secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
      ghost: 'hover:bg-accent hover:text-accent-foreground',
      link: 'text-primary underline-offset-4 hover:underline',
    },
    size: { default: 'h-9 px-4 py-2 has-[>svg]:px-3', sm: 'h-8 text-xs gap-1.5 px-4', lg: 'h-10 px-6', xl: 'h-12 px-8', xxl: 'h-14 px-10', icon: 'size-9' },
  }, defaultVariants: { variant: 'default', size: 'xxl' },
});

function GlassFilter({ id }: { id: string }) {
  // Keep filter definitions in the rendering tree; display:none breaks SVG filters in some browsers.
  return <svg aria-hidden="true" width="0" height="0" className="pointer-events-none absolute">
    <defs><filter id={id} x="0%" y="0%" width="100%" height="100%" colorInterpolationFilters="sRGB">
      <feTurbulence type="fractalNoise" baseFrequency="0.05 0.05" numOctaves="1" seed="1" result="turbulence" />
      <feGaussianBlur in="turbulence" stdDeviation="2" result="blurredNoise" />
      <feDisplacementMap in="SourceGraphic" in2="blurredNoise" scale="70" xChannelSelector="R" yChannelSelector="B" result="displaced" />
      <feGaussianBlur in="displaced" stdDeviation="4" result="finalBlur" />
      <feComposite in="finalBlur" in2="finalBlur" operator="over" />
    </filter></defs>
  </svg>;
}

function LiquidButton({ className, variant, size, asChild = false, children, type, ...props }: React.ComponentProps<'button'> & VariantProps<typeof liquidbuttonVariants> & { asChild?: boolean }) {
  const filterId = 'container-glass-' + React.useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const content = <>
    <span aria-hidden="true" className="liquid-glass-shadow pointer-events-none absolute inset-0 z-0 rounded-[inherit]" />
    <span aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 overflow-hidden rounded-[inherit] bg-white/20 backdrop-blur-sm dark:bg-black/20" style={{ backdropFilter: `blur(4px) url("#${filterId}")`, WebkitBackdropFilter: 'blur(4px)' }} />
    <span className="pointer-events-none relative z-10">{asChild && React.isValidElement<{ children?: React.ReactNode }>(children) ? children.props.children : children}</span>
    <GlassFilter id={filterId} />
  </>;
  const classes = cn('relative isolate', liquidbuttonVariants({ variant, size, className }));
  if (asChild) {
    const child = React.Children.only(children);
    if (!React.isValidElement<{ children?: React.ReactNode }>(child)) throw new Error('LiquidButton asChild requires one element');
    return <Slot data-slot="button" className={classes} {...props}>{React.cloneElement(child, undefined, content)}</Slot>;
  }
  return <button type={type ?? 'button'} data-slot="button" className={classes} {...props}>{content}</button>;
}

type ColorVariant = 'default' | 'primary' | 'success' | 'error' | 'gold' | 'bronze';
interface MetalButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> { variant?: ColorVariant }
const colorVariants: Record<ColorVariant, {outer:string;inner:string;button:string;textColor:string;textShadow:string}> = {
  default: { outer:'bg-gradient-to-b from-[#000] to-[#A0A0A0]',inner:'bg-gradient-to-b from-[#FAFAFA] via-[#3E3E3E] to-[#E5E5E5]',button:'bg-gradient-to-b from-[#B9B9B9] to-[#969696]',textColor:'text-white',textShadow:'[text-shadow:_0_-1px_0_rgb(80_80_80_/_100%)]' },
  primary: { outer:'bg-gradient-to-b from-[#000] to-[#A0A0A0]',inner:'bg-gradient-to-b from-primary via-secondary to-muted',button:'bg-gradient-to-b from-primary to-primary/40',textColor:'text-white',textShadow:'[text-shadow:_0_-1px_0_rgb(30_58_138_/_100%)]' },
  success: { outer:'bg-gradient-to-b from-[#005A43] to-[#7CCB9B]',inner:'bg-gradient-to-b from-[#E5F8F0] via-[#00352F] to-[#D1F0E6]',button:'bg-gradient-to-b from-[#9ADBC8] to-[#3E8F7C]',textColor:'text-[#FFF7F0]',textShadow:'[text-shadow:_0_-1px_0_rgb(6_78_59_/_100%)]' },
  error: { outer:'bg-gradient-to-b from-[#5A0000] to-[#FFAEB0]',inner:'bg-gradient-to-b from-[#FFDEDE] via-[#680002] to-[#FFE9E9]',button:'bg-gradient-to-b from-[#F08D8F] to-[#A45253]',textColor:'text-[#FFF7F0]',textShadow:'[text-shadow:_0_-1px_0_rgb(146_64_14_/_100%)]' },
  gold: { outer:'bg-gradient-to-b from-[#917100] to-[#EAD98F]',inner:'bg-gradient-to-b from-[#FFFDDD] via-[#856807] to-[#FFF1B3]',button:'bg-gradient-to-b from-[#FFEBA1] to-[#9B873F]',textColor:'text-[#FFFDE5]',textShadow:'[text-shadow:_0_-1px_0_rgb(178_140_2_/_100%)]' },
  bronze: { outer:'bg-gradient-to-b from-[#864813] to-[#E9B486]',inner:'bg-gradient-to-b from-[#EDC5A1] via-[#5F2D01] to-[#FFDEC1]',button:'bg-gradient-to-b from-[#FFE3C9] to-[#A36F3D]',textColor:'text-[#FFF7F0]',textShadow:'[text-shadow:_0_-1px_0_rgb(124_45_18_/_100%)]' },
};
const MetalButton = React.forwardRef<HTMLButtonElement, MetalButtonProps>(({ children, className, variant='default', style, type, onPointerDown, onPointerUp, onPointerCancel, onPointerEnter, onPointerLeave, onLostPointerCapture, onBlur, disabled, ...props }, ref) => {
  const [isPressed,setIsPressed] = React.useState(false);
  const [isHovered,setIsHovered] = React.useState(false);
  const colors=colorVariants[variant];
  return <span className={cn('metal-button relative inline-flex rounded-md p-[1.25px]',colors.outer)} style={{ transform:isPressed?'translateY(2.5px) scale(.99)':undefined, transition:'transform 250ms cubic-bezier(.1,.4,.2,1)',boxShadow:isHovered?'0 4px 12px #0002':'0 3px 8px #0001' }}>
    <span aria-hidden="true" className={cn('pointer-events-none absolute inset-px rounded-lg',colors.inner)} />
    <button {...props} ref={ref} type={type ?? 'button'} disabled={disabled} className={cn('relative z-10 m-px inline-flex h-11 cursor-pointer items-center justify-center overflow-hidden rounded-md px-6 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50',colors.button,colors.textColor,colors.textShadow,className)} style={{transform:isPressed?'scale(.97)':undefined,...style}}
      onPointerDown={e=>{onPointerDown?.(e);if(!e.defaultPrevented&&!disabled){setIsPressed(true);e.currentTarget.setPointerCapture(e.pointerId)}}}
      onPointerUp={e=>{setIsPressed(false);onPointerUp?.(e)}} onPointerCancel={e=>{setIsPressed(false);onPointerCancel?.(e)}}
      onLostPointerCapture={e=>{setIsPressed(false);onLostPointerCapture?.(e)}} onBlur={e=>{setIsPressed(false);onBlur?.(e)}}
      onPointerEnter={e=>{if(e.pointerType==='mouse'&&!disabled)setIsHovered(true);onPointerEnter?.(e)}}
      onPointerLeave={e=>{setIsHovered(false);setIsPressed(false);onPointerLeave?.(e)}}>
      <span aria-hidden="true" className={cn('pointer-events-none absolute inset-0 z-20 bg-gradient-to-r from-transparent via-neutral-100 to-transparent transition-opacity',isPressed?'opacity-20':'opacity-0')} />
      <span className="relative z-10">{children ?? 'Button'}</span>
    </button>
  </span>;
});
MetalButton.displayName='MetalButton';
export { Button, buttonVariants, LiquidButton, liquidbuttonVariants, MetalButton };
