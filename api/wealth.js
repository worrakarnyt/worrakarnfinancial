// Private same-origin Vercel proxy. Secrets exist only in Environment Variables.
const { timingSafeEqual, createHash } = require('node:crypto');
const actions = Object.freeze({getCapabilities:0,getData:0,saveRecord:4,deleteRecord:3,extractTransaction:1});
const defaultGasUrl = 'https://script.google.com/macros/s/AKfycbyg9hq1ABmFdDf1JYH3_vcPr-zJyfVLTCYdP16TLzgNbR92MSKRg5ZFV_bgg10fF_8/exec';
function equal(a,b){if(typeof a!=='string'||typeof b!=='string'||a.length>512||b.length>512)return false;return timingSafeEqual(createHash('sha256').update(a).digest(),createHash('sha256').update(b).digest());}
module.exports = async function handler(req,res){
  res.setHeader('Cache-Control','private, no-store, max-age=0');
  res.setHeader('X-Content-Type-Options','nosniff');
  const fail=(status,error)=>res.status(status).json({ok:false,error});
  if(req.method!=='POST'){res.setHeader('Allow','POST');return fail(405,'Method not allowed');}
  const gasSecret=process.env.GAS_API_SECRET, accessKey=process.env.WEALTH_ACCESS_KEY;
  if(!gasSecret||gasSecret.length<32||gasSecret.length>512||!accessKey||accessKey.length<16||accessKey.length>512||gasSecret===accessKey)return fail(503,'กรุณาตั้ง GAS_API_SECRET (32+ ตัวอักษร) และ WEALTH_ACCESS_KEY (16+ ตัวอักษร) ให้แตกต่างกันใน Vercel Environment Variables แล้ว Redeploy');
  const auth=req.headers.authorization||'';
  if(!auth.startsWith('Bearer ')||!equal(auth.slice(7),accessKey))return fail(401,'Unauthorized');
  let gasUrl;try{gasUrl=new URL(process.env.GAS_API_URL||defaultGasUrl);if(gasUrl.protocol!=='https:'||gasUrl.hostname!=='script.google.com'||!/^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(gasUrl.pathname)||gasUrl.search||gasUrl.hash||gasUrl.username||gasUrl.password)throw Error();}catch(e){return fail(503,'GAS_API_URL ต้องเป็น Google Apps Script Web app URL ที่ลงท้าย /exec');}
  let body=req.body;
  try{if(typeof body==='string')body=JSON.parse(body);if(Buffer.isBuffer(body))body=JSON.parse(body.toString('utf8'));}catch(e){return fail(400,'Invalid JSON');}
  if(!body||!Object.prototype.hasOwnProperty.call(actions,body.action)||!Array.isArray(body.args)||body.args.length!==actions[body.action])return fail(400,'Invalid action or arguments');
  const payload=JSON.stringify({secret:gasSecret,action:body.action,args:body.args});
  if(Buffer.byteLength(payload,'utf8')>4300000)return fail(413,'ไฟล์หรือข้อมูลมีขนาดเกินกำหนด กรุณาลดขนาดไฟล์แนบ');
  try{
    const response=await fetch(gasUrl.href,{method:'POST',headers:{'Content-Type':'application/json'},body:payload,redirect:'follow',signal:AbortSignal.timeout(55000)});
    if(!response.ok)return fail(502,'Apps Script HTTP '+response.status+' — ตรวจสอบ Deployment และสิทธิ์');
    let data;try{data=await response.json();}catch(e){return fail(502,'Apps Script ไม่ได้ส่ง JSON — ตรวจสอบ New version, Execute as Me และ Who has access: Anyone');}
    if(!data||typeof data.ok!=='boolean')return fail(502,'รูปแบบ API ของ Apps Script ไม่ถูกต้อง กรุณาอัปเดต Code.gs');
    if(!data.ok)return fail(data.code==='UNAUTHORIZED'||data.code==='CONFIG'?502:400,String(data.error||'Apps Script error').slice(0,500));
    if(Buffer.byteLength(JSON.stringify(data),'utf8')>4300000)return fail(502,'ข้อมูลตอบกลับเกินข้อจำกัด Vercel ต้องเพิ่มระบบแบ่งหน้า API');
    return res.status(200).json({ok:true,data:data.data});
  }catch(e){return fail(502,'ไม่สามารถติดต่อ Apps Script ได้ หรือหมดเวลารอผล กรุณาตรวจสอบข้อมูลก่อนบันทึกซ้ำ');}
};
