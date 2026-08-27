// generic pixel analyser over a PNG file. modes: red, hexat, region, hist
import { chromium } from 'playwright'
import { readFileSync, existsSync } from 'node:fs'
const EXE=process.env.CHROMIUM ?? '/opt/pw-browsers/chromium'
const b=await chromium.launch({executablePath:existsSync(EXE)?EXE:undefined,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']})
const p=await(await b.newContext()).newPage()
const [mode,...rest]=process.argv.slice(2)
const files=rest.filter(a=>a.endsWith('.png'))
const nums=rest.filter(a=>!a.endsWith('.png')).map(Number)
for(const f of files){
 const data='data:image/png;base64,'+readFileSync(f).toString('base64')
 const r=await p.evaluate(async({data,mode,nums})=>{
  const img=new Image(); img.src=data; await img.decode()
  const c=document.createElement('canvas'); c.width=img.width;c.height=img.height
  const ctx=c.getContext('2d',{willReadFrequently:true}); ctx.drawImage(img,0,0)
  const D=ctx.getImageData(0,0,c.width,c.height).data
  const W=c.width,H=c.height
  const hsv=(r,g,bl)=>{r/=255;g/=255;bl/=255;const mx=Math.max(r,g,bl),mn=Math.min(r,g,bl),d=mx-mn
   let h=0; if(d){h=mx===r?60*(((g-bl)/d)%6):mx===g?60*((bl-r)/d+2):60*((r-g)/d+4)}
   if(h<0)h+=360; return [h,mx?d/mx:0,mx]}
  if(mode==='red'){
   const pts=[]
   for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=(y*W+x)*4
    const [h,s,v]=hsv(D[i],D[i+1],D[i+2])
    if((h>=350||h<=15)&&s>=0.25&&v>=0.20)pts.push([x,y])}
   // cluster by simple grid flood
   const key=new Set(pts.map(([x,y])=>x+','+y)); const seen=new Set(); const cl=[]
   for(const k of key){ if(seen.has(k))continue; const st=[k]; seen.add(k); let n=0,x0=1e9,y0=1e9,x1=-1,y1=-1
    while(st.length){const q=st.pop(); const [x,y]=q.split(',').map(Number); n++
     x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y)
     for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){const kk=(x+dx)+','+(y+dy)
      if(key.has(kk)&&!seen.has(kk)){seen.add(kk);st.push(kk)}}}
    cl.push({n,box:[x0,y0,x1,y1]})}
   return {total:pts.length,clusters:cl.sort((a,b)=>b.n-a.n).slice(0,8)}
  }
  if(mode==='rect'){ // x y w h -> mean hex, min/max L, unique colours
   const [x0,y0,w,h]=nums; let R=0,G=0,B=0,n=0,lmin=1e9,lmax=-1; const uniq=new Map()
   for(let y=y0;y<y0+h;y++)for(let x=x0;x<x0+w;x++){const i=(y*W+x)*4
    R+=D[i];G+=D[i+1];B+=D[i+2];n++
    const L=0.2126*D[i]+0.7152*D[i+1]+0.0722*D[i+2]; lmin=Math.min(lmin,L);lmax=Math.max(lmax,L)
    const q=((D[i]>>2)<<12)|((D[i+1]>>2)<<6)|(D[i+2]>>2); uniq.set(q,(uniq.get(q)||0)+1)}
   const hex=v=>('0'+Math.round(v).toString(16)).slice(-2).toUpperCase()
   const top=[...uniq.entries()].sort((a,b)=>b[1]-a[1]).slice(0,6).map(([q,c])=>{
     const r=((q>>12)&63)<<2,g=((q>>6)&63)<<2,bb=(q&63)<<2
     return '#'+hex(r)+hex(g)+hex(bb)+':'+(100*c/n).toFixed(1)+'%'})
   return {mean:'#'+hex(R/n)+hex(G/n)+hex(B/n),n,Lmin:+lmin.toFixed(1),Lmax:+lmax.toFixed(1),top}
  }
  if(mode==='row'){ // y x0 x1 -> luminance run analysis
   const [y,x0,x1]=nums; const out=[]
   const med=x=>{const a=[];for(let k=-2;k<=2;k++){const i=(y*W+Math.min(W-1,Math.max(0,x+k)))*4
     a.push(0.2126*D[i]+0.7152*D[i+1]+0.0722*D[i+2])} a.sort((p,q)=>p-q); return a[2]}
   let prev=med(x0), runStart=x0, runMin=prev,runMax=prev; const runs=[]
   for(let x=x0+1;x<=x1;x++){const m=med(x)
    if(Math.abs(m-prev)>1.6){runs.push({x0:runStart,len:x-runStart,rng:+(runMax-runMin).toFixed(1),L:+med(Math.floor((runStart+x)/2)).toFixed(1)});runStart=x;runMin=m;runMax=m}
    else {runMin=Math.min(runMin,m);runMax=Math.max(runMax,m)}
    prev=m}
   runs.push({x0:runStart,len:x1-runStart,rng:+(runMax-runMin).toFixed(1),L:+med(Math.floor((runStart+x1)/2)).toFixed(1)})
   return {runs:runs.filter(r=>r.len>=4)}
  }
  if(mode==='at'){const [x,y]=nums;const i=(y*W+x)*4
   const hex=v=>('0'+v.toString(16)).slice(-2).toUpperCase()
   return {hex:'#'+hex(D[i])+hex(D[i+1])+hex(D[i+2]),hsv:hsv(D[i],D[i+1],D[i+2]).map(v=>+v.toFixed(3))}}
 },{data,mode,nums})
 console.log(f.split('/').pop(), JSON.stringify(r))
}
await b.close()
