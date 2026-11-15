import * as React from 'react';
import { createRoot } from 'react-dom/client';
import DemoOne from '@/components/demo';
import { LiquidButton, Button, MetalButton } from '@/components/ui/liquid-glass-button';
import './styles/ui.css';
function Showcase(){const[count,setCount]=React.useState(0);return <main className="mx-auto max-w-[800px] px-6 py-12"><h1>Liquid Glass</h1><p>Reusable React buttons · keyboard, touch and mouse</p><DemoOne/><div className="flex flex-wrap items-center gap-6"><LiquidButton onClick={()=>setCount(x=>x+1)}>Pressed {count} times</LiquidButton><LiquidButton disabled>Disabled</LiquidButton><LiquidButton asChild><a href="/">Back to map</a></LiquidButton><Button variant="cool">Cool</Button></div><h2>Metal finishes</h2><div className="flex flex-wrap gap-4">{(['default','primary','success','error','gold','bronze'] as const).map(variant=><MetalButton key={variant} variant={variant}>{variant}</MetalButton>)}</div></main>}
createRoot(document.getElementById('root')!).render(<React.StrictMode><Showcase/></React.StrictMode>);
