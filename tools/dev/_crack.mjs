import { chromium } from 'playwright'
import { readFileSync, existsSync } from 'node:fs'
const EXE=process.env.CHROMIUM ?? '/opt/pw-browsers/chromium'
const b=await chromium.launch({executablePath:existsSync(EXE)?EXE:undefined,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']})
const p=await(await b.newContext()).newPage()
for(const f of process.argv.slice(2)){
const data='data:image/png;base64,'+readFileSync(f).toString('base64')
console.log(f.split('/').pop(),JSON.stringify(await p.evaluate(async({data})=>{
 const img=new Image(); img.src=data; await img.decode()
 const c=document.createElement('canvas'); c.width=img.width;c.height=img.height
 const ctx=c.getContext('2d',{willReadFrequently:true}); ctx.drawImage(img,0,0)
 const D=ctx.getImageData(0,0,c.width,c.height).data, W=c.width,H=c.height
 const sat=(i)=>{const mx=Math.max(D[i],D[i+1],D[i+2]),mn=Math.min(D[i],D[i+1],D[i+2]);return mx?(mx-mn)/mx:0}
 let n=0; const cols={}
 for(let y=2;y<H-2;y++)for(let x=3;x<W-3;x++){const i=(y*W+x)*4
  if(sat(i)<0.24 && sat(i-12)>0.33 && sat(i+12)>0.33 && D[i]>190){n++; cols[x]=(cols[x]||0)+1}}
 const runs=Object.entries(cols).filter(([k,v])=>v>=8).sort((a,b)=>b[1]-a[1]).slice(0,12)
 return {crackPx:n,topColumns:runs.map(([x,v])=>`x=${x}:${v}px`)}
},{data})))
}
await b.close()
