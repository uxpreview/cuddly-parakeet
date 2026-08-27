import { chromium } from 'playwright'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
const [inFile,xs,ys,ws,hs,scaleS='3',outFile='/tmp/sil.png'] = process.argv.slice(2)
const EXE=process.env.CHROMIUM ?? '/opt/pw-browsers/chromium'
const b=await chromium.launch({executablePath:existsSync(EXE)?EXE:undefined,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']})
const p=await(await b.newContext()).newPage()
const data='data:image/png;base64,'+readFileSync(inFile).toString('base64')
const out=await p.evaluate(async({data,x,y,w,h,scale})=>{
 const img=new Image(); img.src=data; await img.decode()
 const c=document.createElement('canvas'); c.width=w; c.height=h
 const ctx=c.getContext('2d'); ctx.drawImage(img,x,y,w,h,0,0,w,h)
 const d=ctx.getImageData(0,0,w,h)
 // background = pale ground; dog coat is E5D5BC-ish and white points; use local
 // gradient magnitude to find the body edge instead of a colour key
 const lum=new Float32Array(w*h)
 for(let i=0;i<w*h;i++){lum[i]=0.2126*d.data[i*4]+0.7152*d.data[i*4+1]+0.0722*d.data[i*4+2]}
 const o=document.createElement('canvas'); o.width=w*scale; o.height=h*scale
 const oc=o.getContext('2d'); oc.imageSmoothingEnabled=false
 const tmp=document.createElement('canvas'); tmp.width=w; tmp.height=h
 const tc=tmp.getContext('2d'); const td=tc.createImageData(w,h)
 for(let yy=1;yy<h-1;yy++)for(let xx=1;xx<w-1;xx++){
  const i=yy*w+xx
  const gx=lum[i+1]-lum[i-1], gy=lum[i+w]-lum[i-w]
  const g=Math.hypot(gx,gy)
  const v=g>6?0:255
  td.data[i*4]=v;td.data[i*4+1]=v;td.data[i*4+2]=v;td.data[i*4+3]=255
 }
 tc.putImageData(td,0,0); oc.drawImage(tmp,0,0,o.width,o.height)
 return o.toDataURL('image/png')
},{data,x:+xs,y:+ys,w:+ws,h:+hs,scale:+scaleS})
writeFileSync(outFile,Buffer.from(out.split(',')[1],'base64'))
await b.close(); console.log('ok '+outFile)
