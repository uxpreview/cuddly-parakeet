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
 const L=new Float32Array(W*H)
 for(let i=0;i<W*H;i++)L[i]=0.2126*D[i*4]+0.7152*D[i*4+1]+0.0722*D[i*4+2]
 // residual vs 5x5 median-ish (use 3x3 mean of a flat interior sample band)
 const res=[]
 const yA=Math.floor(H*0.85), yB=Math.floor(H*0.95)
 for(let y=yA;y<yB;y++)for(let x=Math.floor(W*0.3);x<Math.floor(W*0.5);x++){
  let s=0; for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)s+=L[(y+dy)*W+x+dx]
  res.push(L[y*W+x]-s/9)}
 const m=res.reduce((a,b)=>a+b,0)/res.length
 const sd=Math.sqrt(res.reduce((a,b)=>a+(b-m)*(b-m),0)/res.length)*Math.sqrt(9/8)
 res.sort((a,b)=>a-b)
 // lag-1 autocorrelation of the residual along x
 let num=0,den=0
 for(let i=1;i<res.length;i++){num+=(res[i]-m)*(res[i-1]-m)}
 for(let i=0;i<res.length;i++)den+=(res[i]-m)**2
 return {grainSD:+sd.toFixed(2),p99:+res[Math.floor(res.length*0.99)].toFixed(1),n:res.length}
},{data})))
}
await b.close()
