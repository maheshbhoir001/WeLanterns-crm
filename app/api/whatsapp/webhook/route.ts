import {createHmac,timingSafeEqual} from "node:crypto";
import {NextRequest,NextResponse} from "next/server";
import {getWhatsAppAdminClient} from "@/lib/whatsapp/admin";
function verify(raw:string,sig:string|null){
 const secret=process.env.META_APP_SECRET;
 if(!secret||!sig?.startsWith("sha256="))return false;
 const expected=Buffer.from("sha256="+createHmac("sha256",secret).update(raw).digest("hex"));
 const actual=Buffer.from(sig);
 return expected.length===actual.length&&timingSafeEqual(expected,actual);
}
export async function GET(req:NextRequest){
 const q=req.nextUrl.searchParams,token=process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
 if(q.get("hub.mode")==="subscribe"&&token&&q.get("hub.verify_token")===token&&q.get("hub.challenge"))return new NextResponse(q.get("hub.challenge"),{status:200});
 return NextResponse.json({error:"Webhook verification failed"},{status:403});
}
export async function POST(req:NextRequest){
 const raw=await req.text();
 if(!verify(raw,req.headers.get("x-hub-signature-256")))return NextResponse.json({error:"Invalid webhook signature"},{status:401});
 let payload:any;try{payload=JSON.parse(raw)}catch{return NextResponse.json({error:"Invalid JSON"},{status:400})}
 try{
  const db=getWhatsAppAdminClient(),rows:any[]=[];
  for(const entry of payload.entry??[])for(const change of entry.changes??[]){
   const v=change.value??{};
   for(const message of v.messages??[])if(message.id&&message.from)rows.push({event_key:message.id,event_type:message.type??"unknown",payload:{message,contact:(v.contacts??[]).find((c:any)=>c.wa_id===message.from)??null,phone_number_id:v.metadata?.phone_number_id??null}});
   for(const s of v.statuses??[])if(s.id&&s.status)rows.push({event_key:"status:"+s.id+":"+s.status+":"+(s.timestamp??""),event_type:"status",payload:s});
  }
  if(rows.length){const {error}=await db.from("whatsapp_webhook_events").upsert(rows,{onConflict:"event_key",ignoreDuplicates:true});if(error)throw error}
  return NextResponse.json({received:true});
 }catch(e){console.error("[whatsapp-webhook]",e instanceof Error?e.message:"unknown");return NextResponse.json({error:"Unable to queue webhook event"},{status:500})}
}