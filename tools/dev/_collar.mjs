import { chromium } from 'playwright'
import { readFileSync, existsSync } from 'node:fs'
const EXE=process.env.CHROMIUM ?? '/opt/pw-browsers/chromium'
const b=await chromium.launch({executablePath:existsSync(EXE)?EXE:undefined,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']})
const p=await(await b.newContext()).newPage()
for(const f of process.argv.slice(2)){
 const data='data:image/png;base64,'+readFileSync(f).toString('base64')
 const r=await p.evaluate(async({data})=>{
  const img=new Image(); img.src=data; await img.decode()
  const c=document.createElement('canvas'); c.width=img.width;c.height=img.height
  const ctx=c.getContext('2d',{willReadFrequently:true})
  ctx.filter='blur(3px)'; ctx.drawImage(img,0,0)
  const D=ctx.getImageData(0,0,c.width,c.height).data
  const W=c.width,H=c.height
  let best={s:0}; const sats=[]
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=(y*W+x)*4
   const r=D[i]/255,g=D[i+1]/255,bl=D[i+2]/255
   const mx=Math.max(r,g,bl),mn=Math.min(r,g,bl),d=mx-mn
   let h=0; if(d){h=mx===r?60*(((g-bl)/d)%6):mx===g?60*((bl-r)/d+2):60*((r-g)/d+4)}
   if(h<0)h+=360; const s=mx?d/mx:0
   if((h>=345||h<=20)&&mx>0.2){ sats.push(s); if(s>best.s)best={s,x,y,h:+h.toFixed(1)} }}
  // median saturation of the whole frame for context
  const all=[]
  const ctx2=c.getContext('2d'); 
  return {peakBlurredSat:+best.s.toFixed(3),at:[best.x,best.y],hue:best.h}
 },{data})
 console.log(f.split('/').pop(), JSON.stringify(r))
}
await b.close()
