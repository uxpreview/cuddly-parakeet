import { chromium } from 'playwright'
import { readFileSync, existsSync } from 'node:fs'
const EXE=process.env.CHROMIUM ?? '/opt/pw-browsers/chromium'
const b=await chromium.launch({executablePath:existsSync(EXE)?EXE:undefined,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']})
const p=await(await b.newContext()).newPage()
const pairs=[['vista-desktop',834,589],['prints-desktop',875,363],['town-reveal-desktop',797,532],['ford-desktop',868,316],['hero-desktop',814,451],['dog-read-desktop',745,415],['vista-portrait',455,1106],['prints-portrait',533,682],['town-reveal-portrait',385,999],['hero-portrait',417,846]]
for(const [name,cx,cy] of pairs){
 const f=`renders/gate2b-01/${name}.png`
 const data='data:image/png;base64,'+readFileSync(f).toString('base64')
 const r=await p.evaluate(async({data,cx,cy})=>{
  const img=new Image(); img.src=data; await img.decode()
  const c=document.createElement('canvas'); c.width=img.width;c.height=img.height
  const ctx=c.getContext('2d',{willReadFrequently:true}); ctx.drawImage(img,0,0)
  const D=ctx.getImageData(0,0,c.width,c.height).data, W=c.width
  const hsv=(r,g,bl)=>{r/=255;g/=255;bl/=255;const mx=Math.max(r,g,bl),mn=Math.min(r,g,bl),d=mx-mn
   let h=0; if(d){h=mx===r?60*(((g-bl)/d)%6):mx===g?60*((bl-r)/d+2):60*((r-g)/d+4)}
   if(h<0)h+=360; return [+h.toFixed(1),+(mx?d/mx:0).toFixed(3),+mx.toFixed(3)]}
  const box=(k)=>{let R=0,G=0,B=0,n=0
   for(let y=cy-k;y<=cy+k;y++)for(let x=cx-k;x<=cx+k;x++){const i=(y*W+x)*4;R+=D[i];G+=D[i+1];B+=D[i+2];n++}
   return hsv(R/n,G/n,B/n)}
  // collar extent: count px whose hue in 340-25 and sat>=.15
  let n=0,x0=1e9,y0=1e9,x1=-1,y1=-1
  for(let y=cy-25;y<=cy+25;y++)for(let x=cx-25;x<=cx+25;x++){const i=(y*W+x)*4
   const [h,s,v]=hsv(D[i],D[i+1],D[i+2])
   if((h>=335||h<=25)&&s>=0.15&&v>=0.2){n++;x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y)}}
  return {px1:box(0),px3:box(1),px5:box(2),px7:box(3),collarPx:n,bbox:[x1-x0+1,y1-y0+1]}
 },{data,cx,cy})
 console.log(name.padEnd(22), JSON.stringify(r))
}
await b.close()
