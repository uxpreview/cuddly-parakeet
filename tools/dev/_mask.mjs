import { chromium } from 'playwright'
import { readFileSync, existsSync } from 'node:fs'
const EXE=process.env.CHROMIUM ?? '/opt/pw-browsers/chromium'
const b=await chromium.launch({executablePath:existsSync(EXE)?EXE:undefined,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']})
const p=await(await b.newContext()).newPage()
const [f,X,Y,W2,H2]=process.argv.slice(2)
const data='data:image/png;base64,'+readFileSync(f).toString('base64')
const r=await p.evaluate(async({data,X,Y,W2,H2})=>{
 const img=new Image(); img.src=data; await img.decode()
 const c=document.createElement('canvas'); c.width=img.width;c.height=img.height
 const ctx=c.getContext('2d',{willReadFrequently:true}); ctx.drawImage(img,0,0)
 const D=ctx.getImageData(0,0,c.width,c.height).data, W=c.width
 // dog mask: pixels whose colour is close to coat E5D5BC, points F7F2E8, collar, nose
 const targets=[[229,213,188],[247,242,232],[208,52,44],[51,45,40],[36,31,27]]
 const rows=[]
 for(let y=Y;y<Y+H2;y++){ let x0=-1,x1=-1,n=0
  for(let x=X;x<X+W2;x++){const i=(y*W+x)*4
   let hit=false
   for(const t of targets){ if(Math.abs(D[i]-t[0])<11&&Math.abs(D[i+1]-t[1])<11&&Math.abs(D[i+2]-t[2])<11){hit=true;break} }
   if(hit){ if(x0<0)x0=x; x1=x; n++ }}
  rows.push([y,x0,x1,n]) }
 return rows
},{data,X:+X,Y:+Y,W2:+W2,H2:+H2})
for(const [y,x0,x1,n] of r) if(n>0) console.log(`y=${y} x=${x0}..${x1} w=${x1-x0+1} n=${n}`)
await b.close()
